/**
 * 微信订阅消息发送器。
 * 每条提醒发生时间 + 每个家庭成员只产生一条 delivery，发送成功才消费一条 grant。
 */

const { cloud, db, _, COLLECTIONS, col, getDoc, ensureCollections, removeWhere } = require('./db.js');
const CONFIG = require('../config.js');
const subscription = require('./subscription.js');

const TEMPLATE_ID = CONFIG.REMINDER_SUBSCRIBE_TEMPLATE_ID;
const WINDOW_MS = 30 * 60 * 1000;
const LATE_WINDOW_MS = CONFIG.LATE_WINDOW_MS; // waiting_grant 补救窗口（24h）
const MAX_ATTEMPTS = 3;
const SCAN_LIMIT = 1000; // 单轮扫描安全上限（到期提醒 / 迟发投递共用）

/** offsetDays 显式判空：offsetDays=0（当天提醒）是合法值，不能用 || 兜底成 -7 */
function offsetDaysOf(reminder) {
  return reminder.offsetDays == null ? -7 : Number(reminder.offsetDays);
}

function shanghaiParts(ts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(ts)).reduce((out, p) => { out[p.type] = p.value; return out; }, {});
}

function shanghaiTs(y, m, d, hm) {
  const bits = String(hm || '09:00').split(':');
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(bits[0]) || 0, Number(bits[1]) || 0) - 8 * 60 * 60 * 1000;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

function annualAt(year, base, timeOfDay) {
  const month = Number(base.month);
  const day = Math.min(Number(base.day), daysInMonth(year, month));
  return shanghaiTs(year, month, day, timeOfDay || '09:00');
}

function addDaysShanghai(ts, days) {
  const p = shanghaiParts(ts);
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + days));
  return shanghaiTs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), '00:00');
}

function fixedOccurrence(reminder, now, dueOnly) {
  const p = shanghaiParts(now);
  let candidate;
  if (reminder.repeatType === 'yearly') {
    const base = shanghaiParts(reminder.anniversaryDate || reminder.startAt || reminder.remindAt);
    candidate = annualAt(p.year, base, reminder.timeOfDay || '09:00');
    candidate = addDaysShanghai(candidate, offsetDaysOf(reminder));
    if (candidate < now - WINDOW_MS) {
      candidate = addDaysShanghai(annualAt(Number(p.year) + 1, base, reminder.timeOfDay || '09:00'), offsetDaysOf(reminder));
    }
  } else {
    candidate = shanghaiTs(p.year, p.month, p.day, reminder.timeOfDay || '21:00');
    if (reminder.startAt && candidate < reminder.startAt) candidate = reminder.startAt;
  }
  if (reminder.endAt && candidate > reminder.endAt) return null;
  if (dueOnly) return candidate >= now - WINDOW_MS && candidate <= now ? candidate : null;
  if (candidate >= now - WINDOW_MS) return candidate;
  if (reminder.repeatType === 'yearly') {
    const nextYear = Number(p.year) + 1;
    const base = shanghaiParts(reminder.anniversaryDate || reminder.startAt || reminder.remindAt);
    candidate = annualAt(nextYear, base, reminder.timeOfDay || '09:00');
    candidate = addDaysShanghai(candidate, offsetDaysOf(reminder));
  } else {
    const tomorrow = addDaysShanghai(now, 1);
    const tp = shanghaiParts(tomorrow);
    candidate = shanghaiTs(tp.year, tp.month, tp.day, reminder.timeOfDay || '21:00');
  }
  if (reminder.endAt && candidate > reminder.endAt) return null;
  return candidate;
}

function text(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .trim().slice(0, max || 20);
}

function formatTime(ts) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(ts)).reduce((out, p) => { out[p.type] = p.value; return out; }, {});
  return parts.year + '年' + Number(parts.month) + '月' + Number(parts.day) + '日 ' + parts.hour + ':' + parts.minute;
}

function description(r) {
  if (r.note) return text(r.note, 20);
  const map = {
    vaccine: '请按计划完成疫苗安排',
    deworm: '请按计划完成驱虫安排',
    medication: '请按计划完成用药',
    stock: '库存已到补货阈值',
    stock_expiry: '库存即将到期，请及时处理',
    anniversary: '重要纪念日快到了',
    birthday: '生日快到了，记得准备一下'
  };
  return map[r.category] || '请按计划完成这项待办';
}

function recipientOpenids(reminder, family) {
  if (reminder.notifyScope === 'self') {
    const one = reminder.notifyOpenid || reminder._openid;
    return one ? [one] : [];
  }
  return (family && family.members || []).map((m) => m && m.openid).filter(Boolean);
}

async function claimDelivery(key, reminder, openid, occurrenceAt, familyId) {
  return db.runTransaction(async (transaction) => {
    const gotRes = await transaction.collection(COLLECTIONS.messageDeliveries).where({ deliveryKey: key }).limit(1).get();
    const got = gotRes && gotRes.data && gotRes.data[0];
    const now = Date.now();
    if (got) {
      if (got.status === 'sent' || got.status === 'failed') return null;
      if (got.status === 'waiting_grant' && got.errorCode !== 'NO_GRANT' && (got.attempts || 0) >= MAX_ATTEMPTS) {
        await transaction.collection(COLLECTIONS.messageDeliveries).doc(key).update({ data: { status: 'failed', updateAt: now } });
        return null;
      }
      if (got.status === 'sending' && now - (got.updateAt || got.createAt || now) < 10 * 60 * 1000) return null;
      // waiting_grant 已进入补救期：超 24h 迟发窗口才判死（首次发送的 30 分钟过期判定在 runCron 扫描侧）
      if (got.status === 'waiting_grant' && occurrenceAt < now - LATE_WINDOW_MS) {
        await transaction.collection(COLLECTIONS.messageDeliveries).doc(key).update({ data: { status: 'failed', errorCode: got.errorCode || 'EXPIRED', updateAt: now } });
        return null;
      }
      const attempts = (got.attempts || 0) + 1;
      await transaction.collection(COLLECTIONS.messageDeliveries).doc(key).update({ data: {
        status: 'sending', attempts, updateAt: now
      } });
      return Object.assign({}, got, { attempts, status: 'sending', wasWaiting: got.status === 'waiting_grant' });
    }
    await transaction.collection(COLLECTIONS.messageDeliveries).doc(key).set({ data: {
      deliveryKey: key,
      familyId,
      reminderId: reminder._id,
      recipientOpenid: openid,
      occurrenceAt,
      templateId: TEMPLATE_ID,
      status: 'sending',
      attempts: 1,
      createAt: now,
      updateAt: now
    } });
    return { attempts: 1, status: 'sending' };
  });
}

async function reserveGrant(openid, deliveryKey) {
  // 云数据库事务保证同一条额度不会被并发的两个 cron 实例同时占用。
  return db.runTransaction(async (transaction) => {
    const got = await transaction.collection(COLLECTIONS.messageGrants).where({
      _openid: openid, templateId: TEMPLATE_ID, status: 'available'
    }).orderBy('createAt', 'asc').limit(1).get();
    const grant = got.data && got.data[0];
    if (!grant) return null;
    const now = Date.now();
    await transaction.collection(COLLECTIONS.messageGrants).doc(grant._id).update({ data: {
      status: 'reserved', reservedBy: deliveryKey, reservedAt: now, updateAt: now
    } });
    return grant;
  });
}

async function finishDelivery(key, status, data) {
  await col(COLLECTIONS.messageDeliveries).doc(key).update({ data: Object.assign({ status, updateAt: Date.now() }, data || {}) });
}

async function sendOne(reminder, family, pet, openid, occurrenceAt) {
  const key = String(reminder._id) + '_' + String(occurrenceAt) + '_' + String(openid);
  const claim = await claimDelivery(key, reminder, openid, occurrenceAt, reminder.familyId);
  if (!claim) return { skipped: true };

  const grant = await reserveGrant(openid, key);
  if (!grant) {
    // 首次发送超 30 分钟窗视为过期（避免迟到的首次推送打扰）；waiting_grant 补救期内的按 24h 迟发窗口判定
    const windowMs = claim.wasWaiting ? LATE_WINDOW_MS : WINDOW_MS;
    const expired = occurrenceAt < Date.now() - windowMs;
    await finishDelivery(key, expired ? 'failed' : 'waiting_grant', { errorCode: 'NO_GRANT' });
    return { skipped: true, reason: 'NO_GRANT', retriable: !expired };
  }

  const thing1 = text((pet && pet.name ? pet.name + ' · ' : '') + (reminder.title || '待办事项'), 20);
  const data = {
    thing1: { value: thing1 },
    time2: { value: formatTime(occurrenceAt) },
    thing4: { value: description(reminder) }
  };
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: TEMPLATE_ID,
      page: 'pages/reminder/reminder',
      miniprogramState: CONFIG.REMINDER_MINIPROGRAM_STATE,
      lang: 'zh_CN',
      data
    });
    await col(COLLECTIONS.messageGrants).doc(grant._id).update({ data: { status: 'consumed', consumedAt: Date.now(), updateAt: Date.now() } });
    const sid = subscription.stateId(openid, TEMPLATE_ID);
    await col(COLLECTIONS.messageSubscriptions).doc(sid).update({ data: { sentCount: _.inc(1), updateAt: Date.now() } }).catch(() => {});
    await finishDelivery(key, 'sent', { sentAt: Date.now(), errorCode: '' });
    console.log('[track]', { event: 'notification_send_success', reminderId: reminder._id, openid: String(openid).slice(0, 4) + '***', templateId: TEMPLATE_ID });
    console.log('[notification] sent', { reminderId: reminder._id, openid: String(openid).slice(0, 4) + '***', occurrenceAt });
    return { sent: true };
  } catch (e) {
    const code = String((e && (e.errCode || e.errcode || e.code)) || 'UNKNOWN');
    const permanent = ['43101', '40037', '47003', '41030'].indexOf(code) > -1;
    await col(COLLECTIONS.messageGrants).doc(grant._id).update({ data: {
      status: permanent ? 'invalid' : 'available', updateAt: Date.now(), lastErrorCode: code
    } }).catch(() => {});
    await finishDelivery(key, permanent ? 'failed' : 'waiting_grant', { errorCode: code, errorMessage: String((e && (e.errMsg || e.message)) || '').slice(0, 120) });
    console.log('[track]', { event: 'notification_send_failed', reminderId: reminder._id, openid: String(openid).slice(0, 4) + '***', templateId: TEMPLATE_ID, code });
    console.error('[notification] send failed', { reminderId: reminder._id, openid: String(openid).slice(0, 4) + '***', code });
    return { sent: false, code };
  }
}

/** 分批拉全量 active 提醒（云函数端单次 get 上限 100，skip 分页），remindAt 升序让最紧急的优先处理 */
async function fetchActiveReminders() {
  const all = [];
  let skip = 0;
  while (all.length < SCAN_LIMIT) {
    const got = await col(COLLECTIONS.reminders)
      .where({ status: 'active' })
      .orderBy('remindAt', 'asc')
      .skip(skip)
      .limit(100)
      .get();
    const rows = (got && got.data) || [];
    all.push.apply(all, rows);
    if (rows.length < 100) break;
    skip += rows.length;
  }
  if (all.length >= SCAN_LIMIT) console.warn('[notification] active 提醒达到扫描上限', SCAN_LIMIT, '可能存在漏发，请拆分家庭或提高上限');
  return all;
}

/** 单条提醒的到期发送（runCron 逐条隔离调用） */
async function processReminder(item, at, result) {
  const reminder = item.reminder;
  result.scanned++;
  const family = await getDoc(COLLECTIONS.families, reminder.familyId);
  if (!family || family.dissolved) return;
  const pet = reminder.petId ? await getDoc(COLLECTIONS.pets, reminder.petId) : null;
  if (reminder.petId && (!pet || pet.archived)) return;
  const recipients = recipientOpenids(reminder, family);
  for (const openid of recipients) {
    const out = await sendOne(reminder, family, pet, openid, item.occurrenceAt);
    if (out.sent) result.sent++;
    else if (out.reason === 'NO_GRANT') result.waiting++;
    else if (out.code) result.failed++;
  }
}

/**
 * 迟发通道：waiting_grant 且 occurrenceAt 在 24h 补救窗口内的投递，每轮 cron 重试。
 * 授权晚到的用户不再永久丢通知；超窗由 claimDelivery 判 failed。
 */
async function retryWaitingGrants(at, result) {
  const got = await col(COLLECTIONS.messageDeliveries)
    .where({ status: 'waiting_grant', occurrenceAt: _.gte(at - LATE_WINDOW_MS) })
    .orderBy('occurrenceAt', 'asc')
    .limit(100)
    .get();
  const rows = (got && got.data) || [];
  if (rows.length >= 100) console.warn('[notification] waiting_grant 堆积超过单轮处理上限 100');
  for (const delivery of rows) {
    try {
      const reminder = delivery.reminderId ? await getDoc(COLLECTIONS.reminders, delivery.reminderId) : null;
      if (!reminder || reminder.status !== 'active') continue; // 提醒已删/停用：不再补发，等待超窗自然判死
      const family = await getDoc(COLLECTIONS.families, reminder.familyId);
      if (!family || family.dissolved) continue;
      const pet = reminder.petId ? await getDoc(COLLECTIONS.pets, reminder.petId) : null;
      if (reminder.petId && (!pet || pet.archived)) continue;
      const out = await sendOne(reminder, family, pet, delivery.recipientOpenid, Number(delivery.occurrenceAt));
      if (out.sent) { result.sent++; result.lateRetried++; }
      else if (out.reason === 'NO_GRANT' && !out.retriable) result.failed++;
      else if (out.code) result.failed++;
    } catch (e) {
      console.error('[notification] 迟发重试失败', delivery.deliveryKey, e && (e.message || e));
    }
  }
}

/** 死信与额度清理：a) 30 天前的 sent/failed 投递删除；b) reserved 超 1 小时未更新的额度回滚 available；c) 30 天前的 invalid/consumed 额度删除 */
async function sweep(at) {
  const SWEEP = CONFIG.SWEEP;
  const cleaned = { deliveries: 0, grantsReleased: 0, grantsRemoved: 0 };
  try {
    cleaned.deliveries = await removeWhere(COLLECTIONS.messageDeliveries, {
      status: _.in(['sent', 'failed']), updateAt: _.lt(at - SWEEP.DELIVERY_KEEP_MS)
    }, SWEEP.BATCH_LIMIT);
    // 函数被 kill 残留的 reserved 额度：回滚为 available（1 小时足以覆盖任何在途发送）
    const stuck = await col(COLLECTIONS.messageGrants)
      .where({ status: 'reserved', updateAt: _.lt(at - SWEEP.RESERVED_TIMEOUT_MS) })
      .limit(100)
      .get();
    for (const grant of (stuck && stuck.data) || []) {
      await col(COLLECTIONS.messageGrants).doc(grant._id).update({
        data: { status: 'available', reservedBy: '', reservedAt: 0, updateAt: Date.now() }
      });
      cleaned.grantsReleased++;
    }
    cleaned.grantsRemoved = await removeWhere(COLLECTIONS.messageGrants, {
      status: _.in(['invalid', 'consumed']), updateAt: _.lt(at - SWEEP.GRANT_KEEP_MS)
    }, SWEEP.BATCH_LIMIT);
  } catch (e) {
    console.error('[notification] sweeper 执行失败', e && (e.message || e));
  }
  return cleaned;
}

async function runCron(now) {
  await ensureCollections();
  const at = now || Date.now();
  const minAt = at - WINDOW_MS;
  const result = { scanned: 0, sent: 0, failed: 0, waiting: 0, lateRetried: 0, errors: 0, swept: null };
  const active = await fetchActiveReminders();
  const reminders = active.map((r) => {
    const occurrenceAt = r.scheduleMode === 'fixed' ? fixedOccurrence(r, at, true) : Number(r.remindAt);
    const displayAt = r.scheduleMode === 'fixed' ? fixedOccurrence(r, at, false) : Number(r.remindAt);
    if (displayAt && displayAt !== r.remindAt) col(COLLECTIONS.reminders).doc(r._id).update({ data: { remindAt: displayAt, updateAt: Date.now() } }).catch(() => {});
    return { reminder: r, occurrenceAt };
  }).filter((x) => x.occurrenceAt != null && x.occurrenceAt >= minAt && x.occurrenceAt <= at);
  for (const item of reminders) {
    // 单条失败不拖垮整批：记录后继续处理其余提醒
    try {
      await processReminder(item, at, result);
    } catch (e) {
      result.errors++;
      console.error('[notification] 处理提醒失败', item.reminder && item.reminder._id, e && (e.message || e));
    }
  }
  await retryWaitingGrants(at, result);
  result.swept = await sweep(at);
  return result;
}

module.exports = { runCron, formatTime, description, fixedOccurrence, offsetDaysOf };
