const app = getApp();
const { TC, ICON_OF, NAME } = require('../../../utils/recordMeta.js');
const { fmtDateFull } = require('../../../utils/date.js');
const recordService = require('../../../services/record.js');
const { guard } = require('../../../utils/guard.js');
const subscription = require('../../../services/subscription.js');

Page({
  data: {
    sb: 20,
    _id: '',
    rec: {},
    loading: true,
    showDel: false
  },

  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    const id = options && options.id;
    if (id) {
      this.setData({ _id: id });
      this.loadRecord(id);
    }
    // 浏览型触点：同 pet_detail_view，进入详情页做一次性订阅引导（全局 once，
    // 已持久授权/持久拒绝时 guide 内部跳过），弹窗走 wx.showModal 降级（本页未挂 sub-guide）
    setTimeout(() => subscription.guide('record_detail_view', { once: true }), 600);
  },

  async loadRecord(id) {
    try {
      const r = await recordService.get(id);
      // record.get 云端已带 petName 与最新记录人称呼，无需再跑聚合
      this.setData({ rec: mapRec(r), loading: false });
    } catch (e) {
      console.error('[record.detail] 加载失败', e);
      this.setData({ loading: false });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },
  goEdit() {
    const rec = this.data.rec || {};
    wx.navigateTo({ url: '/pages/record/edit/edit?id=' + this.data._id + '&type=' + (rec.type || 'daily') });
  },
  onDel() {
    this.setData({ showDel: true });
  },
  cancelDel() {
    this.setData({ showDel: false });
  },
  confirmDel: guard('del', async function () {
    this.setData({ showDel: false });
    try {
      await recordService.remove(this.data._id);
      wx.showToast({ title: '已删除', icon: 'none' });
      setTimeout(() => this.goBack(), 400);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '删除失败', icon: 'none' });
    }
  }),
  noop() { },

  // 照片预览：cloud:// fileID 先转临时 URL（参考 pet/detail 的做法）
  async onPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const rawUrls = ((this.data.rec && this.data.rec.photos) || []).filter(Boolean);
    if (!rawUrls.length) return;
    const urls = rawUrls.slice();
    const cloudUrls = rawUrls.filter((url) => String(url).indexOf('cloud://') === 0);
    if (cloudUrls.length && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const result = await wx.cloud.getTempFileURL({ fileList: cloudUrls });
        const mapped = {};
        (result.fileList || []).forEach((item) => {
          if (item.fileID && item.tempFileURL) mapped[item.fileID] = item.tempFileURL;
        });
        rawUrls.forEach((url, i) => { if (mapped[url]) urls[i] = mapped[url]; });
      } catch (e2) {
        // 预览仍尝试使用原始地址，兼容开发者工具或临时 URL。
      }
    }
    wx.previewImage({ current: urls[index] || urls[0], urls });
  }
});

function mapRec(r) {
  const type = r.type || 'daily';
  return {
    type,
    icon: ICON_OF[type] || 'camera',
    color: TC[type] || '#8A8378',
    cat: NAME[type] || '记录',
    title: NAME[type] || '记录',
    value: recordVal(r),
    date: fmtDateFull(r.date),
    by: r.createdByName || '我',
    note: r.note || '',
    petName: r.petName || '',
    items: (r.data && r.data.items) || [],
    photos: r.photos || [],
    videos: r.videos || []
  };
}

function recordVal(r) {
  const d = r.data || {};
  if (r.type === 'weight' && typeof d.weight === 'number') return d.weight + ' kg';
  if (r.type === 'expense' && typeof d.amount === 'number') return '-¥' + d.amount;
  return '';
}