/**
 * 宠物域薄封装（走云函数 pawlog）
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function list() {
  return api.call(ACTIONS.HOME_AGGREGATE, {}).then((d) => (d && d.pets) || []);
}

function create(payload) {
  return api.call(ACTIONS.PET_CREATE, payload);
}

function update(payload) {
  return api.call(ACTIONS.PET_UPDATE, payload);
}

function remove(_id) {
  return api.call(ACTIONS.PET_REMOVE, { _id });
}

function archive(_id, archived) {
  return api.call(ACTIONS.PET_ARCHIVE, { _id, archived });
}

module.exports = {
  list,
  create,
  update,
  remove,
  archive
};