/** 定时任务统一入口：按触发器显式分流，未知触发器直接拒绝（避免新增触发器时静默跑错任务）。 */
const diary = require('./diary.js');
const notification = require('./notification.js');

module.exports = async function run(ctx) {
  const triggerName = (ctx && ctx.triggerName) || '';
  if (triggerName === 'reminderCron') {
    const reminders = await notification.runCron();
    return { enabled: true, trigger: triggerName, diary: { enabled: false }, reminders: { enabled: true, ...reminders } };
  }
  if (triggerName === 'diaryCron') {
    const diaryResult = await diary.runCron();
    return { enabled: true, trigger: triggerName, diary: diaryResult, reminders: { enabled: true } };
  }
  console.warn('[cron] 未知或未命名触发器，未执行任何任务:', triggerName || '(empty)');
  return { enabled: false, trigger: triggerName, reason: 'unknown trigger' };
};
