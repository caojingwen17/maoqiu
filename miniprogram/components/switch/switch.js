Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    checked: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false }
  },
  data: {
    on: false
  },
  observers: {
    checked(v) {
      this.setData({ on: v });
    }
  },
  lifetimes: {
    attached() {
      this.setData({ on: this.data.checked });
    }
  },
  methods: {
    onTap() {
      if (this.data.disabled) return;
      const on = !this.data.on;
      this.setData({ on });
      this.triggerEvent('change', { value: on });
    }
  }
});