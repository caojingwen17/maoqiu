/**
 * 通用防重复触发守卫（PRD §5.6 交互防护）
 *
 * 解决的问题：异步操作（保存/删除/加入等）进行中界面缺少反馈，用户以为没点上而连点，
 * 造成重复提交（如日常记录存出两条）。
 *
 * 两层防护：
 *  1. 在飞锁：handler 整段异步期间（含所有 await）同 key 的重复调用直接忽略；
 *  2. 冷却窗：完成后 cooldown 毫秒内仍忽略，吸收「请求很快返回但手指还在点」的连击。
 *
 * 锁挂在页面/组件实例（this）上：同一实例同 key 互斥，不同实例互不影响。
 * options.flag 传入 data 字段名时自动置位/复位，供按钮「处理中…」禁用态渲染。
 *
 * 用法（Page 方法直接包裹，key 按业务动作命名）：
 *   const { guard } = require('../../utils/guard.js');
 *   Page({
 *     onSave: guard('save', async function () { ... }, { flag: 'saving' }),
 *   });
 */

const DEFAULT_COOLDOWN = 500;

function guard(key, fn, options) {
  const opt = options || {};
  const cooldown = opt.cooldown == null ? DEFAULT_COOLDOWN : opt.cooldown;
  const field = '_guard$' + key;
  return async function () {
    const now = Date.now();
    const prev = this[field];
    if (prev) {
      if (prev.running) return;
      if (cooldown > 0 && now - prev.doneAt < cooldown) return;
    }
    const state = { running: true, doneAt: 0 };
    this[field] = state;
    const canFlag = opt.flag && typeof this.setData === 'function';
    if (canFlag) this.setData({ [opt.flag]: true });
    try {
      return await fn.apply(this, arguments);
    } finally {
      state.running = false;
      state.doneAt = Date.now();
      if (canFlag) this.setData({ [opt.flag]: false });
    }
  };
}

module.exports = { guard, DEFAULT_COOLDOWN };
