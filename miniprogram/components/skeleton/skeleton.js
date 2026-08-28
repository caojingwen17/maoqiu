Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    // 传入形状数组：[{w, h, r, mt}]，单位 rpx；不传走默认空态
    shapes: { type: Array, value: [] }
  },
  data: {
    list: []
  },
  observers: {
    shapes(v) {
      const list = (v && v.length ? v : [
        { w: 600, h: 40, r: 20, mt: 0 },
        { w: 480, h: 40, r: 20, mt: 26 },
        { w: 680, h: 32, r: 16, mt: 26 }
      ]);
      this.setData({ list });
    }
  },
  lifetimes: {
    attached() {
      const v = this.data.shapes && this.data.shapes.length
        ? this.data.shapes
        : [{ w: 600, h: 40, r: 20, mt: 0 }, { w: 480, h: 40, r: 20, mt: 26 }];
      this.setData({ list: v });
    }
  }
});