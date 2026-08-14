// modules/settings.js
// 用户设置模块：每用户一条，无记录返回默认值不落库
var cloud = require('wx-server-sdk');
var schema = require('../schema');
var config = require('../config');

function getDb() {
  return cloud.database();
}

function getOpenid() {
  return cloud.getWXContext().OPENID;
}

// 默认值（PRD §4.5）
function defaultSettings() {
  return {
    theme: 'auto',
    defaultCycles: Object.assign({}, config.DEFAULT_CYCLES),
    advanceDays: config.DEFAULT_ADVANCE_DAYS,
    budget: 0,
    homeLayout: {},
    backupAt: 0,
  };
}

/**
 * 读取用户设置（无则返回默认值）
 * @returns {Object} 设置文档
 */
async function getSettings() {
  var db = getDb();
  var openid = getOpenid();
  var res = await db.collection('settings')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length === 0) {
    return defaultSettings();
  }
  // 用默认值补齐缺字段，防止旧版本数据缺项
  var doc = Object.assign(defaultSettings(), res.data[0]);
  doc.defaultCycles = Object.assign({}, config.DEFAULT_CYCLES, res.data[0].defaultCycles || {});
  return doc;
}

/**
 * 保存用户设置（全量覆盖单条文档）
 * @param {Object} payload {settings}
 */
async function saveSettings(payload) {
  var db = getDb();
  var openid = getOpenid();
  var now = Date.now();
  var patch = schema.validateSettings(payload.settings || {});
  patch.updateAt = now;

  var res = await db.collection('settings')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length > 0) {
    await db.collection('settings').doc(res.data[0]._id).update({ data: patch });
  } else {
    var doc = Object.assign(defaultSettings(), patch);
    doc._openid = openid;
    doc.createAt = now;
    await db.collection('settings').add({ data: doc });
  }
  return null;
}

module.exports = {
  getSettings: getSettings,
  saveSettings: saveSettings,
};
