// statsService.js
// 统计服务：薄封装，聚合在云端做
var api = require('./api.js');

/**
 * 统计数据
 * @param {Object} [options]
 * @param {string} [options.petId] 不传为全部宠物
 * @param {string} [options.range] month（本月）/ halfYear（近半年）/ year（今年），默认 month
 * @returns {Promise<{weights: Array<{petId, points: Array<{date, value}>}>, expenseByMonth: Array<{month, total}>, expenseByCategory: Array<{category, total}>}>}
 *   金额单位分；weights 供折线图（多宠物多线），expenseByMonth 供柱状图，expenseByCategory 供饼图
 */
function getStats(options) {
  options = options || {};
  return api.call('getStats', { petId: options.petId || '', range: options.range || 'month' });
}

module.exports = {
  getStats: getStats,
};
