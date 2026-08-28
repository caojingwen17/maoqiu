/** 宠物日记域薄封装 */
const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function list(petId, options) {
  return listPage(petId, options).then((page) => page.items || []);
}

function listPage(petId, options) {
  const opt = options || {};
  return api.call(ACTIONS.DIARY_LIST, { petId, limit: opt.limit || 20, before: opt.before || '' }).then((result) => {
    if (Array.isArray(result)) return { items: result, hasMore: false, nextCursor: '' };
    return result || { items: [], hasMore: false, nextCursor: '' };
  });
}

function markRead(petId, throughDate) {
  return api.call(ACTIONS.DIARY_MARK_READ, { petId, throughDate });
}

function manualGenerate(petId, date) {
  const payload = { petId };
  if (date) payload.date = date;
  const request = api.call(ACTIONS.DIARY_MANUAL_GENERATE, payload, { noRetry: true });
  const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject({ code: 'DIARY_CLIENT_TIMEOUT', message: '生成超过 55 秒仍未返回，请查看 pawlog 云函数日志' }), 55000);
  });
  return Promise.race([request, timeout]);
}

module.exports = { list, listPage, markRead, manualGenerate };
