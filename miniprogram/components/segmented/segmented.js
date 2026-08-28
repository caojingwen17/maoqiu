Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    items: { type: Array, value: [] },
    value: { type: Number, value: 0 }
  },
  methods: {
    onTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (index === this.data.value) return;
      this.setData({ value: index });
      this.triggerEvent('change', { index, value: this.data.items[index] });
    }
  }
});