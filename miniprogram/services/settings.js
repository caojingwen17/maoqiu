/**
 * 设置域薄封装（用户资料 / 预算）
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function get() {
  return api.call(ACTIONS.SETTINGS_GET, {});
}

function update(payload) {
  return api.call(ACTIONS.SETTINGS_UPDATE, payload);
}

module.exports = {
  get,
  update
};
