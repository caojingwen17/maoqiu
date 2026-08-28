const app = getApp();
const homeService = require('../../services/home.js');
const petService = require('../../services/pet.js');

Page({
  data: {
    sb: 20,
    archived: [],
    loading: true, // 首次加载中（paw-loading 全屏动效）
    // 统一确认弹窗（p-dialog）
    dlg: { show: false, title: '', content: '', confirmText: '确认', restoreId: '' }
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    try {
      const d = await homeService.aggregate();
      this.setData({ archived: (d.archivedPets || []).map((p) => ({ id: p._id, name: p.name, sub: p.species || '已归档', avatar: p.avatar || '' })), loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '归档列表加载失败', icon: 'none' });
    }
  },

  onRestore(e) {
    const item = this.data.archived[e.currentTarget.dataset.index];
    if (!item) return;
    this.setData({
      dlg: { show: true, title: '恢复 ' + item.name + '？', content: '恢复后会重新显示在首页，但历史提醒不会自动补发。', confirmText: '恢复', restoreId: item.id }
    });
  },
  closeDlg() {
    this.setData({ 'dlg.show': false });
  },
  async onDlgConfirm() {
    const id = this.data.dlg.restoreId;
    this.closeDlg();
    if (!id) return;
    try {
      await petService.archive(id, false);
      wx.showToast({ title: '已恢复', icon: 'none' });
      this.loadData();
    } catch (e2) {
      wx.showToast({ title: (e2 && e2.message) || '恢复失败', icon: 'none' });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  }
});
