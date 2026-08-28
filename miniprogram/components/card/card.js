Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    padding: { type: String, value: '' }, // 覆盖内边距
    title: { type: String, value: '' },
    extra: { type: String, value: '' },
    pressable: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      if (this.data.pressable) this.triggerEvent('tap');
    }
  }
});