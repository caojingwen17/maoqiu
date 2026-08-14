// config.js
// 云函数配置常量（占位值需在上线前替换）

// 订阅消息模板 ID（占位，需在微信公众平台申请模板后替换）
// 模板字段约定（申请模板时按此选型）：thing1 提醒内容 / date2 到期时间 / thing3 备注
var SUBSCRIBE_TEMPLATE_ID = 'TEMPLATE_ID_PLACEHOLDER';

// 默认周期（天），与 PRD §4.5 对齐；用户设置会覆盖
var DEFAULT_CYCLES = {
  dewormInternal: 90,
  dewormExternal: 30,
  vaccine: 365,
  bath: 30,
};

// 提醒默认提前展示天数
var DEFAULT_ADVANCE_DAYS = 7;

// 一次性删除的最大批量（云函数单批 where 删除上限 1000）
var BATCH_LIMIT = 1000;

module.exports = {
  SUBSCRIBE_TEMPLATE_ID: SUBSCRIBE_TEMPLATE_ID,
  DEFAULT_CYCLES: DEFAULT_CYCLES,
  DEFAULT_ADVANCE_DAYS: DEFAULT_ADVANCE_DAYS,
  BATCH_LIMIT: BATCH_LIMIT,
};
