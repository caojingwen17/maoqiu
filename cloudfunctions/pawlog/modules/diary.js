const { db, _, COLLECTIONS, col, ensureCollections, getDoc } = require('./db.js');
const { assertOwned } = require('./db.js');
const provider = require('./diaryProvider.js');
const { PROMPT_VERSION } = require('./diaryPrompt.js');
const { TZ, DAY, dateKey, shiftDate, localBounds, summarizeRecord, inputFor, normalizeFamilyTitle, randomFocusSeed } = require('./diaryCore.js');
const CONFIG = require('../config.js');

function track(event, props) {
  console.log('[track]', Object.assign({ event, at: Date.now() }, props || {}));
}

/** 写日记概率：每天 50% 抽签，让日记成为「今天宝宝写了吗」的惊喜。 */
const WRITE_PROBABILITY = 0.5;

function docId(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 'diary_' + (h >>> 0).toString(36);
}

async function eventsFor(familyId, petId, key, family, pet) {
  const bound = localBounds(key);
  const result = await col(COLLECTIONS.records).where({ familyId, petId, date: _.and(_.gte(bound.start), _.lt(bound.end)) }).orderBy('date', 'asc').limit(50).get();
  const members = (family && family.members) || [];
  const rows = result.data || [];
  // 称呼只认 settings.familyNick（用户在「我的」里填的家庭内称呼）；
  // members[].nickname / records.createdByName 在家庭称呼为空时会装微信昵称，不能当称呼用。
  const openids = members.map((m) => m && m.openid).filter(Boolean);
  const nickMap = {};
  if (openids.length) {
    const got = await col(COLLECTIONS.settings).where({ _openid: _.in(openids) }).limit(100).get();
    (got.data || []).forEach((s) => {
      const v = String((s && s.familyNick) || '').trim();
      if (v && s._openid) nickMap[s._openid] = v;
    });
  }
  const titleOf = (record) => normalizeFamilyTitle(nickMap[record.createdBy]);
  const petOwner = members.find((m) => m && m.openid === (pet && (pet.createdBy || pet._openid)));
  return {
    events: rows.map((record) => summarizeRecord(record, titleOf(record))),
    ownerTitle: rows.length ? titleOf(rows[0]) : normalizeFamilyTitle(petOwner && nickMap[petOwner.openid]),
    sourceRecordIds: rows.map((r) => r._id).filter(Boolean)
  };
}

async function getByKey(key) {
  try { const got = await col(COLLECTIONS.diaries).doc(docId(key)).get(); return got.data || null; } catch (e) { return null; }
}

/** 取该宠物 targetDate 之前最近 5 篇日记的标题（供模型避开雷同角度） */
async function recentTitlesFor(familyId, petId, targetDate) {
  try {
    const got = await col(COLLECTIONS.diaries)
      .where({ familyId, petId, status: 'ready', diaryDate: _.lt(String(targetDate)) })
      .orderBy('diaryDate', 'desc').limit(5).get();
    return (got.data || []).map((d) => String(d.title || '').trim()).filter(Boolean);
  } catch (e) {
    console.warn('[diary] 近期标题查询失败（不影响生成）', e && (e.message || e));
    return [];
  }
}

/**
 * 创建/认领日记任务。docId 由 diaryKey 哈希确定性生成，事务内读-判-写：
 * 同一 diaryKey 并发下只有一个调用方能进入 generating（其余拿到已存在任务原样返回）。
 * 返回对象带 _claimed=true 表示本次调用认领了 generating 状态，调用方应继续生成。
 */
async function createTask(family, pet, targetDate, options) {
  const diaryKey = family._id + '|' + pet._id + '|' + targetDate;
  const id = docId(diaryKey);
  const force = !!(options && options.force);
  return db.runTransaction(async (transaction) => {
    const diaryCol = transaction.collection(COLLECTIONS.diaries);
    const got = await diaryCol.doc(id).get().catch(() => null);
    const existing = got && got.data;
    if (existing && force) {
      await diaryCol.doc(id).update({ data: { status: 'generating', decision: 'write', promptVersion: PROMPT_VERSION, retryCount: 0, updateAt: Date.now() } });
      return Object.assign({}, existing, { _id: id, status: 'generating', decision: 'write', promptVersion: PROMPT_VERSION, retryCount: 0, _claimed: true });
    }
    if (existing) return existing;
    const now = Date.now();
    const decision = force ? 'write' : (Math.random() < WRITE_PROBABILITY ? 'write' : 'skip');
    const task = { familyId: family._id, petId: pet._id, diaryDate: targetDate, diaryKey, status: decision === 'skip' ? 'skipped' : 'generating', decision, title: '', content: '', promptVersion: PROMPT_VERSION, model: '', sourceRecordIds: [], readBy: [], retryCount: 0, createAt: now, updateAt: now };
    await diaryCol.doc(id).set({ data: task });
    return Object.assign({ _id: id, _claimed: decision === 'write' }, task);
  });
}

async function generateOne(family, pet, targetDate, options) {
  track('diary_attempt', { familyId: family._id, petId: pet._id, diaryDate: targetDate });
  const task = await createTask(family, pet, targetDate, options);
  if (task.status === 'skipped' || task.status === 'ready') {
    if (task.status === 'skipped') track('diary_skipped', { familyId: family._id, petId: pet._id, diaryDate: targetDate });
    return task.status;
  }
  // generating 重入拦截：另一个并发流程正在生成同一 diaryKey，本轮直接跳过
  if (task.status === 'generating' && !task._claimed) return 'generating';
  if (task.status === 'failed' && (task.retryCount || 0) >= 2) return 'failed';
  console.log('[diary] generating', family._id, pet._id, targetDate);
  const eventData = await eventsFor(family._id, pet._id, targetDate, family, pet);
  // 多样性：近期标题喂给模型避免雷同；随机注意力种子让重复生成/不同天走不同脑回路
  eventData.recentTitles = await recentTitlesFor(family._id, pet._id, targetDate);
  eventData.focusSeed = randomFocusSeed();
  try {
    const result = await provider.generate(inputFor(pet, targetDate, eventData));
    await col(COLLECTIONS.diaries).doc(task._id || docId(task.diaryKey)).update({ data: { status: 'ready', title: result.title, content: result.content, generatedAt: Date.now(), model: result.model || '', sourceRecordIds: eventData.sourceRecordIds, retryCount: task.retryCount || 0, updateAt: Date.now() } });
    console.log('[diary] generated', family._id, pet._id, targetDate);
    track('diary_generated', { familyId: family._id, petId: pet._id, diaryDate: targetDate });
    return options && options.returnRecord ? getByKey(task.diaryKey) : 'ready';
  } catch (e) {
    const retryCount = (task.retryCount || 0) + 1;
    await col(COLLECTIONS.diaries).doc(task._id || docId(task.diaryKey)).update({ data: { status: 'failed', retryCount, sourceRecordIds: eventData.sourceRecordIds, updateAt: Date.now() } });
    console.error('[diary] generation failed', e && e.code ? e.code : (e && e.message));
    track('diary_failed', { familyId: family._id, petId: pet._id, diaryDate: targetDate, retryCount });
    return 'failed';
  }
}

async function runCron(now) {
  await ensureCollections();
  const current = now == null ? Date.now() : now;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(current)));
  if (hour > 2) return { enabled: provider.enabled(), processed: 0, skipped: true, reason: '非日记生成窗口' };
  if (!provider.enabled()) return { enabled: false, processed: 0, reason: '日记模型未启用' };
  const targetDate = shiftDate(dateKey(current), -1);
  const families = (await col(COLLECTIONS.families).limit(100).get()).data || [];
  let processed = 0;
  let errors = 0;
  for (const family of families) {
    if (family.dissolved) continue;
    // 单家庭/单宠物失败不拖垮整批：记录后继续
    let pets = [];
    try {
      pets = (await col(COLLECTIONS.pets).where({ familyId: family._id, archived: false }).limit(100).get()).data || [];
    } catch (e) {
      errors++;
      console.error('[diary] 拉取宠物列表失败', family._id, e && (e.message || e));
      continue;
    }
    for (const pet of pets) {
      try {
        await generateOne(family, pet, targetDate);
        processed++;
      } catch (e) {
        errors++;
        console.error('[diary] 生成失败', family._id, pet && pet._id, e && (e.message || e));
      }
    }
  }
  return { enabled: true, processed, errors, targetDate };
}

async function list(ctx) {
  await ensureCollections();
  const { familyId } = ctx;
  const { petId, limit = 30, before } = ctx.payload || {};
  if (!petId) throw { code: 'INVALID', message: '缺少 petId' };
  await assertOwned(COLLECTIONS.pets, familyId, petId);
  const cond = { familyId, petId, status: 'ready' };
  if (before) cond.diaryDate = _.lt(String(before));
  const pageSize = Math.min(Number(limit) || 30, 50);
  const result = await col(COLLECTIONS.diaries).where(cond).orderBy('diaryDate', 'desc').limit(pageSize + 1).get();
  const rows = result.data || [];
  const items = rows.slice(0, pageSize).map((d) => ({ _id: d._id, petId: d.petId, diaryDate: d.diaryDate, title: d.title || '', content: d.content || '', generatedAt: d.generatedAt || 0 }));
  const hasMore = rows.length > pageSize;
  return { items, hasMore, nextCursor: hasMore && items.length ? items[items.length - 1].diaryDate : '' };
}

async function markRead(ctx) {
  await ensureCollections();
  const { familyId, openid } = ctx;
  const { petId, throughDate } = ctx.payload || {};
  if (!petId || !throughDate) throw { code: 'INVALID', message: '缺少阅读范围' };
  await assertOwned(COLLECTIONS.pets, familyId, petId);
  const result = await col(COLLECTIONS.diaries).where({ familyId, petId, status: 'ready', diaryDate: _.lte(String(throughDate)) }).update({ data: { readBy: _.addToSet(openid), updateAt: Date.now() } });
  return { updated: result.stats ? result.stats.updated : 0 };
}

/** 云开发控制台验收入口：必须显式开启开关且只能由家庭创建者调用。 */
async function manualGenerate(ctx) {
  if (!CONFIG.DIARY_MANUAL_TRIGGER) throw { code: 'FORBIDDEN', message: '手动日记入口未开启' };
  if (!provider.enabled()) throw { code: 'DIARY_NOT_CONFIGURED', message: '日记模型未配置' };
  const { familyId, family, openid } = ctx;
  const { petId, date } = ctx.payload || {};
  if (!family || family.ownerOpenid !== openid) throw { code: 'FORBIDDEN', message: '仅家庭创建者可手动生成日记' };
  if (!petId) throw { code: 'INVALID', message: '缺少 petId' };
  console.log('[diary][manual] start', petId, date || 'previous-day');
  const targetDate = date ? String(date) : shiftDate(dateKey(Date.now()), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw { code: 'INVALID', message: 'date 格式应为 YYYY-MM-DD' };
  const pet = await assertOwned(COLLECTIONS.pets, familyId, petId);
  if (pet.archived) throw { code: 'FORBIDDEN', message: '归档宠物不能生成新日记' };
  // 必须传完整 family（含 members）：eventsFor 要靠成员 openid 查 settings.familyNick 称呼
  const record = await generateOne(family, pet, targetDate, { force: true, returnRecord: true });
  if (!record || record.status !== 'ready') throw { code: 'DIARY_FAILED', message: '模型生成失败，请查看云函数日志' };
  return { _id: record._id, petId, diaryDate: record.diaryDate, title: record.title, content: record.content, model: record.model, sourceRecordIds: record.sourceRecordIds || [] };
}

/** 云开发控制台没有微信身份上下文时使用；仅由 DIARY_MANUAL_TRIGGER 开关保护。 */
async function manualGenerateConsole(payload) {
  if (!CONFIG.DIARY_MANUAL_TRIGGER) throw { code: 'FORBIDDEN', message: '手动日记入口未开启' };
  if (!provider.enabled()) throw { code: 'DIARY_NOT_CONFIGURED', message: '日记模型未配置' };
  console.warn('[diary][manual-console] 控制台后门被调用', JSON.stringify({ petId: payload && payload.petId, date: payload && payload.date }));
  const data = payload || {};
  if (!data.petId) throw { code: 'INVALID', message: '缺少 petId' };
  console.log('[diary][manual-console] start', data.petId, data.date || 'previous-day');
  const pet = await getDoc(COLLECTIONS.pets, data.petId);
  if (!pet) throw { code: 'NOT_FOUND', message: '宠物不存在' };
  if (pet.archived) throw { code: 'FORBIDDEN', message: '归档宠物不能生成新日记' };
  const family = await getDoc(COLLECTIONS.families, pet.familyId);
  if (!family || family.dissolved) throw { code: 'NOT_FOUND', message: '家庭空间不存在' };
  const targetDate = data.date ? String(data.date) : shiftDate(dateKey(Date.now()), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw { code: 'INVALID', message: 'date 格式应为 YYYY-MM-DD' };
  const record = await generateOne(family, pet, targetDate, { force: true, returnRecord: true });
  if (!record || record.status !== 'ready') throw { code: 'DIARY_FAILED', message: '模型生成失败，请查看云函数日志' };
  return { _id: record._id, petId: pet._id, diaryDate: record.diaryDate, title: record.title, content: record.content, model: record.model, sourceRecordIds: record.sourceRecordIds || [] };
}

module.exports = { runCron, list, markRead, manualGenerate, manualGenerateConsole, dateKey, shiftDate, localBounds, summarizeRecord, inputFor, generateOne };
