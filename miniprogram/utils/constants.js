// constants.js
// 全局枚举与常量：物种、记录类型、提醒分类、默认周期
// 记录类型取 16 种（对齐设计文档 §2.4 色板，不含 PRD 枚举中残留的 snack）

// 物种枚举（PRD §4.1）
var SPECIES = [
  { key: 'cat', name: '猫' },
  { key: 'dog', name: '狗' },
  { key: 'rabbit', name: '兔' },
  { key: 'hamster', name: '仓鼠' },
  { key: 'bird', name: '鸟' },
  { key: 'reptile', name: '爬宠' },
  { key: 'other', name: '其他' },
];

var SPECIES_KEYS = SPECIES.map(function (s) { return s.key; });

// 记录类型枚举（16 种，PRD §4.2）
var RECORD_TYPES = [
  'weight', 'vaccine', 'deworm', 'medical', 'medication', 'surgery',
  'feed', 'water', 'groom', 'poop', 'vomit', 'heat',
  'expense', 'walk', 'milestone', 'custom',
];

// 提醒分类（PRD §4.3）
var REMINDER_CATEGORIES = [
  'vaccine', 'deworm', 'groom', 'medication', 'checkup', 'stock', 'custom',
];

// 提醒重复类型（PRD §4.3）
var REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'custom_days'];

// 默认周期（天，PRD §4.5）
var DEFAULT_CYCLES = {
  dewormInternal: 90,
  dewormExternal: 30,
  vaccine: 365,
  bath: 30,
};

// 花销分类（PRD §8.2 花销表单）
var EXPENSE_CATEGORIES = [
  { key: 'food', name: '粮食' },
  { key: 'snack', name: '零食' },
  { key: 'medical', name: '医疗' },
  { key: 'supply', name: '用品' },
  { key: 'toy', name: '玩具' },
  { key: 'groom', name: '美容' },
  { key: 'boarding', name: '寄养' },
  { key: 'insurance', name: '保险' },
  { key: 'other', name: '其他' },
];

// 金额上限：¥999,999（分，PRD §8.2）
var EXPENSE_MAX_CENTS = 99999900;

module.exports = {
  SPECIES: SPECIES,
  SPECIES_KEYS: SPECIES_KEYS,
  RECORD_TYPES: RECORD_TYPES,
  REMINDER_CATEGORIES: REMINDER_CATEGORIES,
  REPEAT_TYPES: REPEAT_TYPES,
  DEFAULT_CYCLES: DEFAULT_CYCLES,
  EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
  EXPENSE_MAX_CENTS: EXPENSE_MAX_CENTS,
};
