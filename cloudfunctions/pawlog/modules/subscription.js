/**
 * 一次性订阅消息授权账本。
 * 授权属于 openid，不属于家庭；每次客户端收到 accept 都幂等落一条可用额度。
 */

const crypto = require('crypto');
const { _, COLLECTIONS, col, getDoc, ensureCollections } = require('./db.js');
const CONFIG = require('../config.js');

function hash(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function stateId(openid, templateId) {
  return 'sub_' + hash(openid + '|' + templateId);
}

function grantId(openid, templateId, requestId) {
  return 'grant_' + hash(openid + '|' + templateId + '|' + requestId);
}

function cleanResult(result) {
  return ['accept', 'reject', 'ban'].indexOf(result) > -1 ? result : 'fail';
}

async function sync(ctx) {
  await ensureCollections();
  const { openid } = ctx;
  const p = ctx.payload || {};
  const requestId = String(p.requestId || '').trim();
  const templateId = String(p.templateId || CONFIG.REMINDER_SUBSCRIBE_TEMPLATE_ID).trim();
  const result = cleanResult(p.result);
  const persistentState = ['accept', 'reject', 'once', 'unknown'].indexOf(String(p.persistentState || '')) > -1
    ? String(p.persistentState)
    : 'unknown';
  if (!openid || !requestId) throw { code: 'INVALID', message: '缺少订阅授权请求标识' };
  if (templateId !== CONFIG.REMINDER_SUBSCRIBE_TEMPLATE_ID) throw { code: 'INVALID', message: '订阅模板不匹配' };

  const now = Date.now();
  const sid = stateId(openid, templateId);
  const gid = grantId(openid, templateId, requestId);
  const existing = await getDoc(COLLECTIONS.messageGrants, gid);

  const baseState = {
    _openid: openid,
    templateId,
    lastResult: result,
    persistentState,
    lastRequestAt: now,
    updateAt: now
  };
  if (result === 'accept' && !existing) {
    await col(COLLECTIONS.messageGrants).doc(gid).set({ data: {
      _openid: openid,
      templateId,
      requestId,
      source: String(p.source || 'unknown').slice(0, 40),
      status: 'available',
      persistentChoice: persistentState === 'accept',
      createAt: now,
      updateAt: now
    } });
    baseState.acceptedCount = _.inc(1);
    console.log('[track]', {
      event: 'subscription_grant_recorded',
      openid: String(openid).slice(0, 4) + '***',
      templateId,
      requestId: requestId.slice(0, 8) + '***'
    });
  }
  if (result !== 'accept') baseState.lastFailureAt = now;

  const current = await getDoc(COLLECTIONS.messageSubscriptions, sid);
  if (current) {
    await col(COLLECTIONS.messageSubscriptions).doc(sid).update({ data: baseState });
  } else {
    const initial = Object.assign({
      _openid: openid,
      templateId,
      acceptedCount: result === 'accept' ? 1 : 0,
      sentCount: 0,
      createAt: now
    }, baseState);
    if (result === 'accept') initial.acceptedCount = 1;
    await col(COLLECTIONS.messageSubscriptions).doc(sid).set({ data: Object.assign({
      _openid: openid,
      templateId,
      acceptedCount: 0,
      sentCount: 0,
      createAt: now
    }, initial) });
  }
  return { recorded: result === 'accept', duplicate: !!existing, state: result };
}

module.exports = { sync, stateId, grantId };
