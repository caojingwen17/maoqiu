// homeService.js
// 首页聚合服务：首屏数据合并为 1 次云函数调用（PRD §15）
var api = require('./api.js');

/**
 * 首页数据一次性拉取
 * @returns {Promise<{pets: Array, todos: {list: Array, total: number}, banner: {monthExpense: number, weekCheckins: number, weightChanges: Array}}>}
 *   pets 同 petService.listPets；todos.list 最多 3 条；monthExpense 单位分
 */
function getHomeData() {
  return api.call('getHomeData');
}

module.exports = {
  getHomeData: getHomeData,
};
