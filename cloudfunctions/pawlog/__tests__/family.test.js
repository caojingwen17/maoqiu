/**
 * 家庭空间核心规则单测（node 直接运行，不依赖 wx-server-sdk）
 *   node __tests__/family.test.js
 * 覆盖 PRD §15 加入前置校验（含单空间红线全等判断）与 §16 携带宠物清单清洗。
 */

const assert = require('assert');
const core = require('../modules/familyCore.js');

const NOW = Date.UTC(2026, 7, 28, 12, 0, 0); // 2026-08-28 12:00 UTC 基准
const DAY = core.DAY;

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

/** 造一个可加入的目标家庭 */
function family(overrides) {
  return Object.assign({
    _id: 'personal_ownerA',
    name: '我的档案袋',
    ownerOpenid: 'ownerA',
    members: [
      { openid: 'ownerA', nickname: 'A', role: 'owner' },
      { openid: 'memberB', nickname: 'B', role: 'member' }
    ],
    lastInviteAt: NOW - 1 * DAY
  }, overrides || {});
}

const B = { openid: 'userB', familyId: 'personal_ownerA', previousFamilyId: 'personal_userB', now: NOW };

console.log('家庭空间规则单测：');

test('正常加入：在自己个人空间 → 放行，petIds 清洗返回', () => {
  const r = core.checkJoin(family(), Object.assign({}, B, { petIds: ['p1', 'p2'] }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.petIds, ['p1', 'p2']);
});

test('guard 修复：当前在他人空间（personal_<他人> 也以 personal_ 开头）必须拒绝', () => {
  // 旧实现用 startsWith('personal_') 判断，会把该情况误放行并搬走他人家庭数据
  const r = core.checkJoin(family(), Object.assign({}, B, { previousFamilyId: 'personal_ownerC' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'ALREADY_IN_FAMILY');
});

test('guard：previousFamilyId 等于目标空间但非成员（指针残留自愈场景）放行', () => {
  const r = core.checkJoin(family(), Object.assign({}, B, { previousFamilyId: 'personal_ownerA' }));
  assert.strictEqual(r.ok, true);
});

test('guard：无 previousFamilyId（首次进入即受邀）放行', () => {
  const r = core.checkJoin(family(), Object.assign({}, B, { previousFamilyId: '' }));
  assert.strictEqual(r.ok, true);
});

test('已在目标家庭 → EXISTS', () => {
  const r = core.checkJoin(family(), Object.assign({}, B, { openid: 'memberB' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'EXISTS');
});

test('满员 → FULL', () => {
  const members = ['o', 'm1', 'm2', 'm3', 'm4'].map((o) => ({ openid: o }));
  const r = core.checkJoin(family({ members }), Object.assign({}, B));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'FULL');
});

test('邀请过期（超过 7 天）→ INVITE_EXPIRED', () => {
  const r = core.checkJoin(family({ lastInviteAt: NOW - 8 * DAY }), Object.assign({}, B));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'INVITE_EXPIRED');
});

test('邀请 7 天边界内放行；lastInviteAt 缺失（历史数据）不拦截', () => {
  assert.strictEqual(core.checkJoin(family({ lastInviteAt: NOW - 7 * DAY - 1 }), B).ok, false);
  assert.strictEqual(core.checkJoin(family({ lastInviteAt: NOW - 7 * DAY + 1000 }), B).ok, true);
  assert.strictEqual(core.checkJoin(family({ lastInviteAt: undefined }), B).ok, true);
});

test('空间已解散 → NOT_FOUND', () => {
  const r = core.checkJoin(family({ dissolved: true }), Object.assign({}, B));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'NOT_FOUND');
});

test('petIds 清洗：非数组视为全部不带', () => {
  assert.deepStrictEqual(core.checkJoin(family(), Object.assign({}, B, { petIds: undefined })).petIds, []);
  assert.deepStrictEqual(core.checkJoin(family(), Object.assign({}, B, { petIds: 'p1' })).petIds, []);
  assert.deepStrictEqual(core.checkJoin(family(), Object.assign({}, B, { petIds: null })).petIds, []);
});

test('petIds 清洗：剔除非字符串与空串并去重', () => {
  const r = core.checkJoin(family(), Object.assign({}, B, { petIds: ['p1', 'p1', '', 42, null, 'p2'] }));
  assert.deepStrictEqual(r.petIds, ['p1', 'p2']);
});

test('petIds 清洗：封顶 50 个', () => {
  const ids = Array.from({ length: 80 }, (_, i) => 'p' + i);
  const r = core.checkJoin(family(), Object.assign({}, B, { petIds: ids }));
  assert.strictEqual(r.petIds.length, core.PET_IDS_MAX);
});

test('personalSpaceId 稳定派生', () => {
  assert.strictEqual(core.personalSpaceId('userB'), 'personal_userB');
});

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
