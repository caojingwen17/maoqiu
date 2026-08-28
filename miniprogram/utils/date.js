/**
 * 日期时间工具（纯函数，无依赖）
 * 约定：所有时间戳为毫秒（微信/云函数统一 ms）
 */

const DAY = 24 * 60 * 60 * 1000;

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 格式化时间戳为 YYYY-MM-DD */
function fmtDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 格式化时间戳为 MM月DD日 周X */
function fmtDateCn(ts) {
  const d = ts ? new Date(ts) : new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

/** 格式化时间戳为 YYYY年M月D日 */
function fmtDateFull(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 相对时间文案：今天 / 明天 / 昨天 / X月X日 */
function relDay(ts) {
  const today = startOfDay(Date.now());
  const target = startOfDay(ts);
  const diff = Math.round((target - today) / DAY);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 今天零点时间戳 */
function startOfDay(ts) {
  const d = new Date(ts || Date.now());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 计算年龄描述：`3岁2个月`，无出生日期返回空串 */
function ageText(birthTs) {
  if (!birthTs) return '';
  const now = new Date();
  const b = new Date(birthTs);
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) {
    return rest === 0 ? '刚出生' : `${rest}个月`;
  }
  return rest === 0 ? `${years}岁` : `${years}岁${rest}个月`;
}

/** 到家天数（adoptTs 距今） */
function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
}

/** 距某时间戳还有几天（正=未来，负=过去） */
function daysUntil(ts) {
  return Math.ceil((startOfDay(ts) - startOfDay(Date.now())) / DAY);
}

/** 逾期/临期描述：`已逾期 2 天` / `明天到期` / `12天后` */
function dueText(remindAt) {
  const days = Math.ceil((remindAt - Date.now()) / DAY);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  return `${days}天后`;
}

module.exports = {
  DAY,
  pad,
  fmtDate,
  fmtDateCn,
  fmtDateFull,
  relDay,
  startOfDay,
  ageText,
  daysSince,
  daysUntil,
  dueText
};