// tracker.js
// 埋点封装：统一走 wx.reportAnalytics，事件名对照 PRD §16
// 事件需在 mp 后台「统计-自定义分析」配置同名事件后才可查到数据

var EVENTS = {
  HOME_EXPOSURE: 'home_exposure',       // 首页曝光
  ADD_PET_SUCCESS: 'add_pet_success',   // 添加宠物成功
  RECORD_SUBMIT: 'record_submit',       // 各类型记录提交（data 带 type）
  REMINDER_CREATE: 'reminder_create',   // 提醒创建
  REMINDER_COMPLETE: 'reminder_complete', // 提醒完成（算完成率）
  BACKUP_USE: 'backup_use',             // 备份使用
  TOOLBOX_USE: 'toolbox_use',           // 工具箱使用（data 带 tool）
};

/**
 * 上报埋点
 * @param {string} event 事件名，建议取 EVENTS 常量
 * @param {Object} [data] 自定义属性（key/value 均需在后台先配置）
 */
function track(event, data) {
  try {
    wx.reportAnalytics(event, data || {});
  } catch (e) {
    // 埋点失败不影响业务，静默吞掉
    console.warn('埋点上报失败', event, e);
  }
}

module.exports = {
  EVENTS: EVENTS,
  track: track,
};
