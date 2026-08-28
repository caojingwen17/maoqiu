/**
 * 埋点（PRD §17）
 * 关键埋点：首页曝光、添加宠物成功、各类型记录提交、提醒完成率、工具箱使用
 * 当前为本地 console + 待接入正式统计的桩；不阻塞业务
 */

const EVENTS = {
  HOME_SHOW: 'home_show',
  PET_CREATED: 'pet_created',
  RECORD_SUBMIT: 'record_submit',
  REMINDER_DONE: 'reminder_done',
  REMINDER_POSTPONE: 'reminder_postpone',
  TOOL_USED: 'tool_used',
  DIARY_ATTEMPT: 'diary_attempt',
  DIARY_GENERATED: 'diary_generated',
  DIARY_SKIPPED: 'diary_skipped',
  DIARY_FAILED: 'diary_failed',
  DIARY_OPEN: 'diary_open',
  DIARY_READ: 'diary_read',
  SUBSCRIPTION_GUIDE_SHOW: 'subscription_guide_show',
  SUBSCRIPTION_REQUEST: 'subscription_request',
  SUBSCRIPTION_ACCEPT: 'subscription_accept',
  SUBSCRIPTION_REJECT: 'subscription_reject',
  SUBSCRIPTION_GRANT_RECORDED: 'subscription_grant_recorded',
  NOTIFICATION_SEND_SUCCESS: 'notification_send_success',
  NOTIFICATION_SEND_FAILED: 'notification_send_failed'
};

function track(event, props) {
  const payload = Object.assign({ event, at: Date.now() }, props || {});
  // 仅本地调试输出；正式接入统计 SDK 时在此替换
  console.log('[track]', payload);
  return payload;
}

module.exports = {
  EVENTS,
  track
};
