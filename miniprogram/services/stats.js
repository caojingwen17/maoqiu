/**
 * 统计域薄封装
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function summary(payload) {
  return api.call(ACTIONS.STATS_SUMMARY, payload || {});
}

module.exports = {
  summary
};