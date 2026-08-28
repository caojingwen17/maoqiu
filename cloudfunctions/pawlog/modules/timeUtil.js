/**
 * 时区公共工具：所有「当天边界 / 日期换算」统一以 Asia/Shanghai 为基准。
 * 云函数运行环境的本地时区不保证是东八区，禁止再用 new Date().setHours/getDate 等本地时区 API 算业务日期。
 * 纯函数、零云 SDK 依赖，可直接被 __tests__ 单测。
 */

const TZ = 'Asia/Shanghai';
const DAY = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Shanghai 固定 UTC+8（无夏令时）

/** 取某时间戳在上海时区的 年/月/日 */
function shanghaiParts(ts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(ts)).reduce((out, p) => { out[p.type] = p.value; return out; }, {});
}

/** 由上海时区的 年/月/日[+hh:mm] 反推 UTC 时间戳 */
function shanghaiTs(y, m, d, hm) {
  const bits = String(hm || '00:00').split(':');
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(bits[0]) || 0, Number(bits[1]) || 0) - TZ_OFFSET_MS;
}

/** 上海时区当天 00:00 的时间戳 */
function startOfDay(ts) {
  const p = shanghaiParts(ts == null ? Date.now() : ts);
  return shanghaiTs(p.year, p.month, p.day);
}

/** 上海时区当月 1 号 00:00 的时间戳 */
function startOfMonth(ts) {
  const p = shanghaiParts(ts == null ? Date.now() : ts);
  return shanghaiTs(p.year, p.month, 1);
}

/** 上海时区下 N 个月 1 号 00:00（months 可为负） */
function shiftMonthStart(ts, months) {
  const p = shanghaiParts(ts == null ? Date.now() : ts);
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1 + months, 1));
  return shanghaiTs(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

module.exports = { TZ, DAY, TZ_OFFSET_MS, shanghaiParts, shanghaiTs, startOfDay, startOfMonth, shiftMonthStart };
