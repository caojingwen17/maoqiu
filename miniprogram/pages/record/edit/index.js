// pages/record/edit/index.js
// 添加/编辑记录页：16 种记录类型共用一个页面，type 参数驱动
// 渲染配置见同目录 formMap.js；通用骨架对齐设计文档 §8.3 与效果图「添加记录 · 体重表单」
var formMap = require('./formMap.js');
var recordService = require('../../../services/recordService.js');
var petService = require('../../../services/petService.js');
var reminderService = require('../../../services/reminderService.js');
var petStore = require('../../../stores/petStore.js');
var settingStore = require('../../../stores/settingStore.js');
var constants = require('../../../utils/constants.js');
var dateUtil = require('../../../utils/date.js');
var recordMeta = require('../../../utils/recordMeta.js');
var tracker = require('../../../utils/tracker.js');
var icons = require('../../../components/icons.js');

var FORM_MAP = formMap.FORM_MAP;
var EDIT_TIMELINE_MAX_PAGES = 10; // 编辑模式在时间线里翻找记录的上限（recordService 暂无 getRecord）

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function nowTimeStr() {
  var d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

Page({
  data: {
    type: 'weight',
    isEdit: false,
    navTitle: '记体重',

    // 宠物卡
    pet: null,
    petId: '',
    petLocked: false,
    petSheet: false,
    petList: [],
    speciesName: '',

    // 表单
    form: {},
    fieldsView: [],
    bigView: null,

    // 日期时间
    dateStr: '',
    timeStr: '',
    todayStr: '',
    isToday: true,

    photos: [],
    note: '',

    // 体重专属
    jinText: '',

    // 花销专属：选「医疗」时的就医联动提示条
    showMedicalBanner: false,

    saving: false,
    kb: { visible: false, mode: 'decimal', max: 0, unit: '' },

    // 类型选择条（type 未锁定时显示）
    typeLocked: true,
    typeList: [],

    chevUri: icons.maskIcon('chevron-right'),
    closeUri: icons.maskIcon('close'),
  },

  onLoad: function (options) {
    options = options || {};
    var type = FORM_MAP[options.type] ? options.type : 'weight';
    // 未指定类型（如详情页 FAB 直入）时，顶部显示类型选择条，可随时切换表单
    var typeLocked = !!(options.type && FORM_MAP[options.type]);
    this._cfg = FORM_MAP[type];
    this._isEdit = !!options.recordId;
    this._recordId = options.recordId || '';
    this._reminderId = options.reminderId || '';
    this._pets = [];
    this._touched = {}; // 用户手改过的字段（默认下次日期不被覆盖）
    this._dirty = false;
    this._alertOn = false;
    this._ready = false; // 初始化期间不记脏
    this._kbKey = '';
    this._prevWeight = null;
    this._jumpMedical = false;

    var meta = recordMeta.getMeta(type);
    var navTitle = this._isEdit ? '编辑' + meta.label : this._cfg.title;
    wx.setNavigationBarTitle({ title: navTitle });

    var now = Date.now();
    this.setData({
      type: type,
      typeLocked: typeLocked,
      typeList: typeLocked ? [] : recordMeta.RECORD_META.map(function (m) {
        return { type: m.type, label: m.label, color: m.color };
      }),
      isEdit: this._isEdit,
      navTitle: navTitle,
      dateStr: dateUtil.fmtDate(now),
      timeStr: nowTimeStr(),
      todayStr: dateUtil.fmtDate(now),
      isToday: true,
    });

    this._initForm(options);
    this._loadPets(options.petId || '');
  },

  onUnload: function () {
    this._setAlert(false);
  },

  /* ================= 初始化 ================= */

  _initForm: function (options) {
    var form = {};
    this._cfg.fields.forEach(function (f) {
      switch (f.kind) {
        case 'number':
          form[f.key] = null;
          break;
        case 'multiselect':
        case 'chips-input':
          form[f.key] = [];
          break;
        case 'segmented':
          form[f.key] = f.options && f.options.length ? f.options[0].value : '';
          break;
        case 'switch':
          form[f.key] = false;
          break;
        default:
          form[f.key] = '';
      }
    });
    if (this._cfg.defaultForm) {
      Object.assign(form, this._cfg.defaultForm());
    }
    // 花销「记一笔就医」跳入：预填花费（分 -> 元）
    if (options.cost && this.data.type === 'medical') {
      form.cost = Math.round(Number(options.cost)) / 100 || null;
    }
    this._applyCycleDefaults(form, null);
    this.setData({ form: form });
    this._syncView();
  },

  // 疫苗/驱虫下次日期默认 = 记录日期 + 设置里的周期天数（用户手改过则不覆盖）
  _applyCycleDefaults: function (form, changedKey) {
    if (this._isEdit) {
      return;
    }
    var cycles = settingStore.get().defaultCycles || constants.DEFAULT_CYCLES;
    var recordDay = dateUtil.startOfDay(this._recordTs());
    var type = this.data.type;
    if (type === 'vaccine' && !this._touched.nextDate) {
      form.nextDate = dateUtil.fmtDate(dateUtil.addDays(recordDay, cycles.vaccine));
    }
    if (type === 'deworm' && !this._touched.nextDate &&
        (changedKey === null || changedKey === 'kind' || changedKey === '__date__')) {
      var days = form.kind === 'external' ? cycles.dewormExternal : cycles.dewormInternal;
      form.nextDate = dateUtil.fmtDate(dateUtil.addDays(recordDay, days));
    }
  },

  _loadPets: function (wantPetId) {
    var self = this;
    var cached = petStore.get().petList || [];
    if (cached.length > 0) {
      this._pets = cached;
      this.setData({ petList: cached });
      this._resolvePet(wantPetId);
    } else {
      petService.listPets().then(function (list) {
        petStore.setPetList(list);
        self._pets = list || [];
        self.setData({ petList: self._pets });
        self._resolvePet(wantPetId);
      }).catch(function () {
        self._resolvePet(wantPetId); // 列表拉取失败不阻塞页面渲染
      });
    }
  },

  _resolvePet: function (wantPetId) {
    var self = this;
    var pet = null;
    if (wantPetId) {
      this._pets.forEach(function (p) {
        if (p._id === wantPetId) { pet = p; }
      });
    }
    if (pet) {
      this._setPet(pet, true);
      this._afterPetReady();
    } else if (wantPetId) {
      // 列表里没有（缓存过期等）：单独拉
      petService.getPet(wantPetId).then(function (p) {
        self._setPet(p, true);
        self._afterPetReady();
      }).catch(function () {
        self._toast('fail', '没有找到这只宠物');
      });
    } else if (this._pets.length === 1) {
      // 只有一只宠物时默认选中，少一步
      this._setPet(this._pets[0], false);
      this._afterPetReady();
    } else {
      this._afterPetReady();
    }
  },

  _afterPetReady: function () {
    this._ready = true;
    if (this._isEdit) {
      this._loadRecord();
    } else {
      this._fetchPrevWeight();
    }
  },

  _setPet: function (pet, locked) {
    var speciesName = '';
    constants.SPECIES.forEach(function (s) {
      if (s.key === pet.species) { speciesName = s.name; }
    });
    this.setData({
      pet: pet,
      petId: pet._id,
      petLocked: locked || this._isEdit,
      speciesName: pet.breed || speciesName,
    });
    this._syncView(); // 疫苗选项随物种刷新
  },

  // 编辑模式：recordService 暂无 getRecord，在时间线里翻找（≤10 页）
  _loadRecord: function () {
    var self = this;
    var petId = this.data.petId;
    if (!petId) {
      this._toast('fail', '缺少宠物信息');
      return;
    }
    var page = 0;
    function next() {
      recordService.getTimeline(petId, page).then(function (res) {
        var found = null;
        (res.list || []).forEach(function (r) {
          if (r._id === self._recordId) { found = r; }
        });
        if (found) {
          self._applyRecord(found);
        } else if (res.hasMore && page < EDIT_TIMELINE_MAX_PAGES) {
          page += 1;
          next();
        } else {
          self._toast('fail', '没有找到这条记录');
        }
      }).catch(function () {
        self._toast('fail', '网络开小差了，请重试');
      });
    }
    next();
  },

  _applyRecord: function (record) {
    var form = this._cfg.fillForm ? this._cfg.fillForm(record.data || {}) : {};
    var d = new Date(record.date);
    this.setData({
      form: form,
      dateStr: dateUtil.fmtDate(record.date),
      timeStr: pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
      isToday: dateUtil.fmtDate(record.date) === this.data.todayStr,
      photos: record.photos || [],
      note: record.note || '',
    });
    this._syncView();
  },

  // 体重对比：上次体重优先取 pet.latestWeight，否则翻时间线首条 weight
  _fetchPrevWeight: function () {
    var self = this;
    if (this.data.type !== 'weight' || !this.data.petId) {
      return;
    }
    var pet = this.data.pet;
    if (pet && pet.latestWeight && typeof pet.latestWeight.value === 'number') {
      this._prevWeight = pet.latestWeight;
      return;
    }
    recordService.getTimeline(this.data.petId, 0).then(function (res) {
      (res.list || []).forEach(function (r) {
        if (!self._prevWeight && r.type === 'weight' && r.data && typeof r.data.value === 'number') {
          self._prevWeight = { value: r.data.value, date: r.date };
        }
      });
    }).catch(function () {
      // 拿不到上次体重就只提示「已记下啦」
    });
  },

  /* ================= 视图同步 ================= */

  // 由 form + 配置构建渲染视图（选项选中态、行内展示值都在这里算）
  _syncView: function () {
    var self = this;
    var form = this.data.form;
    var species = this.data.pet ? this.data.pet.species : '';
    var fieldsView = [];
    var bigView = null;

    this._cfg.fields.forEach(function (f) {
      var value = form[f.key];
      var item = {
        key: f.key,
        label: f.label,
        kind: f.kind,
        required: !!f.required,
        placeholder: f.placeholder || '选填',
        single: !!f.single,
        isCustom: value === '__custom__',
      };

      if (f.kind === 'number') {
        var filled = value !== null && value !== '' && !isNaN(Number(value));
        item.display = filled ? (f.prefix || '') + value + (f.unit ? ' ' + f.unit : '') : '';
        item.filled = filled;
        if (f.big) {
          bigView = {
            key: f.key,
            prefix: f.prefix || '',
            unit: f.unit || '',
            hint: f.hint || '点击数字唤起大键盘',
            display: filled ? '' + value : '--',
            empty: !filled,
          };
          return; // 大数字字段不进字段卡
        }
      } else if (f.kind === 'text') {
        item.text = value || '';
      } else if (f.kind === 'date') {
        item.display = value || '';
        item.pickerValue = value || self.data.dateStr;
        item.filled = !!value;
      } else if (f.kind === 'select') {
        var options = f.dynamicOptions ? f.dynamicOptions(species) : (f.options || []);
        if (f.display === 'sheet') {
          var label = '';
          options.forEach(function (o) {
            if (o.value === value) { label = o.label; }
          });
          if (value === '__custom__') {
            label = form[f.key + 'Custom'] ? form[f.key + 'Custom'] : '自定义';
          }
          item.display = label;
          item.filled = !!value;
        } else {
          item.chips = options.map(function (o) {
            return { value: o.value, label: o.label, icon: o.icon || '', on: o.value === value };
          });
        }
      } else if (f.kind === 'multiselect') {
        item.chips = (f.options || []).map(function (o) {
          return { value: o.value, label: o.label, icon: o.icon || '', on: (value || []).indexOf(o.value) !== -1 };
        });
      } else if (f.kind === 'chips-input') {
        item.tags = value || [];
        item.tagInput = form['__tagInput_' + f.key] || '';
      } else if (f.kind === 'segmented') {
        item.segItems = (f.options || []).map(function (o) { return o.label; });
        var idx = 0;
        (f.options || []).forEach(function (o, i) {
          if (o.value === value) { idx = i; }
        });
        item.segIndex = idx;
      } else if (f.kind === 'switch') {
        item.checked = !!value;
      }
      fieldsView.push(item);
    });

    this.setData({
      fieldsView: fieldsView,
      bigView: bigView,
      customVaccine: this.data.type === 'vaccine' && form.vaccineName === '__custom__',
      showMedicalBanner: this.data.type === 'expense' && form.category === 'medical',
    });
  },

  /* ================= 表单交互 ================= */

  _markDirty: function () {
    if (!this._ready) {
      return;
    }
    this._dirty = true;
    this._setAlert(true);
  },

  _setAlert: function (on) {
    if (on === this._alertOn) {
      return;
    }
    this._alertOn = on;
    try {
      if (on) {
        wx.enableAlertBeforeUnload({ message: '放弃这次记录吗？' });
      } else {
        wx.disableAlertBeforeUnload();
      }
    } catch (e) {
      // 基础库不支持时静默降级
    }
  },

  _toast: function (type, text) {
    var t = this.selectComponent('#toast');
    if (t) {
      t.show({ type: type, text: text });
    }
  },

  // 数字行 / 大数字区：唤 num-keyboard
  onNumberTap: function (e) {
    this._openKeyboard(e.currentTarget.dataset.key);
  },

  onBigTap: function () {
    if (this.data.bigView) {
      this._openKeyboard(this.data.bigView.key);
    }
  },

  _openKeyboard: function (key) {
    var field = this._field(key);
    if (!field) {
      return;
    }
    this._kbKey = key;
    this.setData({
      kb: {
        visible: true,
        mode: field.mode === 'money' ? 'money' : 'decimal',
        max: field.max || 0,
        unit: field.unit || '',
      },
    });
  },

  onKbConfirm: function (e) {
    var field = this._field(this._kbKey);
    if (!field) {
      return;
    }
    var value = e.detail.value;
    if (field.int) {
      value = Math.round(value);
    } else if (field.mode === 'money') {
      value = Math.round(value * 100) / 100;
    } else {
      value = Math.round(value * 10) / 10;
    }
    this._setFormValue(this._kbKey, value, true);
  },

  onKbClose: function () {
    this.setData({ 'kb.visible': false });
  },

  // text：float-input
  onTextInput: function (e) {
    this._setFormValue(e.currentTarget.dataset.key, e.detail.value, true, false);
  },

  // select sheet：ActionSheet（选项 ≤6 个，含「自定义」）
  onSelectSheet: function (e) {
    var self = this;
    var key = e.currentTarget.dataset.key;
    var field = this._field(key);
    if (!field) {
      return;
    }
    var species = this.data.pet ? this.data.pet.species : '';
    var options = field.dynamicOptions ? field.dynamicOptions(species) : (field.options || []);
    var labels = options.map(function (o) { return o.label; });
    if (field.allowCustom) {
      labels.push('自定义');
    }
    wx.showActionSheet({
      itemList: labels,
      success: function (res) {
        var value = res.tapIndex < options.length ? options[res.tapIndex].value : '__custom__';
        self._setFormValue(key, value, true);
      },
    });
  },

  // select chips 单选 / multiselect 多选
  onChip: function (e) {
    var key = e.currentTarget.dataset.key;
    var value = e.currentTarget.dataset.value;
    var field = this._field(key);
    if (!field) {
      return;
    }
    if (field.kind === 'multiselect') {
      var arr = (this.data.form[key] || []).slice();
      var idx = arr.indexOf(value);
      if (idx === -1) {
        arr.push(value);
      } else {
        arr.splice(idx, 1);
      }
      this._setFormValue(key, arr, true);
    } else {
      this._setFormValue(key, value, true);
    }
  },

  // segmented（驱虫内驱/外驱）
  onSegmented: function (e) {
    var key = e.currentTarget.dataset.key;
    var field = this._field(key);
    if (!field) {
      return;
    }
    var option = (field.options || [])[e.detail.index];
    if (option) {
      this._setFormValue(key, option.value, true);
    }
  },

  // chips-input：标签输入
  onTagInput: function (e) {
    this._setFormValue('__tagInput_' + e.currentTarget.dataset.key, e.detail.value, false, false);
  },

  onTagAdd: function (e) {
    var key = e.currentTarget.dataset.key;
    var text = (e.detail.value || '').trim();
    if (!text) {
      return;
    }
    var arr = (this.data.form[key] || []).slice();
    if (arr.indexOf(text) === -1) {
      arr.push(text);
    }
    var patch = {};
    patch[key] = arr;
    patch['__tagInput_' + key] = '';
    this._setFormPatch(patch, true);
  },

  onTagRemove: function (e) {
    var key = e.currentTarget.dataset.key;
    var value = e.currentTarget.dataset.value;
    var arr = (this.data.form[key] || []).filter(function (t) {
      return t !== value;
    });
    this._setFormValue(key, arr, true);
  },

  // 类型内 date 字段
  onFieldDate: function (e) {
    var key = e.currentTarget.dataset.key;
    this._touched[key] = true;
    this._setFormValue(key, e.detail.value, true);
  },

  // switch 开关行
  onSwitchRow: function (e) {
    this._setFormValue(e.currentTarget.dataset.key, e.detail.value, true);
  },

  _field: function (key) {
    var found = null;
    this._cfg.fields.forEach(function (f) {
      if (f.key === key) { found = f; }
    });
    return found;
  },

  _setFormValue: function (key, value, dirty, sync) {
    var patch = {};
    patch[key] = value;
    this._setFormPatch(patch, dirty, sync);
  },

  _setFormPatch: function (patch, dirty, sync) {
    var form = Object.assign({}, this.data.form, patch);
    this._applyCycleDefaults(form, Object.keys(patch)[0]);
    this.setData({ form: form });
    if (sync !== false) {
      this._syncView();
    }
    if (dirty) {
      this._markDirty();
    }
  },

  /* ================= 日期时间行 ================= */

  onDateChange: function (e) {
    var dateStr = e.detail.value;
    this.setData({
      dateStr: dateStr,
      isToday: dateStr === this.data.todayStr,
    });
    // 记录日期变了，未手改过的「下次日期」跟着重算（_recordTs 依赖新的 dateStr）
    var form = Object.assign({}, this.data.form);
    this._applyCycleDefaults(form, '__date__');
    this.setData({ form: form });
    this._syncView();
    this._markDirty();
  },

  onTimeChange: function (e) {
    this.setData({ timeStr: e.detail.value });
    this._markDirty();
  },

  _recordTs: function () {
    var ts = dateUtil.startOfDay(new Date(
      Number(this.data.dateStr.slice(0, 4)),
      Number(this.data.dateStr.slice(5, 7)) - 1,
      Number(this.data.dateStr.slice(8, 10))
    ).getTime());
    var tp = (this.data.timeStr || '00:00').split(':');
    ts += Number(tp[0]) * 3600000 + Number(tp[1]) * 60000;
    var now = Date.now();
    return ts > now ? now : ts; // 不可未来
  },

  /* ================= 照片 / 备注 / 斤换算 ================= */

  onPhotos: function (e) {
    this.setData({ photos: e.detail.photos });
    this._markDirty();
  },

  onNote: function (e) {
    var value = (e.detail.value || '').slice(0, 500);
    this.setData({ note: value });
    this._markDirty();
  },

  onJinInput: function (e) {
    this.setData({ jinText: e.detail.value });
  },

  onConvertJin: function () {
    var jin = parseFloat(this.data.jinText);
    if (!jin || jin <= 0) {
      this._toast('fail', '先输入斤数');
      return;
    }
    var kg = Math.round((jin / 2) * 10) / 10;
    if (kg > 100) {
      this._toast('fail', '体重数值不太对');
      return;
    }
    this._setFormValue('value', kg, true);
    this._toast('success', jin + ' 斤 = ' + kg + ' kg');
  },

  /* ================= 类型切换（仅 type 未锁定时可用） ================= */

  onTypeChipTap: function (e) {
    var t = e.currentTarget.dataset.type;
    if (!t || t === this.data.type || !FORM_MAP[t] || this._isEdit) {
      return;
    }
    this._cfg = FORM_MAP[t];
    this._touched = {}; // 切换类型后默认周期重新带出
    wx.setNavigationBarTitle({ title: this._cfg.title });
    this.setData({
      type: t,
      navTitle: this._cfg.title,
      showMedicalBanner: false,
      jinText: '',
    });
    this._initForm({});
  },

  /* ================= 宠物选择 ================= */

  onOpenPetSheet: function () {
    if (this.data.petLocked) {
      return;
    }
    this.setData({ petSheet: true });
  },

  onClosePetSheet: function () {
    this.setData({ petSheet: false });
  },

  onPickPet: function (e) {
    var id = e.currentTarget.dataset.id;
    var pet = null;
    this._pets.forEach(function (p) {
      if (p._id === id) { pet = p; }
    });
    if (!pet) {
      return;
    }
    this._setPet(pet, false);
    this.setData({ petSheet: false });
    this._fetchPrevWeight();
    this._markDirty();
  },

  /* ================= 花销 → 就医联动 ================= */

  onMedicalBanner: function () {
    if (this.data.saving) {
      return;
    }
    this._jumpMedical = true;
    this.onSave();
  },

  /* ================= 保存 ================= */

  onSave: function () {
    this._save(false);
  },

  onSaveContinue: function () {
    this._save(true);
  },

  _save: function (continueMode) {
    var self = this;
    if (this.data.saving) {
      return;
    }
    if (!this.data.petId) {
      this._toast('fail', '先选一只毛孩子吧');
      return;
    }
    var form = this.data.form;
    var err = this._cfg.validate ? this._cfg.validate(form) : null;
    if (err) {
      this._toast('fail', err);
      return;
    }

    var record = {
      petId: this.data.petId,
      type: this.data.type,
      date: this._recordTs(),
      data: this._cfg.buildData(form),
      photos: this.data.photos,
      note: this.data.note,
    };

    this.setData({ saving: true });
    recordService.saveRecord(record, this._isEdit ? this._recordId : undefined).then(function (res) {
      self.setData({ saving: false });
      self._dirty = false;
      self._setAlert(false);
      tracker.track(tracker.EVENTS.RECORD_SUBMIT, { type: self.data.type });

      // 从提醒「记一笔」跳入：联动完成提醒（失败不打断）
      if (self._reminderId) {
        reminderService.completeReminder(self._reminderId).catch(function () {});
        self._reminderId = '';
      }

      self._afterSave(res, continueMode);
    }).catch(function (err) {
      self.setData({ saving: false });
      // 表单数据保留不清空（PRD §5.3）
      self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
    });
  },

  _afterSave: function (res, continueMode) {
    var self = this;
    var type = this.data.type;

    // 花销选「医疗」且点了联动条：保存后跳就医表单并预填花费
    if (type === 'expense' && this._jumpMedical) {
      this._jumpMedical = false;
      var cents = this._cfg.buildData(this.data.form).amount;
      this._toast('success', '已记下啦');
      setTimeout(function () {
        wx.redirectTo({
          url: '/pages/record/edit/index?type=medical&petId=' + self.data.petId + '&cost=' + cents,
        });
      }, 900);
      return;
    }

    if (continueMode) {
      // 保存并再记一条：重置表单，保留宠物与类型
      var now = Date.now();
      this._touched = {};
      this.setData({
        dateStr: dateUtil.fmtDate(now),
        timeStr: nowTimeStr(),
        isToday: true,
        photos: [],
        note: '',
        jinText: '',
      });
      this._initForm({});
      this._toast('success', '已记下啦');
      return;
    }

    // 体重：带对比反馈的 toast
    if (type === 'weight' && !this._isEdit) {
      this._toast('success', this._weightToastText());
      setTimeout(function () { self._goBack(); }, 1200);
      return;
    }

    // 疫苗/驱虫：云端联动了周期提醒则弹窗告知
    if ((type === 'vaccine' || type === 'deworm') && !this._isEdit && res && (res.reminderId || (res.reminder && res.reminder.remindAt))) {
      var remindAt = res.reminder && res.reminder.remindAt ? res.reminder.remindAt : this._nextRemindAt();
      this._toast('success', '已记下啦');
      setTimeout(function () {
        wx.showModal({
          title: '已记下啦',
          content: '已为你创建下次提醒：' + dateUtil.fmtDate(remindAt),
          confirmText: '修改周期',
          cancelText: '好的',
          success: function (r) {
            if (r.confirm) {
              wx.redirectTo({ url: '/pages/reminder/index' });
            } else {
              self._goBack();
            }
          },
          fail: function () { self._goBack(); },
        });
      }, 900);
      return;
    }

    this._toast('success', '已记下啦');
    setTimeout(function () { self._goBack(); }, 900);
  },

  _weightToastText: function () {
    var prev = this._prevWeight;
    var value = Number(this.data.form.value);
    if (!prev || typeof prev.value !== 'number') {
      return '已记下啦';
    }
    var diff = Math.round((value - prev.value) * 10) / 10;
    if (Math.abs(diff) < 0.05) {
      return '已记下啦 · 与上次持平';
    }
    return '已记下啦 · 比上次 ' + (diff > 0 ? '↑' : '↓') + Math.abs(diff).toFixed(1) + 'kg';
  },

  // 云端返回体不带提醒详情时，按表单下次日期（或周期推算）自行拼接
  _nextRemindAt: function () {
    var form = this.data.form;
    if (form.nextDate) {
      var p = form.nextDate.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
    }
    var cycles = settingStore.get().defaultCycles || constants.DEFAULT_CYCLES;
    var days = this.data.type === 'vaccine'
      ? cycles.vaccine
      : (form.kind === 'external' ? cycles.dewormExternal : cycles.dewormInternal);
    return dateUtil.addDays(this._recordTs(), days);
  },

  _goBack: function () {
    wx.navigateBack({
      fail: function () {
        // 从 tab 页直接跳入时无法 back，回首页
        wx.switchTab({ url: '/pages/home/index' });
      },
    });
  },
});
