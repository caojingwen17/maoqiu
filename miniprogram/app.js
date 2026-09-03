const envList = require('./envList.js');

App({
  globalData: {
    openid: null,
    familyId: null,
    // 被移出 / 家庭解散后的启动拦截态：'none' | 'kicked'
    kicked: 'none',
    kickedName: '',
    statusBarHeight: 20,
    navBarHeight: 64
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: envList.env || 'cloud1-0000000000000000000000000000',
        traceUser: true
      });
    }
    // 只读取订阅状态，不在生命周期中申请授权；授权必须由用户点击触发。
    try { require('./services/subscription.js').refresh(); } catch (e) { /* ignore */ }
    // 深浅主题：应用本地偏好（tabBar 运行时配色）并监听系统主题变化
    try { require('./utils/theme.js').init(); } catch (e) { /* ignore */ }
    this.initWindow();
    this.boot();
  },

  onShow() {
    // 切前台时原生 tabBar/窗口配色可能被微信重置，重申主题偏好
    try { require('./utils/theme.js').applyTabBar(); } catch (e) { /* ignore */ }
  },

  // 启动守卫：检测是否被移出/解散（settings.kickedFrom），用于全屏拦截
  boot() {
    // 提前解析并缓存 familyId（api.js 顶层注入，云函数走快路径省一次 settings 查询）；失败静默，下次调用自愈
    this.resolveFamily();
    const settingsService = require('./services/settings.js');
    settingsService.get()
      .then((d) => {
        if (d && d.kickedFrom) {
          this.globalData.kicked = 'kicked';
          this.globalData.kickedName = d.kickedFrom;
        }
      })
      .catch(() => {});
  },

  // 计算状态栏/导航栏高度，供自定义导航页使用（暗合 iOS 自定义导航）
  initWindow() {
    try {
      const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const statusBarHeight = w.statusBarHeight || 20;
      const navBarHeight = statusBarHeight + 44;
      this.globalData.statusBarHeight = statusBarHeight;
      this.globalData.navBarHeight = navBarHeight;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
      this.globalData.navBarHeight = 64;
    }
  },

  // 解析当前家庭空间（供需要家庭上下文的页面调用）
  resolveFamily() {
    const familyService = require('./services/family.js');
    return familyService.resolve()
      .then((d) => {
        this.globalData.familyId = (d && d.familyId) || this.globalData.familyId;
        return { familyId: this.globalData.familyId };
      })
      .catch(() => ({ familyId: this.globalData.familyId }));
  },

  // 被移出/解散 → 回到个人空间（清空 kickedFrom 标记）
  backToMine() {
    this.globalData.kicked = 'none';
    this.globalData.kickedName = '';
    const settingsService = require('./services/settings.js');
    return settingsService.update({ kickedFrom: '' }).catch(() => {});
  }
});
