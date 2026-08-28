/**
 * p-dialog 统一确认弹窗（居中卡片，替代原生 wx.showModal）
 * 属性：show/title/content/confirmText/cancelText/showCancel/danger
 * 输入模式：input + inputValue/inputPlaceholder/inputType（text/digit/number）+ confirmDisabled（父页实时校验）
 * 事件：bind:confirm（detail.value 为输入内容）、bind:cancel、bind:input（detail.value 实时值）
 */
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    confirmText: { type: String, value: '确认' },
    cancelText: { type: String, value: '取消' },
    showCancel: { type: Boolean, value: true },
    danger: { type: Boolean, value: false },
    input: { type: Boolean, value: false },
    inputValue: { type: String, value: '' },
    inputPlaceholder: { type: String, value: '' },
    inputType: { type: String, value: 'text' },
    confirmDisabled: { type: Boolean, value: false }
  },
  methods: {
    onMask() {
      this.triggerEvent('cancel');
    },
    onCancel() {
      this.triggerEvent('cancel');
    },
    onConfirm() {
      if (this.data.confirmDisabled) return;
      this.triggerEvent('confirm', { value: this.data.inputValue });
    },
    onInput(e) {
      const value = e.detail.value;
      this.setData({ inputValue: value });
      this.triggerEvent('input', { value });
    },
    noop() {}
  }
});
