/**
 * 家庭空间域薄封装
 *
 * 注意：空间切换类动作（join/leave/dissolve）必须同步刷新 api.js 顶层注入用的
 * familyId 缓存（app.globalData.familyId）。否则云端快路径会把「合法但已过期」的
 * 旧空间（如 join 前的个人空间）当作当前空间返回——个人空间的成员校验永远通过，
 * 不会触发 FORBIDDEN 自愈。
 */

const api = require('./api.js');
const { ACTIONS } = require('./constants.js');

/** 刷新全局 familyId 缓存（null = 清空，下次调用走权威解析） */
function setCachedFamilyId(familyId) {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.familyId = familyId || null;
  } catch (e) { /* ignore */ }
}

function resolve() {
  return api.call(ACTIONS.FAMILY_RESOLVE, {});
}

function preview(familyId) {
  return api.call(ACTIONS.FAMILY_PREVIEW, { familyId });
}

function invite() {
  return api.call(ACTIONS.FAMILY_INVITE, {});
}

function join(familyId, petIds) {
  // petIds：要携带进家庭的宠物清单（加入确认页按宠物勾选，默认全选）；
  // 空数组/未传 = 全部留在个人空间。服务端只迁校验通过的部分。
  return api.call(ACTIONS.FAMILY_JOIN, { familyId, petIds: Array.isArray(petIds) ? petIds : [] })
    .then((res) => {
      // 加入成功：当前空间切换为目标家庭，立即刷新缓存（见文件头说明）
      setCachedFamilyId(familyId);
      return res;
    });
}

function leave() {
  return api.call(ACTIONS.FAMILY_LEAVE, {}).then((res) => {
    setCachedFamilyId(null); // 回到个人空间，清缓存走权威解析
    return res;
  });
}

function removeMember(openid) {
  return api.call(ACTIONS.FAMILY_REMOVE_MEMBER, { openid });
}

function dissolve() {
  return api.call(ACTIONS.FAMILY_DISSOLVE, {}).then((res) => {
    setCachedFamilyId(null); // 解散后回到个人空间
    return res;
  });
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
