const app = getApp();
const statsService = require('../../services/stats.js');
const { startOfDay, DAY } = require('../../utils/date.js');
const share = require('../../utils/share.js');
const tracker = require('../../utils/tracker.js');

const RANGES = ['month', 'half_year', 'year'];
const RANGE_LABEL = { month: '本月', half_year: '半年', year: '今年' };
const HEAT_DAYS = 98; // 近 14 周（PRD），与云端 stats.summary 返回窗口一致；98 = 7 × 14，恰好填满 14 列网格

// 三张卡各自独立的范围状态：体重必须选具体宠物；花销/热力 '' 表示全部宠物
const SCOPE_ALL = { id: '', name: '全部宠物', all: true };
const SHEET_TITLE = { wt: '选择宠物', exp: '花销范围', heat: '打卡范围' };

// 头像配色（与首页一致的稳定哈希配色）
const AV = [
  { av: 'a1', paw: '#B0803B' },
  { av: 'a2', paw: '#6B8F4E' },
  { av: 'a3', paw: '#B85C5C' },
  { av: 'a4', paw: '#4A7FC7' }
];
function pickAv(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

Page({
  data: {
    sb: 20,
    loading: false, // 首次加载中（paw-loading 全屏动效）
    segItems: ['本月', '近半年', '今年'],
    seg: 1,
    pets: [], // 仅真实宠物；「全部宠物」由各卡选择器单独提供
    wtPetId: '',
    expPetId: '',
    heatPetId: '',
    // 体重曲线
    wtName: '',
    wtEmpty: '',
    wtLine: '',
    wtFill: '',
    wtDots: [],
    wtTip: '',
    // 花销柱状
    bars: [],
    expHeader: '',
    expEmpty: '',
    expScope: '全部宠物',
    // 打卡热力
    heat: [],
    xLabels: [],
    heatScope: '全部宠物',
    heatTip: '',
    // 卡片选择器弹层
    sheetType: '',
    sheetTitle: '',
    sheetOptions: []
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20, loading: true });
    this._firstShow = true;
    this.loadAll();
  },

  onShow() {
    tracker.track(tracker.EVENTS.TAB_SHOW, { tab: 'stats' });
    // 首次进入时 onLoad 已触发加载，跳过避免重复请求
    if (this._firstShow) {
      this._firstShow = false;
      return;
    }
    this.loadAll();
  },

  onSeg(e) {
    this.setData({ seg: e.detail.index });
    this.loadAll();
  },

  onShareAppMessage() {
    return share.shareAppMessage();
  },
  onShareTimeline() {
    return share.shareTimeline();
  },

  // 单次调用拿三卡数据 + 宠物名册（云端内部并行；体重卡未选宠物时云端默认第一只）
  async loadAll() {
    const range = this.range();
    try {
      const d = await statsService.summary({
        range,
        wtPetId: this.data.wtPetId,
        expPetId: this.data.expPetId,
        heatPetId: this.data.heatPetId
      });
      const pets = ((d && d.pets) || []).map((p) => {
        const c = pickAv(p._id);
        return { id: p._id, name: p.name, avatar: p.avatar || '', av: c.av, paw: c.paw };
      });
      // 选择器状态校正：体重卡以云端实际使用的为准（含默认第一只）；花销/热力所选宠物被删时回「全部」
      const wtPetId = (d && d.wtPetId) || '';
      let { expPetId, heatPetId } = this.data;
      if (expPetId && !pets.some((p) => p.id === expPetId)) expPetId = '';
      if (heatPetId && !pets.some((p) => p.id === heatPetId)) heatPetId = '';
      const wtName = wtPetId ? nameOf(pets, wtPetId) : '';
      this.setData(Object.assign(
        { pets, wtPetId, expPetId, heatPetId, loading: false },
        buildWeight((d && d.weight) || [], wtName, range),
        { expScope: expPetId ? nameOf(pets, expPetId) : SCOPE_ALL.name },
        buildBars((d && d.expenses) || [], range),
        {
          heatScope: heatPetId ? nameOf(pets, heatPetId) : SCOPE_ALL.name,
          heat: buildHeat((d && d.checks) || []),
          heatTip: ''
        }
      ));
    } catch (e) {
      this.setData({ loading: false });
      this.onLoadFail('[stats] 加载失败', e);
    }
  },

  onLoadFail(msg, e) {
    console.error(msg, e);
    const toast = this.selectComponent('#toast');
    if (toast) toast.show('统计加载失败，请稍后再试');
  },

  // ===== 卡片选择器：每张卡独立的 p-sheet =====
  openSheet(e) {
    const type = e.currentTarget.dataset.type;
    const pets = this.data.pets;
    let options;
    if (type === 'wt') {
      options = pets.map((p) => Object.assign({ on: p.id === this.data.wtPetId }, p));
    } else {
      const cur = type === 'exp' ? this.data.expPetId : this.data.heatPetId;
      options = [Object.assign({ on: !cur }, SCOPE_ALL)].concat(
        pets.map((p) => Object.assign({ on: p.id === cur }, p))
      );
    }
    this.setData({ sheetType: type, sheetTitle: SHEET_TITLE[type] || '', sheetOptions: options });
  },

  closeSheet() {
    this.setData({ sheetType: '' });
  },

  onSheetPick(e) {
    const id = e.currentTarget.dataset.id;
    const type = this.data.sheetType;
    this.closeSheet();
    if (type === 'wt') {
      if (!id || id === this.data.wtPetId) return;
      this.setData({ wtPetId: id });
    } else if (type === 'exp') {
      if (id === this.data.expPetId) return;
      this.setData({ expPetId: id });
    } else if (type === 'heat') {
      if (id === this.data.heatPetId) return;
      this.setData({ heatPetId: id });
    }
    this.loadAll();
  },

  range() {
    return RANGES[this.data.seg] || 'half_year';
  },

  // ===== 体重dot点击：显示「日期 · 体重」；最新一点常驻数值标签 =====
  onWtDotTap(e) {
    const item = this.data.wtDots[Number(e.currentTarget.dataset.index)];
    if (!item) return;
    this.setData({ wtTip: item.dateLabel + ' · ' + item.value + ' kg' });
  },

  // ===== 热力格子点击：格子下方显示「日期 · 打卡次数」 =====
  onHeatTap(e) {
    const item = this.data.heat[Number(e.currentTarget.dataset.index)];
    if (!item) return;
    this.setData({
      heatTip: item.label + ' · ' + (item.count ? '打卡 ' + item.count + ' 次' : '无打卡')
    });
  }
});

// ===== 体重曲线：clip-path 折线 + 渐变填充 + 数据点 =====
function nameOf(pets, id) {
  const p = (pets || []).find((x) => x.id === id);
  return p ? p.name : '';
}

function buildWeight(points, name, range) {
  if (!name) {
    return { wtName: '未选择', wtEmpty: '添加毛孩子后即可查看体重曲线', wtLine: '', wtFill: '', wtDots: [], wtTip: '', xLabels: bucketLabels(range) };
  }
  if (!points.length) {
    return { wtName: name, wtEmpty: '范围内还没有体重记录', wtLine: '', wtFill: '', wtDots: [], wtTip: '', xLabels: bucketLabels(range) };
  }
  const vals = points.map((p) => p.value);
  const min = Math.min.apply(null, vals);
  const max = Math.max.apply(null, vals);
  const span = max - min || 1;
  const n = points.length;
  // x 均匀分布（留边），y 映射到 15%..85%（越小越靠上）
  // valPos：数值标签上下交错防水平重叠；贴近上下边缘的点强制往内侧放
  const coords = points.map((p, i) => {
    const y = Math.round((85 - ((p.value - min) / span) * 70) * 10) / 10;
    let valPos = i % 2 === 0 ? 'above' : 'below';
    if (y <= 24) valPos = 'below';
    else if (y >= 76) valPos = 'above';
    return {
      x: n === 1 ? 50 : Math.round((4 + (92 * i) / (n - 1)) * 10) / 10,
      y,
      value: p.value,
      valPos,
      dateLabel: wtDateLabel(p.date)
    };
  });
  const t = 2.2; // 折线半宽（%）
  const top = coords.map((c) => c.x + '% ' + Math.max(c.y - t, 0) + '%').join(', ');
  const bottom = coords.slice().reverse().map((c) => c.x + '% ' + Math.min(c.y + t, 100) + '%').join(', ');
  const line = top + ', ' + bottom;
  const fillTop = coords.map((c) => c.x + '% ' + c.y + '%').join(', ');
  const fill = '0% 100%, ' + fillTop + ', 100% 100%';
  return {
    wtName: name,
    wtEmpty: '',
    wtLine: line,
    wtFill: fill,
    wtDots: coords,
    wtTip: '',
    xLabels: bucketLabels(range)
  };
}

/** 体重dot的日期短标签：M月D日 */
function wtDateLabel(date) {
  const d = new Date(date);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// ===== 花销柱状：按 range 分桶 =====
function bucketLabels(range) {
  const now = new Date();
  if (range === 'month') {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil(days / 7);
    const labels = [];
    for (let i = 0; i < weeks; i++) labels.push((i + 1) + '周');
    return labels;
  }
  const count = range === 'year' ? 12 : 6;
  const labels = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push((d.getMonth() + 1) + '月');
  }
  return labels;
}

function bucketIndex(date, range) {
  const d = new Date(date);
  const now = new Date();
  if (range === 'month') return Math.floor((d.getDate() - 1) / 7);
  // 距当前月的月数差 → 桶下标（最右为当月）
  const count = range === 'year' ? 12 : 6;
  const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return count - 1 - diff;
}

function buildBars(expenses, range) {
  const labels = bucketLabels(range);
  const sums = labels.map(() => 0);
  let total = 0;
  expenses.forEach((e) => {
    const idx = bucketIndex(e.date, range);
    if (idx < 0 || idx >= sums.length) return;
    sums[idx] += e.amount || 0;
    total += e.amount || 0;
  });
  const max = Math.max.apply(null, sums) || 0;
  const curIdx = bucketIndex(Date.now(), range);
  // 金额标签：整数直接展示，有小数保留两位；0 不展示标签
  const bars = sums.map((v, i) => ({
    h: v > 0 ? Math.max(Math.round((v / max) * 100), 8) : 3,
    cur: i === curIdx && v > 0,
    vText: v > 0 ? String(Math.round(v * 100) / 100) : '',
    label: labels[i]
  }));
  const amount = Math.round(total * 100) / 100;
  return {
    bars,
    expHeader: RANGE_LABEL[range] + ' ¥' + amount,
    expEmpty: total > 0 ? '' : '范围内还没有花销记录'
  };
}

// ===== 打卡热力：近 98 天（14 周），0/1/2/3+ 条分级；携带日期与次数供点击展示 =====
function buildHeat(checks) {
  const counts = {};
  checks.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const today = startOfDay(Date.now());
  const heat = [];
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    const ts = today - i * DAY;
    const c = counts[ts] || 0;
    const d = new Date(ts);
    heat.push({
      lv: c >= 3 ? 'l3' : c === 2 ? 'l2' : c === 1 ? 'l1' : '',
      count: c,
      label: (d.getMonth() + 1) + '月' + d.getDate() + '日'
    });
  }
  return heat;
}
