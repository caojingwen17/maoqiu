/**
 * 囤货（库存）域薄封装
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function list() {
  // 轻量单查询（原借道 home.aggregate，白白多跑 8 条无关查询）
  return api.call(ACTIONS.INVENTORY_LIST, {});
}

function inbound(payload) {
  const p = Object.assign({}, payload, { requestId: payload && payload.requestId || ('inv_' + Date.now() + '_' + Math.random().toString(36).slice(2)) });
  return api.call(ACTIONS.INVENTORY_INBOUND, p);
}

function consume(_id, amount) {
  return api.call(ACTIONS.INVENTORY_CONSUME, { _id, amount });
}

function update(payload) {
  return api.call(ACTIONS.INVENTORY_UPDATE, payload);
}

function remove(_id) {
  return api.call(ACTIONS.INVENTORY_REMOVE, { _id });
}

module.exports = {
  list,
  inbound,
  consume,
  update,
  remove
};
