/**
 * settings.* —— 用户资料与预算，每用户一条
 */

const { db, _, COLLECTIONS, col, getSettingsMerged, isBlank } = require('./db.js');
const { validateWrite } = require('../schema.js');
const sec = require('./sec.js');

async function get(ctx) {
  const { openid, familyId } = ctx;
  // 合并读取：历史并发产生的重复 settings 文档在此对齐，称呼以当前空间为准（见 db.getSettingsMerged）
  const byId = await getSettingsMerged([openid], familyId);
  const s = byId[openid] || {};
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

  const got = await col(COLLECTIONS.settings).where({ _openid: openid }).limit(100).get();
  const all = (got.data || []).sort((a, b) => (b.updateAt || 0) - (a.updateAt || 0)); // 新的在前
  if (all.length) {
    // 主文档锚定当前空间：familyId 匹配的优先（称呼等空间字段属于该空间），否则最新
    const hit = all.findIndex((s) => s.familyId && s.familyId === familyId);
    const head = all[hit > -1 ? hit : 0];
    const rest = all.filter((_, i) => i !== (hit > -1 ? hit : 0));
    const patch = Object.assign({}, clean, { updateAt: Date.now() });
    // 自愈去重：历史并发产生的重复文档，把其独有的非空字段并回主文档后删除
    //（clean 里显式提交的字段优先，不会被旧文档覆盖，支持用户主动清空）
    for (const s of rest) {
      for (const k of Object.keys(s)) {
        if (k === '_id' || k === '_openid' || k === 'updateAt') continue;
        if (patch[k] === undefined && isBlank(head[k]) && !isBlank(s[k])) patch[k] = s[k];
      }
    }
    await col(COLLECTIONS.settings).doc(head._id).update({ data: patch });
    for (const s of rest) {
      await col(COLLECTIONS.settings).doc(s._id).remove().catch(() => null);
    }
    if (rest.length) console.warn('[settings.update] 已收敛 %d 条重复 settings 文档: %s', rest.length, openid);
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
 * 快照里 nickname 固定存微信昵称、familyNick 单独存家庭内称呼，
 * 「家庭成员」页统一展示「家庭内称呼 + 昵称」；记录显示名优先级：家庭内称呼 > 微信昵称。
 */
async function syncMemberSnapshot(ctx, profile) {
  const { openid, familyId, family } = ctx;
  if (!family || !family._id || !Array.isArray(family.members)) return;

  const self = family.members.find((m) => m.openid === openid) || {};
  // 未提交的字段沿用自己旧快照，保证显示名回填时优先级正确
  const nick = profile.nickName !== undefined ? ((profile.nickName || '') + '').trim() : ((self.nickname || '') + '').trim();
  const fNick = profile.familyNick !== undefined ? ((profile.familyNick || '') + '').trim() : ((self.familyNick || '') + '').trim();
  const displayName = fNick || nick;
  let changed = false;
  const members = family.members.map((m) => {
    if (m.openid !== openid) return m;
    const next = Object.assign({}, m);
    if (profile.nickName !== undefined) next.nickname = nick;
    if (profile.familyNick !== undefined) next.familyNick = fNick;
    if (profile.avatarUrl !== undefined) next.avatar = profile.avatarUrl;
    if (next.nickname !== m.nickname || next.familyNick !== m.familyNick || next.avatar !== m.avatar) changed = true;
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
