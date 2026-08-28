const TZ = 'Asia/Shanghai';
const DAY = 24 * 60 * 60 * 1000;
const TYPE_NAME = {
  daily: '日常', feed: '吃饭', water: '喝水', snack: '零食', walk: '散步', groom: '洗护',
  poop: '便便', vomit: '身体情况', weight: '体重', vaccine: '疫苗', deworm: '驱虫',
  medical: '就医', medication: '用药', surgery: '手术', milestone: '纪念日', expense: '花销', custom: '记录'
};

/** 随机注意力种子：让同一天重复生成/不同天的日记走不同脑回路，避免千篇一律 */
const FOCUS_SEEDS = [
  '鼻子和闻到的味道', '耳朵和听到的声音', '肚子（饿或饱）', '爪子和踩来踩去',
  '尾巴（抓不到的那条）', '困意和眼皮', '兴奋和坐不住', '好奇和想不通的怪问题',
  '小脾气和哼唧', '想出门/想进来', '守护自己的地盘', '想念和等待'
];

function randomFocusSeed() {
  return FOCUS_SEEDS[Math.floor(Math.random() * FOCUS_SEEDS.length)];
}

// 称呼不设白名单：用户在「我的-家庭内称呼」填了什么就用什么，没填统一「主人」。
function normalizeFamilyTitle(value) {
  const title = String(value || '').trim();
  return title || '主人';
}

function parts(ts) {
  const out = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ts));
  const get = (type) => Number((out.find((x) => x.type === type) || {}).value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function dateKey(ts) {
  const p = parts(ts == null ? Date.now() : ts);
  return p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
}

function shiftDate(key, days) {
  const p = key.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}

function localBounds(key) {
  const p = key.split('-').map(Number);
  const start = Date.UTC(p[0], p[1] - 1, p[2]) - 8 * 60 * 60 * 1000;
  return { start, end: start + DAY };
}

function summarizeRecord(record, actorTitle) {
  const data = record.data || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const values = items.map((x) => x && x.value).filter((x) => x != null && String(x).trim()).join('、');
  const note = String(record.note || '').trim();
  let summary = [values, note].filter(Boolean).join('；') || TYPE_NAME[record.type] || '日常';
  summary = summary.replace(/[\r\n]+/g, ' ')
    .replace(/1[3-9]\d{9}/g, '联系方式')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '邮箱')
    .replace(/https?:\/\/\S+/g, '链接')
    .slice(0, 80);
  const time = record.date ? new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(record.date)) : '';
  return { time, type: TYPE_NAME[record.type] || '记录', summary, actor: normalizeFamilyTitle(actorTitle) };
}

function inputFor(pet, key, eventData) {
  const title = String(pet.ownerTitle || pet.familyTitle || '').trim();
  const eventTitle = (eventData.events || []).map((e) => e && e.actor).find((v) => String(v || '').trim());
  const preferredTitle = title || String(eventData.ownerTitle || '').trim() || eventTitle;
  return {
    date: key,
    pet: {
      name: pet.name || '宝宝',
      species: pet.species || '宠物',
      traits: Array.isArray(pet.traits) ? pet.traits.slice(0, 5) : [],
      ownerTitle: normalizeFamilyTitle(preferredTitle)
    },
    events: eventData.events,
    noEventDay: eventData.events.length === 0,
    // 多样性控制：近期标题（避免雷同开头/标题）+ 随机注意力种子
    recentTitles: Array.isArray(eventData.recentTitles) ? eventData.recentTitles : [],
    focusSeed: eventData.focusSeed || ''
  };
}

module.exports = { TZ, DAY, dateKey, shiftDate, localBounds, summarizeRecord, inputFor, normalizeFamilyTitle, FOCUS_SEEDS, randomFocusSeed };
