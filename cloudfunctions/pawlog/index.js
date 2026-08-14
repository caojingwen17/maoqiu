// index.js
// 毛球档案袋 PawLog 核心云函数入口：单函数多 action 路由
// 约定：返回 {code: 0, data} 成功；{code, msg} 失败（4xx 参数/权限，5xx 内部错误）
var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var pet = require('./modules/pet');
var record = require('./modules/record');
var reminder = require('./modules/reminder');
var home = require('./modules/home');
var stats = require('./modules/stats');
var settings = require('./modules/settings');

// action 路由表：与 miniprogram/services/ 各方法一一对应
var routes = {
  // 宠物
  listPets: pet.listPets,
  getPet: pet.getPet,
  savePet: pet.savePet,
  deletePet: pet.deletePet,
  reorderPets: pet.reorderPets,
  // 记录
  saveRecord: record.saveRecord,
  getTimeline: record.getTimeline,
  updateRecord: record.updateRecord,
  deleteRecord: record.deleteRecord,
  // 提醒
  listReminders: reminder.listReminders,
  getTodos: reminder.getTodos,
  completeReminder: reminder.completeReminder,
  snoozeReminder: reminder.snoozeReminder,
  disableReminder: reminder.disableReminder,
  createReminder: reminder.createReminder,
  // 首页聚合
  getHomeData: home.getHomeData,
  // 统计
  getStats: stats.getStats,
  // 设置
  getSettings: settings.getSettings,
  saveSettings: settings.saveSettings,
};

exports.main = async function (event) {
  var action = event.action;
  var payload = event.payload || {};

  // 定时触发器入口（config.json 配置的 remindPush 每小时触发）
  if (event.Type === 'timer' || action === 'remindPush') {
    try {
      var pushResult = await reminder.remindPush();
      return { code: 0, data: pushResult };
    } catch (err) {
      console.error('[remindPush] 执行失败:', err);
      return { code: 500, msg: err.message || '推送任务失败' };
    }
  }

  var handler = routes[action];
  if (!handler) {
    return { code: 404, msg: '未知操作: ' + action };
  }
  try {
    var data = await handler(payload);
    return { code: 0, data: data === undefined ? null : data };
  } catch (err) {
    console.error('[' + action + '] 失败:', err);
    return { code: err.code || 500, msg: err.msg || err.message || '服务器开小差了' };
  }
};
