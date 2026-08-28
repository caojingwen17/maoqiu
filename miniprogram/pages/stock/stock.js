const app = getApp();
const inventoryService = require('../../services/inventory.js');
const { startOfDay, DAY } = require('../../utils/date.js');
const subscription = require('../../services/subscription.js');

// 分类 → 图标/配色
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
    items: [],
    loading: true, // 首次加载中（paw-loading 全屏动效）
    banner: '', // 最近临期提醒文案，空串不展示
    // 统一确认弹窗（p-dialog）：删除囤货
    dlg: { show: false, title: '', content: '', delId: '' }
  },

  onLoad(options) {
    this._highlightId = options && options.highlight ? options.highlight : '';
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    try {
      const list = await inventoryService.list();
      this.setData({ items: (list || []).map((it) => mapItem(it, this._highlightId)), banner: nearestExpire(list || []), loading: false });
    } catch (e) {
      console.error('[stock] 加载失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },
  onItem(e) {
    wx.navigateTo({ url: '/pages/stock/item/item?id=' + e.currentTarget.dataset.id });
  },
  onAdd() {
    wx.navigateTo({ url: '/pages/stock/inbound/inbound' });
  },

  // 左滑动作：补货（余量回满）/ 删除
  async onAction(e) {
    const idx = e.detail.index;
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find((it) => it.id === id);
    if (!item) return;
    if (idx === 0) {
      subscription.silentRefill('inventory_restock');
      try {
        await inventoryService.update({ _id: id, remainAmount: item.totalAmount || item.remain });
        wx.showToast({ title: '已补货', icon: 'none' });
        this.loadList();
      } catch (err) {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      }
      return;
    }
    this.setData({
      dlg: { show: true, title: '删除 ' + item.name, content: '删除后不再提醒补货与临期，且不可恢复', delId: id }
    });
  },
  closeDlg() {
    this.setData({ 'dlg.show': false });
  },
  async onDlgConfirm() {
    const id = this.data.dlg.delId;
    this.closeDlg();
    if (!id) return;
    try {
      await inventoryService.remove(id);
      this.loadList();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
    }
  }
});

function mapItem(it, highlightId) {
  const style = CAT_STYLE[it.category] || DEFAULT_STYLE;
  const total = typeof it.totalAmount === 'number' ? it.totalAmount : 0;
  const remain = typeof it.remainAmount === 'number' ? it.remainAmount : 0;
  const unit = it.unit || '件';
  const pct = total > 0 ? Math.round((remain / total) * 100) : (remain > 0 ? 100 : 0);
  const threshold = typeof it.threshold === 'number' ? it.threshold : null;
  const expireTs = it.expireDate ? new Date(String(it.expireDate).replace(/-/g, '/')).getTime() : 0;
  const expired = expireTs && expireTs < startOfDay(Date.now());

  let days;
  if (remain <= 0) days = '已用完 · 左滑补货';
  else if (expired) days = '已过期 · 建议处理';
  else if (it.dailyConsume > 0) days = '还能撑 ' + Math.max(1, Math.floor(remain / it.dailyConsume)) + ' 天';
  else days = '余 ' + remain + ' ' + unit;

  let state = 'ok';
  if (remain <= 0 || expired) state = 'danger';
  else if (pct <= 25 || (threshold !== null && threshold > 0 && remain <= threshold)) state = 'warn';

  return {
    id: it._id,
    icon: style.icon,
    color: style.color,
    name: it.itemName || '未命名',
    totalAmount: total,
    remain,
    days,
    pct: Math.min(pct, 100) + '%',
    state,
    highlight: !!highlightId && it._id === highlightId
  };
}

/** 最近一条临期（30 天内，含已过期）→ banner 文案 */
function nearestExpire(list) {
  const today = startOfDay(Date.now());
  let best = null;
  list.forEach((it) => {
    if (!it.expireDate) return;
    const t = new Date(String(it.expireDate).replace(/-/g, '/')).getTime();
    if (!t) return;
    const days = Math.round((t - today) / DAY);
    if (days > 30) return;
    if (!best || days < best.days) best = { name: it.itemName || '物品', days };
  });
  if (!best) return '';
  if (best.days < 0) return best.name + ' 已过期 ' + (-best.days) + ' 天，建议处理';
  if (best.days === 0) return best.name + ' 今天到期';
  return best.name + ' ' + best.days + ' 天后到期';
}
