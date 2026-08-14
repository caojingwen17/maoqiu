/**
 * empty-state —— 空状态占位（设计文档 §7.10 + PRD §5.2）
 *
 * 属性：
 *   image   String  'paw-box'  场景插画：paw-box（猫爪档案盒）/ dog（躺平的狗）/
 *                              chart（图表）/ calendar（日历）
 *   title   String  ''         标题（Title-3/Text-Primary）
 *   desc    String  ''         说明（Subhead/Text-Secondary）
 *   btnText String  ''         按钮文案（Secondary 按钮，为空不显示）
 *
 * 事件：
 *   btnTap()  按钮点击
 *
 * 示例：
 *   <empty-state image="paw-box" title="还没有毛孩子"
 *     desc="添加第一只，开始记录" btnText="添加" bindbtnTap="goAdd" />
 *
 * 说明：单色素描风插画（Primary 40% 透明度，mask 渲染走 token，深色自动生效）；
 * 入场插画上浮淡入 400ms。
 */
var icons = require('../icons.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    image: {
      type: String,
      value: 'paw-box',
      observer: function (image) {
        this.setData({ sketchUri: icons.sketchIcon(image) });
      }
    },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    btnText: { type: String, value: '' }
  },

  data: {
    sketchUri: icons.sketchIcon('paw-box')
  },

  methods: {
    onBtnTap: function () {
      this.triggerEvent('btnTap', {});
    }
  }
});
