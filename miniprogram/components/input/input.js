Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '选填' },
    placeholderClass: { type: String, value: 'ph' },
    type: { type: String, value: 'text' }, // text / number / digit / idcard
    unit: { type: String, value: '' },
    bold: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    maxlength: { type: Number, value: 140 },
    focused: { type: Boolean, value: false }
  },
  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value });
      this.triggerEvent('change', { value: e.detail.value });
    },
    onFocus(e) {
      this.triggerEvent('focus', { value: e.detail.value });
    },
    onBlur(e) {
      this.triggerEvent('blur', { value: e.detail.value });
    }
  }
});