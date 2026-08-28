/**
 * 毛球档案袋 PawLog · 单云函数入口
 *
 * 架构（对应 产品架构与数据流图.md §3 收敛为单函数）：
 *  - 统一入口，按 action 路由到 modules/*；
 *  - 请求人 openid 经 getWXContext 注入；
 *  - resolveFamily：首次进入自动建个人空间（PRD §4.6）；
 *  - members 校验中间件：除 family.join 外，所有操作前校验请求人属于目标 familyId（G2 红线）；
 *  - 定时器触发（event.Type === 'Timer' / TriggerName，兼容小写）走 cron。
 *
 * 返回约定：{ code: 0, data } 成功；{ code: <非0>, message } 失败（PRD §5.3 错误归一化）。
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const dbUtil = require('./modules/db.js');
const home = require('./modules/home.js');
const pet = require('./modules/pet.js');
const record = require('./modules/record.js');
const reminder = require('./modules/reminder.js');
const inventory = require('./modules/inventory.js');
const family = require('./modules/family.js');
const stats = require('./modules/stats.js');
const settings = require('./modules/settings.js');
const cron = require('./modules/cron.js');
const diary = require('./modules/diary.js');
const subscription = require('./modules/subscription.js');

/** 需要校验成员归属的 action（family.join 例外：被邀请人此时尚非成员） */
const MEMBER_REQUIRED = new Set([
  'home.aggregate',
  'pet.create', 'pet.update', 'pet.remove', 'pet.archive',
  'record.create', 'record.update', 'record.remove', 'record.list', 'record.photos', 'record.get',
  'reminder.create', 'reminder.update', 'reminder.complete', 'reminder.postpone', 'reminder.disable', 'reminder.ignore', 'reminder.list',
  'diary.list', 'diary.markRead', 'diary.manualGenerate',
  'subscription.sync',
  'inventory.inbound', 'inventory.consume', 'inventory.update', 'inventory.remove', 'inventory.list',
  'family.invite', 'family.leave', 'family.removeMember', 'family.dissolve', 'family.resolve',
  'stats.summary',
  'settings.update',
]);

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext() || {};
  const openid = wxContext.OPENID || '';

  // 定时器触发：微信云开发真实事件为大写 SCF 风格（Type: "Timer" / TriggerName），
  // 小写 type/triggerName 兼容控制台手动测试的传参
  const triggerName = (event && (event.TriggerName || event.triggerName || event.name)) || '';
  if (event && (event.Type === 'Timer' || event.type === 'timer' || triggerName)) {
    try {
      const data = await cron({ openid: '', familyId: '', triggerName });
      return { code: 0, data };
    } catch (e) {
      console.error('[pawlog][cron]', e);
      return { code: e.code || 500, message: e.message || 'cron 执行失败' };
    }
  }

  const action = (event && event.action) || '';
  const payload = (event && event.payload) || {};
  // 客户端缓存的家庭空间 id（顶层字段，不进 payload，避免撞 schema 白名单）：
  // 命中时跳过 resolveFamily 的 settings 查询，成员校验仍会权威执行（安全性不变）
  const hintedFamilyId = (event && typeof event.familyId === 'string' && event.familyId) || '';

  if (!action) return { code: 'NO_ACTION', message: '缺少 action' };

  // 云开发控制台测试调用通常没有 OPENID；手动验收入口在显式开关下允许直接按 petId 查找。
  if (action === 'diary.manualGenerate' && !openid) {
    try {
      return { code: 0, data: await diary.manualGenerateConsole(payload) };
    } catch (e) {
      console.error('[pawlog][diary.manualGenerate.console]', e);
      return { code: e.code || 500, message: e.message || '手动日记生成失败' };
    }
  }

  try {
    let ctx;
    if (action === 'family.join') {
      // 加入家庭：目标空间来自邀请落地页 payload.familyId，此时请求人尚非成员
      const resolved = await dbUtil.resolveFamily(openid);
      const familyId = payload.familyId;
      if (!familyId) return { code: 'INVALID', message: '缺少 familyId' };
      const fam = await dbUtil.getDoc(dbUtil.COLLECTIONS.families, familyId);
      if (!fam || fam.dissolved) return { code: 'NOT_FOUND', message: '家庭空间不存在或已解散' };
      ctx = { openid, familyId, family: fam, payload, previousFamilyId: resolved.familyId };
    } else if (MEMBER_REQUIRED.has(action)) {
      // 快路径：客户端带了缓存的 familyId 就直接校验（少一次 settings 查询）；
      // 校验失败再回退 resolveFamily 权威解析（缓存过期/被移出/换空间都能自愈）
      let familyId = hintedFamilyId;
      let check = familyId ? await dbUtil.assertMember(openid, familyId) : null;
      if (!check || !check.ok) {
        const resolved = await dbUtil.resolveFamily(openid);
        if (resolved.familyId !== familyId) {
          familyId = resolved.familyId;
          check = await dbUtil.assertMember(openid, familyId);
        }
      }
      if (!check || !check.ok) {
        return { code: (check && check.kicked) ? 'KICKED' : 'FORBIDDEN', message: (check && check.error) || '无权访问' };
      }
      ctx = { openid, familyId, family: check.family, payload };
    } else {
      // 不涉及家庭归属的动作（settings.* 属于个人），familyId 仅作兜底上下文
      const resolved = await dbUtil.resolveFamily(openid);
      ctx = { openid, familyId: resolved.familyId, family: { members: [] }, payload };
    }

    const data = await route(action, ctx);
    return { code: 0, data };
  } catch (e) {
    console.error('[pawlog][' + action + ']', e);
    const code = (e && e.code) || 500;
    const message = (e && e.message) || '网络开小差了，请重试';
    return { code, message };
  }
};

async function route(action, ctx) {
  switch (action) {
    case 'home.aggregate':
      return home(ctx);

    case 'pet.create': return pet.create(ctx);
    case 'pet.update': return pet.update(ctx);
    case 'pet.remove': return pet.remove(ctx);
    case 'pet.archive': return pet.archive(ctx);

    case 'record.create': return record.create(ctx);
    case 'record.update': return record.update(ctx);
    case 'record.remove': return record.remove(ctx);
    case 'record.list': return record.list(ctx);
    case 'record.photos': return record.photos(ctx);
    case 'record.get': return record.get(ctx);

    case 'reminder.create': return reminder.create(ctx);
    case 'reminder.update': return reminder.update(ctx);
    case 'reminder.complete': return reminder.complete(ctx);
    case 'reminder.postpone': return reminder.postpone(ctx);
    case 'reminder.disable': return reminder.disable(ctx);
    case 'reminder.ignore': return reminder.ignore(ctx);
    case 'reminder.list': return reminder.list(ctx);

    case 'inventory.inbound': return inventory.inbound(ctx);
    case 'inventory.list': return inventory.list(ctx);
    case 'inventory.consume': return inventory.consume(ctx);
    case 'inventory.update': return inventory.update(ctx);
    case 'inventory.remove': return inventory.remove(ctx);

    case 'family.invite': return family.invite(ctx);
    case 'family.join': return family.join(ctx);
    case 'family.leave': return family.leave(ctx);
    case 'family.removeMember': return family.removeMember(ctx);
    case 'family.dissolve': return family.dissolve(ctx);
    case 'family.resolve': return family.resolve(ctx);
    case 'family.preview': return family.preview(ctx);

    case 'stats.summary': return stats(ctx);

    case 'diary.list': return diary.list(ctx);
    case 'diary.markRead': return diary.markRead(ctx);
    case 'diary.manualGenerate': return diary.manualGenerate(ctx);

    case 'subscription.sync': return subscription.sync(ctx);

    case 'settings.get': return settings.get(ctx);
    case 'settings.update': return settings.update(ctx);

    default:
      throw { code: 'NO_ACTION', message: '未知 action: ' + action };
  }
}
