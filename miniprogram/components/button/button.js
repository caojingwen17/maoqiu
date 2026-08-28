const TYPE_CLASS = {
  primary: 'btn-p',
  secondary: 'btn-s',
  destructive: 'btn-destructive',
  plain: 'btn-plain'
};

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    type: { type: String, value: 'primary' }, // primary / secondary / destructive / plain
    size: { type: String, value: 'normal' },  // normal / small
    block: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false }
  },
  data: {
    typeClass: 'btn-p'
  },
  observers: {
    type(type) {
      this.setData({ typeClass: TYPE_CLASS[type] || 'btn-p' });
    }
  },
  lifetimes: {
    attached() {
      this.setData({ typeClass: TYPE_CLASS[this.data.type] || 'btn-p' });
    }
  },
  methods: {
    onTap() {
      if (this.data.disabled || this.data.loading) return;
      this.triggerEvent('tap');
    }
  }
});