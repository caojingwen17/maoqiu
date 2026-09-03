const app = getApp();
const { pickAv } = require('../../utils/avatar.js');
const { guard } = require('../../utils/guard.js');
const familyService = require('../../services/family.js');
const subscription = require('../../services/subscription.js');

const theme = require('../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    familyId: '',
    full: false,
    previewFailed: false,
    inviter: '家人',
    family: { name: '', memberCount: 0, pets: [] },
    // 我可携带的宠物（preview.myPets）：默认全选，加入时按勾选迁入家庭空间
    myPets: []
  },

  onShow() {
    theme.attach(this);
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
      // 已在该家庭（如自己点开自己发的邀请链接）：不展示加入确认页，直接回家庭首页
      if (p.isMember) {
        wx.switchTab({ url: '/pages/home/home' });
        return;
      }
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
        full: p.memberCount >= 5,
        myPets: (p.myPets || []).map((pet) => {
          const c = pickAv(pet._id);
          return {
            _id: pet._id,
            av: c.av,
            paw: c.paw,
            avatar: pet.avatar || '',
            name: pet.name || '',
            sub: pet.breed || '',
            archived: !!pet.archived,
            checked: true
          };
        })
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
  togglePet(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      myPets: this.data.myPets.map((p) => (p._id === id ? Object.assign({}, p, { checked: !p.checked }) : p))
    });
  },
  onJoin: guard('join', async function () {
    const toast = this.selectComponent('#toast');
    if (!this.data.familyId || this.data.previewFailed) {
      if (toast) toast.show(this.data.previewFailed ? '预览加载失败，暂不能加入' : '邀请链接无效');
      return;
    }
    const petIds = this.data.myPets.filter((p) => p.checked).map((p) => p._id);
    try {
      await familyService.join(this.data.familyId, petIds);
      if (toast) toast.show('已加入家庭空间');
      // 加入家庭后引导开启微信提醒：弹自绘引导弹窗（sub-guide），
      // 用户在弹窗里点「去开启」这次新的点击才调系统授权，满足手势调用栈约束；
      // 已持久授权/已拒绝时 guide 直接返回，不打扰。处理完（或跳过）再回首页。
      await subscription.guide('family_join');
      wx.switchTab({ url: '/pages/home/home' });
    } catch (e) {
      if (toast) toast.show((e && e.message) || '加入失败');
    }
  }, { flag: 'joining' })
});
