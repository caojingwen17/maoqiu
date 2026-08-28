/**
 * 用户资料域薄封装（头像昵称 · 自主填写，非登录）
 * 对齐《账号与登录设计》：chooseAvatar + nickname input，静默 openid 身份。
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

function getProfile() {
  return api.call(ACTIONS.SETTINGS_GET, {});
}

/**
 * 保存资料：头像临时路径上传云存储 → settings.update → 同步家庭快照（云端 family 侧处理）
 */
function saveProfile(payload) {
  return api.call(ACTIONS.SETTINGS_UPDATE, payload);
}

module.exports = {
  getProfile,
  saveProfile
};