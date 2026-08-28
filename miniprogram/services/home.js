/**
 * 首页聚合（1 次云函数调用拿全首屏 —— 冷启动 ≤2s，PRD §16）
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function aggregate(params) {
  return api.call(ACTIONS.HOME_AGGREGATE, params || {});
}

module.exports = {
  aggregate
};