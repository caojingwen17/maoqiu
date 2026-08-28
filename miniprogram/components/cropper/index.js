/**
 * p-cropper · 正方形裁剪浮层（对齐微信上传头像体验）
 * 交互：movable-area + movable-view 双指缩放 / 拖动（原生手势，最稳）
 * 输出：canvas 2d 按取景框区域绘制，wx.canvasToTempFilePath 导出正方形临时文件
 * 事件：bind:confirm（detail.tempFilePath）/ bind:cancel
 */
const OUT_MAX = 800; // 输出边长上限：头像足够，同时避开 canvas 尺寸上限

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    show: { type: Boolean, value: false },
    src: { type: String, value: '' }
  },
  data: {
    ready: false, // 图片信息就绪后才渲染 movable-view，保证初始 x/y/scale 生效
    areaStyle: '',
    frameStyle: '',
    maskTop: '',
    maskBottom: '',
    maskLeft: '',
    maskRight: '',
    viewW: 0,
    viewH: 0,
    x: 0,
    y: 0,
    scale: 1,
    out: 300 // 离屏 canvas 边长（px），确认时按实际裁剪尺寸重设
  },
  observers: {
    'show, src': function (show, src) {
      if (show && src) this._init();
    }
  },
  lifetimes: {
    attached() {
      const w = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const safeBottom = w.safeArea ? Math.max(0, w.screenHeight - w.safeArea.bottom) : 0;
      this._win = { w: w.windowWidth, h: w.windowHeight, safeBottom };
    }
  },
  methods: {
    _init() {
      wx.getImageInfo({
        src: this.data.src,
        success: (info) => this._layout(info.width, info.height),
        fail: () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
          this.triggerEvent('cancel');
        }
      });
    },

    // 依据图片原始尺寸计算布局：默认缩放到刚好铺满取景框并居中
    _layout(natW, natH) {
      const winW = this._win.w;
      const winH = this._win.h;
      const barH = Math.round(150 * winW / 750) + this._win.safeBottom; // 底部操作栏占位
      const S = winW - Math.round(80 * winW / 750); // 取景框边长：左右各留 40rpx
      const centerY = (winH - barH) / 2;

      const fit = Math.max(S / natW, S / natH); // 源图 → 屏幕 px 的基础倍率
      const imgW = natW * fit;
      const imgH = natH * fit;
      // movable-area 需比取景框大，才允许图片边缘拖到框边（推导：area = 2*img - S）
      const areaW = 2 * imgW - S;
      const areaH = 2 * imgH - S;
      const areaL = winW / 2 - areaW / 2;
      const areaT = centerY - areaH / 2;
      const x = (areaW - imgW) / 2;
      const y = (areaH - imgH) / 2;
      const cropL = (winW - S) / 2;
      const cropT = centerY - S / 2;

      this._natW = natW;
      this._natH = natH;
      this._fit = fit;
      this._imgW = imgW;
      this._imgH = imgH;
      this._S = S;
      this._areaL = areaL;
      this._areaT = areaT;
      this._cropL = cropL;
      this._cropT = cropT;
      this._x = x;
      this._y = y;
      this._scale = 1;
      this._busy = false;

      const px = (n) => Math.round(n * 100) / 100 + 'px';
      this.setData({
        ready: false,
        areaStyle: 'left:' + px(areaL) + ';top:' + px(areaT) + ';width:' + px(areaW) + ';height:' + px(areaH),
        frameStyle: 'left:' + px(cropL) + ';top:' + px(cropT) + ';width:' + px(S) + ';height:' + px(S),
        maskTop: 'left:0;top:0;right:0;height:' + px(cropT),
        maskBottom: 'left:0;right:0;top:' + px(cropT + S) + ';height:' + px(winH - cropT - S),
        maskLeft: 'left:0;top:' + px(cropT) + ';width:' + px(cropL) + ';height:' + px(S),
        maskRight: 'left:' + px(cropL + S) + ';top:' + px(cropT) + ';right:0;height:' + px(S),
        viewW: Math.round(imgW * 100) / 100,
        viewH: Math.round(imgH * 100) / 100,
        x,
        y,
        scale: 1
      }, () => {
        // 重建 movable-view，让新的初始位置 / 缩放值生效
        this.setData({ ready: true });
      });
    },

    onMove(e) {
      this._x = e.detail.x;
      this._y = e.detail.y;
    },
    onScale(e) {
      this._x = e.detail.x;
      this._y = e.detail.y;
      this._scale = e.detail.scale;
    },

    onConfirm() {
      if (this._busy || !this.data.ready) return;
      this._busy = true;
      const c = this._scale || 1;
      const k = this._fit * c; // 源图 → 屏幕 px 的当前倍率
      // movable-view 以自身中心缩放，图片左上角屏幕坐标需补偿放大偏移
      const imgL = this._areaL + this._x + (this._imgW - this._imgW * c) / 2;
      const imgT = this._areaT + this._y + (this._imgH - this._imgH * c) / 2;
      const sw = this._S / k;
      // 取景框对应的源图区域（clamp 防浮点越界）
      const sx = Math.max(0, Math.min((this._cropL - imgL) / k, this._natW - sw));
      const sy = Math.max(0, Math.min((this._cropT - imgT) / k, this._natH - sw));
      const out = Math.min(OUT_MAX, Math.round(sw));
      this.setData({ out }, () => this._draw(sx, sy, sw, out));
    },

    _draw(sx, sy, sw, out) {
      this.createSelectorQuery()
        .select('#pCropCanvas')
        .fields({ node: true })
        .exec((res) => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            this._busy = false;
            wx.showToast({ title: '裁剪失败，请重试', icon: 'none' });
            return;
          }
          canvas.width = out;
          canvas.height = out;
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            ctx.clearRect(0, 0, out, out);
            ctx.drawImage(img, sx, sy, sw, sw, 0, 0, out, out);
            wx.canvasToTempFilePath({
              canvas,
              destWidth: out,
              destHeight: out,
              fileType: 'jpg',
              quality: 0.92,
              success: (r) => this.triggerEvent('confirm', { tempFilePath: r.tempFilePath }),
              fail: () => wx.showToast({ title: '裁剪失败，请重试', icon: 'none' }),
              complete: () => { this._busy = false; }
            });
          };
          img.onerror = () => {
            this._busy = false;
            wx.showToast({ title: '裁剪失败，请重试', icon: 'none' });
          };
          img.src = this.data.src;
        });
    },

    onCancel() {
      this.triggerEvent('cancel');
    },
    noop() {}
  }
});
