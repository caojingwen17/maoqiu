const app = getApp();
const { EXPENSE_CATEGORIES } = require('../../utils/recordMeta.js');
const recordService = require('../../services/record.js');
const settingsService = require('../../services/settings.js');
const { startOfDay } = require('../../utils/date.js');
const { guard } = require('../../utils/guard.js');

const theme = require('../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    month: '',
    loading: true, // 首次加载中（paw-loading 全屏动效）
    monthNum: 0,
    budget: null,
    spent: 0,
    spentInt: '0',
    spentFrac: '00',
    pct: 0,
    cats: ['全部', ...EXPENSE_CATEGORIES],
    active: 0,
    list: [],
    showBudget: false,
    budgetInput: '',
    budgetSaving: false
  },

  onShow() {
    theme.attach(this);
  },
  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    this._month = new Date();
    this.loadData();
  },

  async loadData() {
    try {
      const [records, settings] = await Promise.all([recordService.list('', 'expense'), settingsService.get()]);
      const y = this._month.getFullYear();
      const m = this._month.getMonth();
      const rows = (records || []).filter((r) => {
        const d = new Date(r.date || 0);
        return d.getFullYear() === y && d.getMonth() === m;
      }).map(mapExpense);
      const active = this.data.cats[this.data.active];
      const filtered = active && active !== '全部' ? rows.filter((r) => r.cat === active) : rows;
      const spent = rows.reduce((sum, r) => sum + r.amount, 0);
      const budget = settings && typeof settings.budget === 'number' ? settings.budget : null;
      const parts = spent.toFixed(2).split('.');
      this.setData({
        month: y + '年' + (m + 1) + '月',
        monthNum: m + 1,
        list: filtered,
        spent: Math.round(spent * 100) / 100,
        spentInt: parts[0],
        spentFrac: parts[1],
        budget,
        pct: budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0,
        loading: false
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '账单加载失败', icon: 'none' });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },
  onCat(e) {
    this.setData({ active: Number(e.currentTarget.dataset.index) });
    this.loadData();
  },
  onPrevMonth() {
    this._month.setMonth(this._month.getMonth() - 1);
    this.loadData();
  },
  onNextMonth() {
    const now = new Date();
    if (this._month.getFullYear() === now.getFullYear() && this._month.getMonth() >= now.getMonth()) return;
    this._month.setMonth(this._month.getMonth() + 1);
    this.loadData();
  },
  onAdd() {
    wx.navigateTo({ url: '/pages/record/edit/edit?type=expense' });
  },
  onItem(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/record/detail/detail?id=' + id });
  },

  // ===== 月度预算设置 =====
  openBudget() {
    this.setData({ showBudget: true, budgetInput: this.data.budget ? String(this.data.budget) : '' });
  },
  closeBudget() {
    this.setData({ showBudget: false });
  },
  onBudgetInput(e) {
    this.setData({ budgetInput: e.detail.value });
  },
  saveBudget: guard('budget', async function () {
    const toast = this.selectComponent('#toast');
    const n = Number(this.data.budgetInput);
    if (!(n > 0)) {
      if (toast) toast.show('请输入大于 0 的预算金额', 'warn');
      return;
    }
    if (n > 999999) {
      if (toast) toast.show('预算金额过大，请确认后再输入', 'warn');
      return;
    }
    const budget = Math.round(n * 100) / 100;
    try {
      await settingsService.update({ budget });
      this.setData({ showBudget: false });
      if (toast) toast.show('已设置月度预算');
      this.loadData();
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败，请重试', 'warn');
    }
  }, { flag: 'budgetSaving' })
});

function mapExpense(r) {
  const items = (r.data && r.data.items) || [];
  const cat = (items.find((it) => it.label === '分类') || {}).value || (r.data && r.data.category) || '其他';
  const detail = (items.find((it) => it.label === '明细') || {}).value || (r.data && r.data.note) || cat;
  const amount = Number((r.data && r.data.amount) || 0);
  const colors = { 粮食: '#B0803B', 零食: '#B39A4A', 医疗: '#D24B42', 用品: '#4E8A68', 玩具: '#7D6BAE', 美容: '#5A9EA8', 寄养: '#8A7355', 保险: '#4A7FC7', 其他: '#8A8378' };
  const icons = { 粮食: 'bowl', 医疗: 'fileText', 用品: 'box', 美容: 'drop' };
  const d = new Date(r.date || Date.now());
  return { id: r._id, cat, name: detail, date: (d.getMonth() + 1) + '月' + d.getDate() + '日', amount, amt: '-¥' + amount.toFixed(2), color: colors[cat] || colors.其他, icon: icons[cat] || 'coin' };
}
