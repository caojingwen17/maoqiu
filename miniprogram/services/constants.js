// constants.js
// 前端侧云函数配置引用：与 cloudfunctions/pawlog/config.js 的常量名约定保持一致
// 小程序端无法直接 require 云函数目录，此处手动同步；上线前需替换占位值

// 订阅消息模板 ID（占位，需在微信公众平台申请模板后替换，同步自云端 SUBSCRIBE_TEMPLATE_ID）
var SUBSCRIBE_TEMPLATE_ID = 'TEMPLATE_ID_PLACEHOLDER';

module.exports = {
  SUBSCRIBE_TEMPLATE_ID: SUBSCRIBE_TEMPLATE_ID,
};
