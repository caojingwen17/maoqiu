/**
 * 全局分享配置（右上角胶囊「发送给朋友」/「分享到朋友圈」及各页分享入口）。
 * 页面接入：
 *   const share = require('../../utils/share.js');
 *   onShareAppMessage() { return share.shareAppMessage(); },
 *   onShareTimeline() { return share.shareTimeline(); },
 * 封面图由 tools/gen-share-cover.js 生成（1000×800，5:4）。
 */

const SHARE_TITLE = '毛球档案 PawLog · 记录毛孩子的每一天';
const SHARE_IMG = '/assets/share-cover.png';

function shareAppMessage(overrides) {
  return Object.assign({
    title: SHARE_TITLE,
    path: '/pages/home/home',
    imageUrl: SHARE_IMG
  }, overrides);
}

function shareTimeline(overrides) {
  return Object.assign({
    title: SHARE_TITLE,
    query: '',
    imageUrl: SHARE_IMG
  }, overrides);
}

module.exports = {
  SHARE_TITLE,
  SHARE_IMG,
  shareAppMessage,
  shareTimeline
};
