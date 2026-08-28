const app = getApp();
const { pickAv } = require('../../utils/avatar.js');
const familyService = require('../../services/family.js');

Page({
  data: {
    sb: 20,
    familyId: '',
    full: false,
    previewFailed: false,
    inviter: '家人',
    family: { name: '', memberCount: 0, pets: [] }
  },

  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    const familyId = options && options.familyId;
    if (familyId) {
      this.setData({ familyId });
      this.loadPreview(familyId);
    } else {
      wx.showToast({ title: '邀请链接无效', icon: 'none' });
    }
  },

  async loadPreview(familyId) {
    try {
      const p = await familyService.preview(familyId);
      const pets = (p.pets || []).slice(0, 2).map((pet) => {
        const c = pickAv(pet._id);
        return { av: c.av, paw: c.paw, avatar: pet.avatar || '', name: pet.name, sub: pet.breed || '' };
      });
      // 成员头像叠层：有真实头像用真实头像，没有则用稳定配色爪印兜底（最多展示 3 个）
      const memberAvatars = (p.members || []).slice(0, 3).map((m, i) => {
        const c = pickAv((m.nickname || 'member') + i);
        return { avatar: m.avatar || '', av: c.av, paw: c.paw };
      });
      this.setData({
        family: { name: p.name, memberCount: p.memberCount, pets, memberAvatars },
        inviter: p.ownerName || '家庭创建者',
        full: p.memberCount >= 5
      });
    } catch (e) {
      console.error('[invite] 加载失败', e);
      this.setData({ previewFailed: true });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },
  async onJoin() {
    const toast = this.selectComponent('#toast');
    if (!this.data.familyId || this.data.previewFailed) {
      if (toast) toast.show(this.data.previewFailed ? '预览加载失败，暂不能加入' : '邀请链接无效');
      return;
    }
    try {
      await familyService.join(this.data.familyId);
      if (toast) toast.show('已加入家庭空间');
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 500);
    } catch (e) {
      if (toast) toast.show((e && e.message) || '加入失败');
    }
  }
});
