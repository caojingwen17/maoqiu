// pages/record/edit/formMap.js
// 16 种记录类型的表单配置表：页面按此渲染，不写 16 套模板
// 每种类型：{ title, fields: [...], buildData(form) -> 提交 data, fillForm(data) -> 编辑回填, validate(form) -> 错误文案|null }
//
// field 通用属性：
//   key, label, kind, required?, placeholder?
// kind 说明：
//   number       数字行（点击唤 num-keyboard）；big=true 时渲染为顶部大数字区
//                附加：unit 单位 / max 上限（展示单位）/ mode 'decimal'|'money' / int 取整 / money 提交转分
//   text         float-input 短文本
//   select       单选；display 'sheet'=ActionSheet / 'chips'=Chip 横选（single=true 单排滚动）
//                options [{value,label,icon?}]；dynamicOptions(species) 动态选项；allowCustom 追加「自定义」转 text
//   multiselect  Chip 多选，options 同 select
//   date         picker mode=date 行；form 内存 'YYYY-MM-DD'，buildData 转时间戳
//                defaultCycle 'vaccine' 时默认 = 记录日期 + 设置里的周期天数（驱虫由页面按 kind 处理）
//   segmented    分段选择器（驱虫内驱/外驱）
//   chips-input  标签输入（自定义症状等），form 内存字符串数组
//
// data 字段口径对齐 PRD §4.2 与云端 cloudfunctions/pawlog/schema.js

var recordMeta = require('../../../utils/recordMeta.js');
var dict = require('../../../utils/dict.js');
var dateUtil = require('../../../utils/date.js');

// 'YYYY-MM-DD' -> 本地时间戳（手动拆段，避开 new Date(str) 的时区坑）
function parseDateStr(str) {
  if (!str) {
    return 0;
  }
  var p = str.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
}

// 时间戳 -> 'YYYY-MM-DD'（0 或空返回 ''）
function tsToDateStr(ts) {
  return ts > 0 ? dateUtil.fmtDate(ts) : '';
}

// kg 保留 1 位小数（对齐云端 schema）
function round1(n) {
  return Math.round(n * 10) / 10;
}

// 元 -> 分（int，对齐云端 schema）
function yuanToCents(yuan) {
  return Math.round(Number(yuan) * 100);
}

// 分 -> 元（编辑回填）
function centsToYuan(cents) {
  return cents > 0 ? Math.round(cents) / 100 : null;
}

// 数组型选项构造
function opts(pairs) {
  return pairs.map(function (p) {
    return { value: p[0], label: p[1], icon: p[2] || '' };
  });
}

var MEAL_OPTIONS = opts([
  ['breakfast', recordMeta.MEAL_NAMES.breakfast],
  ['lunch', recordMeta.MEAL_NAMES.lunch],
  ['dinner', recordMeta.MEAL_NAMES.dinner],
  ['extra', recordMeta.MEAL_NAMES.extra],
]);

var GROOM_OPTIONS = opts([
  ['bath', recordMeta.GROOM_ITEM_NAMES.bath],
  ['nail', recordMeta.GROOM_ITEM_NAMES.nail],
  ['ear', recordMeta.GROOM_ITEM_NAMES.ear],
  ['anal', recordMeta.GROOM_ITEM_NAMES.anal],
  ['beauty', recordMeta.GROOM_ITEM_NAMES.beauty],
]);

var POOP_OPTIONS = opts([
  ['normal', recordMeta.POOP_STATUS_NAMES.normal],
  ['soft', recordMeta.POOP_STATUS_NAMES.soft],
  ['diarrhea', recordMeta.POOP_STATUS_NAMES.diarrhea],
  ['constipation', recordMeta.POOP_STATUS_NAMES.constipation],
]);

var VOMIT_OPTIONS = opts([
  ['food', recordMeta.VOMIT_CONTENT_NAMES.food],
  ['hairball', recordMeta.VOMIT_CONTENT_NAMES.hairball],
  ['liquid', recordMeta.VOMIT_CONTENT_NAMES.liquid],
  ['other', recordMeta.VOMIT_CONTENT_NAMES.other],
]);

// 花销分类（PRD §8.2，icon 复用 record-icon 类型图标，仅作视觉映射）
var EXPENSE_OPTIONS = opts([
  ['food', '粮食', 'feed'],
  ['snack', '零食', 'water'],
  ['medical', '医疗', 'medical'],
  ['supply', '用品', 'medicine'],
  ['toy', '玩具', 'walk'],
  ['groom', '美容', 'wash'],
  ['boarding', '寄养', 'milestone'],
  ['insurance', '保险', 'deworm'],
  ['other', '其他', 'custom'],
]);

// 就医常见症状（PRD §8.2）
var SYMPTOM_OPTIONS = opts([
  ['呕吐', '呕吐'], ['腹泻', '腹泻'], ['咳嗽', '咳嗽'], ['打喷嚏', '打喷嚏'],
  ['精神差', '精神差'], ['食欲差', '食欲差'], ['皮肤瘙痒', '皮肤瘙痒'], ['跛行', '跛行'],
]);

// 里程碑预置图标（iconKey，从 16 类型图标里选）
var MILESTONE_ICON_OPTIONS = opts([
  ['milestone', '旗帜', 'milestone'],
  ['walk', '散步', 'walk'],
  ['weight', '体重', 'weight'],
  ['vaccine', '疫苗', 'vaccine'],
  ['feed', '干饭', 'feed'],
  ['medical', '健康', 'medical'],
  ['custom', '星星', 'custom'],
]);

// 按当前时间默认餐次（PRD §8.2 喂食）
function defaultMeal() {
  var h = new Date().getHours();
  if (h >= 5 && h < 10) { return 'breakfast'; }
  if (h >= 10 && h < 15) { return 'lunch'; }
  if (h >= 15 && h < 21) { return 'dinner'; }
  return 'extra';
}

var FORM_MAP = {
  /* ---------- 体重（打磨） ---------- */
  weight: {
    title: '记体重',
    fields: [
      {
        key: 'value', label: '体重', kind: 'number', big: true, required: true,
        unit: 'kg', max: 100, mode: 'decimal',
        hint: '点击数字唤起大键盘 · 支持输入「斤」自动换算',
      },
    ],
    buildData: function (form) {
      return { value: round1(Number(form.value)) };
    },
    fillForm: function (data) {
      return { value: data.value };
    },
    validate: function (form) {
      var v = Number(form.value);
      if (form.value === null || form.value === '' || isNaN(v) || v < 0.1 || v > 100) {
        return '体重数值不太对';
      }
      return null;
    },
  },

  /* ---------- 疫苗（打磨） ---------- */
  vaccine: {
    title: '记疫苗',
    fields: [
      {
        key: 'vaccineName', label: '疫苗名称', kind: 'select', display: 'sheet',
        required: true, allowCustom: true,
        dynamicOptions: function (species) {
          var list = dict.VACCINE_PRESETS[species];
          if (!list) {
            list = dict.VACCINE_PRESETS.cat.concat(dict.VACCINE_PRESETS.dog);
          }
          return list.map(function (name) { return { value: name, label: name }; });
        },
      },
      { key: 'batchNo', label: '批号', kind: 'text', placeholder: '选填' },
      { key: 'hospital', label: '医院', kind: 'text', placeholder: '选填' },
      { key: 'nextDate', label: '下次日期', kind: 'date', defaultCycle: 'vaccine' },
    ],
    buildData: function (form) {
      return {
        vaccineName: form.vaccineName === '__custom__' ? (form.vaccineNameCustom || '').trim() : form.vaccineName,
        batchNo: (form.batchNo || '').trim(),
        hospital: (form.hospital || '').trim(),
        nextDate: parseDateStr(form.nextDate),
      };
    },
    fillForm: function (data) {
      var preset = [];
      Object.keys(dict.VACCINE_PRESETS).forEach(function (k) {
        preset = preset.concat(dict.VACCINE_PRESETS[k]);
      });
      var isPreset = preset.indexOf(data.vaccineName) !== -1;
      return {
        vaccineName: isPreset ? data.vaccineName : '__custom__',
        vaccineNameCustom: isPreset ? '' : (data.vaccineName || ''),
        batchNo: data.batchNo || '',
        hospital: data.hospital || '',
        nextDate: tsToDateStr(data.nextDate),
      };
    },
    validate: function (form) {
      var name = form.vaccineName === '__custom__' ? (form.vaccineNameCustom || '').trim() : form.vaccineName;
      if (!name) {
        return '请填写疫苗名称';
      }
      return null;
    },
  },

  /* ---------- 驱虫（打磨） ---------- */
  deworm: {
    title: '记驱虫',
    fields: [
      {
        key: 'kind', label: '类型', kind: 'segmented', required: true,
        options: opts([
          ['internal', recordMeta.DEWORM_KIND_NAMES.internal],
          ['external', recordMeta.DEWORM_KIND_NAMES.external],
        ]),
      },
      { key: 'product', label: '产品名', kind: 'text', placeholder: '如「大宠爱」' },
      { key: 'nextDate', label: '下次日期', kind: 'date' }, // 默认内驱 90 天 / 外驱 30 天，页面按 kind 算
    ],
    buildData: function (form) {
      return {
        kind: form.kind || 'internal',
        product: (form.product || '').trim(),
        nextDate: parseDateStr(form.nextDate),
      };
    },
    fillForm: function (data) {
      return {
        kind: data.kind || 'internal',
        product: data.product || '',
        nextDate: tsToDateStr(data.nextDate),
      };
    },
    validate: function (form) {
      if (form.kind !== 'internal' && form.kind !== 'external') {
        return '请选择驱虫类型';
      }
      return null;
    },
  },

  /* ---------- 就医（打磨） ---------- */
  medical: {
    title: '记就医',
    fields: [
      {
        key: 'symptom', label: '症状', kind: 'multiselect', required: true,
        options: SYMPTOM_OPTIONS,
      },
      { key: 'symptomCustom', label: '其他症状', kind: 'chips-input', placeholder: '输入后回车添加' },
      { key: 'diagnosis', label: '诊断', kind: 'text', placeholder: '选填' },
      { key: 'prescription', label: '处方', kind: 'text', placeholder: '选填' },
      { key: 'hospital', label: '医院', kind: 'text', placeholder: '选填' },
      { key: 'doctor', label: '医生', kind: 'text', placeholder: '选填' },
      { key: 'cost', label: '花费', kind: 'number', unit: '元', max: 999999, mode: 'money', money: true },
    ],
    buildData: function (form) {
      var symptoms = (form.symptom || []).concat(form.symptomCustom || []);
      return {
        symptom: symptoms.join('、'),
        diagnosis: (form.diagnosis || '').trim(),
        prescription: (form.prescription || '').trim(),
        hospital: (form.hospital || '').trim(),
        doctor: (form.doctor || '').trim(),
        cost: form.cost === null || form.cost === '' ? 0 : yuanToCents(form.cost),
      };
    },
    fillForm: function (data) {
      var common = SYMPTOM_OPTIONS.map(function (o) { return o.value; });
      var selected = [];
      var custom = [];
      (data.symptom || '').split('、').forEach(function (word) {
        if (!word) { return; }
        if (common.indexOf(word) !== -1) {
          selected.push(word);
        } else {
          custom.push(word);
        }
      });
      return {
        symptom: selected,
        symptomCustom: custom,
        diagnosis: data.diagnosis || '',
        prescription: data.prescription || '',
        hospital: data.hospital || '',
        doctor: data.doctor || '',
        cost: centsToYuan(data.cost),
      };
    },
    validate: function (form) {
      if ((form.symptom || []).length === 0 && (form.symptomCustom || []).length === 0) {
        return '请填写症状';
      }
      return null;
    },
  },

  /* ---------- 用药 ---------- */
  medication: {
    title: '记用药',
    fields: [
      { key: 'medicine', label: '药品名', kind: 'text', required: true, placeholder: '如「速诺」' },
      { key: 'dose', label: '单次剂量', kind: 'text', placeholder: '如「半片」' },
      {
        key: 'dailyTimes', label: '每日次数', kind: 'select', display: 'chips',
        options: opts([[1, '1 次'], [2, '2 次'], [3, '3 次'], [4, '4 次']]),
      },
      { key: 'startDate', label: '开始日期', kind: 'date' },
      { key: 'endDate', label: '结束日期', kind: 'date' },
    ],
    buildData: function (form) {
      return {
        medicine: (form.medicine || '').trim(),
        dose: (form.dose || '').trim(),
        startDate: parseDateStr(form.startDate),
        endDate: parseDateStr(form.endDate),
        dailyTimes: Number(form.dailyTimes) || 1,
        checkins: form.checkins || [], // 打卡记录：编辑时保留，新增为空（系统自动写入）
      };
    },
    fillForm: function (data) {
      return {
        medicine: data.medicine || '',
        dose: data.dose || '',
        dailyTimes: data.dailyTimes || 1,
        startDate: tsToDateStr(data.startDate),
        endDate: tsToDateStr(data.endDate),
        checkins: data.checkins || [],
      };
    },
    validate: function (form) {
      if (!(form.medicine || '').trim()) {
        return '请填写药品名';
      }
      return null;
    },
  },

  /* ---------- 手术 ---------- */
  surgery: {
    title: '记手术',
    fields: [
      { key: 'surgeryName', label: '手术名称', kind: 'text', required: true, placeholder: '如「绝育」' },
      { key: 'hospital', label: '医院', kind: 'text', placeholder: '选填' },
      { key: 'cost', label: '花费', kind: 'number', unit: '元', max: 999999, mode: 'money', money: true },
    ],
    buildData: function (form) {
      return {
        surgeryName: (form.surgeryName || '').trim(),
        hospital: (form.hospital || '').trim(),
        cost: form.cost === null || form.cost === '' ? 0 : yuanToCents(form.cost),
      };
    },
    fillForm: function (data) {
      return {
        surgeryName: data.surgeryName || '',
        hospital: data.hospital || '',
        cost: centsToYuan(data.cost),
      };
    },
    validate: function (form) {
      if (!(form.surgeryName || '').trim()) {
        return '请填写手术名称';
      }
      return null;
    },
  },

  /* ---------- 喂食 ---------- */
  feed: {
    title: '记喂食',
    fields: [
      { key: 'meal', label: '餐次', kind: 'select', display: 'chips', required: true, options: MEAL_OPTIONS },
      { key: 'brand', label: '品牌', kind: 'text', placeholder: '选填' },
      { key: 'grams', label: '克数', kind: 'number', unit: 'g', max: 100000, mode: 'decimal', int: true },
    ],
    defaultForm: function () {
      return { meal: defaultMeal() };
    },
    buildData: function (form) {
      return {
        meal: form.meal || defaultMeal(),
        brand: (form.brand || '').trim(),
        grams: form.grams === null || form.grams === '' ? 0 : Math.round(Number(form.grams)),
      };
    },
    fillForm: function (data) {
      return {
        meal: data.meal || defaultMeal(),
        brand: data.brand || '',
        grams: data.grams > 0 ? data.grams : null,
      };
    },
    validate: function (form) {
      if (!form.meal) {
        return '请选择餐次';
      }
      return null;
    },
  },

  /* ---------- 饮水 ---------- */
  water: {
    title: '记饮水',
    fields: [
      { key: 'amount', label: '饮水量', kind: 'number', unit: 'ml', max: 100000, mode: 'decimal', int: true },
    ],
    buildData: function (form) {
      return { amount: form.amount === null || form.amount === '' ? 0 : Math.round(Number(form.amount)) };
    },
    fillForm: function (data) {
      return { amount: data.amount > 0 ? data.amount : null };
    },
    validate: function () {
      return null; // 云端允许 0（打卡式饮水记录）
    },
  },

  /* ---------- 洗护 ---------- */
  groom: {
    title: '记洗护',
    fields: [
      { key: 'items', label: '项目', kind: 'multiselect', required: true, options: GROOM_OPTIONS },
    ],
    buildData: function (form) {
      return { items: form.items || [] };
    },
    fillForm: function (data) {
      return { items: data.items || [] };
    },
    validate: function (form) {
      if ((form.items || []).length === 0) {
        return '请选择洗护项目';
      }
      return null;
    },
  },

  /* ---------- 便便 ---------- */
  poop: {
    title: '记便便',
    fields: [
      { key: 'status', label: '状态', kind: 'select', display: 'chips', required: true, options: POOP_OPTIONS },
    ],
    buildData: function (form) {
      return { status: form.status };
    },
    fillForm: function (data) {
      return { status: data.status || '' };
    },
    validate: function (form) {
      if (!form.status) {
        return '请选择便便状态';
      }
      return null;
    },
  },

  /* ---------- 呕吐 ---------- */
  vomit: {
    title: '记呕吐',
    fields: [
      { key: 'content', label: '内容物', kind: 'select', display: 'chips', required: true, options: VOMIT_OPTIONS },
    ],
    buildData: function (form) {
      return { content: form.content };
    },
    fillForm: function (data) {
      return { content: data.content || '' };
    },
    validate: function (form) {
      if (!form.content) {
        return '请选择呕吐内容物';
      }
      return null;
    },
  },

  /* ---------- 发情 ---------- */
  heat: {
    title: '记发情',
    fields: [
      { key: 'startDate', label: '开始日期', kind: 'date', required: true },
      { key: 'endDate', label: '结束日期', kind: 'date' },
    ],
    buildData: function (form) {
      return {
        startDate: parseDateStr(form.startDate),
        endDate: parseDateStr(form.endDate),
      };
    },
    fillForm: function (data) {
      return {
        startDate: tsToDateStr(data.startDate),
        endDate: tsToDateStr(data.endDate),
      };
    },
    validate: function (form) {
      if (!form.startDate) {
        return '请选择开始日期';
      }
      return null;
    },
  },

  /* ---------- 花销（打磨） ---------- */
  expense: {
    title: '记花销',
    fields: [
      {
        key: 'amount', label: '金额', kind: 'number', big: true, required: true,
        unit: '元', prefix: '¥', max: 999999, mode: 'money', money: true,
        hint: '点击数字唤起大键盘 · 最大 ¥999,999',
      },
      {
        key: 'category', label: '分类', kind: 'select', display: 'chips', single: true,
        required: true, options: EXPENSE_OPTIONS,
      },
      { key: 'itemName', label: '物品名', kind: 'text', placeholder: '选填' },
    ],
    buildData: function (form) {
      return {
        amount: yuanToCents(form.amount),
        category: form.category,
        itemName: (form.itemName || '').trim(),
      };
    },
    fillForm: function (data) {
      return {
        amount: centsToYuan(data.amount),
        category: data.category || '',
        itemName: data.itemName || '',
      };
    },
    validate: function (form) {
      var v = Number(form.amount);
      if (form.amount === null || form.amount === '' || isNaN(v) || v <= 0 || v > 999999) {
        return '请填写金额';
      }
      if (!form.category) {
        return '请选择分类';
      }
      return null;
    },
  },

  /* ---------- 遛狗 ---------- */
  walk: {
    title: '记遛狗',
    fields: [
      { key: 'duration', label: '时长', kind: 'number', required: true, unit: '分钟', max: 1440, mode: 'decimal', int: true },
      { key: 'distance', label: '距离', kind: 'number', unit: 'km', max: 500, mode: 'decimal' },
    ],
    buildData: function (form) {
      return {
        duration: Math.round(Number(form.duration)),
        distance: form.distance === null || form.distance === '' ? 0 : round1(Number(form.distance)),
      };
    },
    fillForm: function (data) {
      return {
        duration: data.duration > 0 ? data.duration : null,
        distance: data.distance > 0 ? data.distance : null,
      };
    },
    validate: function (form) {
      var v = Number(form.duration);
      if (form.duration === null || form.duration === '' || isNaN(v) || v < 1 || v > 1440) {
        return '请填写遛狗时长';
      }
      return null;
    },
  },

  /* ---------- 里程碑 ---------- */
  milestone: {
    title: '记里程碑',
    fields: [
      { key: 'title', label: '标题', kind: 'text', required: true, placeholder: '如「第一次自己上厕所」' },
      {
        key: 'icon', label: '图标', kind: 'select', display: 'chips',
        options: MILESTONE_ICON_OPTIONS,
      },
    ],
    defaultForm: function () {
      return { icon: 'milestone' };
    },
    buildData: function (form) {
      return {
        title: (form.title || '').trim(),
        icon: form.icon || 'milestone',
      };
    },
    fillForm: function (data) {
      return {
        title: data.title || '',
        icon: data.icon || 'milestone',
      };
    },
    validate: function (form) {
      if (!(form.title || '').trim()) {
        return '请填写里程碑标题';
      }
      return null;
    },
  },

  /* ---------- 自定义 ---------- */
  custom: {
    title: '记一条',
    fields: [
      { key: 'title', label: '标题', kind: 'text', required: true, placeholder: '想记点什么？' },
    ],
    buildData: function (form) {
      return { title: (form.title || '').trim() };
    },
    fillForm: function (data) {
      return { title: data.title || '' };
    },
    validate: function (form) {
      if (!(form.title || '').trim()) {
        return '请填写标题';
      }
      return null;
    },
  },
};

module.exports = {
  FORM_MAP: FORM_MAP,
  SYMPTOM_OPTIONS: SYMPTOM_OPTIONS,
  EXPENSE_OPTIONS: EXPENSE_OPTIONS,
};
