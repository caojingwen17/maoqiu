// modules/record.js
// 记录模块：保存（含疫苗/驱虫周期提醒联动）、时间线分页、更新、删除
var cloud = require('wx-server-sdk');
var schema = require('../schema');
var config = require('../config');
var reminderCore = require('./reminderCore');

function getDb() {
  return cloud.database();
}

function getOpenid() {
  return cloud.getWXContext().OPENID;
}

var PAGE_SIZE = 20; // 时间线每页 20 条（PRD §5.3）

// 校验宠物归属（记录必须挂在本人宠物下）
async function checkPetOwned(petId) {
  var db = getDb();
  var res = await db.collection('pets').doc(petId).get().catch(function () {
    schema.fail('宠物不存在', 404);
  });
  if (!res.data || res.data._openid !== getOpenid()) {
    schema.fail('宠物不存在或无权限', 404);
  }
}

// 取记录并校验归属
async function getOwnedRecord(recordId) {
  var db = getDb();
  var res = await db.collection('records').doc(recordId).get().catch(function () {
    schema.fail('记录不存在', 404);
  });
  if (!res.data || res.data._openid !== getOpenid()) {
    schema.fail('记录不存在或无权限', 404);
  }
  return res.data;
}

// 读取用户周期设置（无设置用默认值）
async function getCycles(openid) {
  var db = getDb();
  var res = await db.collection('settings')
    .where({ _openid: openid })
    .limit(1)
    .get();
  var cycles = Object.assign({}, config.DEFAULT_CYCLES);
  var advanceDays = config.DEFAULT_ADVANCE_DAYS;
  if (res.data.length > 0) {
    var s = res.data[0];
    if (s.defaultCycles) {
      Object.keys(cycles).forEach(function (key) {
        if (typeof s.defaultCycles[key] === 'number' && s.defaultCycles[key] > 0) {
          cycles[key] = s.defaultCycles[key];
        }
      });
    }
    if (typeof s.advanceDays === 'number') {
      advanceDays = s.advanceDays;
    }
  }
  return { cycles: cycles, advanceDays: advanceDays };
}

/**
 * 疫苗/驱虫记录的周期提醒联动（PRD §9.2）
 * 同宠物同 category（驱虫按内/外驱细分）的 active 周期提醒只保留一条，更新而非新增
 * @returns {Promise<string|null>} 联动的提醒 _id，非疫苗/驱虫类型返回 null
 */
async function syncCycleReminder(record, recordId) {
  var type = record.type;
  if (type !== 'vaccine' && type !== 'deworm') {
    return null;
  }
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();
  var pref = await getCycles(openid);

  var category = type; // vaccine / deworm
  var subKey = '';
  var cycleDays;
  var title;
  if (type === 'vaccine') {
    cycleDays = pref.cycles.vaccine;
    title = record.data.vaccineName || '疫苗接种';
  } else {
    subKey = record.data.kind; // internal / external
    cycleDays = subKey === 'internal' ? pref.cycles.dewormInternal : pref.cycles.dewormExternal;
    title = subKey === 'internal' ? '体内驱虫' : '体外驱虫';
  }

  // 下次日期优先取记录里的 nextDate，否则按周期推算
  var remindAt = record.data.nextDate > 0
    ? record.data.nextDate
    : record.date + cycleDays * reminderCore.DAY_MS;

  var newDoc = {
    _openid: openid,
    petId: record.petId,
    title: title,
    category: category,
    subKey: subKey,
    remindAt: remindAt,
    repeatType: 'custom_days',
    repeatDays: cycleDays,
    advanceDays: pref.advanceDays,
    sourceRecordId: recordId,
    status: 'active',
    subscribeAuth: false,
    updateAt: now,
  };

  // 查同宠物同 category 的存量 active 提醒，按 subKey 过滤后去重
  var existRes = await db.collection('reminders')
    .where({ _openid: openid, petId: record.petId, category: category, status: 'active' })
    .limit(20)
    .get();
  var sameKey = existRes.data.filter(function (r) {
    return (r.subKey || '') === subKey;
  });

  var decision = reminderCore.decideReminderUpsert(sameKey, newDoc);
  if (decision.action === 'create') {
    newDoc.createAt = now;
    var addRes = await db.collection('reminders').add({ data: newDoc });
    return addRes._id;
  }
  // 更新保留的那条，多余的停用（去重规则）
  await db.collection('reminders').doc(decision.id).update({ data: decision.patch });
  for (var i = 0; i < decision.disableIds.length; i++) {
    await db.collection('reminders').doc(decision.disableIds[i])
      .update({ data: { status: 'disabled', updateAt: now } });
  }
  return decision.id;
}

/**
 * 新增/更新记录；type=vaccine/deworm 时联动创建/更新周期提醒
 * @param {Object} payload {record: 记录, recordId?: 更新时传}
 * @returns {{recordId: string, reminderId: string|null}}
 */
async function saveRecord(payload) {
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();
  var doc = schema.validateRecord(payload.record);
  await checkPetOwned(doc.petId);

  var recordId = payload.recordId;
  if (recordId) {
    await getOwnedRecord(recordId);
    doc.updateAt = now;
    await db.collection('records').doc(recordId).update({ data: doc });
  } else {
    doc._openid = openid;
    doc.createAt = now;
    doc.updateAt = now;
    var addRes = await db.collection('records').add({ data: doc });
    recordId = addRes._id;
  }

  var reminderId = await syncCycleReminder(doc, recordId);
  return { recordId: recordId, reminderId: reminderId };
}

/**
 * 时间线分页：按 date 倒序，每页 20 条
 * @param {Object} payload {petId, page?: 从 0 开始}
 * @returns {{list: Array, page: number, hasMore: boolean}}
 */
async function getTimeline(payload) {
  var db = getDb();
  var openid = getOpenid();
  if (!payload.petId) {
    schema.fail('缺少 petId');
  }
  await checkPetOwned(payload.petId);
  var page = Math.max(0, payload.page || 0);
  // 多取 1 条判断是否还有下一页
  var res = await db.collection('records')
    .where({ _openid: openid, petId: payload.petId })
    .orderBy('date', 'desc')
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .get();
  var list = res.data.slice(0, PAGE_SIZE);
  return { list: list, page: page, hasMore: res.data.length > PAGE_SIZE };
}

/**
 * 局部更新记录：仅 date/data/photos/note，type/petId 不可改
 * @param {Object} payload {recordId, patch}
 */
async function updateRecord(payload) {
  var db = getDb();
  if (!payload.recordId) {
    schema.fail('缺少 recordId');
  }
  var existing = await getOwnedRecord(payload.recordId);
  var patch = payload.patch || {};
  // 合并后用完整校验过一遍，保证落库的 data 一定合法
  var merged = {
    petId: existing.petId,
    type: existing.type,
    date: patch.date !== undefined ? patch.date : existing.date,
    data: patch.data !== undefined ? patch.data : existing.data,
    photos: patch.photos !== undefined ? patch.photos : existing.photos,
    note: patch.note !== undefined ? patch.note : existing.note,
  };
  var doc = schema.validateRecord(merged);
  doc.updateAt = Date.now();
  await db.collection('records').doc(payload.recordId).update({ data: doc });
  return null;
}

/**
 * 删除记录（连带清理云存储照片）
 * @param {Object} payload {recordId}
 */
async function deleteRecord(payload) {
  var db = getDb();
  if (!payload.recordId) {
    schema.fail('缺少 recordId');
  }
  var record = await getOwnedRecord(payload.recordId);
  await db.collection('records').doc(payload.recordId).remove();
  var photos = record.photos || [];
  if (photos.length > 0) {
    try {
      await cloud.deleteFile({ fileList: photos });
    } catch (e) {
      console.error('删除记录照片失败:', e);
    }
  }
  return null;
}

module.exports = {
  saveRecord: saveRecord,
  getTimeline: getTimeline,
  updateRecord: updateRecord,
  deleteRecord: deleteRecord,
};
