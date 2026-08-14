// date.js
// 日期工具：时间线分组、年龄/到家天数、提醒到期文案
// 全部使用本地时区（东八区），时间戳单位毫秒

var DAY_MS = 24 * 60 * 60 * 1000;
var WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 当天 0 点
function startOfDay(ts) {
  var d = ts ? new Date(ts) : new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 当月 1 号 0 点
function startOfMonth(ts) {
  var d = ts ? new Date(ts) : new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 本周周一 0 点（周打卡统计用）
function startOfWeek(ts) {
  var d = new Date(startOfDay(ts));
  var day = d.getDay() || 7; // 周日按 7 处理
  d.setDate(d.getDate() - day + 1);
  return d.getTime();
}

// 加 n 天
function addDays(ts, n) {
  return ts + n * DAY_MS;
}

// 两个时间戳相差的整天数（按自然日 0 点对齐）
function diffDays(laterTs, earlierTs) {
  return Math.round((startOfDay(laterTs) - startOfDay(earlierTs)) / DAY_MS);
}

// 年龄文案：「3岁2个月」，无出生日期返回「年龄未知」
function fmtAge(birthTs, nowTs) {
  if (!birthTs) {
    return '年龄未知';
  }
  var now = nowTs ? new Date(nowTs) : new Date();
  var birth = new Date(birthTs);
  var years = now.getFullYear() - birth.getFullYear();
  var months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || (years === 0 && months < 0)) {
    return '年龄未知';
  }
  if (years === 0 && months === 0) {
    return '不满1个月';
  }
  if (years === 0) {
    return months + '个月';
  }
  if (months === 0) {
    return years + '岁';
  }
  return years + '岁' + months + '个月';
}

// 到家天数文案：「到家 X 天」（到家当天算第 1 天）
function fmtAdoptDays(adoptTs, nowTs) {
  if (!adoptTs) {
    return '';
  }
  var days = diffDays(nowTs || Date.now(), adoptTs) + 1;
  if (days < 1) {
    days = 1;
  }
  return '到家 ' + days + ' 天';
}

// 提醒到期文案：「已逾期 2 天」/「今天到期」/「明天到期」/「12 天后」
function fmtDue(remindAt, nowTs) {
  var days = diffDays(remindAt, nowTs || Date.now());
  if (days < 0) {
    return '已逾期 ' + (-days) + ' 天';
  }
  if (days === 0) {
    return '今天到期';
  }
  if (days === 1) {
    return '明天到期';
  }
  return days + ' 天后';
}

// 时间线日期分组头：「8月10日 周日」
function fmtDayGroup(ts) {
  var d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_NAMES[d.getDay()];
}

// 标准日期：「2026-08-10」
function fmtDate(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// 标准日期时间：「2026-08-10 14:30」
function fmtDateTime(ts) {
  var d = new Date(ts);
  return fmtDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

module.exports = {
  DAY_MS: DAY_MS,
  startOfDay: startOfDay,
  startOfWeek: startOfWeek,
  startOfMonth: startOfMonth,
  addDays: addDays,
  diffDays: diffDays,
  fmtAge: fmtAge,
  fmtAdoptDays: fmtAdoptDays,
  fmtDue: fmtDue,
  fmtDayGroup: fmtDayGroup,
  fmtDate: fmtDate,
  fmtDateTime: fmtDateTime,
};
