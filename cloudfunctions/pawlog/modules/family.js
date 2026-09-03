/**
 * family.* —— 家庭空间成员协作（PRD §15 / §4.6）
 * 覆盖：invite 邀请 / join 加入 / leave 退出 / removeMember 移出 / dissolve 解散 / resolve 查询
 * 成员上限 FAMILY_MAX_MEMBERS（5 人），owner 拥有最高权限。
 */

const { db, _, COLLECTIONS, col } = require('./db.js');
const CONFIG = require('../config.js');
const core = require('./familyCore.js');

const FAMILY_MAX_MEMBERS = CONFIG.FAMILY_MAX_MEMBERS;

/** 查询当前家庭空间全貌 */
async function resolve(ctx) {
  const { familyId, family } = ctx;
  // 成员昵称/称呼直接读 families.members 快照；快照的 familyNick 由
  // settings.update（保存资料）与 family.join（加入）两个写入口负责同步
  return {
    familyId,
    openid: ctx.openid,
    name: family.name,
    ownerOpenid: family.ownerOpenid,
    members: family.members || [],
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
    expireIn: core.INVITE_TTL_MS
  };
}

/** 被邀请人加入 */
async function join(ctx) {
  const { openid, familyId, family, previousFamilyId } = ctx;
  if (!familyId) throw { code: 'INVALID', message: '缺少 familyId' };
  const chk = core.checkJoin(family, {
    openid,
    familyId,
    previousFamilyId,
    petIds: ctx.payload && ctx.payload.petIds
  });
  if (!chk.ok) throw { code: chk.code, message: chk.message };
  const bringPetIds = chk.petIds;

  const member = { openid, nickname: ctx.payload && ctx.payload.nickname || '', familyNick: '', avatar: '', role: 'member', joinedAt: Date.now() };
  // 入空间快照：取用户全局资料（settings.nickName/avatarUrl/familyNick），供成员列表与记录归属展示
  try {
    const sGot = await col(COLLECTIONS.settings).where({ _openid: openid }).limit(1).get();
    const s = sGot.data && sGot.data[0];
    if (s) {
      if (!member.nickname && s.nickName) member.nickname = s.nickName;
      if (s.familyNick) member.familyNick = (s.familyNick + '').trim();
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
  // 选择性迁入（PRD §16）：被邀请人按宠物勾选要带入的档案，宠物与其名下数据
  // （records/reminders/diaries/inventories 按 petId 挂靠）整体迁移；无宠物归属的
  // 家庭级数据（petId 为空）不迁，未勾中的留在个人空间、加入期间不可见、退出后恢复。
  // 迁移源固定为 personal_<openid>：服务端逐个校验勾选的宠物确实属于本人个人空间，
  // 不信任客户端清单；settings 指针异常时也绝不可能搬走他人空间的数据。
  const personalId = core.personalSpaceId(openid);
  if (personalId !== familyId && bringPetIds.length) {
    const owned = await col(COLLECTIONS.pets)
      .where({ familyId: personalId, _id: _.in(bringPetIds) })
      .field({ _id: true })
      .limit(core.PET_IDS_MAX)
      .get();
    const verified = (owned.data || []).map((p) => p._id);
    if (verified.length) {
      await col(COLLECTIONS.pets).where({ familyId: personalId, _id: _.in(verified) }).update({ data: { familyId } });
      for (const name of [COLLECTIONS.records, COLLECTIONS.reminders, COLLECTIONS.diaries, COLLECTIONS.inventories]) {
        await col(name).where({ familyId: personalId, petId: _.in(verified) }).update({ data: { familyId } });
      }
    }
  }
  // 注意对称行为：leave/removeMember 时不回迁，带入与加入后产生的数据都留在家庭空间。
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
  // 已是本家庭成员（如自己点开自己发的邀请）：跳过过期校验直接标记，落地页据此自动回家庭首页
  const isMember = (family.members || []).some((m) => m && m.openid === ctx.openid);
  if (!isMember && core.inviteExpired(family)) throw { code: 'INVITE_EXPIRED', message: '邀请已过期，请让家人重新分享' };
  const petsRes = await col(COLLECTIONS.pets).where({ familyId, archived: false }).limit(3).get();
  // 被邀请人当前可携带的宠物清单（加入确认页勾选用）：仅当请求人还在自己的个人空间时
  // 才有意义（已在其他家庭时 join 会被拦截）；归档宠物一并返回，由勾选默认选中带入。
  let myPets = [];
  if (ctx.familyId === core.personalSpaceId(ctx.openid)) {
    const mine = await col(COLLECTIONS.pets)
      .where({ familyId: ctx.familyId })
      .field({ name: true, breed: true, avatar: true, archived: true, order: true })
      .orderBy('order', 'asc')
      .limit(core.PET_IDS_MAX)
      .get();
    myPets = (mine.data || []).map((p) => ({
      _id: p._id,
      name: p.name || '',
      breed: p.breed || '',
      avatar: p.avatar || '',
      archived: !!p.archived
    }));
  }
  return {
    familyId,
    isMember,
    name: family.name,
    ownerName: ((family.members || []).find((m) => m.openid === family.ownerOpenid) || {}).nickname || '家庭创建者',
    memberCount: (family.members || []).length,
    // 成员昵称+头像快照（邀请落地页展示用，不含 openid）
    members: (family.members || []).slice(0, 5).map((m) => ({ nickname: m.nickname || '', avatar: m.avatar || '' })),
    pets: (petsRes.data || []).map((p) => ({ _id: p._id, name: p.name, breed: p.breed || '' })),
    myPets
  };
}

module.exports = { resolve, invite, join, leave, removeMember, dissolve, preview };
