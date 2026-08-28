/**
 * 表单校验（对齐 PRD §7.1 校验规则）
 * 返回 { ok, msg }
 */

function trimSpace(s) {
  return (s || '').trim();
}

/** 宠物名：1~12 字 */
function petName(v) {
  const name = trimSpace(v);
  if (!name) return { ok: false, msg: '给毛孩子起个名字吧' };
  if (name.length > 12) return { ok: false, msg: '名字最长 12 个字' };
  return { ok: true, value: name };
}

/** 出生日期：不得晚于今天 */
function birthDate(ts) {
  if (!ts) return { ok: true };
  if (ts > Date.now()) return { ok: false, msg: '出生日期不能是未来哦' };
  return { ok: true };
}

/** 到家日期：不得早于出生日期 */
function adoptDate(birthTs, adoptTs) {
  if (!birthTs || !adoptTs) return { ok: true };
  if (adoptTs < birthTs) return { ok: false, msg: '到家日期应该晚于出生日期' };
  return { ok: true };
}

/** 目标体重：0.1~100 kg */
function weight(v) {
  const n = Number(v);
  if (isNaN(n) || n < 0.1 || n > 100) return { ok: false, msg: '体重数值不太对' };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/** 斤/两 → kg 解析：支持 `8斤4两`、`8.4斤`、`4.2`、`4.2kg`。解析失败返回 null */
function parseWeightToKg(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(/\s+/g, '');
  if (!s) return null;
  // 直接 kg
  const kgMatch = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:kg|公斤|千克)?$/);
  if (kgMatch && !/斤|两/.test(s)) {
    const n = Number(kgMatch[1]);
    if (!isNaN(n) && n >= 0.1 && n <= 100) return Math.round(n * 10) / 10;
  }
  // 斤/两
  let jin = 0;
  let liang = 0;
  const jinMatch = s.match(/([0-9]+(?:\.[0-9]+)?)\s*斤/);
  const liangMatch = s.match(/([0-9]+(?:\.[0-9]+)?)\s*两/);
  if (jinMatch) jin = Number(jinMatch[1]);
  if (liangMatch) liang = Number(liangMatch[1]);
  if (jinMatch || liangMatch) {
    const kg = jin * 0.5 + liang * 0.05;
    if (kg >= 0.1 && kg <= 100) return Math.round(kg * 10) / 10;
  }
  return null;
}

/** 金额：0 ~ 999999 */
function amount(v) {
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > 999999) return { ok: false, msg: '金额不对哦' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** 周期天数：1~99 */
function cycleDays(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 99) return { ok: false, msg: '周期填 1~99 的整数' };
  return { ok: true, value: n };
}

module.exports = {
  trimSpace,
  petName,
  birthDate,
  adoptDate,
  weight,
  parseWeightToKg,
  amount,
  cycleDays
};