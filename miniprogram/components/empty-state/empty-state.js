const { sketch } = require('../icon/icons.js');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    sketch: { type: String, value: 'boxCat' },
    title: { type: String, value: '' },
    sub: { type: String, value: '' },
    btn: { type: String, value: '' },
    width: { type: Number, value: 194 },
    height: { type: Number, value: 145 }
  },
  data: {
    src: ''
  },
  observers: {
    sketch(name) {
      this.data.sketchName = name;
      this.render();
    },
    width() { this.render(); },
    height() { this.render(); }
  },
  lifetimes: {
    attached() {
      this.render();
    }
  },
  methods: {
    render() {
      const name = this.data.sketch;
      this.setData({ src: sketch(name, '#3E362C') });
    },
    onTap() {
      this.triggerEvent('action');
    }
  }
});