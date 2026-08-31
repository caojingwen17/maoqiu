/**
 * 家庭空间核心规则（纯函数，零云 SDK 依赖，可直接被 __tests__/family.test.js 单测）
 *
 * 覆盖 PRD §15 的加入前置校验：
 *  - 邀请 7 天过期（family.lastInviteAt；缺失视为不过期，兼容历史数据）
 *  - 已是成员 / 满员（FAMILY_MAX_MEMBERS）拒绝
 *  - 单空间红线：当前空间必须是自己个人空间（personal_<openid> 全等）才能加入新家庭。
 *    注意：本系统所有空间 ID 都以 personal_ 开头（家庭空间由邀请人个人空间原地升级而来，
 *    无独立创建路径），因此不能用前缀判断"是否在自己个人空间"——前缀比对会把
 *    "在其他家庭"（personal_<他人>）误判放行，必须全等。
 *  - 携带宠物清单清洗：仅接受非空字符串数组，去重封顶（PRD §16 选择性迁入）
 */

const CONFIG = require('../config.js');

const DAY = 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * DAY;
const PET_IDS_MAX = 50;

function personalSpaceId(openid) {
  return 'personal_' + openid;
}

/** 邀请是否已过期（lastInviteAt 缺失的历史数据视为不过期，与旧行为一致） */
function inviteExpired(family, now) {
  const last = Number(family && family.lastInviteAt) || 0;
  return last > 0 && (now == null ? Date.now() : now) - last > INVITE_TTL_MS;
}

/** petIds 清洗：非数组按"全部不带"处理；只留非空字符串，去重，封顶 */
function sanitizePetIds(petIds) {
  if (!Array.isArray(petIds)) return [];
  const seen = new Set();
  const out = [];
  for (const v of petIds) {
    if (typeof v !== 'string' || !v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= PET_IDS_MAX) break;
  }
  return out;
}

/**
 * 加入前置校验。
 * @param {object} family   目标家庭空间文档
 * @param {object} options  { openid, familyId, previousFamilyId, petIds, now }
 * @returns {{ ok: true, petIds: string[] }} 或 { ok: false, code, message }
 */
function checkJoin(family, options) {
  const opt = options || {};
  const now = opt.now == null ? Date.now() : opt.now;
  if (!family || family.dissolved) {
    return { ok: false, code: 'NOT_FOUND', message: '家庭空间不存在或已解散' };
  }
  if (inviteExpired(family, now)) {
    return { ok: false, code: 'INVITE_EXPIRED', message: '邀请已过期，请让家人重新分享' };
  }
  const members = family.members || [];
  if (members.some((m) => m && m.openid === opt.openid)) {
    return { ok: false, code: 'EXISTS', message: '你已在该家庭空间中' };
  }
  if (members.length >= (CONFIG.FAMILY_MAX_MEMBERS || 5)) {
    return { ok: false, code: 'FULL', message: '该家庭空间已满（' + (CONFIG.FAMILY_MAX_MEMBERS || 5) + ' 人）' };
  }
  const own = personalSpaceId(opt.openid || '');
  if (opt.previousFamilyId && opt.previousFamilyId !== opt.familyId && opt.previousFamilyId !== own) {
    return { ok: false, code: 'ALREADY_IN_FAMILY', message: '你已在其他家庭空间中，需先退出（创建者需解散）后再加入' };
  }
  return { ok: true, petIds: sanitizePetIds(opt.petIds) };
}

module.exports = {
  DAY,
  INVITE_TTL_MS,
  PET_IDS_MAX,
  personalSpaceId,
  inviteExpired,
  sanitizePetIds,
  checkJoin
};
