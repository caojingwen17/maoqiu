/**
 * settings.* —— 用户资料与预算，每用户一条
 */

const { db, _, COLLECTIONS, col } = require('./db.js');
const { validateWrite } = require('../schema.js');
const sec = require('./sec.js');

async function get(ctx) {
  const { openid } = ctx;
  const got = await col(COLLECTIONS.settings).where({ _openid: openid }).limit(1).get();
  const s = (got.data && got.data[0]) || {};
  const { _openid, ...rest } = s;
  return rest;
}

async function update(ctx) {
  const { openid, familyId, family } = ctx;
  const payload = Object.assign({}, ctx.payload || {});
  // kickedFrom 不在 schema 白名单（防客户端伪造被踢标记）；仅放行清空（'' / null），
  // 前端 app.js backToMine 走 settings.update({ kickedFrom: '' }) 清除拦截标记。
  let clearKicked = false;
  if ('kickedFrom' in payload) {
    if (payload.kickedFrom !== '' && payload.kickedFrom !== null) {
      throw { code: 'INVALID', message: 'kickedFrom 仅允许清空' };
    }
    clearKicked = true;
    delete payload.kickedFrom;
  }
  const chk = validateWrite('settings', payload, { partial: true });
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };
  const clean = Object.assign({}, chk.clean);
  if (clearKicked) clean.kickedFrom = '';

  // 内容安全：昵称/家庭称呼走资料场景（scene=1），头像走图片检测
  await sec.assertTextsSafe(openid, [clean.nickName, clean.familyNick], sec.SCENE.profile);
  if (clean.avatarUrl) await sec.assertCloudImageSafe(clean.avatarUrl);

  const got = await col(COLLECTIONS.settings).where({ _openid: openid }).limit(1).get();
  if (got.data && got.data.length) {
    await col(COLLECTIONS.settings).doc(got.data[0]._id).update({
      data: Object.assign({}, clean, { updateAt: Date.now() })
    });
  } else {
    await col(COLLECTIONS.settings).add({
      data: Object.assign({ _openid: openid }, clean)
    });
  }

  // 同步家庭成员快照：首页头像组 / 家庭成员页 / 记录人称呼都读 families.members[]
  const { nickName, avatarUrl, familyNick } = chk.clean;
  if (nickName !== undefined || avatarUrl !== undefined || familyNick !== undefined) {
    await syncMemberSnapshot(ctx, { nickName, avatarUrl, familyNick });
  }
  return { ok: true };
}

/**
 * 把个人资料写回 families.members[] 中自己的条目，并回填历史记录的家庭内称呼。
 * 显示名优先级：家庭内称呼 > 微信昵称 > 原快照昵称。
 */
async function syncMemberSnapshot(ctx, profile) {
  const { openid, familyId, family } = ctx;
  if (!family || !family._id || !Array.isArray(family.members)) return;

  const displayName = ((profile.familyNick || '') + '').trim() || ((profile.nickName || '') + '').trim();
  let changed = false;
  const members = family.members.map((m) => {
    if (m.openid !== openid) return m;
    const next = Object.assign({}, m);
    if (displayName) next.nickname = displayName;
    if (profile.avatarUrl !== undefined) next.avatar = profile.avatarUrl;
    if (next.nickname !== m.nickname || next.avatar !== m.avatar) changed = true;
    return next;
  });
  if (!changed) return;

  await col(COLLECTIONS.families).doc(family._id).update({ data: { members } });

  // 历史记录上的 createdByName 是建记录时的快照，资料更新后一并回填
  if (displayName && familyId) {
    await col(COLLECTIONS.records).where({ familyId, createdBy: openid }).update({
      data: { createdByName: displayName }
    });
  }
}

module.exports = { get, update };
