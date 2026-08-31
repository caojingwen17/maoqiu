/**
 * 18 种记录类型的元数据 + 表单配置 + 时间线分组 + 快捷九宫格
 * 1:1 对齐原型 doc/app/index.html 的 TC / FORM_DEF / GROUPS / QA_PAGES
 */

/** 类型色板（对齐原型 TC） */
const TC = {
  weight: '#C08A4E', vaccine: '#4A7FC7', deworm: '#7D6BAE', medical: '#D24B42',
  medication: '#A87BA8', feed: '#B0803B', expense: '#4E8A68', groom: '#5A9EA8',
  poop: '#8A7355', milestone: '#A8902E', walk: '#6B8F4E', water: '#5E8FB8',
  vomit: '#B26E4B', surgery: '#C25B5B', snack: '#B39A4A', heat: '#C77F9A',
  custom: '#8A8378', daily: '#CB7A5A', litter: '#8F7E5E'
};

/** 类型 → 图标名（对齐原型 ICON） */
const ICON_OF = {
  weight: 'scale', feed: 'bowl', daily: 'camera', vaccine: 'syringe', deworm: 'shield',
  medical: 'fileText', medication: 'pill', expense: 'coin', poop: 'poop', groom: 'drop',
  vomit: 'vomit', surgery: 'cross', walk: 'walk', water: 'glass', snack: 'bone',
  heat: 'heart', milestone: 'flag', custom: 'pencil', litter: 'box'
};

/**
 * 类型名（表单标题用）
 */
const NAME = {
  weight: '体重', feed: '喂食', daily: '日常', vaccine: '疫苗', deworm: '驱虫',
  medical: '就医', medication: '用药', expense: '花销', poop: '便便', groom: '洗护',
  vomit: '呕吐', surgery: '手术', walk: '遛狗', water: '饮水', snack: '零食',
  heat: '发情', milestone: '里程碑', custom: '自定义', litter: '铲屎'
};

/**
 * 表单字段定义（对齐原型 FORM_DEF）
 * 字段 kind: chips(单选) / mchips(多选) / input(输入) / row(选择行) / switch(开关) / stock(库存药品行)
 * again: 是否显示「保存并再记一条」（日频类型）
 * result: 保存后是否弹结果卡（低频高价值类型）
 */
const FIELD = {
  weight: { name: '体重', fields: [] }, // 体重大数字输入走独立页 pages/weight
  daily: { name: '日常', again: 1, fields: [] },
  feed: { name: '喂食', again: 1, fields: [
    { kind: 'chips', label: '餐次', opts: ['早餐', '午餐', '晚餐', '加餐'], sel: 0 },
    { kind: 'input', label: '食物', val: '' }, // 默认值按宠物物种填主粮名（见 FEED_FOOD）
    { kind: 'input', label: '克数', ph: '选填', unit: 'g' },
    { kind: 'chips', label: '状态', opts: ['全部吃完', '有剩余', '没怎么吃'], sel: 0 }
  ] },
  vaccine: { name: '疫苗', result: 1, fields: [
    { kind: 'chips', label: '疫苗', opts: ['猫三联', '犬四联', '狂犬', '其他'], sel: 0 },
    { kind: 'chips', label: '针次', opts: ['第1针', '第2针', '第3针', '加强针'], sel: 0 },
    { kind: 'input', label: '医院', ph: '选填' },
    { kind: 'input', label: '批号', ph: '选填' },
    { kind: 'row', label: '下次日期', val: '' }
  ] },
  deworm: { name: '驱虫', result: 1, fields: [
    { kind: 'chips', label: '类型', opts: ['体外', '体内', '内外同驱'], sel: 0 },
    { kind: 'input', label: '药品', ph: '如：大宠爱（体外）' }
  ] },
  medical: { name: '就医', result: 1, fields: [
    { kind: 'input', label: '手术名称', ph: '选填，如：绝育' },
    { kind: 'input', label: '医院', ph: '选填' },
    { kind: 'input', label: '症状', ph: '如：呕吐两天' },
    { kind: 'input', label: '诊断', ph: '选填' },
    { kind: 'input', label: '费用', unit: '元', ph: '选填，计入账单' }
  ] },
  medication: { name: '用药', result: 1, fields: [
    { kind: 'input', label: '药品', ph: '如：速诺' },
    { kind: 'input', label: '剂量', ph: '如：50mg' },
    { kind: 'chips', label: '频次', opts: ['每日 1 次', '每日 2 次', '每日 3 次'], sel: 0 },
    { kind: 'input', label: '疗程', ph: '开启提醒时必填 1~90', unit: '天' },
    { kind: 'mchips', label: '提醒时间', opts: ['08:00', '09:00', '14:00', '21:00'], sels: [3] },
    { kind: 'switch', label: '生成用药提醒', hint: '关闭则只保存用药记录', on: 1 }
  ] },
  surgery: { name: '手术', result: 1, fields: [
    { kind: 'input', label: '手术名称', ph: '如：绝育' },
    { kind: 'input', label: '医院', ph: '选填' },
    { kind: 'input', label: '费用', unit: '元', ph: '选填，计入账单' }
  ] },
  expense: { name: '花销', again: 1, fields: [
    { kind: 'input', label: '金额', ph: '0.00', unit: '元' },
    { kind: 'chips', label: '分类', opts: ['粮食', '零食', '医疗', '用品', '玩具', '美容', '寄养', '保险', '其他'], sel: 0 },
    { kind: 'input', label: '明细', ph: '如：鸡肉冻干粮 1.5kg' }
  ] },
  poop: { name: '便便', again: 1, fields: [
    { kind: 'chips', label: '性状', opts: ['正常', '软便', '稀便', '便秘', '带血'], sel: 0 },
    { kind: 'chips', label: '颜色', opts: ['棕色', '黄色', '发黑', '发绿', '灰白'], sel: 0 }
  ] },
  litter: { name: '铲屎', again: 1, fields: [] },
  groom: { name: '洗护', fields: [
    { kind: 'mchips', label: '项目（可多选）', opts: ['洗澡', '剪指甲', '梳毛', '刷牙', '洁耳', '擦眼睛', '美容'], sels: [] },
    { kind: 'input', label: '门店', ph: '选填' },
    { kind: 'input', label: '金额', unit: '元', ph: '选填，计入账单' }
  ] },
  vomit: { name: '呕吐', fields: [
    { kind: 'chips', label: '呕吐物', opts: ['未消化食物', '毛球', '黄水', '白沫', '带血'], sel: 0 },
    { kind: 'chips', label: '次数', opts: ['1 次', '2 次', '3 次及以上'], sel: 0 }
  ] },
  walk: { name: '遛狗', again: 1, fields: [
    { kind: 'input', label: '时长', ph: '选填', unit: '分钟' }
  ] },
  water: { name: '饮水', again: 1, fields: [
    { kind: 'input', label: '水量', ph: '选填', unit: 'ml' }
  ] },
  snack: { name: '零食', again: 1, fields: [
    { kind: 'input', label: '零食', ph: '如：冻干鹌鹑' },
    { kind: 'chips', label: '数量', opts: ['少量', '适量', '吃多了'], sel: 0 }
  ] },
  heat: { name: '发情', fields: [
    { kind: 'row', label: '开始日期', val: '' },
    { kind: 'mchips', label: '表现（可多选）', opts: ['叫春', '乱尿', '烦躁', '食欲差'], sels: [] }
  ] },
  milestone: { name: '里程碑', fields: [
    { kind: 'input', label: '标题', ph: '如：第一次握手' },
    { kind: 'row', label: '日期', val: '' }
  ] },
  custom: { name: '自定义', fields: [
    { kind: 'input', label: '标题', ph: '给这类记录起个名' },
    { kind: 'input', label: '内容', ph: '记点什么' }
  ] }
};

/**
 * 时间线筛选分组（对齐原型 GROUPS —— G4）
 * 「日常」只含 daily 一类；poop/groom/walk/litter/custom 等生活类类型不归属任何分组，在「全部」中查看
 */
const GROUPS = {
  '全部': null,
  '健康': ['weight', 'vaccine', 'deworm', 'medical', 'medication', 'surgery'],
  '喂养': ['feed', 'water', 'snack'],
  '花销': ['expense'],
  '日常': ['daily']
};

/**
 * 快捷记录九宫格（对齐原型 QA_PAGES，两页各 9 格，swiper 滑动翻页）
 * 手术类型不出现在面板（并入就医），仅保留数据定义兼容历史记录
 */
const QA_PAGES = [
  [['scale', '体重', TC.weight, 'weight'], ['bowl', '喂食', TC.feed, 'feed'], ['camera', '日常', TC.daily, 'daily'],
   ['syringe', '疫苗', TC.vaccine, 'vaccine'], ['shield', '驱虫', TC.deworm, 'deworm'], ['drop', '洗护', TC.groom, 'groom'],
   ['coin', '花销', TC.expense, 'expense'], ['walk', '遛狗', TC.walk, 'walk'], ['box', '铲屎', TC.litter, 'litter']],
  [['fileText', '就医', TC.medical, 'medical'], ['poop', '便便', TC.poop, 'poop'], ['pill', '用药', TC.medication, 'medication'],
   ['vomit', '呕吐', TC.vomit, 'vomit'], ['glass', '饮水', TC.water, 'water'], ['bone', '零食', TC.snack, 'snack'],
   ['heart', '发情', TC.heat, 'heat'], ['flag', '里程碑', TC.milestone, 'milestone'], ['pencil', '自定义', TC.custom, 'custom']]
];

/** 花销分类（9 类，PRD §8.2） */
const EXPENSE_CATEGORIES = ['粮食', '零食', '医疗', '用品', '玩具', '美容', '寄养', '保险', '其他'];

/** 喂食记录「食物」默认值：按宠物物种给主粮名，未识别的物种兜底「主粮」 */
const FEED_FOOD = {
  cat: '猫粮',
  dog: '狗粮',
  rabbit: '兔粮',
  hamster: '仓鼠粮',
  bird: '鸟粮',
  reptile: '爬宠粮',
  fish: '鱼粮',
  other: '主粮'
};

/** 面板类型 key（按九宫格顺序；surgery 并入 medical 不在面板，仅保留数据定义） */
const ALL_TYPES = ['weight', 'feed', 'daily', 'vaccine', 'deworm', 'medication', 'expense', 'walk', 'litter', 'medical', 'poop', 'groom', 'vomit', 'water', 'snack', 'heat', 'milestone', 'custom'];

module.exports = {
  TC,
  ICON_OF,
  NAME,
  FIELD,
  GROUPS,
  QA_PAGES,
  EXPENSE_CATEGORIES,
  FEED_FOOD,
  ALL_TYPES
};
