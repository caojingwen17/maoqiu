// settingsService.js
// 用户设置服务：薄封装，方法名与云端 action 一一对应
var api = require('./api.js');

/**
 * 读取用户设置（云端无记录时返回默认值，不落库）
 * @returns {Promise<Object>} {theme, defaultCycles, advanceDays, budget, homeLayout, backupAt}
 */
function getSettings() {
  return api.call('getSettings');
}

/**
 * 保存用户设置（全量覆盖，每用户一条）
 * @param {Object} settings {theme?, defaultCycles?, advanceDays?, budget?, homeLayout?}
 * @returns {Promise<null>}
 */
function saveSettings(settings) {
  return api.call('saveSettings', { settings: settings });
}

module.exports = {
  getSettings: getSettings,
  saveSettings: saveSettings,
};
