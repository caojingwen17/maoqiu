// reminderService.js
// 提醒服务：薄封装，方法名与云端 action 一一对应
var api = require('./api.js');

/**
 * 提醒列表：进行中（按 remindAt 升序）+ 近 30 天已完成
 * @returns {Promise<{active: Array, done: Array}>}
 */
function listReminders() {
  return api.call('listReminders');
}

/**
 * 首页待办：status=active 且已进入提前展示期（remindAt - advanceDays <= now），按 remindAt 升序
 * @returns {Promise<{list: Array, total: number}>}
 */
function getTodos() {
  return api.call('getTodos');
}

/**
 * 完成提醒：周期提醒推进到下一周期，一次性提醒置 done
 * @param {string} reminderId
 * @returns {Promise<{remindAt: number|null}>} 新到期时间（一次性提醒为 null）
 */
function completeReminder(reminderId) {
  return api.call('completeReminder', { reminderId: reminderId });
}

/**
 * 延后 3 天（只影响本次，不动周期）
 * @param {string} reminderId
 * @returns {Promise<{remindAt: number}>}
 */
function snoozeReminder(reminderId) {
  return api.call('snoozeReminder', { reminderId: reminderId });
}

/**
 * 停用提醒（status=disabled）
 * @param {string} reminderId
 * @returns {Promise<null>}
 */
function disableReminder(reminderId) {
  return api.call('disableReminder', { reminderId: reminderId });
}

/**
 * 手动创建提醒（完全自定义）
 * @param {Object} reminder {petId?, title, category, remindAt, repeatType, repeatDays?, advanceDays?, subscribeAuth?}
 * @returns {Promise<{reminderId: string}>}
 */
function createReminder(reminder) {
  return api.call('createReminder', { reminder: reminder });
}

module.exports = {
  listReminders: listReminders,
  getTodos: getTodos,
  completeReminder: completeReminder,
  snoozeReminder: snoozeReminder,
  disableReminder: disableReminder,
  createReminder: createReminder,
};
