const app = getApp();
const { pickAv } = require('../../utils/avatar.js');
const { fmtDateCn } = require('../../utils/date.js');
const familyService = require('../../services/family.js');
const { guard } = require('../../utils/guard.js');

const theme = require('../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    loading: true, // 首次加载中（paw-loading 全屏动效）
    family: { name: '我的档案袋', sub: '共 0 位成员' },
    members: [],
    selectedOpenid: '',
    showSheet: false,
    showDissolve: false,
    dissolveInput: '',
    familyId: '',
    isOwner: false,
    selfOpenid: '',
    // 统一确认弹窗（p-dialog）：退出家庭
    dlgLeave: false
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
      const f = await familyService.resolve();
      const members = (f.members || []).map((m) => {
        const c = pickAv(m.openid);
        const name = displayName(m);
        return {
          openid: m.openid,
          name,
          // 填了家庭内称呼时，副标题带出微信昵称，统一「称呼 + 昵称」展示
          joined: (name !== ((m.nickname || '') + '').trim() && (m.nickname || '').trim()
            ? (m.nickname || '').trim() + ' · ' : '') + fmtDateCn(m.joinedAt) + ' 加入',
          avatar: m.avatar || '',
          av: c.av,
          paw: c.paw,
          owner: (m.openid === f.ownerOpenid) || m.role === 'owner'
        };
      });
      this.setData({
        family: { name: f.name || '我的档案袋', sub: '共 ' + members.length + ' 位成员' },
        members,
        familyId: f.familyId || '',
        selfOpenid: f.openid || '',
        isOwner: f.ownerOpenid === f.openid,
        loading: false
      });
    } catch (e) {
      console.error('[members] 加载失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/mine/mine' });
  },
  onShareAppMessage() {
    if (!this.data.familyId) {
      wx.showToast({ title: '正在加载家庭信息', icon: 'none' });
      return {
        title: '邀请你一起记录宠物档案',
        path: '/pages/invite/invite',
        imageUrl: '/assets/invite-share.png'
      };
    }
    // 分享即发起一次邀请：云端记录 lastInviteAt，preview/join 据此做 7 天过期校验（满员时静默失败即可）
    familyService.invite().catch(() => null);
    return {
      title: this.data.family.name ? '邀请加入「' + this.data.family.name + '」一起记录宠物' : '邀请你一起记录宠物档案',
      path: '/pages/invite/invite?familyId=' + encodeURIComponent(this.data.familyId),
      imageUrl: '/assets/invite-share.png'
    };
  },

  async onLeave() {
    this.setData({ dlgLeave: true });
  },
  closeLeave() {
    this.setData({ dlgLeave: false });
  },
  confirmLeave: guard('leave', async function () {
    this.closeLeave();
    try { await familyService.leave(); wx.showToast({ title: '已退出', icon: 'none' }); setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 400); }
    catch (e) { wx.showToast({ title: (e && e.message) || '退出失败', icon: 'none' }); }
  }),

  // 解散为危险操作：名称确认弹窗（输入与家庭名完全一致才允许解散）
  onDissolve() {
    this.setData({ showDissolve: true, dissolveInput: '' });
  },
  closeDissolve() {
    this.setData({ showDissolve: false });
  },
  onDissolveInput(e) {
    this.setData({ dissolveInput: e.detail.value });
  },
  confirmDissolve: guard('dissolve', async function () {
    if (this.data.dissolveInput !== this.data.family.name) return;
    this.setData({ showDissolve: false });
    try { await familyService.dissolve(); wx.showToast({ title: '已解散', icon: 'none' }); setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 400); }
    catch (e) { wx.showToast({ title: (e && e.message) || '解散失败', icon: 'none' }); }
  }),
  onMember(e) {
    const m = this.data.members[e.currentTarget.dataset.idx];
    if (m && !m.owner) {
      this.setData({ selectedOpenid: m.openid, showSheet: true });
    }
  },
  closeSheet() {
    this.setData({ showSheet: false });
  },
  onRemove: guard('remove', async function () {
    const toast = this.selectComponent('#toast');
    this.setData({ showSheet: false });
    if (!this.data.selectedOpenid) return;
    try {
      await familyService.removeMember(this.data.selectedOpenid);
      if (toast) toast.show('已移出该成员');
      this.loadData();
    } catch (e) {
      if (toast) toast.show((e && e.message) || '操作失败');
    }
  })
});

// 显示名：家庭内称呼 > 微信昵称 > 「家庭成员」（快照里 familyNick/nickname 分字段存储）
function displayName(m) {
  return ((m.familyNick || '') + '').trim() || ((m.nickname || '') + '').trim() || '家庭成员';
}
