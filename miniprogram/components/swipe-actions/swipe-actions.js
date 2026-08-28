Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    actions: { type: Array, value: [] }, // [{ label, color, bg }]
    actionWidth: { type: Number, value: 130 }, // rpx per action
    disabled: { type: Boolean, value: false }
  },
  data: {
    offset: 0,        // 当前拖出的距离（0=关闭，-max=全开），rpx
    reveal: 0,        // 按钮层的 translateX（max=藏在右缘外，0=完全滑入），rpx
    revealOpacity: 0, // 按钮层透明度：随滑入从 0 渐变到 1
    moving: false     // 手指拖动中：禁用过渡，避免每帧 setData 被动画拖住
  },
  observers: {
    // actions 就绪后把按钮层初始藏到右缘外（reveal = 总宽度）
    'actions, actionWidth': function (actions, actionWidth) {
      this._max = (actions || []).length * (actionWidth || 130);
      if (this.data.offset === 0) {
        this.setData({ reveal: this._max, revealOpacity: 0 });
      }
    }
  },
  methods: {
    maxOffset() {
      return this._max || this.data.actions.length * this.data.actionWidth;
    },
    onStart(e) {
      if (this.data.disabled) return;
      const t = e.touches[0];
      this._startX = t.clientX;
      this._startY = t.clientY;
      this._base = this.data.offset;
      this._dir = null;
      this._moved = false;
    },
    onMove(e) {
      if (this.data.disabled) return;
      const t = e.touches[0];
      const dx = t.clientX - this._startX;
      const dy = t.clientY - this._startY;
      if (!this._dir) {
        this._dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (this._dir !== 'h') return;
      let o = this._base + dx * this._rpxRatio();
      const max = this.maxOffset();
      if (o > 0) o = 0;
      if (o < -max) o = -max;
      if (o === this.data.offset) return;
      this._moved = true;
      this._apply(o, true);
    },
    onEnd() {
      if (this.data.disabled) return;
      if (!this._moved) return;
      this._moved = false;
      const max = this.maxOffset();
      const target = this.data.offset < -max / 2 ? -max : 0;
      // 先摘掉 moving 让过渡恢复，下一帧再吸附，开/关都有动画
      this.setData({ moving: false });
      if (target !== this.data.offset) {
        setTimeout(() => {
          this._apply(target, false);
          this.triggerEvent('openchange', { open: target < 0 });
        }, 20);
      } else {
        this.triggerEvent('openchange', { open: target < 0 });
      }
    },
    onAction(e) {
      const index = Number(e.currentTarget.dataset.index);
      this.triggerEvent('action', { index, action: this.data.actions[index] });
      this._apply(0, false);
    },
    close() {
      this._apply(0, false);
    },
    // 统一写入三件套：位移 / 按钮层位置 / 按钮层透明度
    _apply(offset, moving) {
      const max = this.maxOffset();
      this.setData({
        offset,
        moving,
        reveal: max + offset,
        revealOpacity: max ? (-offset / max) : 0
      });
    },
    // px -> rpx：offset 以 rpx 为单位写入样式，触摸位移是 px，需要换算
    _rpxRatio() {
      if (!this._ratio) {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this._ratio = 750 / (info.windowWidth || 375);
      }
      return this._ratio;
    }
  }
});
