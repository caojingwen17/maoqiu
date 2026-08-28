/**
 * stats.summary —— 统计聚合（PRD §11）
 * 体重趋势 / 花销趋势 / 打卡热力，为三卡图表提供结构化数据。
 *
 * payload: { petId?: string, range?: 'month' | 'half_year' | 'year' }
 * 返回:
 *  - weight:   [{ date, value }]        范围内体重点（按日期升序）
 *  - expenses: [{ date, amount, category }] 范围内花销流水
 *  - checks:   [ts, ...]                近 98 天有记录的「日历日 0 点时间戳」（可重复，客户端计数）
 */

const { db, _, COLLECTIONS, col } = require('./db.js');
const timeUtil = require('./timeUtil.js');

const DAY = timeUtil.DAY;
const HEAT_DAYS = 98;

/** 上海时区当天 00:00（统一走 timeUtil） */
const startOfDay = timeUtil.startOfDay;

/** range 窗口起点：month=本月 1 号；half_year=5 个月前的 1 号（共 6 个自然月）；year=11 个月前的 1 号（共 12 个自然月），均按上海时区自然月 */
function rangeStart(range, now) {
  return timeUtil.shiftMonthStart(now, range === 'month' ? 0 : (range === 'year' ? -11 : -5));
}

/** 体重数值读取：data.weight / data.value / data.kg（与 home.aggregate 一致） */
function readWeight(r) {
  const d = (r && r.data) || {};
  if (typeof d.weight === 'number') return d.weight;
  if (typeof d.value === 'number') return d.value;
  if (typeof d.kg === 'number') return d.kg;
  return null;
}

module.exports = async function summary(ctx) {
  const { familyId } = ctx;
  const { petId, wtPetId, expPetId, heatPetId, range = 'half_year' } = ctx.payload || {};
  const now = Date.now();
  const start = rangeStart(range, now);

  // 三张卡各自独立选宠物（'' = 全部）；兼容旧契约 petId 作为三张卡共同的回退
  const legacyPet = petId || '';
  const expPet = expPetId !== undefined ? expPetId : legacyPet;
  const heatPet = heatPetId !== undefined ? heatPetId : legacyPet;
  const wtPetKnown = (wtPetId !== undefined ? wtPetId : legacyPet) || '';

  // 第一批并行：宠物名册 + 花销 + 热力（体重若已指定宠物也并入；未指定要等名册默认第一只）
  const eWhere = { familyId, type: 'expense', date: _.gte(start) };
  if (expPet) eWhere.petId = expPet;
  const cWhere = { familyId, date: _.gte(startOfDay(now) - (HEAT_DAYS - 1) * DAY) };
  if (heatPet) cWhere.petId = heatPet;
  const weightQuery = (pid) => {
    const wWhere = { familyId, type: 'weight', date: _.gte(start) };
    if (pid) wWhere.petId = pid;
    return col(COLLECTIONS.records).where(wWhere).orderBy('date', 'asc').limit(365).get();
  };
  const batch = [
    col(COLLECTIONS.pets).where({ familyId, archived: false }).field({ name: true, avatar: true, order: true }).orderBy('order', 'asc').get(),
    col(COLLECTIONS.records).where(eWhere).orderBy('date', 'asc').limit(1000).get(),
    col(COLLECTIONS.records).where(cWhere).field({ date: true }).limit(1000).get()
  ];
  if (wtPetKnown) batch.push(weightQuery(wtPetKnown));
  const [petsRes, expenseRes, checkRes, weightRes0] = await Promise.all(batch);

  // 体重未指定宠物：默认第一只未归档宠物（省掉前端二次往返）
  let wtPet = wtPetKnown;
  let weightRes = weightRes0;
  if (!wtPet) {
    const first = (petsRes.data || [])[0];
    wtPet = first ? first._id : '';
    weightRes = wtPet ? await weightQuery(wtPet) : { data: [] };
  }

  return {
    range,
    wtPetId: wtPet, // 实际使用的体重卡宠物（含默认回退），前端同步选择器
    pets: (petsRes.data || []).map((p) => ({ _id: p._id, name: p.name, avatar: p.avatar || '' })),
    weight: (weightRes.data || [])
      .map((r) => ({ date: r.date, value: readWeight(r) }))
      .filter((p) => typeof p.value === 'number'),
    expenses: (expenseRes.data || []).map((r) => ({
      date: r.date,
      amount: (r.data && r.data.amount) || 0,
      category: (r.data && r.data.category) || ''
    })),
    checks: (checkRes.data || []).map((r) => startOfDay(r.date)).filter((t) => t > 0)
  };
};
