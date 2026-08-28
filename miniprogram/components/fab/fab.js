Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    icon: { type: String, value: 'plus' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    }
  }
});