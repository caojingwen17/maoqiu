/**
 * record.* —— 记录 CRUD（create / update / remove）
 * 所有类型记录统一集合 records（PRD §4.2）。写入经 schema 白名单校验。
 */

const { db, _, COLLECTIONS, col, assertOwned, ensureCollections, removeWhere, getDoc, getSettingsMerged } = require('./db.js');
const { validateWrite } = require('../schema.js');
const core = require('./reminderCore.js');
const timeUtil = require('./timeUtil.js');
const CONFIG = require('../config.js');
const inventory = require('./inventory.js');
const sec = require('./sec.js');

/** 记录 UGC 文本：备注 + data.items 各填写项的值（药品名/医院/自定义内容等） */
function recordTexts(clean) {
  const texts = [clean.note];
  const items = (clean.data && Array.isArray(clean.data.items)) ? clean.data.items : [];
  items.forEach((x) => { if (x && typeof x.value === 'string') texts.push(x.value); });
  return texts;
}

const TYPES = [
  'weight', 'vaccine', 'deworm', 'medical', 'medication', 'surgery',
  'feed', 'water', 'snack', 'groom', 'poop', 'vomit', 'heat',
  'expense', 'walk', 'milestone', 'custom', 'daily', 'litter'
];

async function create(ctx) {
  const { openid, familyId, family } = ctx;
  const chk = validateWrite('records', ctx.payload, {});
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };

  if (TYPES.indexOf(chk.clean.type) === -1) {
    throw { code: 'INVALID', message: '未知记录类型: ' + chk.clean.type };
  }

  if (chk.clean.petId) {
    const pet = await assertOwned(COLLECTIONS.pets, familyId, chk.clean.petId);
    if (pet.archived) throw { code: 'FORBIDDEN', message: '归档宠物为只读状态' };
  }
  if (chk.clean.date && chk.clean.date > Date.now()) throw { code: 'INVALID', message: '记录日期不能晚于今天' };
  await sec.assertTextsSafe(openid, recordTexts(chk.clean), sec.SCENE.post);
  if (Array.isArray(chk.clean.photos) && chk.clean.photos.length) {
    await sec.assertCloudImagesSafe(chk.clean.photos);
  }
  if (chk.clean.requestId) {
    const duplicate = await col(COLLECTIONS.records).where({ familyId, requestId: chk.clean.requestId }).limit(1).get();
    if (duplicate.data && duplicate.data.length) return { _id: duplicate.data[0]._id, record: duplicate.data[0], duplicate: true };
  }

  // 显式库存扣减：选了囤货先在落库前校验（被删/类型不符/过期/不足直接报错，用户可修正重试，不会产生重复记录）
  let consumePlan = null;
  if (chk.clean.inventoryId) {
    consumePlan = await inventory.planConsumeForRecord(familyId, chk.clean);
  }

  const now = Date.now();
  const data = Object.assign({}, chk.clean, {
    _openid: openid,
    familyId,
    createdBy: openid,
    createdByName: memberName(family, openid),
    date: chk.clean.date || now,
    createAt: now,
    updateAt: now
  });
  const res = await col(COLLECTIONS.records).add({ data });
  // 派生联动：疫苗/驱虫 → 周期提醒；选定囤货 → 库存扣减
  try {
    await deriveFromRecord(openid, familyId, Object.assign({ _id: res._id }, data));
    if (consumePlan) await inventory.applyConsume(familyId, consumePlan.item, consumePlan.amount, consumePlan.reason);
  } catch (e) {
    // 主记录已经落库，联动失败不应让用户重试造成重复记录；后续可由补偿任务重算。
    console.error('[record][derive]', e && e.message);
  }
  return { _id: res._id, record: data };
}

async function update(ctx) {
  const { openid, familyId } = ctx;
  const { _id, ...fields } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const chk = validateWrite('records', fields, { partial: true });
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };
  const existing = await assertOwned(COLLECTIONS.records, familyId, _id);
  const targetPetId = chk.clean.petId || existing.petId;
  if (targetPetId) {
    const pet = await assertOwned(COLLECTIONS.pets, familyId, targetPetId);
    if (pet.archived) throw { code: 'FORBIDDEN', message: '归档宠物为只读状态' };
  }
  if (chk.clean.date && chk.clean.date > Date.now()) throw { code: 'INVALID', message: '记录日期不能晚于今天' };
  await sec.assertTextsSafe(openid, recordTexts(chk.clean), sec.SCENE.post);
  // 照片只校验本次新增部分（已入库的照片此前已过关）
  if (Array.isArray(chk.clean.photos)) {
    const oldPhotos = Array.isArray(existing.photos) ? existing.photos : [];
    const added = chk.clean.photos.filter((p) => oldPhotos.indexOf(p) === -1);
    if (added.length) await sec.assertCloudImagesSafe(added);
  }
  await col(COLLECTIONS.records).doc(_id).update({
    data: Object.assign({}, chk.clean, { updateAt: Date.now() })
  });
  // 编辑会产生提醒的记录时同步重算派生提醒：旧派生提醒直接删除重建（避免 disabled 垃圾线性累积）；
  // 只按 sourceRecordId 匹配派生提醒，用户手工建的同类提醒不动。
  // deworm 已不再派生提醒，但仍保留在清理名单里：编辑历史驱虫记录时把它早年派生的提醒一并清掉。
  const updatedRecord = Object.assign({}, existing, chk.clean, { _id });
  const cleanupTypes = ['vaccine', 'deworm', 'medication'];
  const deriveTypes = ['vaccine', 'medication'];
  if (cleanupTypes.indexOf(existing.type) > -1 || cleanupTypes.indexOf(updatedRecord.type) > -1) {
    await removeWhere(COLLECTIONS.reminders, { familyId, sourceRecordId: _id });
    if (deriveTypes.indexOf(updatedRecord.type) > -1 && updatedRecord.petId) await deriveFromRecord(openid, familyId, updatedRecord);
  }
  return { _id };
}

async function remove(ctx) {
  const { familyId } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  await assertOwned(COLLECTIONS.records, familyId, _id);
  await col(COLLECTIONS.records).doc(_id).remove();
  // 派生提醒联动：删除记录时把由它派生的 active 提醒置为 disabled（PRD §8.1），不做周期重算
  await col(COLLECTIONS.reminders).where({ familyId, sourceRecordId: _id, status: 'active' }).update({
    data: { status: 'disabled', updateAt: Date.now() }
  });
  return { _id };
}

function memberName(family, openid) {
  const m = (family && family.members || []).find((x) => x.openid === openid);
  // 显示名优先级：家庭内称呼 > 微信昵称（与 members 页/createdByName 回填一致）
  return (m && ((m.familyNick || '').trim() || m.nickname)) || '';
}

/** 记录列表（宠物详情时间线 / 类型筛选，PRD §8） */
async function list(ctx) {
  const { familyId } = ctx;
  const { petId, type, limit = 30, before } = ctx.payload || {};
  const cond = { familyId };
  if (petId) cond.petId = petId;
  if (type) cond.type = type;
  const pageSize = Math.min(Number(limit) || 30, 50);
  let beforeDate = null;
  if (before) {
    try {
      const parsed = JSON.parse(Buffer.from(String(before), 'base64').toString('utf8'));
      if (parsed && Number.isFinite(Number(parsed.date))) beforeDate = Number(parsed.date);
    } catch (e) { /* 无效游标按第一页处理 */ }
  }
  if (beforeDate != null) cond.date = _.lt(beforeDate);
  const res = await col(COLLECTIONS.records)
    .where(cond)
    .orderBy('date', 'desc')
    .limit(pageSize + 1)
    .get();
  const rows = res.data || [];
  const items = rows.slice(0, pageSize);
  await applyFreshNames(items, familyId);
  const hasMore = rows.length > pageSize;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last && last.date != null
    ? Buffer.from(JSON.stringify({ date: last.date })).toString('base64')
    : '';
  return { items, hasMore, nextCursor };
}

/** 单条记录（记录详情，PRD §8.1）；顺带补上宠物名，免客户端为个名字再跑聚合 */
async function get(ctx) {
  const { familyId } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const record = await assertOwned(COLLECTIONS.records, familyId, _id);
  const jobs = [applyFreshNames([record], familyId)];
  if (record.petId) {
    jobs.push(getDoc(COLLECTIONS.pets, record.petId).then((p) => {
      if (p) record.petName = p.name || '';
    }));
  }
  await Promise.all(jobs);
  return record;
}

/**
 * 记录人显示名以 settings.familyNick（家庭内称呼）为最新准：
 * createdByName 只是写入时的快照，用户后补称呼或回填未跑时快照会停留在微信昵称，
 * 读取时统一覆盖，保证时间线/记录详情展示与「我的」资料一致。
 * 称呼按当前家庭 familyId 关联（同一用户可能有多条 settings 文档，见 db.getSettingsMerged）。
 */
async function applyFreshNames(records, familyId) {
  const openids = Array.from(new Set(records.map((r) => r && r.createdBy).filter(Boolean)));
  if (!openids.length) return;
  const byId = await getSettingsMerged(openids, familyId);
  const nickOf = {};
  Object.keys(byId).forEach((openid) => {
    const v = String((byId[openid] && byId[openid].familyNick) || '').trim();
    if (v) nickOf[openid] = v;
  });
  records.forEach((r) => {
    if (r && nickOf[r.createdBy]) r.createdByName = nickOf[r.createdBy];
  });
}

/** 相册分页：只返回当前宠物记录中的照片，不把照片数组随时间线全量带回。 */
async function photos(ctx) {
  await ensureCollections();
  const { familyId } = ctx;
  const { petId, limit = 30, before } = ctx.payload || {};
  if (!petId) throw { code: 'INVALID', message: '缺少 petId' };
  await assertOwned(COLLECTIONS.pets, familyId, petId);
  const cond = { familyId, petId, photos: _.exists(true) };
  let beforeDate = null;
  if (before) {
    try {
      const parsed = JSON.parse(Buffer.from(String(before), 'base64').toString('utf8'));
      if (parsed && Number.isFinite(Number(parsed.date))) beforeDate = Number(parsed.date);
    } catch (e) { /* 无效游标按第一页处理 */ }
  }
  if (beforeDate != null) cond.date = _.lt(beforeDate);
  const pageSize = Math.min(Number(limit) || 30, 50);
  const result = await col(COLLECTIONS.records)
    .where(cond)
    .field({ photos: true, date: true })
    .orderBy('date', 'desc')
    .limit(pageSize + 1)
    .get();
  const rows = result.data || [];
  const hasMore = rows.length > pageSize;
  const used = rows.slice(0, pageSize);
  const items = [];
  used.forEach((row) => (Array.isArray(row.photos) ? row.photos : []).forEach((url) => {
    if (url) items.push(url);
  }));
  const last = used[used.length - 1];
  const nextCursor = hasMore && last && last.date != null
    ? Buffer.from(JSON.stringify({ date: last.date })).toString('base64')
    : '';
  return { items, hasMore, nextCursor };
}

/** 记录派生联动（PRD §9.2 / §8.1）：疫苗/用药 → 周期提醒；驱虫不派生，统一在提醒页手工新建 */
async function deriveFromRecord(openid, familyId, record) {
  const now = Date.now();
  const data = record.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const getValue = (label) => {
    const it = items.find((x) => x.label === label);
    return it && it.value != null ? String(it.value) : '';
  };

  if (record.type === 'vaccine') {
    const cycleDays = CONFIG.DEFAULT_CYCLES.vaccine;
    const remindAt = data.nextDate || (now + cycleDays * core.DAY);
    const vaccineName = items.length && items[0].value && items[0].value !== '其他' ? items[0].value + '疫苗' : '疫苗';
    // 去重只认派生提醒（sourceRecordId 存在），用户手工建的疫苗提醒不被接管
    const got = await col(COLLECTIONS.reminders).where({ familyId, petId: record.petId, category: 'vaccine', status: 'active', sourceRecordId: _.exists(true) }).limit(1).get();
    const reminderData = {
      _openid: openid, familyId, petId: record.petId, title: vaccineName, category: 'vaccine', remindAt,
      repeatType: 'custom_days', repeatDays: cycleDays, advanceDays: CONFIG.DEFAULT_ADVANCE_DAYS,
      sourceRecordId: record._id, notifyScope: 'family', notifyOpenid: '', scheduleMode: 'after_complete', status: 'active', updateAt: now
    };
    if (got.data && got.data.length) await col(COLLECTIONS.reminders).doc(got.data[0]._id).update({ data: reminderData });
    else await col(COLLECTIONS.reminders).add({ data: Object.assign({ createAt: now }, reminderData) });
  }

  if (record.type === 'medication') {
    await col(COLLECTIONS.reminders).where({ familyId, sourceRecordId: record._id, category: 'medication', status: 'active' }).update({
      data: { status: 'disabled', disabledReason: data.medicationReminder === false ? 'disabled_by_user' : 'replaced', updateAt: now }
    });
    if (data.medicationReminder === false) return;
    const courseDays = Number(data.courseDays);
    const times = Array.isArray(data.medicationTimes) && data.medicationTimes.length ? data.medicationTimes : ['21:00'];
    if (!(courseDays >= 1 && courseDays <= 90)) return;
    const start = Math.max(core.startOfDay(record.date || now), core.startOfDay(now));
    const end = start + (courseDays - 1) * core.DAY + core.DAY - 1;
    for (let i = 0; i < times.length; i++) {
      const hm = String(times[i]).split(':');
      // 用药时间按上海时区对齐（start 已是上海时区当天 00:00）
      const sp = timeUtil.shanghaiParts(start);
      let firstTs = timeUtil.shanghaiTs(sp.year, sp.month, sp.day, (Number(hm[0]) || 21) + ':' + (Number(hm[1]) || 0));
      while (firstTs < now) firstTs += core.DAY;
      await col(COLLECTIONS.reminders).add({ data: {
        _openid: openid, familyId, petId: record.petId, title: getValue('药品') || '用药提醒', category: 'medication',
        remindAt: firstTs, repeatType: 'daily', repeatDays: 1, advanceDays: 0, scheduleMode: 'fixed',
        startAt: start, endAt: end, timeOfDay: times[i], slotKey: 'med_' + i, sourceRecordId: record._id,
        notifyScope: 'family', notifyOpenid: '', status: 'active', createAt: now, updateAt: now
      } });
    }
  }

}

module.exports = { create, update, remove, list, photos, get };
