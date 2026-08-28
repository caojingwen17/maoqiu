/**
 * family.* —— 家庭空间成员协作（PRD §15 / §4.6）
 * 覆盖：invite 邀请 / join 加入 / leave 退出 / removeMember 移出 / dissolve 解散 / resolve 查询
 * 成员上限 FAMILY_MAX_MEMBERS（5 人），owner 拥有最高权限。
 */

const { db, _, COLLECTIONS, col } = require('./db.js');
const CONFIG = require('../config.js');

const FAMILY_MAX_MEMBERS = CONFIG.FAMILY_MAX_MEMBERS;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 邀请 7 天有效

/** 邀请过期校验：family.lastInviteAt 距今超过 7 天则拒绝 */
function assertInviteFresh(family) {
  if (family.lastInviteAt && Date.now() - Number(family.lastInviteAt) > INVITE_TTL_MS) {
    throw { code: 'INVITE_EXPIRED', message: '邀请已过期，请让家人重新分享' };
  }
}

/** 查询当前家庭空间全貌 */
async function resolve(ctx) {
  const { familyId, family } = ctx;
  const members = (family.members || []).slice();
  // 顺手刷新自己的成员快照：settings 里的昵称/头像改动后同步进家庭（其他成员保持入空间时的快照）
  try {
    const sGot = await col(COLLECTIONS.settings).where({ _openid: ctx.openid }).limit(1).get();
    const s = sGot.data && sGot.data[0];
    const idx = members.findIndex((m) => m.openid === ctx.openid);
    if (s && idx > -1) {
      const wantNick = s.nickName || members[idx].nickname || '';
      const wantAvatar = s.avatarUrl || members[idx].avatar || '';
      if (wantNick !== (members[idx].nickname || '') || wantAvatar !== (members[idx].avatar || '')) {
        members[idx] = Object.assign({}, members[idx], { nickname: wantNick, avatar: wantAvatar });
        await col(COLLECTIONS.families).doc(familyId).update({ data: { members } });
      }
    }
  } catch (e) { /* 快照刷新失败不阻塞查询 */ }
  return {
    familyId,
    openid: ctx.openid,
    name: family.name,
    ownerOpenid: family.ownerOpenid,
    members,
    createAt: family.createAt
  };
}

/** 创建邀请（返回邀请码/落地参数），被邀请人凭 familyId 走 join */
async function invite(ctx) {
  const { familyId, family } = ctx;
  if (!family.members || family.members.length >= FAMILY_MAX_MEMBERS) {
    throw { code: 'FULL', message: '家庭成员已达上限（5 人）' };
  }
  const invitedBy = (family.members || []).find((m) => m.openid === ctx.openid);
  // 记录最近邀请时间，preview/join 据此做 7 天过期校验（lastInviteAt 不存在的历史数据不拦截）
  await col(COLLECTIONS.families).doc(familyId).update({ data: { lastInviteAt: Date.now() } });
  return {
    familyId,
    familyName: family.name,
    invitedBy: invitedBy ? (invitedBy.nickname || '成员') : '成员',
    expireIn: INVITE_TTL_MS
  };
}

/** 被邀请人加入 */
async function join(ctx) {
  const { openid, familyId, family, previousFamilyId } = ctx;
  if (!familyId) throw { code: 'INVALID', message: '缺少 familyId' };
  assertInviteFresh(family);

  const already = (family.members || []).some((m) => m.openid === openid);
  if (already) throw { code: 'EXISTS', message: '你已在该家庭空间中' };
  if (family.members && family.members.length >= FAMILY_MAX_MEMBERS) {
    throw { code: 'FULL', message: '该家庭空间已满（5 人）' };
  }

  if (previousFamilyId && previousFamilyId !== familyId && !String(previousFamilyId).startsWith('personal_')) {
    throw { code: 'ALREADY_IN_FAMILY', message: '你已在另一个家庭空间中，需先退出' };
  }

  const member = { openid, nickname: ctx.payload && ctx.payload.nickname || '', avatar: '', role: 'member', joinedAt: Date.now() };
  // 入空间快照：取用户全局资料（settings.nickName/avatarUrl），供成员列表与记录归属展示
  try {
    const sGot = await col(COLLECTIONS.settings).where({ _openid: openid }).limit(1).get();
    const s = sGot.data && sGot.data[0];
    if (s) {
      if (!member.nickname && s.nickName) member.nickname = s.nickName;
      if (s.avatarUrl) member.avatar = s.avatarUrl;
    }
  } catch (e) { /* 快照失败不阻塞加入 */ }
  // 事务内重读校验 + push：并发 join 不会再突破成员上限 / 重复加入
  await db.runTransaction(async (transaction) => {
    const famCol = transaction.collection(COLLECTIONS.families);
    const got = await famCol.doc(familyId).get();
    const fam = got && got.data;
    if (!fam || fam.dissolved) throw { code: 'NOT_FOUND', message: '家庭空间不存在或已解散' };
    if ((fam.members || []).some((m) => m.openid === openid)) throw { code: 'EXISTS', message: '你已在该家庭空间中' };
    if ((fam.members || []).length >= FAMILY_MAX_MEMBERS) throw { code: 'FULL', message: '该家庭空间已满（5 人）' };
    await famCol.doc(familyId).update({ data: { members: _.push(member) } });
  });
  // 将个人空间数据迁移到目标家庭，避免加入后丢失自己原有档案。
  const personalId = previousFamilyId || ('personal_' + openid);
  if (personalId !== familyId) {
    for (const name of [COLLECTIONS.pets, COLLECTIONS.records, COLLECTIONS.reminders, COLLECTIONS.diaries, COLLECTIONS.inventories]) {
      await col(name).where({ familyId: personalId }).update({ data: { familyId } });
    }
  }
  // 记录归属：个人空间数据合并进家庭空间（PRD §16 数据归属，v1 简化）。
  // 注意对称行为：leave/removeMember 时数据仍留在原家庭空间不回迁，成员回到个人空间后看不到历史数据。
  await col(COLLECTIONS.settings).where({ _openid: openid }).update({ data: { familyId } });
  return { familyId, member };
}

/** 成员主动退出（owner 不可退出，需先解散）。
 *  数据归属（v1 简化，PRD §16）：退出后其产生的记录/宠物等数据仍留在家庭空间，不回迁个人空间。 */
async function leave(ctx) {
  const { openid, familyId, family } = ctx;
  if (family.ownerOpenid === openid) {
    throw { code: 'FORBIDDEN', message: '创建者不可退出，请先解散家庭空间' };
  }
  const members = (family.members || []).filter((m) => m.openid !== openid);
  await col(COLLECTIONS.families).doc(familyId).update({ data: { members } });
  // 回到个人空间：见 schema.resolv
  // （幂等）：若此前无个人空间则重建
  await col(COLLECTIONS.settings).where({ _openid: openid }).update({ data: { familyId: '' } });
  return { familyId };
}

/** owner 移出某成员。
 *  数据归属（v1 简化，与 leave 一致）：被移出成员的数据留在家庭空间，仅 settings 打上 kickedFrom 标记用于启动拦截。 */
async function removeMember(ctx) {
  const { openid, familyId, family } = ctx;
  if (family.ownerOpenid !== openid) throw { code: 'FORBIDDEN', message: '仅创建者可移出成员' };
  const target = ctx.payload && ctx.payload.openid;
  if (!target || target === openid) throw { code: 'INVALID', message: '无效的成员' };
  const members = (family.members || []).filter((m) => m.openid !== target);
  await col(COLLECTIONS.families).doc(familyId).update({ data: { members } });
  await col(COLLECTIONS.settings).where({ _openid: target }).update({
    data: { familyId: '', kickedFrom: family.name }
  });
  return { familyId };
}

/** owner 解散家庭空间 */
async function dissolve(ctx) {
  const { openid, familyId, family } = ctx;
  if (family.ownerOpenid !== openid) throw { code: 'FORBIDDEN', message: '仅创建者可解散家庭空间' };
  const personalId = 'personal_' + openid;
  for (const name of [COLLECTIONS.pets, COLLECTIONS.records, COLLECTIONS.reminders, COLLECTIONS.diaries, COLLECTIONS.inventories]) {
    await col(name).where({ familyId }).update({ data: { familyId: personalId } });
  }
  await col(COLLECTIONS.families).doc(familyId).update({
    data: { dissolved: true, dissolvedAt: Date.now() }
  });
  // 所有成员回到个人空间
  for (const m of (family.members || [])) {
    if (m.openid === family.ownerOpenid) {
      await col(COLLECTIONS.settings).where({ _openid: m.openid }).update({ data: { familyId: '' } });
    } else {
      await col(COLLECTIONS.settings).where({ _openid: m.openid }).update({
        data: { familyId: '', kickedFrom: family.name }
      });
    }
  }
  return { familyId };
}

/** 邀请落地页预览（被邀请人视角，无需成员资格） */
async function preview(ctx) {
  const { familyId } = ctx.payload || {};
  if (!familyId) throw { code: 'INVALID', message: '缺少 familyId' };
  let family = null;
  try {
    const got = await col(COLLECTIONS.families).doc(familyId).get();
    family = got && got.data;
  } catch (e) {
    family = null;
  }
  if (!family || family.dissolved) throw { code: 'NOT_FOUND', message: '家庭空间不存在或已解散' };
  assertInviteFresh(family);
  const petsRes = await col(COLLECTIONS.pets).where({ familyId, archived: false }).limit(3).get();
  return {
    familyId,
    name: family.name,
    ownerName: ((family.members || []).find((m) => m.openid === family.ownerOpenid) || {}).nickname || '家庭创建者',
    memberCount: (family.members || []).length,
    // 成员昵称+头像快照（邀请落地页展示用，不含 openid）
    members: (family.members || []).slice(0, 5).map((m) => ({ nickname: m.nickname || '', avatar: m.avatar || '' })),
    pets: (petsRes.data || []).map((p) => ({ _id: p._id, name: p.name, breed: p.breed || '', avatar: p.avatar || '' }))
  };
}

module.exports = { resolve, invite, join, leave, removeMember, dissolve, preview };
