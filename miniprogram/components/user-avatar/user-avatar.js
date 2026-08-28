const { sketch } = require('../icon/icons.js');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    url: { type: String, value: '' }, // 已上传的头像 URL（云存储永久地址）
    size: { type: Number, value: 96 }, // 边长 rpx
    pawColor: { type: String, value: '#B9AE9E' },
    round: { type: Boolean, value: true } // true=圆形，false=圆角方形
  },
  data: {
    src: ''
  },
  observers: {
    url() { this._render(); },
    pawColor() { this._render(); }
  },
  lifetimes: {
    attached() { this._render(); }
  },
  methods: {
    _render() {
      if (this.data.url) {
        this.setData({ src: '' });
        return;
      }
      this.setData({ src: sketch('framePaw', this.data.pawColor) });
    }
  }
});