// dict.js
// 离线字典数据：品种、疫苗预置、禁忌食物
// 禁忌食物供 v1.4 工具箱「安全食物查询」用，纯离线不写库
// level 分档：danger 剧毒 / harmful 有害 / caution 少量可 / safe 安全 / note 注意

// 猫常见品种（20+，供品种选择器搜索）
var CAT_BREEDS = [
  '中华田园猫', '英国短毛猫', '美国短毛猫', '布偶猫', '暹罗猫',
  '波斯猫', '加菲猫', '缅因猫', '俄罗斯蓝猫', '苏格兰折耳猫',
  '金吉拉', '孟加拉豹猫', '斯芬克斯猫', '挪威森林猫', '阿比西尼亚猫',
  '德文卷毛猫', '英国长毛猫', '曼基康猫', '土耳其安哥拉猫', '东方短毛猫',
  '伯曼猫', '索马里猫', '柯尼斯卷毛猫', '新加坡猫', '巴厘猫',
];

// 狗常见品种（20+）
var DOG_BREEDS = [
  '中华田园犬', '金毛寻回犬', '拉布拉多', '柯基', '泰迪',
  '比熊', '博美', '柴犬', '哈士奇', '萨摩耶',
  '边境牧羊犬', '德国牧羊犬', '法国斗牛犬', '巴哥犬', '雪纳瑞',
  '约克夏', '吉娃娃', '阿拉斯加', '杜宾犬', '松狮',
  '秋田犬', '西高地白梗', '马尔济斯', '蝴蝶犬', '比格犬',
];

// 疫苗预置字典（PRD §8.2：猫 猫三联/狂犬；狗 犬四联/犬六联/狂犬）
var VACCINE_PRESETS = {
  cat: ['猫三联', '狂犬疫苗'],
  dog: ['犬四联', '犬六联', '狂犬疫苗'],
};

// 禁忌食物离线数据（60+ 条）
// name 食物名；level 分档；note 一句话说明（面向普通养宠人的白话）
var FORBIDDEN_FOODS = [
  // danger 剧毒（少量即可能致命，立即就医）
  { name: '巧克力', level: 'danger', note: '可可碱中毒，黑巧克力尤其危险' },
  { name: '洋葱', level: 'danger', note: '破坏红细胞，引发溶血性贫血' },
  { name: '大蒜', level: 'danger', note: '与洋葱同类，熟蒜蒜粉也不行' },
  { name: '葡萄', level: 'danger', note: '可导致急性肾衰竭，一颗也不能试' },
  { name: '葡萄干', level: 'danger', note: '浓缩的葡萄，毒性更强' },
  { name: '木糖醇', level: 'danger', note: '常见于无糖口香糖，致血糖骤降肝衰竭' },
  { name: '酒精', level: 'danger', note: '极小量也会中毒，含酒精食物同样禁止' },
  { name: '咖啡', level: 'danger', note: '咖啡因中毒，心跳过速可致命' },
  { name: '浓茶', level: 'danger', note: '茶碱与咖啡因同源，对猫狗都有毒' },
  { name: '夏威夷果', level: 'danger', note: '对狗剧毒，呕吐抽搐后肢无力' },
  { name: '牛油果', level: 'danger', note: '含 Persin，猫狗食用可致心肌损伤' },
  { name: '生面团', level: 'danger', note: '酵母在胃内发酵产酒精并撑胀胃' },
  { name: '樱桃', level: 'danger', note: '果核含氰化物，果肉也可能引起肠胃不适' },
  { name: '桃核杏核', level: 'danger', note: '果核含氰化物，还有卡喉风险' },
  { name: '百合花', level: 'danger', note: '对猫剧毒，花粉都可能致肾衰，家中勿养' },

  // harmful 有害（明确伤身，不要喂）
  { name: '牛奶', level: 'harmful', note: '多数猫狗乳糖不耐，喝了腹泻' },
  { name: '熟禽骨', level: 'harmful', note: '煮熟后变脆，碎骨易划伤消化道' },
  { name: '生鸡蛋', level: 'harmful', note: '沙门氏菌风险，还影响生物素吸收' },
  { name: '生鱼', level: 'harmful', note: '含硫胺素酶，长期喂致维生素B1缺乏' },
  { name: '动物肝脏', level: 'harmful', note: '维生素A过量中毒，每周一小口为限' },
  { name: '肥肉', level: 'harmful', note: '高脂诱发胰腺炎，尤其小型犬' },
  { name: '高盐食物', level: 'harmful', note: '火腿肠咸菜等，伤肾还可能钠中毒' },
  { name: '高糖零食', level: 'harmful', note: '蛋糕饼干，肥胖与糖尿病的来源' },
  { name: '冰淇淋', level: 'harmful', note: '糖加乳糖双重打击，没有好处' },
  { name: '油炸食品', level: 'harmful', note: '高油高盐，胰腺炎高危' },
  { name: '蘑菇', level: 'harmful', note: '食用菇也可能肠胃不适，野生菇致命' },
  { name: '生土豆', level: 'harmful', note: '含龙葵素，发芽变绿毒性更强' },
  { name: '青番茄', level: 'harmful', note: '未熟番茄含龙葵碱' },
  { name: '辣椒', level: 'harmful', note: '刺激肠胃，猫狗不会觉得香只觉得痛' },
  { name: '坚果', level: 'harmful', note: '高脂且易卡喉，部分种类有毒' },
  { name: '人类药物', level: 'harmful', note: '布洛芬、对乙酰氨基酚等对宠物剧毒' },
  { name: '烟草', level: 'harmful', note: '尼古丁中毒，烟蒂也要收好' },

  // caution 少量可（能喂但要控制量或做法）
  { name: '苹果', level: 'caution', note: '去核去籽少量喂，果核含氰化物' },
  { name: '香蕉', level: 'caution', note: '高糖，一小块解馋即可' },
  { name: '西瓜', level: 'caution', note: '去籽少量，糖分不低' },
  { name: '草莓', level: 'caution', note: '少量可，含糖较高' },
  { name: '橙子', level: 'caution', note: '多数猫讨厌柑橘味，少量果肉无碍' },
  { name: '奶酪', level: 'caution', note: '乳糖较低，指甲盖大小试起' },
  { name: '蛋黄', level: 'caution', note: '必须全熟，每周一两个足够' },
  { name: '三文鱼', level: 'caution', note: '必须煮熟去刺，生鱼有寄生虫风险' },
  { name: '虾', level: 'caution', note: '煮熟去壳去虾线，个别宠物过敏' },
  { name: '米饭', level: 'caution', note: '可少量拌粮，不能当主食' },
  { name: '面包', level: 'caution', note: '无馅白面包偶尔一小块，无营养' },
  { name: '花生酱', level: 'caution', note: '必须不含木糖醇，少量涂抹可' },
  { name: '玉米', level: 'caution', note: '少量玉米粒可，玉米棒会卡肠道' },
  { name: '菠菜', level: 'caution', note: '草酸偏高，偶尔少量煮熟喂' },
  { name: '芒果', level: 'caution', note: '去皮去核少量，糖分高' },
  { name: '荔枝龙眼', level: 'caution', note: '去核少量，糖分过高不宜常吃' },

  // safe 安全（正常喂食无碍）
  { name: '鸡胸肉', level: 'safe', note: '煮熟无调味，优质蛋白来源' },
  { name: '牛肉', level: 'safe', note: '煮熟瘦肉，补铁补蛋白' },
  { name: '胡萝卜', level: 'safe', note: '煮熟切小块，补充维生素' },
  { name: '南瓜', level: 'safe', note: '蒸熟喂食，软便克星' },
  { name: '红薯', level: 'safe', note: '蒸熟少量，纤维助消化' },
  { name: '西兰花', level: 'safe', note: '煮熟少量，补充维生素' },
  { name: '黄瓜', level: 'safe', note: '水分足热量低，夏季好零食' },
  { name: '蓝莓', level: 'safe', note: '抗氧化，几颗即可' },
  { name: '燕麦', level: 'safe', note: '煮熟原味，少量拌粮' },
  { name: '白菜', level: 'safe', note: '煮熟切碎，少量无碍' },
  { name: '木瓜', level: 'safe', note: '去籽少量，助消化' },
  { name: '梨', level: 'safe', note: '去核少量，水分足' },

  // note 注意（不算食物但必须提醒）
  { name: '绿萝', level: 'note', note: '常见家养绿植，啃食会口腔灼伤' },
  { name: '康乃馨', level: 'note', note: '对猫有毒，花束要放到猫够不到处' },
  { name: '驱蚊液', level: 'note', note: '含菊酯类成分，对猫毒性大' },
  { name: '樟脑丸', level: 'note', note: '误食中毒，衣柜收纳要防翻' },
];

module.exports = {
  CAT_BREEDS: CAT_BREEDS,
  DOG_BREEDS: DOG_BREEDS,
  VACCINE_PRESETS: VACCINE_PRESETS,
  FORBIDDEN_FOODS: FORBIDDEN_FOODS,
};
