// recordMeta.js
// 16 种记录类型的元数据表：时间线摘要、日历圆点色、统计图表全靠这张表
// color 对齐设计文档 §2.4 记录类型色板；data 字段对齐 PRD §4.2

var MEAL_NAMES = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  extra: '加餐',
};

var GROOM_ITEM_NAMES = {
  bath: '洗澡',
  nail: '剪指甲',
  ear: '清耳朵',
  anal: '挤肛门腺',
  beauty: '美容造型',
};

var POOP_STATUS_NAMES = {
  normal: '正常',
  soft: '偏软',
  diarrhea: '拉稀',
  constipation: '便秘',
};

var VOMIT_CONTENT_NAMES = {
  food: '食物',
  hairball: '毛球',
  liquid: '液体',
  other: '其他',
};

var DEWORM_KIND_NAMES = {
  internal: '体内驱虫',
  external: '体外驱虫',
};

// 金额（分）转显示文案
function fmtCents(cents) {
  return '¥' + (cents / 100).toFixed(2);
}

var RECORD_META = [
  {
    type: 'weight',
    label: '体重',
    color: '#C08A4E',
    iconKey: 'weight',
    summary: function (data) {
      return '体重 ' + data.value + ' kg';
    },
    formFields: [
      { key: 'value', label: '体重', type: 'number', unit: 'kg', required: true, hint: '保留 1 位小数' },
    ],
  },
  {
    type: 'vaccine',
    label: '疫苗',
    color: '#4A7FC7',
    iconKey: 'vaccine',
    summary: function (data) {
      var text = '接种疫苗 ' + (data.vaccineName || '');
      if (data.hospital) { text += ' · ' + data.hospital; }
      return text;
    },
    formFields: [
      { key: 'vaccineName', label: '疫苗名称', type: 'text', required: true, hint: '预置字典或自定义' },
      { key: 'batchNo', label: '批号', type: 'text' },
      { key: 'hospital', label: '医院', type: 'text' },
      { key: 'nextDate', label: '下次日期', type: 'date', hint: '默认按疫苗周期自动算出' },
    ],
  },
  {
    type: 'deworm',
    label: '驱虫',
    color: '#7D6BAE',
    iconKey: 'deworm',
    summary: function (data) {
      var kind = DEWORM_KIND_NAMES[data.kind] || '驱虫';
      return kind + (data.product ? ' · ' + data.product : '');
    },
    formFields: [
      { key: 'kind', label: '类型', type: 'enum', options: ['internal', 'external'], required: true, hint: '内驱/外驱' },
      { key: 'product', label: '产品名', type: 'text', hint: '带历史输入联想' },
      { key: 'nextDate', label: '下次日期', type: 'date', hint: '内驱默认 90 天，外驱默认 30 天' },
    ],
  },
  {
    type: 'medical',
    label: '就医',
    color: '#D24B42',
    iconKey: 'medical',
    summary: function (data) {
      var text = '就医 ' + (data.diagnosis || data.symptom || '');
      if (data.hospital) { text += ' · ' + data.hospital; }
      return text;
    },
    formFields: [
      { key: 'symptom', label: '症状', type: 'text', required: true, hint: '多选常见词 + 手填' },
      { key: 'diagnosis', label: '诊断', type: 'text' },
      { key: 'prescription', label: '处方', type: 'text' },
      { key: 'hospital', label: '医院', type: 'text' },
      { key: 'doctor', label: '医生', type: 'text' },
      { key: 'cost', label: '花费', type: 'number', unit: '分', hint: '金额存分' },
    ],
  },
  {
    type: 'medication',
    label: '用药',
    color: '#A87BA8',
    iconKey: 'medication',
    summary: function (data) {
      var text = '用药 ' + (data.medicine || '');
      if (data.dose) { text += ' · ' + data.dose; }
      if (data.dailyTimes) { text += ' · 每日' + data.dailyTimes + '次'; }
      return text;
    },
    formFields: [
      { key: 'medicine', label: '药品名', type: 'text', required: true },
      { key: 'dose', label: '单次剂量', type: 'text' },
      { key: 'dailyTimes', label: '每日次数', type: 'number', hint: '1~4 次' },
      { key: 'startDate', label: '开始日期', type: 'date' },
      { key: 'endDate', label: '结束日期', type: 'date' },
      { key: 'checkins', label: '打卡记录', type: 'array', hint: '系统自动写入，勿手填' },
    ],
  },
  {
    type: 'surgery',
    label: '手术',
    color: '#B85C5C',
    iconKey: 'surgery',
    summary: function (data) {
      var text = '手术 ' + (data.surgeryName || '');
      if (data.hospital) { text += ' · ' + data.hospital; }
      return text;
    },
    formFields: [
      { key: 'surgeryName', label: '手术名称', type: 'text', required: true },
      { key: 'hospital', label: '医院', type: 'text' },
      { key: 'cost', label: '花费', type: 'number', unit: '分', hint: '金额存分' },
    ],
  },
  {
    type: 'feed',
    label: '喂食',
    color: '#B0803B',
    iconKey: 'feed',
    summary: function (data) {
      var text = MEAL_NAMES[data.meal] || '喂食';
      if (data.brand) { text += ' · ' + data.brand; }
      if (data.grams) { text += ' ' + data.grams + 'g'; }
      return text;
    },
    formFields: [
      { key: 'meal', label: '餐次', type: 'enum', options: ['breakfast', 'lunch', 'dinner', 'extra'], required: true },
      { key: 'brand', label: '品牌', type: 'text', hint: '带历史输入联想' },
      { key: 'grams', label: '克数', type: 'number', unit: 'g' },
    ],
  },
  {
    type: 'water',
    label: '饮水',
    color: '#5E8FB8',
    iconKey: 'water',
    summary: function (data) {
      return data.amount ? '饮水 ' + data.amount + ' ml' : '饮水记录';
    },
    formFields: [
      { key: 'amount', label: '饮水量', type: 'number', unit: 'ml' },
    ],
  },
  {
    type: 'groom',
    label: '洗护',
    color: '#5A9EA8',
    iconKey: 'groom',
    summary: function (data) {
      var items = (data.items || []).map(function (k) { return GROOM_ITEM_NAMES[k] || k; });
      return items.length > 0 ? '洗护 ' + items.join('、') : '洗护记录';
    },
    formFields: [
      { key: 'items', label: '项目', type: 'multi', options: ['bath', 'nail', 'ear', 'anal', 'beauty'], required: true },
    ],
  },
  {
    type: 'poop',
    label: '便便',
    color: '#8A7355',
    iconKey: 'poop',
    summary: function (data) {
      return '便便 ' + (POOP_STATUS_NAMES[data.status] || '');
    },
    formFields: [
      { key: 'status', label: '状态', type: 'enum', options: ['normal', 'soft', 'diarrhea', 'constipation'], required: true },
    ],
  },
  {
    type: 'vomit',
    label: '呕吐',
    color: '#A8865E',
    iconKey: 'vomit',
    summary: function (data) {
      return '呕吐 ' + (VOMIT_CONTENT_NAMES[data.content] || '');
    },
    formFields: [
      { key: 'content', label: '内容物', type: 'enum', options: ['food', 'hairball', 'liquid', 'other'], required: true },
    ],
  },
  {
    type: 'heat',
    label: '发情',
    color: '#B87B8E',
    iconKey: 'heat',
    summary: function (data) {
      return data.endDate ? '发情期（已结束）' : '发情期开始';
    },
    formFields: [
      { key: 'startDate', label: '开始日期', type: 'date', required: true },
      { key: 'endDate', label: '结束日期', type: 'date' },
    ],
  },
  {
    type: 'expense',
    label: '花销',
    color: '#4E8A68',
    iconKey: 'expense',
    summary: function (data) {
      var text = fmtCents(data.amount || 0);
      if (data.itemName) { text += ' · ' + data.itemName; }
      return text;
    },
    formFields: [
      { key: 'amount', label: '金额', type: 'number', unit: '分', required: true, hint: '最大 ¥999,999，存分' },
      { key: 'category', label: '分类', type: 'enum', required: true, hint: '粮食/零食/医疗/用品/玩具/美容/寄养/保险/其他' },
      { key: 'itemName', label: '物品名', type: 'text' },
    ],
  },
  {
    type: 'walk',
    label: '遛狗',
    color: '#6B8F4E',
    iconKey: 'walk',
    summary: function (data) {
      var text = '遛狗 ' + (data.duration || 0) + ' 分钟';
      if (data.distance) { text += ' · ' + data.distance + ' km'; }
      return text;
    },
    formFields: [
      { key: 'duration', label: '时长', type: 'number', unit: '分钟', required: true },
      { key: 'distance', label: '距离', type: 'number', unit: 'km' },
    ],
  },
  {
    type: 'milestone',
    label: '里程碑',
    color: '#A8902E',
    iconKey: 'milestone',
    summary: function (data) {
      return '里程碑 ' + (data.title || '');
    },
    formFields: [
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'icon', label: '图标', type: 'text', hint: 'iconKey，从预置图标中选' },
    ],
  },
  {
    type: 'custom',
    label: '自定义',
    color: '#7A7A76',
    iconKey: 'custom',
    summary: function (data) {
      return data.title || '自定义记录';
    },
    formFields: [
      { key: 'title', label: '标题', type: 'text', required: true },
    ],
  },
];

// type -> meta 的索引，O(1) 查询用
var META_MAP = {};
RECORD_META.forEach(function (meta) {
  META_MAP[meta.type] = meta;
});

// 取某类型的元数据（未知类型兜底为 custom）
function getMeta(type) {
  return META_MAP[type] || META_MAP.custom;
}

module.exports = {
  RECORD_META: RECORD_META,
  META_MAP: META_MAP,
  getMeta: getMeta,
  MEAL_NAMES: MEAL_NAMES,
  GROOM_ITEM_NAMES: GROOM_ITEM_NAMES,
  POOP_STATUS_NAMES: POOP_STATUS_NAMES,
  VOMIT_CONTENT_NAMES: VOMIT_CONTENT_NAMES,
  DEWORM_KIND_NAMES: DEWORM_KIND_NAMES,
};
