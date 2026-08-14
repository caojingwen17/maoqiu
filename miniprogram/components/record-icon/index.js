/**
 * record-icon —— 记录类型线性图标（设计文档 §9 + §2.4 色板）
 *
 * 属性：
 *   type   String  'custom'  16 种记录类型/提醒分类：
 *                            weight 体重 / vaccine 疫苗 / deworm 驱虫 / surgery 手术
 *                            groom 洗护 / walk 遛狗 / milestone 里程碑 / water 饮水
 *                            medical 就医 / medication 用药 / feed 喂食 / expense 花销
 *                            poop 便便 / vomit 呕吐 / heat 发情 / custom 自定义
 *   size   String  '56rpx'   尺寸（时间线 56rpx，无底圆形、纯描边）
 *   color  String  ''        描边色；默认自动取 §2.4 类型色，传值可覆盖（如 'var(--text-tertiary)'）
 *
 * 事件：无
 *
 * 示例：
 *   <record-icon type="vaccine" />
 *   <record-icon type="weight" size="48rpx" color="var(--text-tertiary)" />
 *
 * 说明：图标为 SVG path 描边（1.5px 等宽、几何化、转角微圆），以 CSS mask 渲染，
 * 颜色由 background 决定；类型色映射内置（§2.4 照抄）。
 */
var icons = require('../icons.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    type: {
      type: String,
      value: 'custom',
      observer: function () { this._update(); }
    },
    size: { type: String, value: '56rpx' },
    color: {
      type: String,
      value: '',
      observer: function () { this._update(); }
    }
  },

  data: {
    iconUri: '',
    iconColor: icons.RECORD_COLORS.custom
  },

  lifetimes: {
    attached: function () { this._update(); }
  },

  methods: {
    _update: function () {
      var type = this.data.type;
      var name = icons.RECORD_ICONS[type] || 'custom';
      this.setData({
        iconUri: icons.maskIcon(name),
        iconColor: this.data.color || icons.RECORD_COLORS[type] || icons.RECORD_COLORS.custom
      });
    }
  }
});
