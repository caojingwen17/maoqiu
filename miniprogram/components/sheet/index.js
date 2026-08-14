/**
 * sheet —— 底部弹层（设计文档 §7.7）
 *
 * 属性：
 *   visible  Boolean  false   显示/隐藏（升起 500ms var(--spring) + 遮罩淡入）
 *   height   String   'half'  half=50%（选择器类）/ full=92%（表单类）
 *   title    String   ''      头部标题（毛玻璃区域）
 *
 * 事件：
 *   close()  关闭（点遮罩 / 下拉手势惯性关闭后触发，页面应把 visible 置 false）
 *
 * 方法：无
 *
 * 示例：
 *   <sheet visible="{{show}}" title="选择餐次" bindclose="show=false">
 *     <view>内容</view>
 *   </sheet>
 *
 * 说明：内容走默认 slot；下拉拖拽跟手，速度/距离超过阈值惯性关闭（§6.2）；
 * half 档上推超过阈值自动吸附到 full（§7.7）。
 */
Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: function (v) {
        if (v) this._open(); else this._animateOut();
      }
    },
    height: { type: String, value: 'half' },
    title: { type: String, value: '' }
  },

  data: {
    rendered: false,   // 是否在 DOM 中
    active: false,     // 是否已升起到位
    dragY: 0,          // 跟手位移 px
    dragging: false,
    expanded: false    // half 上推吸附到 full
  },

  methods: {
    _open: function () {
      var self = this;
      this.setData({ rendered: true, dragY: 0, expanded: false }, function () {
        // 下一帧再激活，确保从 -100% 升起有过渡
        setTimeout(function () { self.setData({ active: true }); }, 30);
      });
    },

    _animateOut: function () {
      if (!this.data.rendered) return;
      var self = this;
      this.setData({ active: false, dragging: false, dragY: 0 });
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(function () {
        self.setData({ rendered: false });
      }, 520); // 与 500ms spring 过渡对齐
    },

    onMaskTap: function () {
      this.triggerEvent('close');
    },

    /* —— 下拉手势：跟手 + 惯性关闭 / half 上推吸附 full —— */
    onHeaderTouchStart: function (e) {
      var t = e.touches[0];
      this._touchY = t.clientY;
      this._touchT = Date.now();
      this.setData({ dragging: true });
    },

    onHeaderTouchMove: function (e) {
      if (this._touchY === undefined) return;
      var dy = e.touches[0].clientY - this._touchY;
      this.setData({ dragY: dy });
    },

    onHeaderTouchEnd: function (e) {
      if (this._touchY === undefined) return;
      var dy = this.data.dragY;
      var dt = Math.max(1, Date.now() - this._touchT);
      var velocity = dy / dt; // px/ms
      this._touchY = undefined;
      this.setData({ dragging: false });

      if (dy < -80 && this.data.height === 'half' && !this.data.expanded) {
        // 上推吸附到 92% 档
        this.setData({ dragY: 0, expanded: true });
        return;
      }
      if (dy > 140 || velocity > 0.5) {
        // 惯性关闭
        this.setData({ dragY: 0 });
        this.triggerEvent('close');
        return;
      }
      this.setData({ dragY: 0 });
    }
  }
});
