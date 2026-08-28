/**
 * 家庭空间域薄封装
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function resolve() {
  return api.call(ACTIONS.FAMILY_RESOLVE, {});
}

function preview(familyId) {
  return api.call(ACTIONS.FAMILY_PREVIEW, { familyId });
}

function invite() {
  return api.call(ACTIONS.FAMILY_INVITE, {});
}

function join(familyId) {
  return api.call(ACTIONS.FAMILY_JOIN, { familyId });
}

function leave() {
  return api.call(ACTIONS.FAMILY_LEAVE, {});
}

function removeMember(openid) {
  return api.call(ACTIONS.FAMILY_REMOVE_MEMBER, { openid });
}

function dissolve() {
  return api.call(ACTIONS.FAMILY_DISSOLVE, {});
}

module.exports = {
  resolve,
  preview,
  invite,
  join,
  leave,
  removeMember,
  dissolve
};
