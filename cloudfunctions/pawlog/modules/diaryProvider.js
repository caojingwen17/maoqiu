const https = require('https');
const http = require('http');
const { URL } = require('url');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./diaryPrompt.js');
const CONFIG = require('../config.js');

const TIMEOUT_DEFAULT = 8000;

function enabled() {
  const explicit = String(CONFIG.DIARY_LLM.enabled || '').toLowerCase();
  if (explicit === 'false' || explicit === '0') return false;
  if (explicit === 'true' || explicit === '1') return true;
  return Boolean(CONFIG.DIARY_LLM.baseUrl && CONFIG.DIARY_LLM.apiKey);
}

function config() {
  const timeoutMs = Number(CONFIG.DIARY_LLM.timeoutMs) || TIMEOUT_DEFAULT;
  return {
    base: String(CONFIG.DIARY_LLM.baseUrl || '').replace(/\/$/, ''),
    key: String(CONFIG.DIARY_LLM.apiKey || ''),
    model: String(CONFIG.DIARY_LLM.model || 'qwen-plus'),
    timeoutMs: Math.max(3000, Math.min(timeoutMs, 15000))
  };
}

function requestJson(url, body, key, timeoutMs) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch (e) { reject(new Error('LLM_API_BASE 无效')); return; }
    const payload = JSON.stringify(body);
    const transport = target.protocol === 'http:' ? http : https;
    let settled = false;
    let hardTimer;
    let response;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (hardTimer) clearTimeout(hardTimer);
      fn(value);
    };
    const req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: (target.pathname || '/') + (target.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: 'Bearer ' + key
      },
      timeout: timeoutMs
    }, (res) => {
      response = res;
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('error', (err) => finish(reject, err));
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch (e) { finish(reject, new Error('模型返回不是 JSON')); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          finish(reject, new Error((data && data.error && data.error.message) || '模型接口请求失败'));
          return;
        }
        finish(resolve, data);
      });
    });
    // socket timeout 对 DNS/建立连接阶段并不总是可靠，额外加硬超时避免函数悬挂。
    hardTimer = setTimeout(() => {
      const error = new Error('模型接口超时（' + timeoutMs + 'ms）');
      // 直接 settle Promise；仅 destroy request 在已收到响应头的情况下
      // 不一定触发 request 的 error 事件，可能导致调用方永久等待。
      finish(reject, error);
      if (response && !response.destroyed) response.destroy(error);
      if (!req.destroyed) req.destroy(error);
    }, timeoutMs);
    req.on('timeout', () => req.destroy(new Error('模型接口超时（' + timeoutMs + 'ms）')));
    req.on('error', (err) => finish(reject, err));
    req.write(payload);
    req.end();
  });
}

function extractContent(result) {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }
  if (Array.isArray(result.output)) {
    const chunks = [];
    // Responses 可能同时包含 reasoning 和 message，只读取最终 assistant message。
    const messages = result.output.filter((item) => item && (item.type === 'message' || item.role === 'assistant' || item.message));
    (messages.length ? messages : result.output.filter((item) => item && item.type !== 'reasoning')).forEach((item) => {
      if (item && item.type === 'message' && typeof item.text === 'string') chunks.push(item.text);
      if (item && Array.isArray(item.content)) {
        item.content.forEach((part) => {
          const text = part && (part.text || part.output_text || part.content || part.value);
          if (typeof text === 'string' && text.trim()) chunks.push(text);
        });
      }
      const messageText = item && item.message && item.message.content;
      if (typeof messageText === 'string' && messageText.trim()) chunks.push(messageText);
    });
    if (chunks.length) return chunks.join('\n').trim();
  }
  // 保留 Chat Completions 兼容解析，便于后续切换供应商。
  const value = result.choices && result.choices[0] && result.choices[0].message;
  return value && typeof value.content === 'string' ? value.content.trim() : '';
}

function parseJson(raw) {
  const cleaned = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  // 模型偶尔会在 JSON 前后附带一句说明，提取第一个完整对象再解析。
  for (let start = 0; start < cleaned.length; start++) {
    if (cleaned[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (e) { break; }
        }
      }
    }
  }
  throw new Error('模型输出格式无效');
}

function normalizeOwnerTitle(input) {
  const value = input && input.pet && String(input.pet.ownerTitle || '').trim();
  // 称呼不设白名单：用户填了什么就用什么，没填统一「主人」
  return value || '主人';
}

function normalizeDiaryAddress(value, input) {
  if (!value || typeof value !== 'object') return value;
  const title = normalizeOwnerTitle(input);
  const replaceAddress = (text) => {
    // 只处理宠物常见的想念/感谢式直呼；“你在做什么”等带主人动作的句子保留给校验拦截。
    let out = String(text || '')
      .replace(/(想|想念|喜欢|爱|等|谢谢)你/g, '$1' + title)
      .replace(/(想|想念|喜欢|爱|等|谢谢)您/g, '$1' + title);
    if (title !== '主人') out = out.replace(/主人/g, title);
    return out;
  };
  return {
    title: replaceAddress(value.title),
    content: replaceAddress(value.content)
  };
}

function validDiary(value) {
  if (!value || typeof value !== 'object') return false;
  const title = String(value.title || '').trim();
  const content = String(value.content || '').trim();
  if (!title || title.length > 12 || content.length < 80 || content.length > 180) return false;
  if (/[\u{1F300}-\u{1FAFF}]|[#*_`]/u.test(title)) return false;
  // 日记是宠物自己的内心独白，禁止退化成直接写给人的二人称书信。
  if (/[你您]/.test(title) || /[你您]/.test(content)) return false;
  if (!/[我俺]|本[汪喵]/.test(content)) return false;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(content)) return false;
  if (/毕竟我是|我是个(?:吃货|安静|活泼|高冷|胆小)|我很(?:吃货|安静|活泼|高冷|胆小)/.test(content)) return false;
  if (/时光|岁月|光阴|心里开花|灯都变暖|治愈系|人生哲理|命运|流淌|暖暖的|温柔|宁静|静好|安然/.test(title + content)) return false;
  if (/模型|提示词|数据库|只有我|你不陪我|去死|自杀/.test(content)) return false;
  return { title, content };
}

async function generate(input) {
  if (!enabled()) throw Object.assign(new Error('日记模型未启用'), { code: 'DIARY_DISABLED' });
  const cfg = config();
  if (!cfg.base || !cfg.key) throw Object.assign(new Error('日记模型配置不完整'), { code: 'DIARY_NOT_CONFIGURED' });
  // 与饭桶宝现有的百炼调用保持一致：Responses API 对 qwen3.x 文本模型更稳定。
  const endpoint = cfg.base.endsWith('/responses') ? cfg.base : cfg.base + '/responses';
  console.log('[diary][llm] request', { model: cfg.model, endpoint, timeoutMs: cfg.timeoutMs });
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userText = buildUserPrompt(input, attempt > 0);
      const result = await requestJson(endpoint, {
        model: cfg.model,
        reasoning: { effort: 'none' },
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
          { role: 'user', content: [{ type: 'input_text', text: userText }] }
        ]
      }, cfg.key, cfg.timeoutMs);
      const rawContent = extractContent(result);
      console.log('[diary][llm] output meta', { attempt: attempt + 1, chars: rawContent.length, first: rawContent.slice(0, 1), last: rawContent.slice(-1) });
      const parsed = parseJson(rawContent);
      const normalized = normalizeDiaryAddress(parsed, input);
      const valid = validDiary(normalized);
      if (valid) return { title: valid.title, content: valid.content, model: cfg.model };
      lastError = new Error('模型输出未通过日记内容校验');
    } catch (e) {
      lastError = e;
      console.warn('[diary][llm] attempt failed', { attempt: attempt + 1, message: e && e.message ? e.message : String(e) });
    }
  }
  throw lastError || new Error('模型生成失败');
}

module.exports = { enabled, config, generate, validDiary, normalizeDiaryAddress, parseJson, extractContent };
