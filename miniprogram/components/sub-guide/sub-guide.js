/**
 * sub-guide 订阅授权引导弹窗（自绘，替代 subscription.guide 里的原生 wx.showModal）
 *
 * 工作方式：attached 时把自己注册到 subscription 服务；guide() 被任意页面调用时，
 * 若当前页面挂了本组件则弹自绘弹窗，否则降级 wx.showModal。
 * 点「去开启」是一次新的用户点击，满足 requestSubscribeMessage 的手势调用栈要求。
 */
const subscription = require('../../services/subscription.js');

Component({
  data: { show: false },
  lifetimes: {
    attached() { subscription._registerGuide(this); },
    detached() {
      // 页面销毁时若弹窗还开着，按「取消」收尾，避免 guide() 的 Promise 悬空
      if (this._resolve) {
        const done = this._resolve;
        this._resolve = null;
        done({ result: 'cancel' });
      }
      subscription._unregisterGuide(this);
    }
  },
  methods: {
    /** 由 subscription.guide() 调用；返回 Promise，resolve 授权结果 */
    open(source) {
      if (this._resolve) this._resolve({ result: 'cancel' }); // 上一次未收尾的先取消
      return new Promise((resolve) => {
        this._resolve = resolve;
        this._source = source;
        this.setData({ show: true });
      });
    },
    onConfirm() {
      this.setData({ show: false });
      const done = this._resolve;
      const source = this._source;
      this._resolve = null;
      subscription.request(source).then((res) => { if (done) done(res); });
    },
    onCancel() {
      this.setData({ show: false });
      const done = this._resolve;
      this._resolve = null;
      if (done) done({ result: 'cancel' });
    }
  }
});
