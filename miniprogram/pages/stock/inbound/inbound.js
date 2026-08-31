const app = getApp();
const inventoryService = require('../../../services/inventory.js');
const recordService = require('../../../services/record.js');
const subscription = require('../../../services/subscription.js');
const { guard } = require('../../../utils/guard.js');

const CATEGORIES = ['粮食', '猫砂', '药品', '用品'];
const MODES = [
  { key: 'byAmount', name: '按量扣减', sub: '如粮食按克 / 袋' },
  { key: 'byPiece', name: '按件扣减', sub: '如药品按支 / 片' }
];
const LINK_TYPES = ['deworm', 'medication'];

Page({
  data: {
    sb: 20,
    name: '',
    categories: CATEGORIES,
    catIdx: 0,
    amount: '',
    unit: '',
    expireDate: '',
    threshold: '',
    dailyConsume: '',
    modes: MODES,
    modeIdx: 0,
    linkType: 'deworm',
    linkTypes: LINK_TYPES,
    toBill: false,
    price: '',
    saving: false,
    editingId: ''
  },

  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    if (options && options.id) {
      this.setData({ editingId: options.id });
      inventoryService.list().then((list) => {
        const it = (list || []).find((x) => x._id === options.id);
        if (!it) return;
        this.setData({ name: it.itemName || '', catIdx: Math.max(0, CATEGORIES.indexOf(it.category)), amount: String(it.totalAmount || ''), unit: it.unit || '', expireDate: it.expireDate || '', threshold: it.threshold != null ? String(it.threshold) : '', dailyConsume: it.dailyConsume != null ? String(it.dailyConsume) : '', modeIdx: it.consumeMode === 'byPiece' ? 1 : 0, linkType: it.linkType || 'deworm' });
      }).catch(() => {});
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onCat(e) { this.setData({ catIdx: Number(e.currentTarget.dataset.index) }); },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  onUnit(e) { this.setData({ unit: e.detail.value }); },
  onExpire(e) { this.setData({ expireDate: e.detail.value }); },
  onThreshold(e) { this.setData({ threshold: e.detail.value }); },
  onDailyConsume(e) { this.setData({ dailyConsume: e.detail.value }); },
  onMode(e) { this.setData({ modeIdx: Number(e.currentTarget.dataset.index) }); },
  onLinkType(e) { this.setData({ linkType: this.data.linkTypes[Number(e.currentTarget.dataset.index)] }); },
  onToBill(e) { this.setData({ toBill: !!e.detail.value }); },
  onPrice(e) { this.setData({ price: e.detail.value }); },

  onSave: guard('save', async function () {
    const toast = this.selectComponent('#toast');
    const name = (this.data.name || '').trim();
    if (!name) { if (toast) toast.show('请填写物品名称'); return; }
    const total = Number(this.data.amount);
    if (!(total > 0)) { if (toast) toast.show('请填写数量'); return; }

    const payload = {
      itemName: name,
      category: this.data.categories[this.data.catIdx],
      totalAmount: total,
      remainAmount: total,
      unit: (this.data.unit || '').trim() || '件',
      consumeMode: this.data.modes[this.data.modeIdx].key,
      expireDate: this.data.expireDate || '',
      threshold: Number(this.data.threshold) > 0 ? Number(this.data.threshold) : 0,
      dailyConsume: Number(this.data.dailyConsume) > 0 ? Number(this.data.dailyConsume) : 0
    };
    if (this.data.modeIdx === 1) payload.linkType = this.data.linkType;
    const threshold = Number(this.data.threshold);
    const daily = Number(this.data.dailyConsume);

    // 计入本月账单：同步记一笔「用品」花销（家庭级，不归属单一宠物）
    const price = Number(this.data.price);
    const withBill = this.data.toBill && price > 0;

    subscription.silentRefill('inventory_save');
    try {
      if (this.data.editingId) {
        payload._id = this.data.editingId;
        delete payload.totalAmount;
        delete payload.remainAmount;
        await inventoryService.update(payload);
      } else {
        await inventoryService.inbound(payload);
      }
      if (withBill) {
        const amount = Math.round(price * 100) / 100;
        await recordService.create({
          type: 'expense',
          date: Date.now(),
          data: {
            amount,
            category: '用品',
            note: '囤货入库 · ' + name,
            items: [
              { label: '分类', value: '用品' },
              { label: '金额', value: amount + ' 元' },
              { label: '明细', value: '囤货入库 · ' + name }
            ]
          }
        }).catch(() => {}); // 账单联动失败不影响入库结果
      }
      if (toast) toast.show(this.data.editingId ? '已保存' : (withBill ? '已入库 · 已记入本月账单' : '已入库'));
      if (this.data.expireDate || threshold > 0) await subscription.guide('inventory_reminder', { once: true });
      setTimeout(() => this.goBack(), 600);
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败');
    }
  }, { flag: 'saving' })
});
