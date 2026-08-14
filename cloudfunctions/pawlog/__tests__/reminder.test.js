// __tests__/reminder.test.js
// 提醒核心逻辑单测（纯 node，不依赖 wx-server-sdk）
// 运行方式：node cloudfunctions/pawlog/__tests__/reminder.test.js
var assert = require('assert');
var core = require('../modules/reminderCore');

var DAY = core.DAY_MS;
var now = Date.now();

// ---------- 用例 1：completeReminder 周期推进正确 ----------
// 一次性提醒：置 done
var oncePatch = core.applyComplete({ remindAt: now, repeatType: 'none' }, now);
assert.strictEqual(oncePatch.status, 'done', '一次性提醒完成后应为 done');
assert.strictEqual(oncePatch.remindAt, undefined, '一次性提醒不应有新到期时间');

// 每日周期：+1 天
var dailyNext = core.applyComplete({ remindAt: now, repeatType: 'daily' }, now).remindAt;
assert.strictEqual(dailyNext - now, DAY, 'daily 应推进 1 天');

// 每周周期：+7 天
var weeklyNext = core.applyComplete({ remindAt: now, repeatType: 'weekly' }, now).remindAt;
assert.strictEqual(weeklyNext - now, 7 * DAY, 'weekly 应推进 7 天');

// 每月周期：+1 个月（约 30 天，按日历月计算）
var monthlyNext = core.applyComplete({ remindAt: now, repeatType: 'monthly' }, now).remindAt;
var monthDiff = (monthlyNext - now) / DAY;
assert.ok(monthDiff >= 28 && monthDiff <= 31, 'monthly 应推进 1 个日历月');

// 长期未处理（到期时间远在过去）：推进后必须落在未来，不能还是过期状态
var staleNext = core.computeNextRemindAt(now - 40 * DAY, 'weekly', 0, now);
assert.ok(staleNext > now, '过期多周的周期提醒应推进到未来');
assert.ok(staleNext - now <= 7 * DAY, '推进后应在最近一个周期点内');

// ---------- 用例 2：同 petId + category 去重只留一条 active（PRD §9.2） ----------
var newDoc = {
  petId: 'pet1',
  category: 'vaccine',
  title: '狂犬疫苗',
  remindAt: now + 365 * DAY,
  repeatType: 'custom_days',
  repeatDays: 365,
  advanceDays: 7,
  sourceRecordId: 'rec3',
};

// 无存量 -> 创建
var createDecision = core.decideReminderUpsert([], newDoc);
assert.strictEqual(createDecision.action, 'create', '无存量提醒应创建新提醒');
assert.strictEqual(createDecision.doc, newDoc);

// 有存量 -> 更新最早一条，多余的停用
var existing = [
  { _id: 'r-new', petId: 'pet1', category: 'vaccine', status: 'active', createAt: 200 },
  { _id: 'r-old', petId: 'pet1', category: 'vaccine', status: 'active', createAt: 100 },
];
var updateDecision = core.decideReminderUpsert(existing, newDoc);
assert.strictEqual(updateDecision.action, 'update', '有存量提醒应更新而非新增');
assert.strictEqual(updateDecision.id, 'r-old', '应保留创建最早的那条');
assert.deepStrictEqual(updateDecision.disableIds, ['r-new'], '多余的一条应停用');
assert.strictEqual(updateDecision.patch.sourceRecordId, 'rec3', '应更新来源记录');
assert.strictEqual(updateDecision.patch.remindAt, newDoc.remindAt, '应更新到期时间');

// 驱虫内外驱分键：subKey 不同视为不同提醒
var keyInternal = core.cycleDedupeKey({ petId: 'p', category: 'deworm', subKey: 'internal' });
var keyExternal = core.cycleDedupeKey({ petId: 'p', category: 'deworm', subKey: 'external' });
assert.notStrictEqual(keyInternal, keyExternal, '内驱与外驱应各保留一条（PRD §9.2）');

// ---------- 用例 3：custom_days 周期 ----------
// 45 天自定义周期：完成推进 45 天
var customNext = core.applyComplete(
  { remindAt: now, repeatType: 'custom_days', repeatDays: 45 },
  now
).remindAt;
assert.strictEqual(customNext - now, 45 * DAY, 'custom_days 45 应推进 45 天');

// custom_days 长期未处理同样推进到未来
var staleCustom = core.computeNextRemindAt(now - 100 * DAY, 'custom_days', 45, now);
assert.ok(staleCustom > now, '过期的 custom_days 应推进到未来');
assert.ok(staleCustom - now <= 45 * DAY, '推进后应在一个周期内');

// repeatDays 缺失兜底：按 1 天处理且不进入死循环
var fallbackNext = core.computeNextRemindAt(now, 'custom_days', 0, now);
assert.strictEqual(fallbackNext - now, DAY, 'repeatDays 缺失时按 1 天兜底');

console.log('全部 3 组用例通过：周期推进 / 同键去重 / custom_days');
