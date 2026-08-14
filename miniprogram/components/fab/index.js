/**
 * fab —— 浮动按钮（设计文档 §7.9，首页「+」）
 *
 * 属性：
 *   shrink  Boolean  false  滚动超过一屏时缩小为 88rpx + 透明度 0.85（回顶恢复）
 *
 * 事件：
 *   tap()  点击
 *
 * 示例：
 *   wxml: <fab shrink="{{scrolled}}" bindtap="openQuickPanel"
 *           style="position: fixed; right: 32rpx; bottom: calc(env(safe-area-inset-bottom) + 48rpx);" />
 *
 * 说明：112rpx 圆形 Primary 实心 + 米白「+」线性图标 + --shadow-fab 染色投影；
 * 全产品唯一允许回弹的组件：按下回弹 3%（250ms 弹性曲线）。
 * 「+」色用 var(--bg-page)：浅色=米白 #FAF6EF，深色随 Primary 反转为深底（§2.2）。
 */
var icons = require('../icons.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    shrink: { type: Boolean, value: false }
  },

  data: {
    plusUri: icons.maskIcon('plus')
  },

  methods: {
    onTap: function () {
      this.triggerEvent('tap', {});
    }
  }
});
