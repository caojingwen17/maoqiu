/**
 * 数据访问辅助：云数据库集合引用 + 家庭空间成员归属解析（PRD §4.7）
 * 所有读写统一走云函数中转，客户端零直连数据库。
 */

const cloud = require('wx-server-sdk');

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  pets: 'pets',
  records: 'records',
  reminders: 'reminders',
  diaries: 'diaries',
  messageSubscriptions: 'messageSubscriptions',
  messageGrants: 'messageGrants',
  messageDeliveries: 'messageDeliveries',
  inventories: 'inventories',
  settings: 'settings',
  families: 'families'
};

function col(name) {
  return db.collection(name);
}

/** -502005 = DATABASE_COLLECTION_NOT_EXIST（新环境集合未创建） */
function isCollectionMissing(e) {
  const msg = String((e && (e.errMsg || e.message)) || '');
  return (e && e.errCode === -502005) || msg.indexOf('-502005') > -1 || msg.indexOf('COLLECTION_NOT_EXIST') > -1;
}

let collectionsEnsured = false; // 同一容器实例内只引导一次

/** 空环境首次访问时自动创建全部集合（幂等：已存在/并发冲突均忽略） */
async function ensureCollections() {
  if (collectionsEnsured) return;
  const names = Object.keys(COLLECTIONS).map((k) => COLLECTIONS[k]);
  await Promise.all(
    names.map((name) =>
      db.createCollection(name).catch(() => {
        // 已存在或并发创建冲突：忽略，后续真实读写错误会自然暴露
      })
    )
  );
  // 全部完成后再置位：中途若抛错（如网络瞬时失败），本实例下次调用仍会重试
  collectionsEnsured = true;
}

/**
 * 按条件分页删除（云函数端 where().remove() 有数量/权限限制，统一走「查询 + 逐条删」并带上限保护）。
 * @returns {Promise<number>} 实际删除条数
 */
async function removeWhere(collection, cond, cap) {
  const limit = cap || 1000;
  let removed = 0;
  while (removed < limit) {
    const got = await col(collection).where(cond).limit(Math.min(100, limit - removed)).get();
    const rows = (got && got.data) || [];
    if (!rows.length) break;
    for (const row of rows) {
      await col(collection).doc(row._id).remove();
      removed++;
    }
    if (rows.length < 100) break;
  }
  if (removed >= limit) console.warn('[db] removeWhere 达到上限', collection, JSON.stringify(cond), limit);
  return removed;
}

/** 读取单条文档：doc(_id).get()，缺失或异常统一返回 null（避免某些 sdk 版本抛错） */
async function getDoc(collection, _id) {
  try {
    const got = await col(collection).doc(_id).get();
    return (got && got.data) || null;
  } catch (e) {
    return null;
  }
}

/** 校验文档属于当前 familyId，返回文档；否则抛 NOT_FOUND */
async function assertOwned(collection, familyId, _id) {
  const doc = await getDoc(collection, _id);
  if (!doc || doc.familyId !== familyId) {
    throw { code: 'NOT_FOUND', message: '数据不存在或不属于当前家庭空间' };
  }
  return doc;
}

/**
 * 解析请求人的家庭空间：
 *  1. settings 集合按 _openid 存家庭空间归属（记录当前所在 familyId）；
 *  2. 首次进入（无归属）自动创建个人空间（PRD §4.6 派生规则）。
 * @param {string} openid 请求人 openid
 * @returns {Promise<{ familyId: string, created: boolean }>}
 */
async function resolveFamily(openid) {
  const settingsCol = col(COLLECTIONS.settings);
  let got;
  try {
    got = await settingsCol.where({ _openid: openid }).limit(1).get();
  } catch (e) {
    // 空环境首次访问：集合不存在 → 自动建齐全部集合后重试一次
    if (!isCollectionMissing(e)) throw e;
    await ensureCollections();
    got = await settingsCol.where({ _openid: openid }).limit(1).get();
  }
  // 新功能集合可能是在已有用户空间创建后才加入，所有入口统一做一次幂等确保。
  await ensureCollections();

  // 已有归属
  if (got.data && got.data.length) {
    const s = got.data[0];
    if (s.familyId) return { familyId: s.familyId, created: false };
  }

  // 首次进入：自建稳定个人空间（familyId 仅由 openid 派生，doc().set() 幂等、免竞态）
  const now = Date.now();
  const familyId = 'personal_' + openid;
  await col(COLLECTIONS.families).doc(familyId).set({
    data: {
      name: '我的档案袋',
      ownerOpenid: openid,
      members: [{ openid, nickname: '毛球家长', avatar: '', role: 'owner', joinedAt: now }],
      createAt: now
    }
  });

  const familyIdOfSettings = familyId;
  if (got.data && got.data.length) {
    await settingsCol.doc(got.data[0]._id).update({ data: { familyId: familyIdOfSettings } });
  } else {
    await settingsCol.add({ data: { _openid: openid, familyId: familyIdOfSettings } });
  }
  return { familyId, created: true };
}

/**
 * 校验请求人是否为目标 familyId 的成员（G2 红线：未授权拒绝）。
 * @param {string} openid
 * @param {string} familyId
 * @returns {Promise<{ ok: boolean, family?: object }>}
 */
async function assertMember(openid, familyId) {
  if (!familyId) return { ok: false, error: '缺少 familyId' };
  const family = await getDoc(COLLECTIONS.families, familyId);
  if (!family || family.dissolved) return { ok: false, error: '家庭空间不存在或已解散' };
  const mem = (family.members || []).some((m) => m.openid === openid);
  if (!mem) return { ok: false, error: '你不是该家庭空间成员', kicked: true };
  return { ok: true, family };
}

module.exports = {
  cloud,
  db,
  _,
  COLLECTIONS,
  col,
  getDoc,
  assertOwned,
  resolveFamily,
  assertMember,
  ensureCollections,
  removeWhere
};
