Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    show: { type: Boolean, value: false },
    decimal: { type: Boolean, value: true },
    jin: { type: Boolean, value: false } // 是否提供「斤」键（体重输入自动换算）
  },
  data: {
    keys: []
  },
  observers: {
    'decimal, jin'() {
      this.buildKeys();
    }
  },
  lifetimes: {
    attached() {
      this.buildKeys();
    }
  },
  methods: {
    buildKeys() {
      const keys = [];
      for (let i = 1; i <= 9; i++) keys.push({ k: String(i), kind: 'num' });
      if (this.data.decimal) keys.push({ k: '.', kind: 'num' });
      keys.push({ k: '0', kind: 'num' });
      keys.push({ k: 'del', kind: 'del' });
      if (this.data.jin) keys.push({ k: '斤', kind: 'jin' });
      this.setData({ keys });
    },
    onKey(e) {
      const k = e.currentTarget.dataset.k;
      this.triggerEvent('key', { key: k });
    },
    onDone() {
      this.triggerEvent('done');
    },
    noop() {}
  }
});