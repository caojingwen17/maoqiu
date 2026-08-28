/**
 * pawlog 云函数配置：提醒提前量 / 限制常量
 */

module.exports = {
  REMINDER_SUBSCRIBE_TEMPLATE_ID: process.env.REMINDER_SUBSCRIBE_TEMPLATE_ID || 'dx8E4xROB3HiNg9Pj0OTqsLUE5WP0Ja5Mo_cFvFmlPA',
  REMINDER_MINIPROGRAM_STATE: process.env.REMINDER_MINIPROGRAM_STATE || 'formal',
  /**
   * AI 日记模型配置全部从云函数环境变量读取，不写入代码仓库。
   * 推荐千问兼容模式：
   * DIARY_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
   * DIARY_LLM_API_KEY=服务端密钥
   * DIARY_LLM_MODEL=qwen3.5-flash（可替换为已开通的千问文本模型）
   */
  DIARY_LLM: {
    enabled: process.env.DIARY_ENABLED || process.env.DIARY_LLM_ENABLED || '',
    baseUrl: process.env.DIARY_LLM_BASE_URL || process.env.LLM_API_BASE || '',
    apiKey: process.env.DIARY_LLM_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.DIARY_LLM_MODEL || process.env.LLM_MODEL || 'qwen3.5-flash',
    timeoutMs: Number(process.env.DIARY_LLM_TIMEOUT_MS || 8000)
  },
  /** 仅用于云开发控制台验收，生产环境默认关闭 */
  DIARY_MANUAL_TRIGGER: String(process.env.DIARY_MANUAL_TRIGGER || '').toLowerCase() === 'true' || process.env.DIARY_MANUAL_TRIGGER === '1',

  /** 家庭空间成员上限（PRD §4.6） */
  FAMILY_MAX_MEMBERS: 5,

  /** 待办默认提前显示天数（PRD §4.3 advanceDays 默认 7） */
  DEFAULT_ADVANCE_DAYS: 7,

  /** 记录生成周期提醒时使用的内部默认值（不提供设置页；驱虫不派生，统一提醒页手工新建） */
  DEFAULT_CYCLES: {
    vaccine: 365,
    bath: 30
  },

  /** 宠物名最大长度 */
  PET_NAME_MAX: 12,

  /** 记录备注最大长度 */
  NOTE_MAX: 500,

  /** 提醒延期默认天数（完成面板「延后 3 天」） */
  POSTPONE_DAYS: 3,

  /** 提醒延期天数上限（reminder.postpone 入参封顶，防误传超大值） */
  POSTPONE_DAYS_MAX: 30,

  /** waiting_grant 迟发补救窗口：首次发送超 30 分钟窗即过期；已进入等待授权状态的给 24h 补救期 */
  LATE_WINDOW_MS: 24 * 60 * 60 * 1000,

  /** 通知管道清理：投递记录保留天数 / reserved 额度回收阈值 / 每轮清理上限 */
  SWEEP: {
    DELIVERY_KEEP_MS: 30 * 24 * 60 * 60 * 1000,
    GRANT_KEEP_MS: 30 * 24 * 60 * 60 * 1000,
    RESERVED_TIMEOUT_MS: 60 * 60 * 1000,
    BATCH_LIMIT: 500
  }
};
