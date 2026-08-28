Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    show: { type: Boolean, value: false }
  },
  methods: {
    onMask() {
      this.triggerEvent('close');
    },
    noop() {}
  }
});