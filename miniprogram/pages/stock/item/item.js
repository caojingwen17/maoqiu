const app = getApp();
const inventoryService = require('../../../services/inventory.js');
const subscription = require('../../../services/subscription.js');
const { startOfDay, DAY } = require('../../../utils/date.js');

// 分类 → 图标/配色（与列表页一致）
const CAT_STYLE = {
  '粮食': { icon: 'bowl', color: '#B0803B' },
  '猫砂': { icon: 'box', color: '#8A8378' },
  '药品': { icon: 'cross', color: '#7D6BAE' },
  '用品': { icon: 'shield', color: '#4E8A68' }
};
const DEFAULT_STYLE = { icon: 'box', color: '#4E8A68' };

Page({
  data: {
    sb: 20,
    item: null,
    loading: true, // 首次加载中（paw-loading 全屏动效）
    // 手动消耗弹窗（p-dialog 输入模式）
    consumeDlg: false,
    consumeVal: ''
  },

  onLoad(options) {
    this._id = (options && options.id) || '';
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },

  onShow() {
    this.loadItem();
  },

  async loadItem() {
    if (!this._id) return;
    try {
      const list = await inventoryService.list();
      const it = (list || []).find((x) => x._id === this._id);
      if (!it) {
        this.setData({ loading: false });
        wx.showToast({ title: '物品不存在或已删除', icon: 'none' });
        setTimeout(() => this.goBack(), 600);
        return;
      }
      this.setData({ item: mapDetail(it), loading: false });
    } catch (e) {
      console.error('[stock/item] 加载失败', e);
      this.setData({ loading: false });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },

  // 手动消耗：弹出可输入数量的对话框（p-dialog 输入模式）
  onConsume() {
    const item = this.data.item;
    if (!item) return;
    this.setData({ consumeDlg: true, consumeVal: '' });
  },
  closeConsume() {
    this.setData({ consumeDlg: false });
  },
  onConsumeInput(e) {
    this.setData({ consumeVal: e.detail.value });
  },
  async confirmConsume() {
    const item = this.data.item;
    const toast = this.selectComponent('#toast');
    const amount = Number(this.data.consumeVal);
    if (!(amount > 0)) {
      if (toast) toast.show('请输入有效数量');
      return;
    }
    this.closeConsume();
    subscription.silentRefill('inventory_consume');
    try {
      await inventoryService.consume(this._id, amount);
      if (toast) toast.show('已扣减 ' + amount + ' ' + item.unit);
      this.loadItem();
    } catch (e) {
      if (toast) toast.show((e && e.message) || '扣减失败');
    }
  },
  onEdit() {
    wx.navigateTo({ url: '/pages/stock/inbound/inbound?id=' + this._id });
  }
});

function mapDetail(it) {
  const style = CAT_STYLE[it.category] || DEFAULT_STYLE;
  const total = typeof it.totalAmount === 'number' ? it.totalAmount : 0;
  const remain = typeof it.remainAmount === 'number' ? it.remainAmount : 0;
  const unit = it.unit || '件';
  const pct = total > 0 ? Math.round((remain / total) * 100) : (remain > 0 ? 100 : 0);

  let days;
  if (remain <= 0) days = '已用完';
  else if (it.dailyConsume > 0) days = '还能撑 ' + Math.max(1, Math.floor(remain / it.dailyConsume)) + ' 天';
  else days = '余 ' + remain + ' ' + unit;

  let expireText = '未设置';
  if (it.expireDate) {
    const t = new Date(String(it.expireDate).replace(/-/g, '/')).getTime();
    const diff = Math.round((t - startOfDay(Date.now())) / DAY);
    expireText = it.expireDate + (diff < 0 ? '（已过期）' : diff <= 30 ? '（' + diff + ' 天后到期）' : '');
  }

  return {
    name: it.itemName || '未命名',
    icon: style.icon,
    color: style.color,
    unit,
    remain,
    remainText: remain + ' / ' + total + ' ' + unit + '（' + Math.min(pct, 100) + '%）',
    days,
    category: it.category || '未分类',
    dailyConsumeText: it.dailyConsume > 0 ? it.dailyConsume + ' ' + unit + '/天' : '未设置',
    thresholdText: typeof it.threshold === 'number' && it.threshold > 0 ? it.threshold + ' ' + unit : '未设置',
    expireText,
    logs: (Array.isArray(it.consumeLogs) ? it.consumeLogs : []).slice().reverse().slice(0, 20).map((x) => ({
      amount: x.amount,
      reason: x.reason || '消耗',
      date: new Date(x.at || Date.now()).toLocaleDateString()
    }))
  };
}
