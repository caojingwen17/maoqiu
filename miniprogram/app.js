// app.js
// 全局入口：初始化云能力与全局设置
var envConfig = require('./envList.js');
var settingStore = require('./stores/settingStore.js');

App({
  onLaunch: function () {
    // env 参数决定小程序发起的云开发调用（wx.cloud.xxx）请求到哪个云环境
    // 取 envList 第一个可用项，环境 ID 可在微信开发者工具云开发面板获取
    var env = '';
    var envList = envConfig.envList || [];
    if (envList.length > 0) {
      var first = envList[0];
      env = typeof first === 'string' ? first : (first.envId || '');
    }
    this.globalData = { env: env };
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: env,
        traceUser: true,
      });
    }
    // 初始化全局设置（从本地缓存恢复主题等偏好）
    settingStore.init();
  },
  globalData: {
    env: '',
  },
});
