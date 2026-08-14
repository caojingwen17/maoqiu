/**
 * num-keyboard —— 自定义大数字键盘（设计文档 §7.3 数字输入：体重/金额）
 *
 * 属性：
 *   visible  Boolean  false     显示/隐藏（500ms var(--spring) 升起）
 *   mode     String   'decimal' decimal=体重 1 位小数 / money=金额 2 位小数
 *   max      Number   0         最大值（0 = 不限）；超限忽略输入并 heavy 震动
 *   unit     String   ''        顶部大数右侧的单位（如 'kg' / '元'），Caption 置灰跟随
 *
 * 事件：
 *   confirm(detail: {value})  点「完成」，value 为 Number
 *   close()                   点遮罩或「完成」后触发，页面应把 visible 置 false
 *
 * 示例：
 *   <num-keyboard visible="{{kb}}" mode="decimal" max="99" unit="kg"
 *     bindconfirm="onWeight" bindclose="kb=false" />
 *
 * 说明：顶部实时大数 Title-1 + tabular-nums；按键高 108rpx，按下底色加深无缩放。
 */
var icons = require('../icons.js');
var utils = require('../utils.js');

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
    mode: { type: String, value: 'decimal' },
    max: { type: Number, value: 0 },
    unit: { type: String, value: '' }
  },

  data: {
    rendered: false,
    active: false,
    text: '0', // 输入串（字符串保证小数位输入过程可控）
    delUri: icons.maskIcon('kbd-delete'),
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
  },

  methods: {
    _open: function () {
      var self = this;
      this.setData({ rendered: true, text: '0' }, function () {
        setTimeout(function () { self.setData({ active: true }); }, 30);
      });
    },

    _animateOut: function () {
      if (!this.data.rendered) return;
      var self = this;
      this.setData({ active: false });
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(function () {
        self.setData({ rendered: false });
      }, 520);
    },

    onMaskTap: function () {
      this.triggerEvent('close');
    },

    onKey: function (e) {
      var key = e.currentTarget.dataset.key;
      var text = this.data.text;
      var decimals = this.data.mode === 'money' ? 2 : 1;

      if (key === 'del') {
        text = text.length > 1 ? text.slice(0, -1) : '0';
        this.setData({ text: text });
        return;
      }

      if (key === '.') {
        if (text.indexOf('.') === -1) text += '.';
        this.setData({ text: text });
        return;
      }

      // 数字键
      if (text === '0') {
        text = key;
      } else {
        var dot = text.indexOf('.');
        if (dot !== -1 && text.length - dot - 1 >= decimals) {
          utils.haptic('heavy'); // 小数位已满，校验失败
          return;
        }
        text += key;
      }

      if (this.data.max > 0 && parseFloat(text) > this.data.max) {
        utils.haptic('heavy'); // §6.5 校验失败
        return;
      }
      this.setData({ text: text });
    },

    onConfirm: function () {
      var value = parseFloat(this.data.text) || 0;
      utils.haptic('medium'); // §6.5 保存成功
      this.triggerEvent('confirm', { value: value });
      this.triggerEvent('close');
    }
  }
});
