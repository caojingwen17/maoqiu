/**
 * 提醒核心规则单测（node 直接运行，不依赖 wx-server-sdk）
 *   node __tests__/reminder.test.js
 * 覆盖 PRD §9.1 / §9.2 的核心演进规则与去重 / 补催窗口。
 */

const assert = require('assert');
const core = require('../modules/reminderCore.js');

const DAY = core.DAY;
const T0 = Date.UTC(2026, 7, 14, 21, 0, 0); // 2026-08-14 21:00 UTC 基准

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name);
    console.log('    ', e.message);
  }
}

console.log('提醒规则单测：');

test('daily 周期推进 +1 天', () => {
  assert.strictEqual(core.nextRemindAt(T0, 'daily'), T0 + DAY);
});

test('weekly 周期推进 +7 天', () => {
  assert.strictEqual(core.nextRemindAt(T0, 'weekly'), T0 + 7 * DAY);
});

test('custom_days 周期推进 +N 天（默认 1）', () => {
  assert.strictEqual(core.nextRemindAt(T0, 'custom_days', 30), T0 + 30 * DAY);
  assert.strictEqual(core.nextRemindAt(T0, 'custom_days', undefined), T0 + DAY);
});

test('monthly 周期推进保留日（跨月收敛到月末）', () => {
  const jan31 = Date.UTC(2026, 0, 31, 21, 0, 0);
  const next = core.nextRemindAt(jan31, 'monthly');
  const d = new Date(next);
  assert.strictEqual(d.getUTCMonth(), 1); // 二月
  assert.strictEqual(d.getUTCDate(), 28); // 收敛到 2 月最后一天（2026 非闰年）
});

test('monthly 普通月推进 +1 月', () => {
  const mar5 = Date.UTC(2026, 2, 5, 21, 0, 0);
  const d = new Date(core.nextRemindAt(mar5, 'monthly'));
  assert.strictEqual(d.getUTCMonth(), 3); // 四月
  assert.strictEqual(d.getUTCDate(), 5);
});

test('yearly 周期推进：2 月 29 日在非闰年收敛到 2 月 28 日', () => {
  const leap = new Date(2028, 1, 29, 9, 0, 0, 0).getTime();
  const next = new Date(core.nextRemindAt(leap, 'yearly'));
  assert.strictEqual(next.getMonth(), 1);
  assert.strictEqual(next.getDate(), 28);
});

test('none（一次性）nextRemindAt 返回 null', () => {
  assert.strictEqual(core.nextRemindAt(T0, 'none'), null);
});

test('完成：一次性提醒 → done', () => {
  const r = { remindAt: T0, repeatType: 'none', status: 'active' };
  assert.deepStrictEqual(core.complete(r), { status: 'done' });
});

test('完成：周期提醒 → active 且 remindAt 推进', () => {
  const r = { remindAt: T0, repeatType: 'weekly', repeatDays: undefined, status: 'active' };
  const out = core.complete(r);
  assert.strictEqual(out.status, 'active');
  assert.strictEqual(out.remindAt, T0 + 7 * DAY);
});

test('延后：remindAt += N 天，周期不变', () => {
  const r = { remindAt: T0, repeatType: 'monthly', status: 'active' };
  const out = core.postpone(r, 3);
  assert.strictEqual(out.remindAt, T0 + 3 * DAY);
  assert.strictEqual(r.repeatType, 'monthly'); // 原对象周期未改
});

test('延后默认 3 天', () => {
  assert.strictEqual(core.postpone({ remindAt: T0 }, undefined).remindAt, T0 + 3 * DAY);
});

test('待办可见：remindAt 提前窗口内才显示', () => {
  const now = T0;
  const r = { status: 'active', remindAt: T0 + 6 * DAY, advanceDays: 7 };
  assert.strictEqual(core.isDue(r, now), true); // 6 天后到期，在 7 天窗口内
});

test('待办不可见：超出提前窗口', () => {
  const now = T0;
  const r = { status: 'active', remindAt: T0 + 10 * DAY, advanceDays: 7 };
  assert.strictEqual(core.isDue(r, now), false);
});

test('待办不可见：非 active 状态', () => {
  const r = { status: 'done', remindAt: T0, advanceDays: 7 };
  assert.strictEqual(core.isDue(r, T0), false);
});

test('默认提前天数 7', () => {
  const r = { status: 'active', remindAt: T0 + 7 * DAY };
  assert.strictEqual(core.isDue(r, T0), true); // 正好 7 天边界
  const r2 = { status: 'active', remindAt: T0 + 7 * DAY + 1 };
  assert.strictEqual(core.isDue(r2, T0), false);
});

test('去重键：同宠物同 category 一致', () => {
  const a = { petId: 'p1', category: 'vaccine' };
  const b = { petId: 'p1', category: 'vaccine' };
  const c = { petId: 'p1', category: 'deworm_internal' };
  assert.strictEqual(core.dedupeKey(a), core.dedupeKey(b));
  assert.notStrictEqual(core.dedupeKey(a), core.dedupeKey(c));
});

// ---- 时区统一（timeUtil，Asia/Shanghai 基准）----
const timeUtil = require('../modules/timeUtil.js');

test('startOfDay 按上海时区对齐（UTC 16:00 为上海次日 00:00）', () => {
  assert.strictEqual(timeUtil.startOfDay(Date.UTC(2026, 7, 16, 15, 59, 59)), Date.UTC(2026, 7, 15, 16));
  assert.strictEqual(timeUtil.startOfDay(Date.UTC(2026, 7, 16, 16, 0, 0)), Date.UTC(2026, 7, 16, 16));
});

test('reminderCore.startOfDay 与 timeUtil 一致（不再用服务器本地时区）', () => {
  assert.strictEqual(core.startOfDay, timeUtil.startOfDay);
  assert.strictEqual(core.startOfDay(Date.UTC(2026, 7, 16, 16, 0, 0)), Date.UTC(2026, 7, 16, 16));
});

test('shanghaiTs/shanghaiParts 往返一致', () => {
  const ts = timeUtil.shanghaiTs(2026, 8, 17, '09:30');
  const p = timeUtil.shanghaiParts(ts);
  assert.strictEqual(p.year, '2026');
  assert.strictEqual(p.month, '08');
  assert.strictEqual(p.day, '17');
  assert.strictEqual(ts, Date.UTC(2026, 7, 17, 1, 30));
});

test('startOfMonth / shiftMonthStart 按上海时区自然月', () => {
  assert.strictEqual(timeUtil.startOfMonth(Date.UTC(2026, 7, 16, 16)), Date.UTC(2026, 6, 31, 16)); // 2026-08-01 00:00 上海
  assert.strictEqual(timeUtil.shiftMonthStart(Date.UTC(2026, 7, 16, 16), -1), Date.UTC(2026, 5, 30, 16)); // 2026-07-01 上海
});

// ---- schema 写入校验加强 ----
const { validateWrite } = require('../schema.js');

test('reminders.remindAt 范围校验：过去超 1 小时 / 非正数拒绝，未来允许', () => {
  const now = Date.now();
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: now - 2 * 3600 * 1000 }, {}).ok, false);
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: 0 }, {}).ok, false);
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: '明天' }, {}).ok, false);
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: now + 3600 * 1000 }, {}).ok, true);
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: now - 30 * 60 * 1000 }, {}).ok, true); // 1h 内允许（立即触发）
});

test('records.data 已知字段校验：weight/amount/nextDate', () => {
  assert.strictEqual(validateWrite('records', { type: 'weight', data: { weight: '12' } }, {}).ok, false);
  assert.strictEqual(validateWrite('records', { type: 'weight', data: { weight: 600 } }, {}).ok, false);
  assert.strictEqual(validateWrite('records', { type: 'weight', data: { weight: 12.5 } }, {}).ok, true);
  assert.strictEqual(validateWrite('records', { type: 'expense', data: { amount: -1 } }, {}).ok, false);
  assert.strictEqual(validateWrite('records', { type: 'vaccine', data: { nextDate: '2026-09-01' } }, {}).ok, false);
  assert.strictEqual(validateWrite('records', { type: 'vaccine', data: { nextDate: Date.now() + 86400000, custom: '保留' } }, {}).ok, true); // 未知字段宽松保留
});

test('settings 白名单移除 kickedFrom（客户端不可自写）', () => {
  assert.strictEqual(validateWrite('settings', { kickedFrom: '某家庭' }, { partial: true }).ok, false);
  assert.strictEqual(validateWrite('settings', { nickName: '毛球' }, { partial: true }).ok, true);
});

test('pets.name / note 长度上限接入 config', () => {
  assert.strictEqual(validateWrite('pets', { name: 'a'.repeat(13), species: 'dog', gender: 'male' }, {}).ok, false);
  assert.strictEqual(validateWrite('pets', { name: 'a'.repeat(12), species: 'dog', gender: 'male' }, {}).ok, true);
  assert.strictEqual(validateWrite('records', { type: 'daily', note: 'n'.repeat(501) }, {}).ok, false);
  assert.strictEqual(validateWrite('reminders', { title: 't', remindAt: Date.now() + 1000, note: 'n'.repeat(501) }, {}).ok, false);
});

test('补催：当天到期且未补催过 → 补催', () => {
  const now = T0;
  const r = { status: 'active', remindAt: T0, advanceDays: 7 };
  assert.strictEqual(core.shouldNudge(r, now), true);
});

test('补催：当天已补催过 → 不再补催', () => {
  const now = T0 + 8 * 60 * 60 * 1000; // 同日 05:00
  const r = { status: 'active', remindAt: T0, advanceDays: 7, lastNudgeAt: T0 + 60 * 60 * 1000 };
  assert.strictEqual(core.shouldNudge(r, now), false);
});

test('补催：非当天到期的提醒不补催', () => {
  const now = T0;
  const tomorrow = T0 + DAY;
  const r = { status: 'active', remindAt: tomorrow, advanceDays: 7 };
  assert.strictEqual(core.shouldNudge(r, now), false);
});

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) {
  process.exit(1);
}
