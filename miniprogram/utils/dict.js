/**
 * 离线字典：物种 / 猫狗品种 / 疫苗 / 禁忌食物（安全食物查询）
 * 纯本地数据，无需请求云函数
 */

/** 物种（PRD §4.1 species 枚举，8 种 + 中文名 + 身份字段语义） */
const SPECIES = [
  { key: 'cat', name: '猫' },
  { key: 'dog', name: '狗' },
  { key: 'rabbit', name: '兔' },
  { key: 'hamster', name: '仓鼠' },
  { key: 'bird', name: '鸟' },
  { key: 'reptile', name: '爬宠' },
  { key: 'fish', name: '鱼' },
  { key: 'other', name: '其他' }
];

/**
 * 物种差异化字段（对齐原型 SPECIES_FORM 与 PRD §7.1）
 * identity: 该物种的「身份字段」语义；breedLabel: 品种/种类标签；needNeutered: 是否需要绝育字段
 */
const SPECIES_FORM = {
  猫: { breed: '如：美国短毛猫', breedLabel: '品种', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: true, neuteredOpts: ['已绝育', '未绝育', '不确定'], hint: '生日与到家日期用于自动计算年龄和「到家 N 天」' },
  狗: { breed: '如：柯基', breedLabel: '品种', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: true, neuteredOpts: ['已绝育', '未绝育', '不确定'], hint: '生日与到家日期用于自动计算年龄和「到家 N 天」' },
  兔: { breed: '选填，如：垂耳兔', breedLabel: '品种', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: true, neuteredOpts: ['已绝育', '未绝育', '不确定'], hint: '生日与到家日期用于自动计算年龄和「到家 N 天」' },
  仓鼠: { breed: '选填，如：金丝熊', breedLabel: '品种', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: false, hint: '不知道生日也没关系，可以只记录到家日期' },
  鸟: { breed: '选填，如：玄凤鹦鹉', breedLabel: '品种', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: false, hint: '不知道生日也没关系，可以只记录到家日期' },
  鱼: { breed: '如：客厅小鱼缸', breedLabel: '鱼缸/名称', identity: '数量', identityOpts: ['1 条', '2–10 条', '10 条以上'], needNeutered: false, hint: '群养鱼可填写鱼缸名称，数量与入缸日期更有用' },
  爬宠: { breed: '如：豹纹守宫', breedLabel: '种类', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: false, hint: '可在保存后补充饲养箱、适温和湿度信息' },
  其他: { breed: '选填，如：龙猫', breedLabel: '品种/种类', identity: '性别', identityOpts: ['♀ 雌性', '♂ 雄性', '不确定'], needNeutered: false, hint: '先建立档案，后续记录可使用日常和自定义类型' }
};

/** 猫狗品种字典（后续可扩展） */
const BREEDS = {
  cat: ['英国短毛猫', '美国短毛猫', '布偶猫', '缅因猫', '狸花猫', '橘猫', '暹罗猫', '波斯猫', '苏格兰折耳猫', '无毛猫', '奶牛猫', '三花猫'],
  dog: ['柯基', '金毛寻回犬', '拉布拉多', '边牧', '泰迪', '比熊', '柴犬', '柯利牧羊犬', '哈士奇', '萨摩耶', '博美', '雪纳瑞']
};

/** 疫苗字典（按物种） */
const VACCINES = {
  cat: ['猫三联', '狂犬', '猫白血病', '其他'],
  dog: ['犬四联', '犬六联', '狂犬', '其他'],
  default: ['其他']
};

/** 护理提醒预设模板（PRD §9.1） */
const CARE_TEMPLATES = ['梳毛', '刷牙', '洗澡', '剪指甲', '洁耳', '擦眼睛', '铲屎', '洗猫砂盆', '洗碗', '称体重', '驱虫', '复查', '自定义'];

/**
 * 禁忌食物字典（安全食物查询 · 离线）
 * level: toxic(剧毒) / harmful(有害) / limited(少量可) / safe(安全)
 * 起步数据，后续可扩展到 100+（PRD §13）
 */
const FOODS = [
  ['巧克力', 'toxic'], ['洋葱', 'toxic'], ['大蒜', 'toxic'], ['葡萄', 'toxic'], ['葡萄干', 'toxic'],
  ['木糖醇', 'toxic'], ['酒', 'toxic'], ['酒精', 'toxic'], ['咖啡', 'toxic'], ['咖啡因', 'toxic'],
  ['百合花', 'toxic'], ['牛油果', 'toxic'], ['夏威夷果', 'toxic'], ['生面团', 'toxic'],
  ['韭菜', 'harmful'], ['大葱', 'harmful'], ['小葱', 'harmful'], ['辣椒', 'harmful'],
  ['巧克力饼干', 'harmful'], ['腌制食品', 'harmful'], ['咸鱼', 'harmful'], ['腊肉', 'harmful'],
  ['油炸食品', 'harmful'], ['生鸡蛋', 'harmful'], ['生鱼', 'harmful'], ['生肉', 'harmful'],
  ['牛奶', 'limited'], ['奶酪', 'limited'], ['奶油', 'limited'], ['肥肉', 'limited'],
  ['培根', 'limited'], ['香肠', 'limited'], ['菠萝', 'limited'], ['芒果', 'limited'],
  ['草莓', 'limited'], ['西瓜', 'limited'],
  ['苹果', 'safe'], ['香蕉', 'safe'], ['蓝莓', 'safe'], ['胡萝卜', 'safe'], ['南瓜', 'safe'],
  ['西兰花', 'safe'], ['黄瓜', 'safe'], ['米饭', 'safe'], ['鸡胸肉', 'safe'], ['三文鱼', 'safe'],
  ['红薯', 'safe'], ['燕麦', 'safe']
];

const FOOD_LEVELS = {
  toxic: { name: '剧毒', color: '#D24B42' },
  harmful: { name: '有害', color: '#B26E4B' },
  limited: { name: '少量可', color: '#9C6B33' },
  safe: { name: '安全', color: '#34A05C' }
};

/** 宠物冷知识库（paw-loading 加载动效随机展示一条） */
const PET_TRIVIA = [
  '猫咪每天睡 12~16 小时',
  '狗狗能记住 200 多个词',
  '猫的呼噜声有助于放松',
  '猫咪尝不出甜味',
  '狗狗的鼻纹独一无二',
  '猫的肉垫会出汗',
  '狗狗摇尾巴不一定代表开心',
  '猫咪蹭你是在标记领地',
  '兔子的牙齿会一直在长',
  '仓鼠喜欢把食物藏进颊囊',
  '金鱼的记忆远不止 7 秒',
  '兔子开心时会跳起来甩头',
  '仓鼠是夜行动物，白天补觉',
  '猫的胡须能感知气流变化',
  '狗狗的听觉是人的好几倍',
  '猫咪清醒时约三分之一时间在舔毛',
  '兔子不会呕吐',
  '虎皮鹦鹉能学会说不少词语',
  '鱼也能认出经常喂食的人',
  '爬宠靠晒太阳调节体温',
  '狗喝水时舌头会向后卷成勺子',
  '猫从高处落下能自动翻转身体'
];

module.exports = {
  SPECIES,
  SPECIES_FORM,
  BREEDS,
  VACCINES,
  CARE_TEMPLATES,
  FOODS,
  FOOD_LEVELS,
  PET_TRIVIA
};