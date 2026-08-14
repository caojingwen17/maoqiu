/**
 * skeleton —— 骨架屏（设计文档 §7.2）
 *
 * 属性：
 *   type  String  'card'  card=单张信息卡 / list=列表行组 / home=首页（统计卡+双列卡片网格）
 *
 * 事件：无
 *
 * 示例：
 *   <skeleton type="home" wx:if="{{loading}}" />
 *
 * 说明：形状与真实布局 1:1，禁用任何文字占位；shimmer 为 120rpx 斜向高光带
 * 1.4s 一轮扫过。高光带色值无 token，深色模式透明度 0.08 需组件内媒体查询（§7.2）。
 */
Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    type: { type: String, value: 'card' }
  },

  data: {
    rows: [0, 1, 2],
    cards: [0, 1, 2, 3]
  }
});
