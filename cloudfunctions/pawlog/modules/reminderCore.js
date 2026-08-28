/**
 * 提醒核心规则（纯函数，零云 SDK 依赖，可直接被 __tests__/reminder.test.js 单测）
 *
 * 覆盖 PRD §9.1 / §9.2 的提醒演进规则：
 *  - 周期推进：none（一次性）/ daily / weekly / monthly / custom_days
 *  - 完成语义：周期提醒推进到下一周期；一次性提醒标记 done
 *  - 延后语义：remindAt += 天数，不改变周期
 *  - 去重键：同宠物同 category 的周期提醒只保留一条 active
 *  - 补催窗口：当天 22:00 未完成 → 补催一次，每条每天最多 1 次
 *  - 待办可见区间：remindAt - advanceDays ≤ now
 */

const timeUtil = require('./timeUtil.js');

const DAY = timeUtil.DAY;

/** 上海时区当天 00:00（统一走 timeUtil，避免依赖服务器本地时区） */
const startOfDay = timeUtil.startOfDay;

function daysBetween(a, b) {
  return Math.floor((startOfDay(b) - startOfDay(a)) / DAY);
}

/** 按月推进（保留「日」，跨月自动收敛到月末最后一天） */
function addMonths(ts, months) {
  const d = new Date(ts);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return target.getTime();
}

function addYears(ts, years) {
  const d = new Date(ts);
  const month = d.getMonth();
  const day = d.getDate();
  const target = new Date(d.getFullYear() + years, month, 1);
  const lastDay = new Date(target.getFullYear(), month + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return target.getTime();
}

/**
 * 计算周期提醒「完成」后的下一次触发时间。
 * @param {number} remindAt   当前触发时间戳
 * @param {string} repeatType none|daily|weekly|monthly|custom_days
 * @param {number} repeatDays repeatType=custom_days 时的天数
 * @returns {number|null} 下一次触发时间戳；none 返回 null
 */
function nextRemindAt(remindAt, repeatType, repeatDays) {
  switch (repeatType) {
    case 'daily':
      return remindAt + DAY;
    case 'weekly':
      return remindAt + 7 * DAY;
    case 'monthly':
      return addMonths(remindAt, 1);
    case 'custom_days':
      return remindAt + (repeatDays || 1) * DAY;
    case 'yearly':
      return addYears(remindAt, 1);
    case 'none':
    default:
      return null;
  }
}

/**
 * 周期标签（展示用）
 */
function cycleLabel(repeatType, repeatDays) {
  switch (repeatType) {
    case 'daily': return '每天';
    case 'weekly': return '每周';
    case 'monthly': return '每月';
    case 'custom_days': return '每 ' + (repeatDays || 1) + ' 天';
    case 'yearly': return '每年';
    default: return '一次性';
  }
}

/**
 * 完成一个提醒：返回其「完成」后的目标状态。
 * @param {object} r 提醒对象（含 remindAt/repeatType/repeatDays/status）
 * @returns {{ status: string, remindAt?: number }} done 或 active（带新的 remindAt）
 */
function complete(r) {
  if (r.repeatType && r.repeatType !== 'none') {
    const next = nextRemindAt(r.remindAt, r.repeatType, r.repeatDays);
    if (next === null || next === undefined) return { status: 'done' };
    if (r.endAt && next > r.endAt) return { status: 'done' };
    return { status: 'active', remindAt: next };
  }
  return { status: 'done' };
}

/**
 * 延后：仅本次 remindAt 后移，周期不变（PRD §6.3）
 */
function postpone(r, days) {
  return { remindAt: r.remindAt + (days || 3) * DAY };
}

/** 是否应出现在首页/提醒中心待办区（提前窗口内） */
function isDue(r, now) {
  const advance = (r.advanceDays != null ? r.advanceDays : 7) * DAY;
  return r.status === 'active' && (r.remindAt - advance) <= now;
}

/** 去重键：同宠物同 category 的周期提醒只保留一条 active（PRD §9.2） */
function dedupeKey(r) {
  return [r.petId || '', r.category || ''].join('|');
}

/** 是否需要在当天 22:00 补催：未完成 + 当天尚未补催过（PRD §9.1） */
function shouldNudge(r, now) {
  if (r.status !== 'active') return false;
  if (!isDue(r, now)) return false;
  if (r.lastNudgeAt && daysBetween(r.lastNudgeAt, now) === 0) return false;
  // 仅当天到点的提醒才补催
  return startOfDay(r.remindAt) === startOfDay(now);
}

module.exports = {
  DAY,
  startOfDay,
  daysBetween,
  addMonths,
  addYears,
  nextRemindAt,
  cycleLabel,
  complete,
  postpone,
  isDue,
  dedupeKey,
  shouldNudge
};
