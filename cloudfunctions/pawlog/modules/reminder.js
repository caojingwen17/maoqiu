/**
 * reminder.* —— 提醒 CRUD + 完成/延后/停用（PRD §9）
 * 周期演进规则剥离到 reminderCore.js（纯函数，可单测）。
 */

const { db, _, COLLECTIONS, col, assertOwned } = require('./db.js');
const { validateWrite } = require('../schema.js');
const core = require('./reminderCore.js');
const CONFIG = require('../config.js');
const sec = require('./sec.js');

async function create(ctx) {
  const { openid, familyId } = ctx;
  const chk = validateWrite('reminders', ctx.payload, {});
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };

  await sec.assertTextsSafe(openid, [chk.clean.title, chk.clean.note], sec.SCENE.post);

  const now = Date.now();
  const data = Object.assign({}, chk.clean, {
    _openid: openid,
    familyId,
    repeatType: chk.clean.repeatType || 'none',
    status: chk.clean.status || 'active',
    advanceDays: chk.clean.advanceDays != null ? chk.clean.advanceDays : 7,
    notifyScope: chk.clean.notifyScope === 'self' ? 'self' : 'family',
    notifyOpenid: chk.clean.notifyScope === 'self' ? openid : '',
    scheduleMode: chk.clean.scheduleMode || 'after_complete',
    createAt: now,
    updateAt: now
  });
  const res = await col(COLLECTIONS.reminders).add({ data });
  return { _id: res._id, reminder: data };
}

async function update(ctx) {
  const { familyId, openid } = ctx;
  const { _id, ...fields } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const chk = validateWrite('reminders', fields, { partial: true });
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };
  await sec.assertTextsSafe(openid, [chk.clean.title, chk.clean.note], sec.SCENE.post);
  await assertOwned(COLLECTIONS.reminders, familyId, _id);
  const clean = Object.assign({}, chk.clean);
  if (clean.notifyScope) {
    clean.notifyScope = clean.notifyScope === 'self' ? 'self' : 'family';
    clean.notifyOpenid = clean.notifyScope === 'self' ? openid : '';
  }
  await col(COLLECTIONS.reminders).doc(_id).update({
    data: Object.assign({}, clean, { updateAt: Date.now() })
  });
  return { _id };
}

async function complete(ctx) {
  const { familyId, openid, family } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };

  const r = await assertOwned(COLLECTIONS.reminders, familyId, _id);

  const out = core.complete(r);
  const completedAt = Date.now();
  const member = (family && family.members || []).find((m) => m.openid === openid);
  const completeData = {
      status: out.status,
      completedAt,
      completedBy: openid,
      completedByName: (member && member.nickname) || '',
      updateAt: completedAt
  };
  if (out.remindAt !== undefined) completeData.remindAt = out.remindAt;
  await col(COLLECTIONS.reminders).doc(_id).update({ data: completeData });
  return { _id, ...out };
}

async function postpone(ctx) {
  const { familyId } = ctx;
  const { _id, days: days0 } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };

  const r = await assertOwned(COLLECTIONS.reminders, familyId, _id);

  // 默认/上限走 config：防客户端传超大天数把提醒推到遥远的未来
  let days = Number(days0);
  if (!(days > 0)) days = CONFIG.POSTPONE_DAYS;
  days = Math.min(days, CONFIG.POSTPONE_DAYS_MAX);
  const out = core.postpone(r, days);
  await col(COLLECTIONS.reminders).doc(_id).update({ data: { remindAt: out.remindAt, updateAt: Date.now() } });
  return { _id, remindAt: out.remindAt };
}

async function disable(ctx) {
  const { familyId } = ctx;
  const { _id, disabled = true } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  await assertOwned(COLLECTIONS.reminders, familyId, _id);
  await col(COLLECTIONS.reminders).doc(_id).update({
    data: { status: disabled ? 'disabled' : 'active', updateAt: Date.now() }
  });
  return { _id, status: disabled ? 'disabled' : 'active' };
}

/** 忽略本次：周期提醒推进到下一周期，一次性提醒直接结束但不进入已完成记录。 */
async function ignore(ctx) {
  const { familyId, openid } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const r = await assertOwned(COLLECTIONS.reminders, familyId, _id);
  const out = core.complete(r);
  const now = Date.now();
  const ignoreData = { status: out.status, ignoredAt: now, ignoredBy: openid, updateAt: now };
  if (out.remindAt !== undefined) ignoreData.remindAt = out.remindAt;
  await col(COLLECTIONS.reminders).doc(_id).update({ data: ignoreData });
  return { _id, ...out };
}

/** 提醒列表（提醒中心：进行中/已完成，PRD §9） */
async function list(ctx) {
  const { familyId } = ctx;
  const { status, limit = 100 } = ctx.payload || {};
  const pageSize = Math.min(Number(limit) || 100, 200);

  // status='all'：提醒页一屏数据合并返回（进行中 + 近 30 天已完成 + 宠物名册），
  // 三个查询互不依赖并行发出；调用方从 3 次函数调用收敛为 1 次
  if (status === 'all') {
    const [activesRes, donesRes, petsRes] = await Promise.all([
      col(COLLECTIONS.reminders).where({ familyId, status: 'active' }).orderBy('remindAt', 'asc').limit(pageSize).get(),
      col(COLLECTIONS.reminders).where({ familyId, status: 'done', completedAt: _.gte(Date.now() - 30 * core.DAY) }).orderBy('remindAt', 'asc').limit(pageSize).get(),
      col(COLLECTIONS.pets).where({ familyId }).field({ name: true, avatar: true, archived: true, order: true }).orderBy('order', 'asc').get()
    ]);
    return { actives: activesRes.data || [], dones: donesRes.data || [], pets: petsRes.data || [] };
  }

  const cond = { familyId };
  if (status) cond.status = status;
  if (status === 'done') {
    cond.completedAt = _.gte(Date.now() - 30 * core.DAY);
  }
  const res = await col(COLLECTIONS.reminders)
    .where(cond)
    .orderBy('remindAt', 'asc')
    .limit(pageSize)
    .get();
  return res.data || [];
}

module.exports = { create, update, complete, postpone, disable, ignore, list };
