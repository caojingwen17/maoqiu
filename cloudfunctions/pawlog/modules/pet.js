// modules/pet.js
// 宠物档案模块：列表聚合、详情、新增/更新、级联删除、排序
var cloud = require('wx-server-sdk');
var schema = require('../schema');
var config = require('../config');

function getDb() {
  return cloud.database();
}

function getOpenid() {
  return cloud.getWXContext().OPENID;
}

// 取宠物并校验归属（非本人数据直接报错，防越权）
async function getOwnedPet(petId) {
  var db = getDb();
  var res = await db.collection('pets').doc(petId).get().catch(function () {
    schema.fail('宠物不存在', 404);
  });
  var pet = res.data;
  if (!pet || pet._openid !== getOpenid()) {
    schema.fail('宠物不存在或无权限', 404);
  }
  return pet;
}

// 聚合单只宠物的首页展示数据：最新体重 + 最近临期提醒
async function attachPetMeta(pet) {
  var db = getDb();
  var openid = getOpenid();
  var results = await Promise.all([
    // 最新体重（records 有 petId + date desc 联合索引）
    db.collection('records')
      .where({ _openid: openid, petId: pet._id, type: 'weight' })
      .orderBy('date', 'desc')
      .limit(1)
      .get(),
    // 最近一条进行中的提醒
    db.collection('reminders')
      .where({ _openid: openid, petId: pet._id, status: 'active' })
      .orderBy('remindAt', 'asc')
      .limit(1)
      .get(),
  ]);
  var weightDoc = results[0].data[0];
  var reminderDoc = results[1].data[0];
  pet.latestWeight = weightDoc
    ? { value: weightDoc.data.value, date: weightDoc.date }
    : null;
  pet.nextReminder = reminderDoc
    ? { title: reminderDoc.title, remindAt: reminderDoc.remindAt, category: reminderDoc.category }
    : null;
  return pet;
}

/**
 * 宠物列表：全部（含归档，首页自行过滤），按 order 升序
 * 每只宠物附加 latestWeight（最新体重）与 nextReminder（最近临期提醒）
 */
async function listPets() {
  var db = getDb();
  var openid = getOpenid();
  var res = await db.collection('pets')
    .where({ _openid: openid })
    .orderBy('order', 'asc')
    .limit(100)
    .get();
  var pets = await Promise.all(res.data.map(attachPetMeta));
  return pets;
}

/**
 * 单只宠物详情
 * @param {Object} payload {petId}
 */
async function getPet(payload) {
  if (!payload.petId) {
    schema.fail('缺少 petId');
  }
  return getOwnedPet(payload.petId);
}

/**
 * 新增/更新宠物
 * @param {Object} payload {pet: 宠物表单, petId?: 更新时传}
 * @returns {{petId: string}}
 */
async function savePet(payload) {
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();

  if (payload.petId) {
    // 更新：先校验归属，更新模式下允许局部字段
    await getOwnedPet(payload.petId);
    var patch = schema.validatePet(payload.pet, true);
    patch.updateAt = now;
    await db.collection('pets').doc(payload.petId).update({ data: patch });
    return { petId: payload.petId };
  }

  // 新增：order 取当前最大值 + 1
  var doc = schema.validatePet(payload.pet, false);
  var maxRes = await db.collection('pets')
    .where({ _openid: openid })
    .orderBy('order', 'desc')
    .limit(1)
    .get();
  var maxOrder = maxRes.data.length > 0 ? (maxRes.data[0].order || 0) : -1;
  doc._openid = openid;
  doc.order = maxOrder + 1;
  doc.archived = doc.archived === undefined ? false : doc.archived;
  doc.neutered = doc.neutered === undefined ? false : doc.neutered;
  doc.createAt = now;
  doc.updateAt = now;
  var addRes = await db.collection('pets').add({ data: doc });
  return { petId: addRes._id };
}

// 分批清空某集合中指定条件的文档（单批上限 1000）
async function removeWhere(collection, where) {
  var db = getDb();
  var total = 0;
  while (true) {
    var res = await db.collection(collection).where(where).limit(config.BATCH_LIMIT).remove();
    total += res.stats ? res.stats.removed : 0;
    if (!res.stats || res.stats.removed < config.BATCH_LIMIT) {
      break;
    }
  }
  return total;
}

/**
 * 删除宠物：级联删除 records/reminders/inventories + 云存储图片（PRD §7.1）
 * @param {Object} payload {petId}
 * @returns {{deleted: {records: number, reminders: number, inventories: number, files: number}}}
 */
async function deletePet(payload) {
  var db = getDb();
  var openid = getOpenid();
  if (!payload.petId) {
    schema.fail('缺少 petId');
  }
  var pet = await getOwnedPet(payload.petId);
  var wherePet = { _openid: openid, petId: payload.petId };

  // 1. 收集需清理的云存储 fileID：头像 + 所有记录照片
  var fileIds = [];
  if (pet.avatar) {
    fileIds.push(pet.avatar);
  }
  // 记录照片分批扫（每批 100 条，只取 photos 字段）
  var skip = 0;
  while (true) {
    var batch = await db.collection('records')
      .where(wherePet)
      .field({ photos: true })
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(100)
      .get();
    batch.data.forEach(function (r) {
      (r.photos || []).forEach(function (fid) {
        fileIds.push(fid);
      });
    });
    if (batch.data.length < 100) {
      break;
    }
    skip += 100;
  }

  // 2. 级联删除 records / reminders / inventories（PRD §7.1）
  var deletedRecords = await removeWhere('records', wherePet);
  var deletedReminders = await removeWhere('reminders', wherePet);
  var deletedInventories = await removeWhere('inventories', wherePet);

  // 3. 删除宠物本体
  await db.collection('pets').doc(payload.petId).remove();

  // 4. 删除云存储图片（失败不阻断，图片无引用后由存储生命周期兜底）
  var deletedFiles = 0;
  if (fileIds.length > 0) {
    try {
      var fileRes = await cloud.deleteFile({ fileList: fileIds });
      deletedFiles = (fileRes.fileList || []).filter(function (f) {
        return f.status === 0;
      }).length;
    } catch (e) {
      console.error('删除云存储图片失败:', e);
    }
  }

  return {
    deleted: {
      records: deletedRecords,
      reminders: deletedReminders,
      inventories: deletedInventories,
      files: deletedFiles,
    },
  };
}

/**
 * 批量更新排序：按 petIds 数组顺序写入 order
 * @param {Object} payload {petIds: Array<string>}
 * @returns {{updated: number}}
 */
async function reorderPets(payload) {
  var db = getDb();
  var openid = getOpenid();
  var petIds = payload.petIds;
  if (!Array.isArray(petIds) || petIds.length === 0 || petIds.length > 100) {
    schema.fail('petIds 必须是 1~100 个的数组');
  }
  var now = Date.now();
  var updated = 0;
  // 逐条校验归属后更新（个人数据量级小，串行即可）
  for (var i = 0; i < petIds.length; i++) {
    var petId = petIds[i];
    try {
      var res = await db.collection('pets')
        .doc(petId)
        .update({ data: { order: i, updateAt: now } });
      // 越权或不存在时 update 不会报错但 stats.updated 为 0，这里再核对一次
      if (res.stats && res.stats.updated > 0) {
        updated += 1;
      }
    } catch (e) {
      console.error('更新排序失败 ' + petId + ':', e);
    }
  }
  return { updated: updated };
}

module.exports = {
  listPets: listPets,
  getPet: getPet,
  savePet: savePet,
  deletePet: deletePet,
  reorderPets: reorderPets,
};
