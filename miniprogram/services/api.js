/**
 * 云函数调用封装：自动重试 1 次 + 错误归一化（PRD §5.3）
 * 所有数据读写唯一入口（客户端零直连数据库 —— 架构约束 4.7 / G2）
 */

const { CLOUD_FN } = require('./constants.js');

/** 归一化错误为 { code, message } */
function normalizeError(err) {
  const e = err || {};
  return {
    code: e.code || e.errCode || 'UNKNOWN',
    message: e.message || e.errMsg || '网络开小差了，请重试'
  };
}

/** 核心调用：失败自动重试 1 次 + 业务错误归一化 */
function call(action, payload, options) {
  const opt = options || {};
  return _callOnce(action, payload)
    .catch((err) => {
      if (opt.noRetry) throw normalizeError(err);
      return _callOnce(action, payload);
    })
    .then((res) => {
      const r = res && res.result ? res.result : res;
      if (r && r.code && r.code !== 0) {
        // 成员归属失效（被移出/换空间）：清掉缓存的 familyId，下次调用走权威解析自愈
        if (r.code === 'KICKED' || r.code === 'FORBIDDEN') clearFamilyCache();
        throw r; // 业务错误
      }
      return r && r.data !== undefined ? r.data : r;
    });
}

function _callOnce(action, payload) {
  if (!wx.cloud) {
    return Promise.reject({ code: 'NO_CLOUD', message: '当前环境不支持云能力' });
  }
  // 顶层携带缓存的 familyId：云函数命中快路径可省掉 resolveFamily 的一次 settings 查询
  return wx.cloud.callFunction({
    name: CLOUD_FN,
    data: Object.assign({ action, familyId: cachedFamilyId() }, { payload: payload || {} })
  });
}

function cachedFamilyId() {
  try {
    const app = getApp();
    return (app && app.globalData && app.globalData.familyId) || '';
  } catch (e) {
    return '';
  }
}

function clearFamilyCache() {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.familyId = null;
  } catch (e) { /* ignore */ }
}

module.exports = {
  call,
  normalizeError
};