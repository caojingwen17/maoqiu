// settingStore.js
// 用户设置全局状态：启动时从本地缓存恢复，每次变更自动持久化
// 注意：云端 settings 集合是数据的最终来源（见 settingsService），
// 这里只做本地偏好缓存，保证离线/弱网下页面也能拿到主题等配置
var storeModule = require('./store.js');
var createStore = storeModule.createStore;

var STORAGE_KEY = 'pawlog_settings';

// 默认值，与 PRD §4.5 对齐（budget 单位为分，0 表示未设置）
var DEFAULT_SETTINGS = {
  theme: 'auto', // light / dark / auto
  defaultCycles: {
    dewormInternal: 90,
    dewormExternal: 30,
    vaccine: 365,
    bath: 30,
  },
  advanceDays: 7, // 提醒提前几天进入待办
  budget: 0,      // 月度预算（分）
};

var settingStore = createStore(DEFAULT_SETTINGS);

// 从本地缓存恢复（app.js onLaunch 时调用）
function init() {
  try {
    var cached = wx.getStorageSync(STORAGE_KEY);
    if (cached && typeof cached === 'object') {
      settingStore.set(mergeWithDefaults(cached));
    }
  } catch (e) {
    console.warn('读取设置缓存失败，使用默认值', e);
  }
}

// 用默认值补齐缺失字段（防止旧版本缓存缺字段）
function mergeWithDefaults(partial) {
  var merged = Object.assign({}, DEFAULT_SETTINGS, partial);
  merged.defaultCycles = Object.assign(
    {},
    DEFAULT_SETTINGS.defaultCycles,
    partial.defaultCycles || {}
  );
  return merged;
}

// 更新设置并持久化到本地缓存
function set(patch) {
  settingStore.set(patch);
  try {
    wx.setStorageSync(STORAGE_KEY, settingStore.get());
  } catch (e) {
    console.warn('写入设置缓存失败', e);
  }
}

// 整体替换（云端拉取后调用），同样持久化
function replace(settings) {
  set(mergeWithDefaults(settings || {}));
}

module.exports = {
  get: settingStore.get,
  subscribe: settingStore.subscribe,
  init: init,
  set: set,
  replace: replace,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
};
