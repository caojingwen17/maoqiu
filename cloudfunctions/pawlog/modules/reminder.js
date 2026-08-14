// modules/reminder.js
// 提醒模块：列表、首页待办聚合、完成/延后/停用、手动创建、定时推送
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

// 取提醒并校验归属
async function getOwnedReminder(reminderId) {
  var db = getDb();
  var res = await db.collection('reminders').doc(reminderId).get().catch(function () {
    schema.fail('提醒不存在', 404);
  });
  if (!res.data || res.data._openid !== getOpenid()) {
    schema.fail('提醒不存在或无权限', 404);
  }
  return res.data;
}

/**
 * 提醒列表：进行中按 remindAt 升序 + 近 30 天已完成（PRD §9.1）
 * @returns {{active: Array, done: Array}}
 */
async function listReminders() {
  var db = getDb();
  var openid = getOpenid();
  var _ = db.command;
  var thirtyDaysAgo = Date.now() - 30 * reminderCore.DAY_MS;
  var results = await Promise.all([
    db.collection('reminders')
      .where({ _openid: openid, status: 'active' })
      .orderBy('remindAt', 'asc')
      .limit(200)
      .get(),
    db.collection('reminders')
      .where({ _openid: openid, status: 'done', updateAt: _.gte(thirtyDaysAgo) })
      .orderBy('updateAt', 'desc')
      .limit(100)
      .get(),
  ]);
  return { active: results[0].data, done: results[1].data };
}

/**
 * 首页待办：status=active 且已进入提前展示期（remindAt - advanceDays <= now），升序
 * advanceDays 存在文档上无法直接写进 where，故取全量 active 后在内存过滤（个人量级小）
 * @returns {{list: Array, total: number}}
 */
async function getTodos() {
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();
  var res = await db.collection('reminders')
    .where({ _openid: openid, status: 'active' })
    .orderBy('remindAt', 'asc')
    .limit(200)
    .get();
  var list = res.data.filter(function (r) {
    var advanceDays = typeof r.advanceDays === 'number' ? r.advanceDays : config.DEFAULT_ADVANCE_DAYS;
    return r.remindAt - advanceDays * reminderCore.DAY_MS <= now;
  });
  return { list: list, total: list.length };
}

/**
 * 完成提醒：周期提醒推进到下一周期，一次性置 done（PRD §6.3）
 * @param {Object} payload {reminderId}
 * @returns {{remindAt: number|null}} 周期提醒返回新到期时间，一次性返回 null
 */
async function completeReminder(payload) {
  var db = getDb();
  if (!payload.reminderId) {
    schema.fail('缺少 reminderId');
  }
  var reminder = await getOwnedReminder(payload.reminderId);
  if (reminder.status !== 'active') {
    schema.fail('该提醒已完成或已停用');
  }
  var patch = reminderCore.applyComplete(reminder, Date.now());
  patch.updateAt = Date.now();
  await db.collection('reminders').doc(payload.reminderId).update({ data: patch });
  return { remindAt: patch.remindAt || null };
}

/**
 * 延后 3 天：只改本次 remindAt，不动周期（PRD §6.3）
 * @param {Object} payload {reminderId}
 * @returns {{remindAt: number}}
 */
async function snoozeReminder(payload) {
  var db = getDb();
  if (!payload.reminderId) {
    schema.fail('缺少 reminderId');
  }
  var reminder = await getOwnedReminder(payload.reminderId);
  if (reminder.status !== 'active') {
    schema.fail('该提醒已完成或已停用');
  }
  var next = reminder.remindAt + 3 * reminderCore.DAY_MS;
  await db.collection('reminders').doc(payload.reminderId)
    .update({ data: { remindAt: next, updateAt: Date.now() } });
  return { remindAt: next };
}

/**
 * 停用提醒
 * @param {Object} payload {reminderId}
 */
async function disableReminder(payload) {
  var db = getDb();
  if (!payload.reminderId) {
    schema.fail('缺少 reminderId');
  }
  await getOwnedReminder(payload.reminderId);
  await db.collection('reminders').doc(payload.reminderId)
    .update({ data: { status: 'disabled', updateAt: Date.now() } });
  return null;
}

/**
 * 手动创建提醒（PRD §9.2：完全自定义）
 * @param {Object} payload {reminder}
 * @returns {{reminderId: string}}
 */
async function createReminder(payload) {
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();
  var doc = schema.validateReminder(payload.reminder);
  doc._openid = openid;
  doc.status = 'active';
  doc.sourceRecordId = '';
  doc.subKey = '';
  doc.createAt = now;
  doc.updateAt = now;
  var addRes = await db.collection('reminders').add({ data: doc });
  return { reminderId: addRes._id };
}

// 推送文案的日期格式：「2026-08-11 09:00」
function fmtPushDate(ts) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  var d = new Date(ts);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/**
 * 定时推送入口（config.json 触发器，每小时一次，PRD §5.5）：
 * 查「已到期（remindAt <= now）且已授权订阅消息」的提醒，逐条推送；
 * 成功按周期推进/置 done，失败标记 pushFailed 降级为小程序内展示。
 * 幂等设计：
 * 1) lastPushedFor 记录「已为哪个 remindAt 推过」，同一到期实例不重复推送；
 * 2) 先快照 _id 列表再逐条处理，避免边处理边 skip 翻页导致的结果集漂移；
 * 3) 窗口收窄为「已到期」而非「24h 内」——否则 daily 等短周期提醒推进后
 *    仍落在窗口内，会被反复命中、remindAt 无限提前。
 * 注意：定时器触发无用户态，跨用户扫描（云函数为管理员权限）
 */
async function remindPush() {
  var db = getDb();
  var _ = db.command;
  var now = Date.now();
  var sent = 0;
  var failed = 0;

  // 第一步：快照全部到期提醒的 _id（快照期间不做任何写操作，skip 翻页安全）
  var ids = [];
  var skip = 0;
  while (ids.length < 2000) {
    var res = await db.collection('reminders')
      .where({ status: 'active', subscribeAuth: true, remindAt: _.lte(now) })
      .orderBy('remindAt', 'asc')
      .skip(skip)
      .limit(100)
      .field({ _id: true })
      .get();
    for (var i = 0; i < res.data.length; i++) ids.push(res.data[i]._id);
    if (res.data.length < 100) break;
    skip += 100;
  }

  // 第二步：逐条取最新文档处理
  for (var j = 0; j < ids.length; j++) {
    var docRes = await db.collection('reminders').doc(ids[j]).get().catch(function () { return null; });
    var r = docRes && docRes.data;
    // 处理期间状态可能已变（用户在小程序内完成/停用），或该到期实例已推过
    if (!r || r.status !== 'active' || !r.subscribeAuth || r.remindAt > now) continue;
    if (r.lastPushedFor && r.lastPushedFor >= r.remindAt) continue;
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: r._openid,
        templateId: config.SUBSCRIBE_TEMPLATE_ID,
        page: 'pages/reminder/index',
        data: {
          thing1: { value: (r.title || '宠物提醒').slice(0, 20) },
          date2: { value: fmtPushDate(r.remindAt) },
          thing3: { value: '到期请及时处理'.slice(0, 20) },
        },
      });
      // 推送成功：标记本实例已推 + 周期推进 / 一次性置 done
      var patch = reminderCore.applyComplete(r, now);
      patch.lastPushedFor = r.remindAt;
      patch.updateAt = now;
      await db.collection('reminders').doc(r._id).update({ data: patch });
      sent += 1;
    } catch (e) {
      // 推送失败（授权余量不足等）：标记降级，仅小程序内展示
      console.error('推送失败 ' + r._id + ':', e);
      await db.collection('reminders').doc(r._id)
        .update({ data: { pushFailed: true, updateAt: now } })
        .catch(function () {});
      failed += 1;
    }
  }
  return { sent: sent, failed: failed };
}

module.exports = {
  listReminders: listReminders,
  getTodos: getTodos,
  completeReminder: completeReminder,
  snoozeReminder: snoozeReminder,
  disableReminder: disableReminder,
  createReminder: createReminder,
  remindPush: remindPush,
};
