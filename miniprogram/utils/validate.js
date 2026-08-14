// validate.js
// 表单校验：宠物档案规则与错误文案逐字对齐 PRD §7.1

// 通用：必填校验，通过返回 null，失败返回错误文案
function required(value, msg) {
  if (value === undefined || value === null || value === '') {
    return msg;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return msg;
  }
  return null;
}

// 通用：数值范围校验（value 可空，空则跳过）
function numberRange(value, min, max, msg) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  var n = Number(value);
  if (isNaN(n) || n < min || n > max) {
    return msg;
  }
  return null;
}

/**
 * 宠物档案表单校验（PRD §7.1）
 * @param {Object} form {name, species, birthDate, adoptDate, weightGoal}
 * @returns {{ok: boolean, errors: Object, firstError: string|null}}
 */
function validatePetForm(form) {
  var errors = {};

  // 名字：必填，1~12 字，去首尾空格
  var name = (form.name || '').trim();
  if (!name) {
    errors.name = '给毛孩子起个名字吧';
  } else if (name.length > 12) {
    errors.name = '给毛孩子起个名字吧';
  }

  // 物种：必选
  if (!form.species) {
    errors.species = '请选择物种';
  }

  // 出生日期：不得晚于今天
  if (form.birthDate && form.birthDate > Date.now()) {
    errors.birthDate = '出生日期不能是未来哦';
  }

  // 到家日期：不得早于出生日期
  if (form.adoptDate && form.birthDate && form.adoptDate < form.birthDate) {
    errors.adoptDate = '到家日期应该晚于出生日期';
  }

  // 目标体重：0.1~100 kg
  var weightErr = numberRange(form.weightGoal, 0.1, 100, '体重数值不太对');
  if (weightErr) {
    errors.weightGoal = weightErr;
  }

  var firstError = null;
  var keys = Object.keys(errors);
  if (keys.length > 0) {
    firstError = errors[keys[0]];
  }
  return { ok: keys.length === 0, errors: errors, firstError: firstError };
}

module.exports = {
  required: required,
  numberRange: numberRange,
  validatePetForm: validatePetForm,
};
