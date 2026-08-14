// pages/mine/index.js
// 我的 · 设置页：品牌卡 / 数据备份占位 / 偏好 / 通用 / 关于（PRD §14.2，设计 §8.6）
var settingsService = require('../../services/settingsService.js');
var petService = require('../../services/petService.js');
var settingStore = require('../../stores/settingStore.js');
var petStore = require('../../stores/petStore.js');
var dateUtil = require('../../utils/date.js');
var icons = require('../../components/icons.js');

// 订阅消息模板 ID（占位）：与 cloudfunctions/pawlog/config.js 的 SUBSCRIBE_TEMPLATE_ID
// 同名同值；前端无法引用云函数目录，上线前需同步替换为正式模板 ID
var SUBSCRIBE_TEMPLATE_ID = 'TEMPLATE_ID_PLACEHOLDER';

// 本地设置缓存键（清除缓存时保留）
var SETTINGS_STORAGE_KEY = 'pawlog_settings';

var THEME_OPTIONS = [
  { key: 'auto', name: '跟随系统' },
  { key: 'light', name: '浅色' },
  { key: 'dark', name: '深色' },
];

var THEME_NAMES = { auto: '跟随系统', light: '浅色', dark: '深色' };

Page({
  data: {
    version: 'v1.0.0',
    slogan: '每只毛孩子，都值得一个装满成长的档案袋',
    pawUri: icons.maskIcon('paw'),
    backupUri: icons.maskIcon('download'),
    arrowUri: icons.maskIcon('chevron-right'),
    checkUri: icons.maskIcon('check'),

    theme: 'auto',
    themeText: '跟随系统',
    themeOptions: THEME_OPTIONS,
    notifyOn: false,
    backupText: '上次备份 · 从未备份',
    cyclesText: '',
    budgetText: '未设置',
    advanceDaysText: '7 天',
    archivedCountText: '',

    themeSheet: false,
    cyclesSheet: false,
    budgetSheet: false,
    advanceSheet: false,
    archivedSheet: false,
    aboutSheet: false,

    cyclesForm: { dewormInternal: '', dewormExternal: '', vaccine: '', bath: '' },
    budgetForm: '',
    advanceForm: '',
    archivedList: [],
  },

  onLoad: function () {
    var self = this;
    // 设置变化即时生效（本页或其他页改动都会同步到这里）
    this._unsubscribe = settingStore.subscribe(function () {
      self._syncFromStore();
    });
  },

  onUnload: function () {
    if (this._unsubscribe) this._unsubscribe();
  },

  onShow: function () {
    this._syncFromStore();
    this._fetchCloudSettings();
    this._fetchPets();
  },

  /* —— 本地设置 -> 展示文案 —— */
  _syncFromStore: function () {
    var st = settingStore.get();
    var budget = typeof st.budget === 'number' ? st.budget : 0;
    var yuan = budget / 100;
    var yuanText = yuan.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    var dc = st.defaultCycles || {};
    this.setData({
      theme: st.theme || 'auto',
      themeText: THEME_NAMES[st.theme] || THEME_NAMES.auto,
      notifyOn: !!st.subscribeAuth,
      budgetText: budget > 0 ? '¥' + yuanText : '未设置',
      advanceDaysText: (typeof st.advanceDays === 'number' ? st.advanceDays : 7) + ' 天',
      cyclesText: '内驱' + (dc.dewormInternal || 90) + ' · 外驱' + (dc.dewormExternal || 30) +
        ' · 疫苗' + (dc.vaccine || 365) + ' · 洗澡' + (dc.bath || 30),
    });
  },

  // 云端设置是最终来源：拉到后整体替换本地缓存（失败静默，用本地缓存兜底）
  _fetchCloudSettings: function () {
    var self = this;
    settingsService.getSettings()
      .then(function (res) {
        if (!res) return;
        settingStore.replace(res);
        self.setData({
          backupText: res.backupAt
            ? '上次备份 · ' + dateUtil.fmtDate(res.backupAt)
            : '上次备份 · 从未备份',
        });
      })
      .catch(function () {});
  },

  _fetchPets: function () {
    var self = this;
    petService.listPets()
      .then(function (list) {
        petStore.setPetList(list);
        self._applyPets(list);
      })
      .catch(function () {
        // 云服务未配置：用缓存兜底，没有缓存则显示 0
        self._applyPets(petStore.get().petList || []);
      });
  },

  _applyPets: function (list) {
    var archived = (list || []).filter(function (p) { return !!p.archived; });
    this.setData({
      archivedList: archived,
      archivedCountText: archived.length > 0 ? String(archived.length) : '',
    });
  },

  _toast: function (type, text) {
    var toast = this.selectComponent('#toast');
    if (toast) toast.show({ type: type, text: text });
  },

  // 本地即时生效 + 云端持久化；云端失败不撤回本地（离线可用），仅提示
  _applySettings: function (patch, okText) {
    var self = this;
    settingStore.set(patch);
    settingsService.saveSettings(patch)
      .then(function () {
        if (okText) self._toast('success', okText);
      })
      .catch(function (err) {
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  onCloseSheet: function (e) {
    var key = e.currentTarget.dataset.sheet;
    if (key) this.setData({ [key]: false });
  },

  /* —— 品牌 / 备份 —— */
  // cell 的 tap 为「原生冒泡 + triggerEvent」双触发（共享组件行为，README 示例即 bindtap），
  // 有副作用的行点击做 500ms 去重
  _dedupTap: function (key) {
    var now = Date.now();
    this._tapTs = this._tapTs || {};
    if (this._tapTs[key] && now - this._tapTs[key] < 500) return true;
    this._tapTs[key] = now;
    return false;
  },

  onBackup: function () {
    if (this._dedupTap('backup')) return;
    // v1.3 范围，先占位
    this._toast('success', '备份功能将在后续版本上线');
  },

  /* —— 偏好：外观模式 —— */
  onThemeTap: function () {
    this.setData({ themeSheet: true });
  },

  onThemePick: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ themeSheet: false });
    if (key === settingStore.get().theme) return;
    this._applySettings({ theme: key }, '已保存');
    // 说明：app.wxss 深色 token 走 prefers-color-scheme 媒体查询，
    // 手动指定浅色/深色需 app.json 开启 darkmode 并改造全局样式（共享文件，未改动）
  },

  /* —— 偏好：默认提醒周期 —— */
  onCyclesTap: function () {
    var d = settingStore.get().defaultCycles || {};
    this.setData({
      cyclesSheet: true,
      cyclesForm: {
        dewormInternal: String(d.dewormInternal || 90),
        dewormExternal: String(d.dewormExternal || 30),
        vaccine: String(d.vaccine || 365),
        bath: String(d.bath || 30),
      },
    });
  },

  onCycleInput: function (e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ ['cyclesForm.' + key]: e.detail.value });
  },

  onCyclesSave: function () {
    var f = this.data.cyclesForm;
    var def = settingStore.DEFAULT_SETTINGS.defaultCycles;
    function parseDay(v, fallback) {
      var n = parseInt(v, 10);
      return n >= 1 && n <= 3650 ? n : fallback;
    }
    var cycles = {
      dewormInternal: parseDay(f.dewormInternal, def.dewormInternal),
      dewormExternal: parseDay(f.dewormExternal, def.dewormExternal),
      vaccine: parseDay(f.vaccine, def.vaccine),
      bath: parseDay(f.bath, def.bath),
    };
    this.setData({ cyclesSheet: false });
    this._applySettings({ defaultCycles: cycles }, '已保存');
  },

  /* —— 偏好：月度预算（存「分」） —— */
  onBudgetTap: function () {
    var budget = settingStore.get().budget || 0;
    this.setData({
      budgetSheet: true,
      budgetForm: budget > 0 ? String(budget / 100) : '',
    });
  },

  onBudgetInput: function (e) {
    this.setData({ budgetForm: e.detail.value });
  },

  onBudgetSave: function () {
    var v = parseFloat(this.data.budgetForm);
    var cents = isNaN(v) || v <= 0 ? 0 : Math.round(v * 100);
    this.setData({ budgetSheet: false });
    this._applySettings({ budget: cents }, '已保存');
  },

  /* —— 通用：微信提醒通知开关 —— */
  onNotifySwitch: function (e) {
    var self = this;
    if (!e.detail.checked) {
      settingStore.set({ subscribeAuth: false });
      return;
    }
    // 开 = 发起订阅消息授权；拒绝则开关回弹
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TEMPLATE_ID],
      success: function (res) {
        var accepted = res && res[SUBSCRIBE_TEMPLATE_ID] === 'accept';
        settingStore.set({ subscribeAuth: accepted, subscribeAsked: true });
        if (!accepted) {
          self.setData({ notifyOn: false });
          self._toast('fail', '未获得通知授权');
        }
      },
      fail: function () {
        settingStore.set({ subscribeAsked: true });
        self.setData({ notifyOn: false });
        self._toast('fail', '未获得通知授权');
      },
    });
  },

  /* —— 通用：归档宠物 —— */
  onArchivedTap: function () {
    this.setData({ archivedSheet: true });
    this._fetchPets();
  },

  onRestorePet: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    // 恢复到列表末尾：order 取当前最大值 +1，避免与在列宠物重号
    var all = petStore.get().petList || [];
    var maxOrder = all.reduce(function (m, p) {
      return Math.max(m, typeof p.order === 'number' ? p.order : 0);
    }, 0);
    // savePet 更新模式支持局部字段（云端 validatePet(pet, true)）
    petService.savePet({ archived: false, order: maxOrder + 1 }, id)
      .then(function () {
        var list = all.map(function (p) {
          return p._id === id ? Object.assign({}, p, { archived: false, order: maxOrder + 1 }) : p;
        });
        petStore.setPetList(list);
        self._applyPets(list);
        self._toast('success', '已恢复');
      })
      .catch(function (err) {
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  /* —— 通用：提醒提前天数 —— */
  onAdvanceTap: function () {
    var n = settingStore.get().advanceDays;
    this.setData({
      advanceSheet: true,
      advanceForm: String(typeof n === 'number' ? n : 7),
    });
  },

  onAdvanceInput: function (e) {
    this.setData({ advanceForm: e.detail.value });
  },

  onAdvanceSave: function () {
    var n = parseInt(this.data.advanceForm, 10);
    if (isNaN(n) || n < 0 || n > 30) n = 7;
    this.setData({ advanceSheet: false });
    this._applySettings({ advanceDays: n }, '已保存');
  },

  /* —— 通用：清除缓存（保留设置，只清图片等缓存键） —— */
  onClearCache: function () {
    if (this._dedupTap('clearCache')) return;
    var removed = 0;
    try {
      var info = wx.getStorageInfoSync();
      (info.keys || []).forEach(function (key) {
        if (key === SETTINGS_STORAGE_KEY) return;
        wx.removeStorageSync(key);
        removed += 1;
      });
    } catch (e) {
      this._toast('fail', '清理失败，请重试');
      return;
    }
    this._toast('success', removed > 0 ? '缓存已清理' : '没有可清理的缓存');
  },

  /* —— 关于 —— */
  onAboutTap: function () {
    this.setData({ aboutSheet: true });
  },
});
