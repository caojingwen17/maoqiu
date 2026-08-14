// api.js
// 统一云函数调用封装：所有业务走云函数 pawlog，按 action 分发
// 约定：8 秒超时（wx.cloud.callFunction 不支持 timeout，用 Promise.race 实现）、
//      超时/网络失败自动重试 1 次、错误归一化为 {code, msg}
// loading 态不在这里管，由页面自行控制

var TIMEOUT_MS = 8000;

// 错误码约定：
//   0    成功
//   -1   本地超时
//   -2   网络/调用失败（wx 侧报错）
//   4xx  参数/权限类业务错误（云端返回）
//   5xx  云端内部错误
function normalizeError(err) {
  if (err && typeof err.code === 'number' && err.msg) {
    return { code: err.code, msg: err.msg };
  }
  // wx.cloud.callFunction 原生拒绝：errCode/errMsg 结构
  return { code: -2, msg: '网络开小差了，请重试' };
}

// 单次调用（不带重试）
function rawCall(action, payload) {
  var request = wx.cloud
    .callFunction({
      name: 'pawlog',
      data: { action: action, payload: payload || {} },
    })
    .then(function (res) {
      var result = (res && res.result) || {};
      if (result.code === 0) {
        return result.data;
      }
      throw { code: typeof result.code === 'number' ? result.code : 500, msg: result.msg || '服务器开小差了' };
    });

  var timer = new Promise(function (resolve, reject) {
    setTimeout(function () {
      reject({ code: -1, msg: '网络开小差了，请重试' });
    }, TIMEOUT_MS);
  });

  return Promise.race([request, timer]).catch(function (err) {
    throw normalizeError(err);
  });
}

/**
 * 调用云函数 pawlog
 * @param {string} action 云端动作名（见云函数 index.js 路由表）
 * @param {Object} [payload] 入参
 * @returns {Promise<*>} resolve 云端返回的 data；reject {code, msg}
 * 重试策略：仅超时（-1）/网络失败（-2）自动重试 1 次；业务错误（4xx/5xx）直接抛出，
 * 避免写操作重试产生脏数据
 */
function call(action, payload) {
  return rawCall(action, payload).catch(function (err) {
    if (err.code === -1 || err.code === -2) {
      return rawCall(action, payload);
    }
    throw err;
  });
}

module.exports = {
  call: call,
};
