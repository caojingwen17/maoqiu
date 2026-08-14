// schema.js
// 写入数据校验：数据准确性的闸门，所有集合的写操作先过这里
// 字段定义逐条对齐 PRD §4，不合法直接抛 {code, msg} 明确错误

// 枚举定义（与 miniprogram/utils/constants.js 保持一致，云函数独立部署故本地维护一份）
var SPECIES = ['cat', 'dog', 'rabbit', 'hamster', 'bird', 'reptile', 'other'];
var GENDERS = ['male', 'female'];
var RECORD_TYPES = [
  'weight', 'vaccine', 'deworm', 'medical', 'medication', 'surgery',
  'feed', 'water', 'groom', 'poop', 'vomit', 'heat',
  'expense', 'walk', 'milestone', 'custom',
];
var REMINDER_CATEGORIES = ['vaccine', 'deworm', 'groom', 'medication', 'checkup', 'stock', 'custom'];
var REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'custom_days'];
var THEMES = ['light', 'dark', 'auto'];
var EXPENSE_CATEGORIES = ['food', 'snack', 'medical', 'supply', 'toy', 'groom', 'boarding', 'insurance', 'other'];
var MEALS = ['breakfast', 'lunch', 'dinner', 'extra'];
var GROOM_ITEMS = ['bath', 'nail', 'ear', 'anal', 'beauty'];
var POOP_STATUS = ['normal', 'soft', 'diarrhea', 'constipation'];
var VOMIT_CONTENTS = ['food', 'hairball', 'liquid', 'other'];
var DEWORM_KINDS = ['internal', 'external'];

// 抛出业务错误（index.js 统一捕获）
function fail(msg, code) {
  var e = new Error(msg);
  e.code = code || 400;
  e.msg = msg;
  throw e;
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isStr(v) {
  return typeof v === 'string';
}

function isNum(v) {
  return typeof v === 'number' && !isNaN(v) && isFinite(v);
}

// 字符串字段：去首尾空格 + 限长，可空
function optStr(data, key, maxLen) {
  var v = data[key];
  if (v === undefined || v === null || v === '') {
    return undefined;
  }
  if (!isStr(v)) {
    fail(key + ' 必须是字符串');
  }
  v = v.trim();
  if (v.length > maxLen) {
    fail(key + ' 不能超过 ' + maxLen + ' 字');
  }
  return v;
}

// 数字字段：范围校验，可空
function optNum(data, key, min, max) {
  var v = data[key];
  if (v === undefined || v === null || v === '') {
    return undefined;
  }
  if (!isNum(v)) {
    fail(key + ' 必须是数字');
  }
  if (v < min || v > max) {
    fail(key + ' 超出允许范围（' + min + '~' + max + '）');
  }
  return v;
}

// 字符串数组字段：限条数 + 单条限长，可空
function optStrArr(data, key, maxCount, maxLen) {
  var v = data[key];
  if (v === undefined || v === null) {
    return undefined;
  }
  if (!Array.isArray(v)) {
    fail(key + ' 必须是数组');
  }
  if (v.length > maxCount) {
    fail(key + ' 最多 ' + maxCount + ' 条');
  }
  return v.map(function (item) {
    if (!isStr(item)) {
      fail(key + ' 的元素必须是字符串');
    }
    item = item.trim();
    if (item.length > maxLen) {
      fail(key + ' 单条不能超过 ' + maxLen + ' 字');
    }
    return item;
  });
}

// 枚举字段
function enumVal(v, list, key) {
  if (list.indexOf(v) === -1) {
    fail(key + ' 取值非法: ' + v);
  }
  return v;
}

/**
 * 校验宠物写入数据（PRD §4.1）
 * @param {Object} data 客户端提交的宠物表单
 * @param {boolean} isUpdate 更新模式：必填字段缺省时跳过（允许局部更新）
 * @returns {Object} 清洗后的宠物文档（不含 _openid/order/createAt，由调用方补）
 */
function validatePet(data, isUpdate) {
  if (!isObj(data)) {
    fail('宠物数据格式不对');
  }
  var doc = {};

  var name = optStr(data, 'name', 12);
  if (name !== undefined) {
    if (!name) {
      fail('给毛孩子起个名字吧');
    }
    doc.name = name;
  } else if (!isUpdate) {
    fail('给毛孩子起个名字吧');
  }

  if (data.species !== undefined) {
    doc.species = enumVal(data.species, SPECIES, 'species');
  } else if (!isUpdate) {
    fail('请选择物种');
  }

  if (data.gender !== undefined) {
    doc.gender = enumVal(data.gender, GENDERS, 'gender');
  } else if (!isUpdate) {
    fail('请选择性别');
  }

  if (data.neutered !== undefined) {
    if (typeof data.neutered !== 'boolean') {
      fail('neutered 必须是布尔值');
    }
    doc.neutered = data.neutered;
  }

  var birthDate = optNum(data, 'birthDate', 0, Date.now() + 60000);
  if (birthDate !== undefined) {
    doc.birthDate = birthDate;
  }
  var adoptDate = optNum(data, 'adoptDate', 0, Date.now() + 60000);
  if (adoptDate !== undefined) {
    // 到家日期不得早于出生日期（更新模式下与已有出生日期比对由调用方负责）
    var ref = doc.birthDate !== undefined ? doc.birthDate : data.birthDate;
    if (ref !== undefined && adoptDate < ref) {
      fail('到家日期应该晚于出生日期');
    }
    doc.adoptDate = adoptDate;
  }

  if (data.weightGoal === 0 || data.weightGoal === null) {
    // 前端约定 0/null = 清除目标体重（optNum 的 0.1~100 区间不接受 0，须先短路）
    doc.weightGoal = 0;
  } else {
    var weightGoal = optNum(data, 'weightGoal', 0.1, 100);
    if (weightGoal !== undefined) {
      // 体重 kg 保留 1 位小数
      doc.weightGoal = Math.round(weightGoal * 10) / 10;
    }
  }

  ['avatar', 'breed', 'color', 'chipNo', 'certNo'].forEach(function (key) {
    var v = optStr(data, key, key === 'avatar' ? 256 : 64);
    if (v !== undefined) {
      doc[key] = v;
    }
  });

  if (data.insurance !== undefined) {
    if (!isObj(data.insurance)) {
      fail('insurance 格式不对');
    }
    doc.insurance = {
      company: optStr(data.insurance, 'company', 64) || '',
      policyNo: optStr(data.insurance, 'policyNo', 64) || '',
      expireAt: optNum(data.insurance, 'expireAt', 0, 4102416000000) || 0,
    };
  }

  if (data.vetInfo !== undefined) {
    if (!isObj(data.vetInfo)) {
      fail('vetInfo 格式不对');
    }
    doc.vetInfo = {
      hospital: optStr(data.vetInfo, 'hospital', 64) || '',
      doctor: optStr(data.vetInfo, 'doctor', 32) || '',
      phone: optStr(data.vetInfo, 'phone', 32) || '',
    };
  }

  var traits = optStrArr(data, 'traits', 5, 12);
  if (traits !== undefined) {
    doc.traits = traits;
  }
  var allergies = optStrArr(data, 'allergies', 20, 24);
  if (allergies !== undefined) {
    doc.allergies = allergies;
  }
  var forbiddenFood = optStrArr(data, 'forbiddenFood', 20, 24);
  if (forbiddenFood !== undefined) {
    doc.forbiddenFood = forbiddenFood;
  }

  if (data.archived !== undefined) {
    if (typeof data.archived !== 'boolean') {
      fail('archived 必须是布尔值');
    }
    doc.archived = data.archived;
  }

  return doc;
}

/**
 * 校验记录 data 扩展字段（PRD §4.2 按 type 定义）
 * @param {string} type
 * @param {Object} data
 * @returns {Object} 清洗后的 data
 */
function validateRecordData(type, data) {
  if (!isObj(data)) {
    fail('记录的 data 必须是对象');
  }
  var d = {};
  switch (type) {
    case 'weight': {
      var w = optNum(data, 'value', 0.1, 100);
      if (w === undefined) {
        fail('体重数值不太对');
      }
      d.value = Math.round(w * 10) / 10; // kg 保留 1 位小数
      break;
    }
    case 'vaccine':
      d.vaccineName = optStr(data, 'vaccineName', 32) || fail('请填写疫苗名称');
      d.batchNo = optStr(data, 'batchNo', 64) || '';
      d.hospital = optStr(data, 'hospital', 64) || '';
      d.nextDate = optNum(data, 'nextDate', 0, 4102416000000) || 0;
      break;
    case 'deworm':
      d.kind = enumVal(data.kind, DEWORM_KINDS, 'deworm.kind');
      d.product = optStr(data, 'product', 64) || '';
      d.nextDate = optNum(data, 'nextDate', 0, 4102416000000) || 0;
      break;
    case 'medical':
      d.symptom = optStr(data, 'symptom', 200) || fail('请填写症状');
      d.diagnosis = optStr(data, 'diagnosis', 200) || '';
      d.prescription = optStr(data, 'prescription', 500) || '';
      d.hospital = optStr(data, 'hospital', 64) || '';
      d.doctor = optStr(data, 'doctor', 32) || '';
      d.cost = optNum(data, 'cost', 0, 99999900) || 0; // 金额存分
      break;
    case 'medication':
      d.medicine = optStr(data, 'medicine', 64) || fail('请填写药品名');
      d.dose = optStr(data, 'dose', 32) || '';
      d.startDate = optNum(data, 'startDate', 0, 4102416000000) || 0;
      d.endDate = optNum(data, 'endDate', 0, 4102416000000) || 0;
      d.dailyTimes = optNum(data, 'dailyTimes', 1, 4) || 1;
      d.checkins = Array.isArray(data.checkins) ? data.checkins.filter(isNum).slice(0, 365) : [];
      break;
    case 'surgery':
      d.surgeryName = optStr(data, 'surgeryName', 64) || fail('请填写手术名称');
      d.hospital = optStr(data, 'hospital', 64) || '';
      d.cost = optNum(data, 'cost', 0, 99999900) || 0;
      break;
    case 'feed':
      d.meal = enumVal(data.meal, MEALS, 'feed.meal');
      d.brand = optStr(data, 'brand', 64) || '';
      d.grams = optNum(data, 'grams', 0, 100000) || 0;
      break;
    case 'water':
      d.amount = optNum(data, 'amount', 0, 100000) || 0;
      break;
    case 'groom': {
      var items = data.items;
      if (!Array.isArray(items) || items.length === 0) {
        fail('请选择洗护项目');
      }
      d.items = items.map(function (k) { return enumVal(k, GROOM_ITEMS, 'groom.items'); });
      break;
    }
    case 'poop':
      d.status = enumVal(data.status, POOP_STATUS, 'poop.status');
      break;
    case 'vomit':
      d.content = enumVal(data.content, VOMIT_CONTENTS, 'vomit.content');
      break;
    case 'heat':
      d.startDate = optNum(data, 'startDate', 0, 4102416000000) || fail('请选择开始日期');
      d.endDate = optNum(data, 'endDate', 0, 4102416000000) || 0;
      break;
    case 'expense':
      d.amount = optNum(data, 'amount', 1, 99999900);
      if (d.amount === undefined) {
        fail('请填写金额');
      }
      d.amount = Math.round(d.amount); // 金额必须是整数（分）
      d.category = enumVal(data.category, EXPENSE_CATEGORIES, 'expense.category');
      d.itemName = optStr(data, 'itemName', 64) || '';
      break;
    case 'walk':
      d.duration = optNum(data, 'duration', 1, 1440);
      if (d.duration === undefined) {
        fail('请填写遛狗时长');
      }
      d.distance = optNum(data, 'distance', 0, 500) || 0;
      break;
    case 'milestone':
      d.title = optStr(data, 'title', 32) || fail('请填写里程碑标题');
      d.icon = optStr(data, 'icon', 32) || '';
      break;
    case 'custom':
      d.title = optStr(data, 'title', 32) || fail('请填写标题');
      break;
    default:
      fail('未知记录类型: ' + type);
  }
  return d;
}

/**
 * 校验记录写入数据（PRD §4.2）
 * @param {Object} record {petId, type, date, data, photos, note}
 * @returns {Object} 清洗后的记录文档（不含 _openid/createAt）
 */
function validateRecord(record) {
  if (!isObj(record)) {
    fail('记录数据格式不对');
  }
  if (!record.petId || !isStr(record.petId)) {
    fail('缺少 petId');
  }
  enumVal(record.type, RECORD_TYPES, 'type');

  var date = record.date;
  if (!isNum(date)) {
    fail('记录时间不对');
  }
  if (date > Date.now() + 60000) {
    fail('记录日期不能是未来哦');
  }

  var doc = {
    petId: record.petId,
    type: record.type,
    date: date,
    data: validateRecordData(record.type, record.data || {}),
  };

  var note = optStr(record, 'note', 500);
  if (note !== undefined) {
    doc.note = note;
  }
  var photos = optStrArr(record, 'photos', 9, 256);
  if (photos !== undefined) {
    doc.photos = photos;
  }
  return doc;
}

/**
 * 校验提醒写入数据（PRD §4.3）
 * @param {Object} reminder {petId?, title, category, remindAt, repeatType, repeatDays?, advanceDays?, subscribeAuth?}
 * @returns {Object} 清洗后的提醒文档
 */
function validateReminder(reminder) {
  if (!isObj(reminder)) {
    fail('提醒数据格式不对');
  }
  var doc = {};
  var title = optStr(reminder, 'title', 30);
  if (!title) {
    fail('请填写提醒标题');
  }
  doc.title = title;
  doc.category = enumVal(reminder.category, REMINDER_CATEGORIES, 'category');

  if (!isNum(reminder.remindAt) || reminder.remindAt <= 0) {
    fail('提醒时间不对');
  }
  doc.remindAt = reminder.remindAt;

  doc.repeatType = enumVal(reminder.repeatType || 'none', REPEAT_TYPES, 'repeatType');
  if (doc.repeatType === 'custom_days') {
    doc.repeatDays = optNum(reminder, 'repeatDays', 1, 3650);
    if (doc.repeatDays === undefined) {
      fail('自定义周期请填写天数');
    }
    doc.repeatDays = Math.round(doc.repeatDays);
  } else {
    doc.repeatDays = 0;
  }

  var advanceDays = optNum(reminder, 'advanceDays', 0, 30);
  doc.advanceDays = advanceDays === undefined ? 7 : Math.round(advanceDays);

  var petId = optStr(reminder, 'petId', 64);
  if (petId !== undefined) {
    doc.petId = petId;
  }
  if (reminder.subscribeAuth !== undefined) {
    doc.subscribeAuth = !!reminder.subscribeAuth;
  }
  return doc;
}

/**
 * 校验用户设置写入数据（PRD §4.5）
 * @param {Object} settings
 * @returns {Object} 清洗后的设置文档
 */
function validateSettings(settings) {
  if (!isObj(settings)) {
    fail('设置数据格式不对');
  }
  var doc = {};
  if (settings.theme !== undefined) {
    doc.theme = enumVal(settings.theme, THEMES, 'theme');
  }
  if (settings.defaultCycles !== undefined) {
    if (!isObj(settings.defaultCycles)) {
      fail('defaultCycles 格式不对');
    }
    var cycles = {};
    ['dewormInternal', 'dewormExternal', 'vaccine', 'bath'].forEach(function (key) {
      var v = settings.defaultCycles[key];
      if (v !== undefined) {
        if (!isNum(v) || v < 1 || v > 3650) {
          fail('周期天数需在 1~3650 之间');
        }
        cycles[key] = Math.round(v);
      }
    });
    doc.defaultCycles = cycles;
  }
  var advanceDays = optNum(settings, 'advanceDays', 0, 30);
  if (advanceDays !== undefined) {
    doc.advanceDays = Math.round(advanceDays);
  }
  var budget = optNum(settings, 'budget', 0, 99999900);
  if (budget !== undefined) {
    doc.budget = Math.round(budget); // 金额存分
  }
  if (settings.homeLayout !== undefined) {
    if (!isObj(settings.homeLayout)) {
      fail('homeLayout 格式不对');
    }
    doc.homeLayout = settings.homeLayout;
  }
  return doc;
}

module.exports = {
  fail: fail,
  validatePet: validatePet,
  validateRecord: validateRecord,
  validateReminder: validateReminder,
  validateSettings: validateSettings,
  RECORD_TYPES: RECORD_TYPES,
  REMINDER_CATEGORIES: REMINDER_CATEGORIES,
};
