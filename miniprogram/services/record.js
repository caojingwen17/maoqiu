/**
 * 记录域薄封装（18 种类型统一走 record.*）
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

/** 会话级幂等键：一次「填写表单」共享一键，保存成功后由调用方换新键。
 *  双击/在飞重复提交共享同一 requestId，云端按 familyId+requestId 去重兜底。 */
function newRequestId() {
  return 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function create(payload) {
  const p = Object.assign({}, payload, { requestId: (payload && payload.requestId) || newRequestId() });
  return api.call(ACTIONS.RECORD_CREATE, p);
}

function update(payload) {
  return api.call(ACTIONS.RECORD_UPDATE, payload);
}

function remove(_id) {
  return api.call(ACTIONS.RECORD_REMOVE, { _id });
}

function listPage(petId, type, options) {
  const opt = options || {};
  return api.call(ACTIONS.RECORD_LIST, {
    petId,
    type,
    limit: opt.limit || 30,
    before: opt.before || ''
  }).then((result) => {
    // 兼容旧版云函数返回数组，便于灰度部署期间页面不中断。
    if (Array.isArray(result)) return { items: result, hasMore: false, nextCursor: '' };
    return result || { items: [], hasMore: false, nextCursor: '' };
  });
}

function list(petId, type) {
  return listPage(petId, type).then((page) => page.items || []);
}

function listPhotosPage(petId, options) {
  const opt = options || {};
  return api.call(ACTIONS.RECORD_PHOTOS, {
    petId,
    limit: opt.limit || 30,
    before: opt.before || ''
  }).then((result) => result || { items: [], hasMore: false, nextCursor: '' });
}

function get(_id) {
  return api.call(ACTIONS.RECORD_GET, { _id });
}

module.exports = {
  newRequestId,
  create,
  update,
  remove,
  list,
  listPage,
  listPhotosPage,
  get
};
