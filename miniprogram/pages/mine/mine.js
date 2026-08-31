const app = getApp();
const userService = require('../../services/user.js');
const homeService = require('../../services/home.js');
const { startOfDay, DAY } = require('../../utils/date.js');
const share = require('../../utils/share.js');
const tracker = require('../../utils/tracker.js');
const { guard } = require('../../utils/guard.js');

Page({
  data: {
    sb: 20,
    loading: true, // 首次加载中（paw-loading 全屏动效）
    // 我的资料（头像昵称 · 自主填写，对齐《账号与登录设计》）
    me: { nickName: '', avatarUrl: '', familyNick: '' },
    showProfile: false,
    editNickName: '',
    editFamilyNick: '',
    editAvatarUrl: '',
    // 三组设置（条目 value 由 loadMine 按真实数据填充）
    groups: [
      {
        title: '协作与数据',
        items: [
          { icon: 'paw', color: '#3E362C', label: '家庭成员', value: '', url: '/pages/members/members' },
          { icon: 'box', color: '#4E8A68', label: '囤货', value: '', url: '/pages/stock/stock' },
          { icon: 'coin', color: '#C08A4E', label: '记账与预算', value: '', url: '/pages/expense/expense' },
          { icon: 'fileText', color: '#8A8378', label: '归档宠物', value: '', url: '/pages/archive/archive' }
        ]
      },
      {
        title: '工具箱',
        items: [
          { icon: 'calc', color: '#C08A4E', label: '年龄换算', url: '/pages/toolbox/age/age' },
          { icon: 'bowl', color: '#B0803B', label: '喂食量计算', url: '/pages/toolbox/feed/feed' },
          { icon: 'search', color: '#5A9EA8', label: '安全食物查询', url: '/pages/toolbox/food/food' }
        ]
      },
      {
        title: '关于',
        items: [
          { share: true, icon: 'heart', color: '#C77F9A', label: '推荐给朋友', sub: '分享小程序卡片给微信好友' },
          { noIcon: true, label: '版本', value: 'v' + versionText() }
        ]
      }
    ]
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },
  onShow() {
    tracker.track(tracker.EVENTS.TAB_SHOW, { tab: 'mine' });
    Promise.allSettled([this.loadProfile(), this.loadMine()]).then(() => {
      if (this.data.loading) this.setData({ loading: false });
    });
  },

  async loadProfile() {
    try {
      const d = await userService.getProfile();
      this.setData({
        me: { nickName: d.nickName || '', avatarUrl: d.avatarUrl || '', familyNick: d.familyNick || '' },
        _budget: typeof d.budget === 'number' ? d.budget : null
      });
    } catch (e) {
      // 资料加载失败不阻塞页面
    }
  },

  // 协作与数据组的真实摘要：成员数 / 囤货状态 / 本月花销 / 归档数
  async loadMine() {
    try {
      const agg = await homeService.aggregate();
      const memberCount = ((agg && agg.members) || []).length;
      const expense = (agg && agg.strip && agg.strip.monthExpense) || 0;
      const budget = this.data._budget;
      this.setData({
        'groups[0].items[0].value': memberCount ? memberCount + ' 位成员' : '',
        'groups[0].items[1].value': invSummary(agg && agg.inventories),
        'groups[0].items[2].value': '本月 ¥' + expense + (budget ? ' / ¥' + budget : ''),
        'groups[0].items[3].value': agg && agg.archivedCount ? agg.archivedCount + ' 只 · 可恢复' : ''
      });
    } catch (e) {
      // 摘要加载失败保留空 value，不影响入口跳转
    }
  },

  onTap(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  onShareAppMessage() {
    return share.shareAppMessage();
  },
  onShareTimeline() {
    return share.shareTimeline();
  },

  // ===== 资料编辑（chooseAvatar + nickname input，主动触发，非登录页） =====
  openProfile() {
    this.setData({
      showProfile: true,
      editNickName: this.data.me.nickName,
      editFamilyNick: this.data.me.familyNick,
      editAvatarUrl: this.data.me.avatarUrl
    });
  },
  closeProfile() {
    this.setData({ showProfile: false });
  },
  onChooseAvatar(e) {
    // 临时路径（微信侧已做安全检测），保存时上传转永久 URL
    const temp = e.detail && e.detail.avatarUrl;
    if (temp) this.setData({ editAvatarUrl: temp });
  },
  onNickInput(e) {
    this.setData({ editNickName: e.detail.value });
  },
  onFamilyNickInput(e) {
    this.setData({ editFamilyNick: e.detail.value });
  },
  saveProfile: guard('profile', async function () {
    const toast = this.selectComponent('#toast');
    const payload = {
      nickName: this.data.editNickName,
      familyNick: this.data.editFamilyNick
    };
    // 头像临时路径 → 上传云存储转永久 URL
    // 临时路径可能是 wxfile://、http://tmp/（真机）或 http://127.0.0.1/...（开发者工具），
    // 只有 cloud:// fileID 和 https:// 永久外链才算已上传
    const av = this.data.editAvatarUrl;
    const isTemp = av && av.indexOf('cloud://') !== 0 && av.indexOf('https://') !== 0;
    if (isTemp) {
      try {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'avatars/' + Date.now() + '.jpg',
          filePath: av
        });
        payload.avatarUrl = up.fileID;
      } catch (e) {
        // 上传失败降级：不落头像，仅保存昵称
      }
    } else if (av) {
      payload.avatarUrl = av;
    }
    try {
      await userService.saveProfile(payload);
      this.setData({
        showProfile: false,
        me: Object.assign({}, this.data.me, payload)
      });
      if (toast) toast.show('已保存资料');
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败');
    }
  }, { flag: 'saving' })
});

/** 版本号：体验版/开发版 version 可能为空，回退 1.0.0 */
function versionText() {
  try {
    const info = wx.getAccountInfoSync();
    const v = info && info.miniProgram && info.miniProgram.version;
    return v || '1.0.0';
  } catch (e) {
    return '1.0.0';
  }
}

/** 囤货摘要：x 件临期（含已过期） · x 件该补货；无囤货返回空串 */
function invSummary(list) {
  if (!list || !list.length) return '';
  const now = startOfDay(Date.now());
  const soon = now + 7 * DAY;
  let exp = 0;
  let low = 0;
  list.forEach((it) => {
    if (it.expireDate) {
      const t = new Date(String(it.expireDate).replace(/-/g, '/')).getTime();
      if (t && t <= soon) exp += 1; // 已过期或 7 天内到期
    }
    const remain = typeof it.remainAmount === 'number' ? it.remainAmount : null;
    const th = typeof it.threshold === 'number' ? it.threshold : null;
    if (remain === 0 || (remain !== null && th !== null && th > 0 && remain <= th)) low += 1;
  });
  const parts = [];
  if (exp) parts.push(exp + ' 件临期');
  if (low) parts.push(low + ' 件该补货');
  return parts.length ? parts.join(' · ') : '库存充足';
}
