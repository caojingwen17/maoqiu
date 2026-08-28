/**
 * 提醒域薄封装
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function list(status) {
  return api.call(ACTIONS.REMINDER_LIST, status ? { status } : {});
}

/** 提醒页一屏数据：进行中 + 近 30 天已完成 + 宠物名册，单次调用返回 */
function listAll() {
  return api.call(ACTIONS.REMINDER_LIST, { status: 'all' });
}

function create(payload) {
  return api.call(ACTIONS.REMINDER_CREATE, payload);
}

function update(payload) {
  return api.call(ACTIONS.REMINDER_UPDATE, payload);
}

function complete(_id) {
  return api.call(ACTIONS.REMINDER_COMPLETE, { _id });
}

function postpone(_id, days) {
  return api.call(ACTIONS.REMINDER_POSTPONE, { _id, days: days || 3 });
}

function disable(_id) {
  return api.call(ACTIONS.REMINDER_DISABLE, { _id });
}

function ignore(_id) {
  return api.call(ACTIONS.REMINDER_IGNORE, { _id });
}

module.exports = {
  list,
  listAll,
  create,
  update,
  complete,
  postpone,
  disable,
  ignore
};
