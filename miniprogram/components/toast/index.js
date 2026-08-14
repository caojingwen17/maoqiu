/**
 * toast —— 顶部降下毛玻璃胶囊提示（设计文档 §7.8）
 *
 * 属性：无（通过 show 方法驱动）
 *
 * 方法（页面 selectComponent 调用）：
 *   show({ type, text, duration? })
 *     type     'success'（Success 色对勾图标）/ 'fail'（Danger 色感叹号图标）
 *     text     文案
 *     duration 停留毫秒，默认 2000
 *
 * 事件：无
 *
 * 示例：
 *   wxml: <toast id="toast" />
 *   js:   this.selectComponent('#toast').show({ type: 'success', text: '已保存' });
 *
 * 说明：安全区下方 16rpx 降入（500ms var(--spring)），停留 2s 上滑收走；
 * 一次只一条，新 Toast 顶替旧的（不堆叠）；成功 medium / 失败 heavy 触觉（§6.5）。
 * 注：图标以 mask 渲染，§7.8 的 path 描边动画以 300ms 淡入近似。
 */
var icons = require('../icons.js');
var utils = require('../utils.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  data: {
    show: false,
    leaving: false,
    text: '',
    type: 'success',
    iconUri: icons.maskIcon('check-circle')
  },

  methods: {
    show: function (opts) {
      opts = opts || {};
      var self = this;
      // 顶替不堆叠：清掉上一条的收走定时器，直接重置动画
      clearTimeout(this._stayTimer);
      clearTimeout(this._leaveTimer);

      var type = opts.type === 'fail' ? 'fail' : 'success';
      this.setData({
        show: false,
        leaving: false,
        text: opts.text || '',
        type: type,
        iconUri: icons.maskIcon(type === 'fail' ? 'exclaim' : 'check-circle')
      }, function () {
        setTimeout(function () {
          self.setData({ show: true });
        }, 30);
      });

      utils.haptic(type === 'fail' ? 'heavy' : 'medium'); // §6.5

      this._stayTimer = setTimeout(function () {
        self._dismiss();
      }, opts.duration || 2000);
    },

    _dismiss: function () {
      var self = this;
      this.setData({ show: false, leaving: true });
      this._leaveTimer = setTimeout(function () {
        self.setData({ leaving: false });
      }, 320);
    }
  }
});
