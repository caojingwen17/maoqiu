// modules/reminderCore.js
// 提醒核心逻辑：纯函数，不依赖 wx-server-sdk，供模块与单测共用
// 覆盖 PRD §9.2 的两条核心规则：
//   1. 周期推进：完成/推送后 remindAt 按 repeatType 推进到下一个周期点
//   2. 去重：同宠物同 category（驱虫再细分内外驱）的 active 周期提醒只保留一条，更新而非新增

var DAY_MS = 24 * 60 * 60 * 1000;

// 加 n 个月（保持日号，月末溢出时取目标月最后一天，如 1月31日 + 1月 = 2月28日）
function addMonthsTs(ts, months) {
  var d = new Date(ts);
  var day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  var lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/**
 * 周期推进一步
 * @param {number} remindAt 当前到期时间
 * @param {string} repeatType none/daily/weekly/monthly/custom_days
 * @param {number} [repeatDays] custom_days 时的天数
 * @returns {number} 下一个到期时间（none 原样返回）
 */
function stepRemindAt(remindAt, repeatType, repeatDays) {
  if (repeatType === 'daily') {
    return remindAt + DAY_MS;
  }
  if (repeatType === 'weekly') {
    return remindAt + 7 * DAY_MS;
  }
  if (repeatType === 'monthly') {
    return addMonthsTs(remindAt, 1);
  }
  if (repeatType === 'custom_days') {
    return remindAt + (repeatDays || 1) * DAY_MS;
  }
  return remindAt; // none 或未知：不推进
}

/**
 * 推进到「未来」的下一周期点：若按周期加完仍在过去（长期未处理），继续推进直到 > now
 * @param {number} remindAt
 * @param {string} repeatType
 * @param {number} [repeatDays]
 * @param {number} [now] 默认当前时间
 * @returns {number}
 */
function computeNextRemindAt(remindAt, repeatType, repeatDays, now) {
  var next = stepRemindAt(remindAt, repeatType, repeatDays);
  var limit = now || Date.now();
  var guard = 0;
  while (next <= limit && guard < 500) {
    var stepped = stepRemindAt(next, repeatType, repeatDays);
    if (stepped === next) {
      break; // none 等不推进的类型，防死循环
    }
    next = stepped;
    guard += 1;
  }
  return next;
}

/**
 * 「完成提醒」的更新补丁：周期提醒推进，一次性置 done（PRD §6.3/§5.5 同一逻辑）
 * @param {Object} reminder {remindAt, repeatType, repeatDays}
 * @param {number} [now]
 * @returns {Object} 更新补丁 {status:'done'} 或 {remindAt, pushFailed:false}
 */
function applyComplete(reminder, now) {
  if (!reminder.repeatType || reminder.repeatType === 'none') {
    return { status: 'done' };
  }
  return {
    remindAt: computeNextRemindAt(reminder.remindAt, reminder.repeatType, reminder.repeatDays, now),
    pushFailed: false,
  };
}

/**
 * 周期提醒去重键：同宠物 + 同 category 一条；驱虫按内/外驱再细分（PRD §9.2 内外驱各一条）
 * @param {Object} doc {petId, category, subKey}
 * @returns {string}
 */
function cycleDedupeKey(doc) {
  return [doc.petId || '', doc.category || '', doc.subKey || ''].join('|');
}

/**
 * 去重决策：给定同键的存量 active 周期提醒与一条新提醒，决定创建还是更新（PRD §9.2）
 * @param {Array} existing 同 petId+category(+subKey) 的 active 提醒（任意顺序）
 * @param {Object} newDoc 新提醒文档（不含 _id）
 * @returns {{action: 'create', doc: Object} | {action: 'update', id: string, patch: Object, disableIds: Array<string>}}
 *   无存量 -> create；有存量 -> 更新最早创建的那条（保留 _id 与订阅授权状态），多余的一律停用
 */
function decideReminderUpsert(existing, newDoc) {
  if (!existing || existing.length === 0) {
    return { action: 'create', doc: newDoc };
  }
  // 按创建时间升序，保留最早的一条
  var sorted = existing.slice().sort(function (a, b) {
    return (a.createAt || 0) - (b.createAt || 0);
  });
  var keeper = sorted[0];
  var patch = {
    title: newDoc.title,
    remindAt: newDoc.remindAt,
    repeatType: newDoc.repeatType,
    repeatDays: newDoc.repeatDays || 0,
    advanceDays: newDoc.advanceDays,
    sourceRecordId: newDoc.sourceRecordId || '',
    subKey: newDoc.subKey || '',
    pushFailed: false,
    updateAt: newDoc.updateAt || Date.now(),
  };
  var disableIds = sorted.slice(1).map(function (r) { return r._id; });
  return { action: 'update', id: keeper._id, patch: patch, disableIds: disableIds };
}

module.exports = {
  DAY_MS: DAY_MS,
  addMonthsTs: addMonthsTs,
  stepRemindAt: stepRemindAt,
  computeNextRemindAt: computeNextRemindAt,
  applyComplete: applyComplete,
  cycleDedupeKey: cycleDedupeKey,
  decideReminderUpsert: decideReminderUpsert,
};
