/**
 * 微信一次性订阅消息授权。
 *
 * 重要约束：requestSubscribeMessage 只能在用户明确点击的调用栈中触发。
 * refresh() 只读取状态；silentRefill() 只在已持久允许时被业务点击调用。
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');
const tracker = require('../utils/tracker.js');

const TEMPLATE_ID = 'dx8E4xROB3HiNg9Pj0OTqsLUE5WP0Ja5Mo_cFvFmlPA';
const STORAGE_KEY = 'subscription.reminder.state';
const GUIDE_KEY = 'subscription.reminder.guideShown';
const REQUEST_GAP = 1200;

let state = wx.getStorageSync(STORAGE_KEY) || { status: 'unknown', persistent: false, updatedAt: 0 };
let inFlight = false;
let lastRequestAt = 0;

function save(next) {
  state = Object.assign({}, state, next, { updatedAt: Date.now() });
  try { wx.setStorageSync(STORAGE_KEY, state); } catch (e) { /* ignore storage failures */ }
  return state;
}

function parseSetting(res) {
  const settings = (res && res.subscriptionsSetting) || {};
  const item = settings.itemSettings || {};
  const status = item[TEMPLATE_ID];
  // 微信「订阅消息」总开关：false = 用户在微信设置里关掉了通知，授权记录虽在但消息不送达。
  // 未回传该字段的环境按开启处理，避免误报“已关闭”
  const mainSwitch = settings.mainSwitch !== false;
  if (status === 'accept' || status === 'reject' || status === 'ban') {
    return { status, persistent: true, mainSwitch };
  }
  // itemSettings 查不到该模板：可能是开发者工具不回传、或用户授权时未勾选“总是保持”。
  // 不能据此降级——否则已确认的持久授权会被洗掉，导致引导弹窗反复出现。
  // 本地有授权记录就原样保留（一次性授权保持非持久，引导仍会按设计出现）；完全没有记录才视为未知。
  if (state.status === 'accept' || state.status === 'reject' || state.status === 'ban') {
    return { status: state.status, persistent: state.persistent, mainSwitch };
  }
  return { status: 'unknown', persistent: false, mainSwitch };
}

function refresh() {
  if (!wx.getSetting) return Promise.resolve(state);
  return new Promise((resolve) => {
    wx.getSetting({
      withSubscriptions: true,
      success: (res) => resolve(save(parseSetting(res))),
      fail: () => resolve(state)
    });
  });
}

function report(requestId, result, persistentState, source) {
  if (result === 'accept') tracker.track(tracker.EVENTS.SUBSCRIPTION_ACCEPT, { source });
  else if (result === 'reject') tracker.track(tracker.EVENTS.SUBSCRIPTION_REJECT, { source });
  return api.call(ACTIONS.SUBSCRIPTION_SYNC, {
    requestId,
    templateId: TEMPLATE_ID,
    result,
    persistentState: persistentState || 'unknown',
    source: source || 'unknown'
  }, { noRetry: false }).then(() => {
    // 授权结果已落云端（fire-and-forget，失败不影响用户）
    tracker.track(tracker.EVENTS.SUBSCRIPTION_GRANT_RECORDED, { source, result });
  }).catch(() => null);
}

function makeRequestId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function request(source) {
  if (!wx.requestSubscribeMessage || inFlight) return Promise.resolve({ result: 'skipped' });
  const now = Date.now();
  if (now - lastRequestAt < REQUEST_GAP) return Promise.resolve({ result: 'skipped' });
  inFlight = true;
  lastRequestAt = now;
  tracker.track(tracker.EVENTS.SUBSCRIPTION_REQUEST, { source });
  const requestId = makeRequestId();
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: (res) => {
        const result = res && res[TEMPLATE_ID] ? res[TEMPLATE_ID] : 'reject';
        // 保留现有持久标记（refresh 会用 getSetting 权威校正），避免 refresh 未回传时把已勾选
        // “总是保持”的持久授权先洗成非持久
        if (result === 'accept' || result === 'reject' || result === 'ban') save({ status: result, persistent: state.persistent });
        refresh().then((next) => {
          const persistentState = next.persistent ? (result === 'accept' ? 'accept' : 'reject') : 'once';
          report(requestId, result, persistentState, source);
          resolve({ requestId, result, persistentState });
        });
      },
      fail: (err) => {
        // 与 success 分支对称：落定本地状态为未知（已持久允许的不降级），不做任何用户可见提示
        if (!(state.status === 'accept' && state.persistent)) save({ status: 'unknown', persistent: false });
        resolve({ requestId, result: 'fail', error: err });
      },
      complete: () => { inFlight = false; }
    });
  });
}

/** 首次显式入口：不会阻断业务，用户可以选择暂不开启。 */
let guideRef = null; // 当前页面挂载的 sub-guide 组件实例；有则走自绘弹窗，否则降级原生弹窗
function _registerGuide(c) { guideRef = c; }
function _unregisterGuide(c) { if (guideRef === c) guideRef = null; }

function guide(source, options) {
  if (state.status === 'accept' && state.persistent) return Promise.resolve({ result: 'already' });
  if (state.persistent && (state.status === 'reject' || state.status === 'ban')) return Promise.resolve({ result: state.status });
  const opt = options || {};
  if (opt.once && wx.getStorageSync(GUIDE_KEY)) return Promise.resolve({ result: 'already_shown' });
  if (opt.once) {
    try { wx.setStorageSync(GUIDE_KEY, 1); } catch (e) { /* ignore */ }
  }
  tracker.track(tracker.EVENTS.SUBSCRIPTION_GUIDE_SHOW, { source });
  // 优先走自绘弹窗（sub-guide 组件，页面已挂载时）
  if (guideRef) return guideRef.open(source);
  return new Promise((resolve) => {
    wx.showModal({
      title: '开启微信提醒',
      content: '开启后，微信会在事项时间提醒你。若希望以后不用重复确认，可在下一步勾选“总是保持以上选择，不再询问”，再点允许。',
      confirmText: '去开启',
      cancelText: '暂不开启',
      success: (res) => {
        if (res && res.confirm) request(source).then(resolve);
        else resolve({ result: 'cancel' });
      },
      fail: () => resolve({ result: 'cancel' })
    });
  });
}

/** 只应在用户点击处理函数的同步起点调用。 */
function silentRefill(source) {
  if (state.status !== 'accept' || !state.persistent) return Promise.resolve({ result: 'not_persistent' });
  return request(source);
}

function openSettings() {
  if (wx.openSetting) return wx.openSetting({});
  return Promise.resolve();
}

function getState() { return Object.assign({}, state); }

module.exports = {
  TEMPLATE_ID,
  refresh,
  request,
  guide,
  silentRefill,
  openSettings,
  getState,
  _registerGuide,
  _unregisterGuide
};
