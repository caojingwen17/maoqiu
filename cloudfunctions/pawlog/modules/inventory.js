/**
 * inventory.* —— 库存（囤货）入库/扣减/更新（PRD §10）
 * 按量扣减（byAmount）/ 按件扣减（byPiece）两类模式。
 */

const { db, _, COLLECTIONS, col, assertOwned } = require('./db.js');
const { validateWrite } = require('../schema.js');
const timeUtil = require('./timeUtil.js');
const sec = require('./sec.js');

/** 解析 expireDate（'YYYY-MM-DD'）为上海时区当天某时刻的时间戳；hm 默认 00:00。无法解析返回 NaN。 */
function expiryTs(expireDate, offsetDays, hm) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(expireDate || ''));
  if (!m) return NaN;
  return timeUtil.shanghaiTs(Number(m[1]), Number(m[2]), Number(m[3]) - (offsetDays || 0), hm || '00:00');
}

async function inbound(ctx) {
  const { openid, familyId } = ctx;
  const chk = validateWrite('inventories', ctx.payload, {});
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };
  await sec.assertTextsSafe(openid, [chk.clean.itemName], sec.SCENE.post);
  if (chk.clean.requestId) {
    const duplicate = await col(COLLECTIONS.inventories).where({ familyId, requestId: chk.clean.requestId }).limit(1).get();
    if (duplicate.data && duplicate.data.length) return { _id: duplicate.data[0]._id, inventory: duplicate.data[0], duplicate: true };
  }

  const now = Date.now();
  const clean = chk.clean;
  if (!(Number(clean.totalAmount) > 0)) throw { code: 'INVALID', message: '入库数量必须大于 0' };
  if (clean.remainAmount != null && Number(clean.remainAmount) < 0) throw { code: 'INVALID', message: '剩余数量不能为负数' };
  const data = Object.assign({}, clean, {
    _openid: openid,
    familyId,
    totalAmount: clean.totalAmount != null ? clean.totalAmount : 0,
    remainAmount: clean.remainAmount != null ? clean.remainAmount : clean.totalAmount,
    consumeMode: clean.consumeMode || 'byAmount',
    createAt: now,
    updateAt: now
  });
  const res = await col(COLLECTIONS.inventories).add({ data });
  await syncExpiryReminders(familyId, Object.assign({ _id: res._id }, data));
  if (data.threshold != null && data.remainAmount <= data.threshold) {
    await ensureRestockReminder(familyId, Object.assign({ _id: res._id }, data));
  }
  return { _id: res._id, inventory: data };
}

async function consume(ctx) {
  const { familyId } = ctx;
  const { _id, amount = 1 } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };

  const item = await assertOwned(COLLECTIONS.inventories, familyId, _id);

  const n = Number(amount);
  if (!(n > 0)) throw { code: 'INVALID', message: '消耗数量必须大于 0' };
  const remain = Math.max(0, (item.remainAmount || 0) - n);
  await applyConsume(familyId, item, n, '手动消耗');
  return { _id, remainAmount: remain };
}

/**
 * 记录创建时的显式库存扣减：校验用户选择的库存并返回扣减计划。
 * 不再自动猜测扣减对象 —— 只有 record.create 携带 inventoryId 时才调用。
 * 校验失败（库存被删/不属本家庭/类型不符/已过期/数量不足）直接抛错，由 record.create 在落库前拦截。
 * 数量规则维持原自动扣减逻辑：喂食按「克数」换算单位扣减，驱虫/用药按件扣 1。
 */
async function planConsumeForRecord(familyId, record) {
  if (!record || !record.inventoryId) return null;
  const item = await assertOwned(COLLECTIONS.inventories, familyId, record.inventoryId);
  if (isExpired(item)) throw { code: 'INVALID', message: '「' + (item.itemName || '该囤货') + '」已过期，无法扣减' };
  const dataItems = (record.data && record.data.items) || [];
  const getValue = (label) => ((dataItems.find((x) => x.label === label) || {}).value || '');
  const name = item.itemName || '该囤货';
  if (record.type === 'feed') {
    if (item.category !== '粮食' || item.consumeMode === 'byPiece') {
      throw { code: 'INVALID', message: '「' + name + '」不是可按量扣减的粮食' };
    }
    const grams = parseFloat(getValue('克数'));
    if (!(grams > 0)) throw { code: 'INVALID', message: '请先填写喂食克数，再选择从囤货扣减' };
    if ((item.remainAmount || 0) <= 0) throw { code: 'INVALID', message: '「' + name + '」库存不足' };
    const amount = toInventoryUnit(grams, item.unit);
    if (!(amount > 0)) throw { code: 'INVALID', message: '喂食克数无法换算为「' + name + '」的计量单位' };
    return { item, amount, reason: '喂食记录' };
  }
  if (record.type === 'deworm' || record.type === 'medication') {
    if (item.consumeMode !== 'byPiece') throw { code: 'INVALID', message: '「' + name + '」不是按件扣减的药品' };
    if (item.linkType && item.linkType !== record.type) {
      throw { code: 'INVALID', message: '「' + name + '」关联的记录类型不是' + (record.type === 'deworm' ? '驱虫' : '用药') };
    }
    if ((item.remainAmount || 0) < 1) throw { code: 'INVALID', message: '「' + name + '」库存不足' };
    return { item, amount: 1, reason: record.type === 'deworm' ? '驱虫记录' : '用药记录' };
  }
  throw { code: 'INVALID', message: '该记录类型不支持从囤货扣减' };
}

async function applyConsume(familyId, item, amount, reason) {
  const now = Date.now();
  const remain = Math.max(0, (item.remainAmount || 0) - amount);
  const logs = Array.isArray(item.consumeLogs) ? item.consumeLogs.slice() : [];
  logs.push({ at: now, amount, reason });
  await col(COLLECTIONS.inventories).doc(item._id).update({ data: { remainAmount: remain, consumeLogs: logs.slice(-100), updateAt: now } });
  if ((item.threshold != null && remain <= item.threshold) || remain <= 0) await ensureRestockReminder(familyId, item);
  else await col(COLLECTIONS.reminders).where({ familyId, category: 'stock', status: 'active', sourceInventoryId: item._id }).update({ data: { status: 'disabled', disabledReason: 'restocked', updateAt: now } });
  return remain;
}

async function ensureRestockReminder(familyId, item) {
  const got = await col(COLLECTIONS.reminders).where({ familyId, category: 'stock', sourceInventoryId: item._id }).limit(1).get();
  if (got.data && got.data.length) {
    if (got.data[0].status === 'done') return;
    await col(COLLECTIONS.reminders).doc(got.data[0]._id).update({ data: { status: 'active', disabledReason: '', remindAt: Date.now(), updateAt: Date.now() } });
    return;
  }
  await col(COLLECTIONS.reminders).add({ data: {
    familyId, _openid: item._openid || '', petId: item.petId || '', title: (item.itemName || '库存物品') + '快没了',
    category: 'stock', remindAt: Date.now(), repeatType: 'none', advanceDays: 0, sourceInventoryId: item._id,
    notifyScope: 'family', notifyOpenid: '', scheduleMode: 'after_complete',
    status: 'active', createAt: Date.now(), updateAt: Date.now()
  } });
}

/** 为库存临期建立 30/15/3/0 天四个一次性提醒。 */
async function syncExpiryReminders(familyId, item) {
  if (!item || !item._id) return;
  const now = Date.now();
  await col(COLLECTIONS.reminders).where({ familyId, category: 'stock_expiry', sourceInventoryId: item._id, status: 'active' }).update({
    data: { status: 'disabled', disabledReason: 'recalculated', updateAt: now }
  });
  if (!item.expireDate) return;
  if (isNaN(expiryTs(item.expireDate, 0))) return;
  const offsets = [30, 15, 3, 0];
  for (let index = 0; index < offsets.length; index++) {
    const days = offsets[index];
    // 到期日按上海时区 09:00 推送（不再用服务器本地时区 setHours）
    const at = expiryTs(item.expireDate, days, '09:00');
    if (at < now && days !== 0) continue;
    const remindAt = days === 0 && at < now ? now : at;
    await col(COLLECTIONS.reminders).add({ data: {
      familyId, _openid: item._openid || '', petId: item.petId || '', title: (item.itemName || '物品') + '临期',
      category: 'stock_expiry', remindAt, repeatType: 'none', advanceDays: 0, sourceInventoryId: item._id,
      expiryOffsetDays: days, notifyScope: 'family', notifyOpenid: '', scheduleMode: 'after_complete',
      status: 'active', createAt: now + index, updateAt: now
    } });
  }
}

function isExpired(item) {
  if (!item.expireDate) return false;
  const t = expiryTs(item.expireDate, 0);
  return t > 0 && t < Date.now();
}

function toInventoryUnit(grams, unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'kg' || u === '公斤' || u === '千克') return grams / 1000;
  if (u === 'g' || u === '克') return grams;
  return 0;
}

async function update(ctx) {
  const { familyId, openid } = ctx;
  const { _id, ...fields } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const chk = validateWrite('inventories', fields, { partial: true });
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };
  await sec.assertTextsSafe(openid, [chk.clean.itemName], sec.SCENE.post);
  const existing = await assertOwned(COLLECTIONS.inventories, familyId, _id);
  await col(COLLECTIONS.inventories).doc(_id).update({
    data: Object.assign({}, chk.clean, { updateAt: Date.now() })
  });
  const updated = Object.assign({}, existing, chk.clean, { _id });
  await syncExpiryReminders(familyId, updated);
  if (updated.threshold != null && updated.remainAmount <= updated.threshold) {
    await ensureRestockReminder(familyId, updated);
  } else {
    await col(COLLECTIONS.reminders).where({ familyId, category: 'stock', sourceInventoryId: _id, status: 'active' }).update({
      data: { status: 'disabled', disabledReason: 'above_threshold', updateAt: Date.now() }
    });
  }
  return { _id };
}

async function remove(ctx) {
  const { familyId } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  await assertOwned(COLLECTIONS.inventories, familyId, _id);
  await col(COLLECTIONS.reminders).where({ familyId, sourceInventoryId: _id, status: 'active' }).update({ data: { status: 'disabled', disabledReason: 'inventory_removed', updateAt: Date.now() } });
  await col(COLLECTIONS.inventories).doc(_id).remove();
  return { _id };
}

/** 囤货列表（轻量单查询，囤货页/物品详情用；不再借道 home.aggregate 的 9 条查询） */
async function list(ctx) {
  const { familyId } = ctx;
  const res = await col(COLLECTIONS.inventories).where({ familyId }).limit(100).get();
  return res.data || [];
}

module.exports = { inbound, consume, planConsumeForRecord, applyConsume, update, remove, syncExpiryReminders, list };
