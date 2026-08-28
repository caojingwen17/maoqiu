/**
 * pawlog 写入校验闸门（PRD §4.1 ~ §4.6 字段白名单 + 类型校验）
 *
 * 设计目标：
 *  - 客户端零直连数据库，所有写操作经云函数中转；
 *  - 每个集合维护「可写字段白名单」，不认识的字段一律拒绝（防止越权/越界写入）；
 *  - 仅在写入时校验「必填字段存在 + 类型正确」，不做业务语义校验（业务在 modules 内）。
 *
 * 类型常量：
 *  - 'string' | 'number' | 'boolean' | 'object' | 'array'
 *  - 'nullable' 字段允许 null/undefined（未提供则跳过）
 */

function isType(v, t) {
  if (v === undefined) return false;
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
  return typeof v === t;
}

const CONFIG = require('./config.js');

const S = { string: 'string', number: 'number', boolean: 'boolean', object: 'object', array: 'array' };

/** 集合字段白名单：key -> { type, required } */
const SCHEMAS = {
  pets: {
    name: { type: S.string, required: true },
    avatar: { type: S.string, required: false },
    species: { type: S.string, required: true },
    breed: { type: S.string, required: false },
    gender: { type: S.string, required: true },
    birthDate: { type: S.number, required: false },
    adoptDate: { type: S.number, required: false },
    color: { type: S.string, required: false },
    neutered: { type: S.boolean, required: false },
    chipNo: { type: S.string, required: false },
    certNo: { type: S.string, required: false },
    insurance: { type: S.object, required: false },
    vetInfo: { type: S.object, required: false },
    traits: { type: S.array, required: false },
    allergies: { type: S.array, required: false },
    forbiddenFood: { type: S.array, required: false },
    weightGoal: { type: S.number, required: false },
    order: { type: S.number, required: false },
    archived: { type: S.boolean, required: false }
  },

  records: {
    requestId: { type: S.string, required: false },
    // petId 可选：家庭级记录（如囤货入库产生的花销）不归属单一宠物
    petId: { type: S.string, required: false },
    type: { type: S.string, required: true },
    date: { type: S.number, required: false },
    data: { type: S.object, required: false },
    photos: { type: S.array, required: false },
    // 日常记录的视频（cloud:// fileID 数组）；微信无同步视频内容检测接口，客户端限制大小后上传
    videos: { type: S.array, required: false },
    note: { type: S.string, required: false },
    // 显式选择的囤货库存 id：仅 create 生效（配合库存扣减），update 忽略
    inventoryId: { type: S.string, required: false }
  },

  reminders: {
    petId: { type: S.string, required: false },
    title: { type: S.string, required: true },
    category: { type: S.string, required: false },
    remindAt: { type: S.number, required: true },
    repeatType: { type: S.string, required: false },
    repeatDays: { type: S.number, required: false },
    advanceDays: { type: S.number, required: false },
    sourceRecordId: { type: S.string, required: false },
    sourceInventoryId: { type: S.string, required: false },
    status: { type: S.string, required: false },
    subscribeAuth: { type: S.boolean, required: false },
    notifyScope: { type: S.string, required: false },
    notifyOpenid: { type: S.string, required: false },
    note: { type: S.string, required: false },
    scheduleMode: { type: S.string, required: false },
    startAt: { type: S.number, required: false },
    endAt: { type: S.number, required: false },
    timeOfDay: { type: S.string, required: false },
    slotKey: { type: S.string, required: false },
    anniversaryType: { type: S.string, required: false },
    anniversaryDate: { type: S.number, required: false },
    offsetDays: { type: S.number, required: false },
    reminderSubtype: { type: S.string, required: false },
    expiryOffsetDays: { type: S.number, required: false },
    disabledReason: { type: S.string, required: false }
  },

  diaries: {
    familyId: { type: S.string, required: true },
    petId: { type: S.string, required: true },
    diaryDate: { type: S.string, required: true },
    diaryKey: { type: S.string, required: true },
    status: { type: S.string, required: true },
    decision: { type: S.string, required: true },
    title: { type: S.string, required: false },
    content: { type: S.string, required: false },
    generatedAt: { type: S.number, required: false },
    promptVersion: { type: S.string, required: false },
    model: { type: S.string, required: false },
    sourceRecordIds: { type: S.array, required: false },
    readBy: { type: S.array, required: false },
    retryCount: { type: S.number, required: false },
    createAt: { type: S.number, required: false },
    updateAt: { type: S.number, required: false }
  },

  inventories: {
    requestId: { type: S.string, required: false },
    petId: { type: S.string, required: false },
    itemName: { type: S.string, required: true },
    category: { type: S.string, required: false },
    totalAmount: { type: S.number, required: false },
    remainAmount: { type: S.number, required: false },
    unit: { type: S.string, required: false },
    dailyConsume: { type: S.number, required: false },
    threshold: { type: S.number, required: false },
    expireDate: { type: S.string, required: false },
    consumeMode: { type: S.string, required: false },
    linkType: { type: S.string, required: false },
    consumeLogs: { type: S.array, required: false }
  },

  settings: {
    budget: { type: S.number, required: false },
    // kickedFrom 不在白名单：只能由 family.removeMember/dissolve 服务端直连 db 写入；
    // 客户端仅允许经 settings.update 清空（settings.js 单独放行 '' / null）
    nickName: { type: S.string, required: false },
    avatarUrl: { type: S.string, required: false },
    familyNick: { type: S.string, required: false }
  },

  families: {
    name: { type: S.string, required: true },
    members: { type: S.array, required: false } // 成员增删走 family 模块专用流程，不走通用写入
  }
};

/**
 * records.data 字段袋的已知字段规则：类型/范围错误拒绝；未知字段宽松保留。
 * nextDate 必须是正数时间戳（record.js 派生提醒直接当时间戳用，传字符串会产生 NaN）。
 */
const RECORD_DATA_RULES = {
  weight: (v) => typeof v === 'number' && v > 0 && v <= 500, // kg，合理上限
  amount: (v) => typeof v === 'number' && v >= 0,
  price: (v) => typeof v === 'number' && v >= 0,
  nextDate: (v) => typeof v === 'number' && v > 0
};

/** 集合级语义校验（白名单/类型通过后再跑）。返回错误文案或 null。 */
function extraChecks(collection, clean) {
  if (collection === 'pets' && clean.name !== undefined && String(clean.name).length > CONFIG.PET_NAME_MAX) {
    return '宠物名过长（≤' + CONFIG.PET_NAME_MAX + ' 字）';
  }
  if ((collection === 'records' || collection === 'reminders') && clean.note !== undefined && String(clean.note).length > CONFIG.NOTE_MAX) {
    return '备注过长（≤' + CONFIG.NOTE_MAX + ' 字）';
  }
  if (collection === 'records' && clean.data) {
    const bad = Object.keys(RECORD_DATA_RULES).filter((k) => clean.data[k] !== undefined && clean.data[k] !== null && !RECORD_DATA_RULES[k](clean.data[k]));
    if (bad.length) return 'data 字段校验失败: ' + bad.join(', ');
  }
  if (collection === 'reminders' && clean.remindAt !== undefined) {
    // 必须为正数时间戳；允许回写最近 1 小时内的过去时间（立即触发），更早的视为误写拒绝。
    // after_complete/周年模式的 startAt/endAt/anniversaryDate 不在此校验，避免误伤合法路径。
    if (!(clean.remindAt > 0)) return 'remindAt 必须为正数时间戳';
    if (clean.remindAt < Date.now() - 60 * 60 * 1000) return 'remindAt 不能早于当前时间 1 小时';
  }
  return null;
}

/**
 * 校验写入 payload（白名单 + 必填 + 类型）
 * @param {string} collection 集合名
 * @param {object} payload   待写入字段（不含 _openid/familyId/createdBy 等系统字段）
 * @param {object} options   { partial: 是否允许部分字段（update 场景） }
 * @returns {{ ok: boolean, error?: string, clean?: object }}
 */
function validateWrite(collection, payload, options) {
  const schema = SCHEMAS[collection];
  if (!schema) return { ok: false, error: '未知集合: ' + collection };

  const opt = options || {};
  const data = payload || {};
  const clean = {};
  const unknown = [];

  Object.keys(data).forEach((key) => {
    if (!schema[key]) {
      unknown.push(key);
      return;
    }
    const spec = schema[key];
    const v = data[key];
    if (v === undefined || v === null) return;
    if (!isType(v, spec.type)) {
      unknown.push(key + '(' + spec.type + ' required, got ' + typeof v + ')');
      return;
    }
    clean[key] = v;
  });

  if (unknown.length) {
    return { ok: false, error: '字段校验失败: ' + unknown.join(', ') };
  }

  const extraError = extraChecks(collection, clean);
  if (extraError) return { ok: false, error: extraError };

  // 必填校验（仅完整写入时校验，update 允许部分字段）
  if (!opt.partial) {
    const missing = [];
    Object.keys(schema).forEach((key) => {
      if (schema[key].required && (clean[key] === undefined || clean[key] === null)) {
        missing.push(key);
      }
    });
    if (missing.length) {
      return { ok: false, error: '缺少必填字段: ' + missing.join(', ') };
    }
  }

  return { ok: true, clean };
}

module.exports = {
  SCHEMAS,
  validateWrite,
  isType
};
