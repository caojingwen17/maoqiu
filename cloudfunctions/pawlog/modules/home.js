/**
 * home.aggregate —— 首页聚合（一次云函数调用返回首页全部数据，PRD §5.3 / §7）
 * 返回：宠物卡片墙 + 待办提醒 + 统计速览条（本月花销 / 本周打卡 / 最新体重变化）
 */

const { db, _, COLLECTIONS, col, ensureCollections } = require('./db.js');
const core = require('./reminderCore.js');
const timeUtil = require('./timeUtil.js');

module.exports = async function aggregate(ctx) {
  await ensureCollections();
  const { familyId, family } = ctx;
  // includeArchived=true 时 pets 列表附带已归档宠物（pet 对象自带 archived 字段，前端自行分组/置底）；默认 false 保持原契约
  const includeArchived = !!(ctx.payload && ctx.payload.includeArchived === true);
  const now = Date.now();
  // 本月起点按上海时区自然月（core.startOfDay 已统一为上海时区）
  const monthStart = timeUtil.startOfMonth(now);

  // 1. 宠物卡片墙（默认归档隐藏；includeArchived 时全量返回）
  const petCond = includeArchived ? { familyId } : { familyId, archived: false };
  const weekStart = now - 7 * core.DAY;
  // 全部查询互不依赖，并行发出：总耗时 ≈ 最慢的一条（串行时 9 次查询叠加是首屏 1s+ 的主因）
  const [petsRes, diaryRes, reminderRes, invRes, archRes, archivedPetsRes, expenseRes, weekRes, weightRes] = await Promise.all([
    col(COLLECTIONS.pets).where(petCond).orderBy('order', 'asc').get(),
    // 当前成员未读的最新日记（只返回 ready，避免把生成失败暴露到首页）
    col(COLLECTIONS.diaries).where({ familyId, status: 'ready' }).orderBy('diaryDate', 'desc').limit(200).get(),
    // 2. 今日待办（active 且到期日 ≤ 今天）
    col(COLLECTIONS.reminders).where({ familyId, status: 'active' }).orderBy('remindAt', 'asc').limit(50).get(),
    // 2d. 囤货列表（囤货页 / 我的页「囤货」摘要共用）
    col(COLLECTIONS.inventories).where({ familyId }).limit(100).get(),
    // 2e. 归档宠物数（我的页「归档宠物」摘要）
    col(COLLECTIONS.pets).where({ familyId, archived: true }).count(),
    col(COLLECTIONS.pets).where({ familyId, archived: true }).orderBy('updateAt', 'desc').limit(100).get(),
    // 3. 本月花销
    col(COLLECTIONS.records).where({ familyId, type: 'expense', date: _.gte(monthStart) }).limit(1000).get(),
    // 4. 本周打卡：近 7 天记录条数（与统计页打卡热力同口径——每记一笔算 1 次）
    col(COLLECTIONS.records).where({ familyId, date: _.gte(weekStart) }).limit(1000).get(),
    // 5. 体重（按日期倒序）：per-pet 最新体重 + 家庭级最近体重变化
    col(COLLECTIONS.records).where({ familyId, type: 'weight' }).orderBy('date', 'desc').limit(200).get()
  ]);
  const pets = petsRes.data || [];

  const petDiaryMap = {};
  (diaryRes.data || []).forEach((d) => {
    if (!d.petId || (d.readBy || []).indexOf(ctx.openid) > -1) return;
    if (!(d.petId in petDiaryMap)) {
      petDiaryMap[d.petId] = { diaryId: d._id, diaryDate: d.diaryDate, title: d.title || '' };
    }
  });

  const todayEnd = core.startOfDay(now) + core.DAY;
  const todos = (reminderRes.data || []).filter((r) => r.status === 'active' && r.remindAt < todayEnd);

  // 2b. 每只宠物最近一条到期提醒（宠物卡片右下角展示，todos 已按 remindAt 升序）
  const petTodoMap = {};
  todos.forEach((t) => {
    if (t.petId && !(t.petId in petTodoMap)) petTodoMap[t.petId] = t.title || t.category || '';
  });

  // 2c. 家庭成员头像组（首页大标题左侧，PRD §模块1）
  const members = ((family && family.members) || []).map((m) => ({
    nickname: m.nickname || '',
    avatar: m.avatar || ''
  }));

  const monthExpense = (expenseRes.data || []).reduce((sum, r) => {
    const v = (r.data && r.data.amount);
    return sum + (typeof v === 'number' ? v : 0);
  }, 0);

  const weekChecks = (weekRes.data || []).length;

  const wlist = weightRes.data || [];
  const weightMap = {};
  for (const r of wlist) {
    const w = readWeight(r);
    if (w == null) continue;
    if (!(r.petId in weightMap)) weightMap[r.petId] = w;
  }
  const weightTrend = buildWeightTrend(wlist, pets);

  return {
    pets,
    weightMap,
    todos,
    petTodoMap,
    petDiaryMap,
    members,
    inventories: invRes.data || [],
    archivedCount: archRes.total || 0,
    archivedPets: archivedPetsRes.data || [],
    strip: { monthExpense, weekChecks, weightTrend }
  };
};

/** 体重数值读取：data.weight / data.value / data.kg */
function readWeight(r) {
  const d = (r && r.data) || {};
  if (typeof d.weight === 'number') return d.weight;
  if (typeof d.value === 'number') return d.value;
  if (typeof d.kg === 'number') return d.kg;
  return null;
}

/** 家庭级最近体重变化（最新一条 vs 同一只宠物的上一条） */
function buildWeightTrend(wlist, pets) {
  if (!wlist.length) return null;
  const latest = wlist[0];
  const w = readWeight(latest);
  if (w == null) return null;
  const pet = pets.find((p) => p._id === latest.petId);
  // 必须与最新一条同宠物，否则多宠家庭会跨宠物相减得出错误 delta
  const prev = wlist.slice(1).find((r) => r.petId === latest.petId);
  const prevW = prev ? readWeight(prev) : null;
  let delta = null;
  if (prevW != null) delta = Math.round((w - prevW) * 10) / 10;
  return { petId: latest.petId, petName: pet ? pet.name : '', weight: w, delta, date: latest.date };
}
