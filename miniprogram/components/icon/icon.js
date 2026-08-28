const { icon } = require('./icons.js');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  properties: {
    name: { type: String, value: 'paw' },
    color: { type: String, value: '#3E362C' },
    size: { type: Number, value: 40 }
  },
  data: {
    src: '',
    box: '40rpx'
  },
  observers: {
    'name, color, size': function (name, color, size) {
      this.render(name, color, size);
    }
  },
  lifetimes: {
    attached() {
      this.render(this.data.name, this.data.color, this.data.size);
    }
  },
  methods: {
    render(name, color, size) {
      const r = icon(name, color, size);
      this.setData({ src: r.src, box: r.size + 'rpx' });
    }
  }
});