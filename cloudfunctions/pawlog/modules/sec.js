/**
 * 微信内容安全：文本 msgSecCheck(v2)、图片 imgSecCheck（运营规范 §5.18 / §10.2）
 * @see https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/msgSecCheck.html
 *
 * 策略：云端写入路径统一拦截（客户端零直连数据库，所有 UGC 必经此处）；
 * 检测接口本身故障时 fail-closed（拒绝写入），避免违规内容落库。
 */

const cloud = require('wx-server-sdk');

const TEXT_VIOLATION = { code: 'CONTENT_RISKY', message: '内容包含违规信息，请修改后重试' };
const IMAGE_VIOLATION = { code: 'CONTENT_RISKY', message: '图片包含违规信息，请更换后重试' };
const SEC_FAIL = { code: 'SEC_CHECK_FAIL', message: '内容安全检测失败，请稍后重试' };

/** scene: 1=资料（昵称/名称），2=评论，3=论坛，4=社交日志（记录/备注/标题） */
const SCENE = { profile: 1, post: 4 };

function safeStr(v) {
  return v === undefined || v === null ? '' : String(v);
}

function isRiskySuggest(suggest) {
  return suggest === 'risky' || suggest === 'review';
}

function isViolationError(e) {
  const msg = safeStr((e && e.errMsg) || (e && e.message) || e);
  const code = e && (e.errCode != null ? e.errCode : e.errcode);
  return code === 87014 || msg.indexOf('87014') > -1 || msg.indexOf('risky') > -1 || msg.indexOf('违规') > -1;
}

function isViolationResult(res) {
  if (!res) return false;
  const code = res.errCode != null ? res.errCode : res.errcode;
  if (code === 87014) return true;
  return isRiskySuggest(res.result && res.result.suggest);
}

/**
 * 文本校验：多段文本合并分片送检（单片和单字段上限均为 2500 字）。
 * @param {string} openid 发布者 openid（v2 必传）
 * @param {string[]} texts 待检文本（空值自动过滤）
 * @param {number} scene 场景值，默认 4（社交日志）
 */
async function assertTextsSafe(openid, texts, scene) {
  const parts = (texts || []).map((t) => safeStr(t).trim()).filter(Boolean);
  if (!parts.length) return;
  const content = parts.join('\n');
  const CHUNK = 2500;
  try {
    for (let i = 0; i < content.length; i += CHUNK) {
      const res = await cloud.openapi.security.msgSecCheck({
        openid,
        scene: scene || SCENE.post,
        version: 2,
        content: content.slice(i, i + CHUNK)
      });
      if (isRiskySuggest(res && res.result && res.result.suggest)) throw TEXT_VIOLATION;
    }
  } catch (e) {
    if (e === TEXT_VIOLATION || isViolationError(e)) throw TEXT_VIOLATION;
    console.warn('[sec] msgSecCheck 接口异常:', safeStr((e && e.errMsg) || (e && e.message)));
    throw SEC_FAIL;
  }
}

/** 图片 buffer 校验（imgSecCheck 单张上限 1MB，上传前小程序侧已压缩） */
async function assertImageBufferSafe(buffer) {
  if (!buffer || !buffer.length) return;
  try {
    const res = await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/jpeg', value: buffer }
    });
    if (isViolationResult(res)) throw IMAGE_VIOLATION;
  } catch (e) {
    if (e === IMAGE_VIOLATION || isViolationError(e)) throw IMAGE_VIOLATION;
    console.warn('[sec] imgSecCheck 接口异常:', safeStr((e && e.errMsg) || (e && e.message)));
    throw SEC_FAIL;
  }
}

/** 云存储图片校验：fileID → 下载 → imgSecCheck；非 cloud:// 直接跳过 */
async function assertCloudImageSafe(fileID) {
  const id = safeStr(fileID).trim();
  if (!id || id.indexOf('cloud://') !== 0) return;
  let dl;
  try {
    dl = await cloud.downloadFile({ fileID: id });
  } catch (e) {
    console.warn('[sec] 下载待检图片失败:', id.slice(-24), safeStr((e && e.errMsg) || (e && e.message)));
    throw SEC_FAIL;
  }
  const buf = dl && dl.fileContent;
  if (!buf) throw SEC_FAIL;
  await assertImageBufferSafe(buf);
}

/** 批量图片校验（记录照片最多 9 张） */
async function assertCloudImagesSafe(fileIDs) {
  const ids = (fileIDs || []).filter((f) => safeStr(f).indexOf('cloud://') === 0);
  for (const id of ids) {
    await assertCloudImageSafe(id);
  }
}

module.exports = {
  SCENE,
  assertTextsSafe,
  assertImageBufferSafe,
  assertCloudImageSafe,
  assertCloudImagesSafe,
  isViolationResult,
  TEXT_VIOLATION,
  IMAGE_VIOLATION,
  SEC_FAIL
};
