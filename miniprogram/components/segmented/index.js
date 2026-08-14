/**
 * segmented —— 分段选择器（设计文档 §7.11，iOS 标配件）
 *
 * 属性：
 *   items    Array   []   选项文字数组，如 ['时间线', '健康', '花销', '相册']
 *   current  Number  0    当前选中下标
 *
 * 事件：
 *   change(detail: {index})  切换选项
 *
 * 示例：
 *   <segmented items="{{tabs}}" current="{{tab}}" bindchange="onTab" />
 *
 * 说明：容器 BG-Fill/radius-s；滑块白底小阴影，300ms var(--snap) 滑动，
 * 宽度实测文字自适应（SelectorQuery 测量）；切换带 light 触觉反馈。
 */
var utils = require('../utils.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    items: {
      type: Array,
      value: [],
      observer: function () { this._measure(); }
    },
    current: {
      type: Number,
      value: 0,
      observer: function () { this._updateSlider(); }
    }
  },

  data: {
    sliderStyle: 'left: 0px; width: 0px;'
  },

  lifetimes: {
    ready: function () { this._measure(); }
  },

  methods: {
    _measure: function () {
      var self = this;
      // 等下一帧渲染完再量
      setTimeout(function () {
        self.createSelectorQuery()
          .selectAll('.seg-item')
          .boundingClientRect(function (rects) {
            self._rects = rects || [];
            self._updateSlider();
          })
          .exec();
      }, 50);
    },

    _updateSlider: function () {
      var rects = this._rects;
      var i = this.data.current;
      if (!rects || !rects[i]) return;
      // left 以 .seg padding-box 为基准，item 0 前还有 4rpx 容器内边距
      var left = rects[i].left - rects[0].left + utils.rpx2px(4);
      this.setData({
        sliderStyle: 'left: ' + left + 'px; width: ' + rects[i].width + 'px;'
      });
    },

    onTap: function (e) {
      var index = e.currentTarget.dataset.index;
      if (index === this.data.current) return;
      utils.haptic('light'); // §6.5 Chip 选中
      this.setData({ current: index });
      this.triggerEvent('change', { index: index });
    }
  }
});
