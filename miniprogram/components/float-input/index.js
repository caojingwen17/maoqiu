/**
 * float-input —— 浮动标签输入框（设计文档 §7.3，iOS 填充式）
 *
 * 属性：
 *   label  String   ''       浮动标签（未输入时作占位提示）
 *   value  String   ''       输入值（Callout/Text-Primary）
 *   type   String   'text'   text / digit / textarea
 *   error  String   ''       错误文案（非空进入错误态：横条变 Danger + 红字脉冲一次）
 *
 * 事件：
 *   input(detail: {value})    输入
 *   confirm(detail: {value})  键盘确认
 *
 * 示例：
 *   <float-input label="备注" value="{{note}}" bindinput="onNote" />
 *   <float-input label="症状" type="textarea" error="{{errMsg}}" />
 *
 * 说明：聚焦底色加深 BG-Fill-Deep + 底部 2rpx Primary 横条从中心展开 250ms；
 * 聚焦且有内容时右侧出 32rpx 灰色圆形清除钮；错误横条透明度脉冲（不抖动）。
 */
var icons = require('../icons.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    type: { type: String, value: 'text' },
    error: { type: String, value: '' }
  },

  data: {
    focused: false,
    closeUri: icons.maskIcon('close')
  },

  methods: {
    onFocus: function () { this.setData({ focused: true }); },
    onBlur: function () { this.setData({ focused: false }); },

    onInput: function (e) {
      var value = e.detail.value;
      this.setData({ value: value });
      this.triggerEvent('input', { value: value });
    },

    onConfirm: function (e) {
      this.triggerEvent('confirm', { value: e.detail.value });
    },

    onClear: function () {
      this.setData({ value: '' });
      this.triggerEvent('input', { value: '' });
    }
  }
});
