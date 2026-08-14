/**
 * components/utils.js —— 组件共享小工具
 * haptic(type)   : 触觉反馈（§6.5），type: light | medium | heavy
 * rpx2px(rpx)    : rpx 转 px（按当前设备屏宽换算）
 */

function haptic(type) {
  try {
    wx.vibrateShort({ type: type || 'light' });
  } catch (e) {
    try { wx.vibrateShort(); } catch (e2) { /* 旧基础库静默降级 */ }
  }
}

var cachedWidth = 0;
function windowWidth() {
  if (cachedWidth) return cachedWidth;
  try {
    cachedWidth = wx.getWindowInfo().windowWidth || 375;
  } catch (e) {
    try { cachedWidth = wx.getSystemInfoSync().windowWidth || 375; } catch (e2) { cachedWidth = 375; }
  }
  return cachedWidth;
}

function rpx2px(rpx) {
  return (rpx * windowWidth()) / 750;
}

module.exports = { haptic: haptic, rpx2px: rpx2px, windowWidth: windowWidth };
