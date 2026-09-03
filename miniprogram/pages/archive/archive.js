const app = getApp();
const homeService = require('../../services/home.js');
const petService = require('../../services/pet.js');
const { guard } = require('../../utils/guard.js');

const theme = require('../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
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
    theme.attach(this);
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
  onDlgConfirm: guard('restore', async function () {
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
  }),

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  }
});
