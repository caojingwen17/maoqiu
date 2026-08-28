const { pawStrokes } = require('../icon/icons.js');
const { PET_TRIVIA } = require('../../utils/dict.js');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    // 页面级加载为 Primary 色，静止为 Text-Tertiary
    primary: { type: Boolean, value: false },
    tips: { type: Array, value: [] }
  },
  data: {
    strokes: [],
    tip: ''
  },
  lifetimes: {
    attached() {
      const color = this.data.primary ? '#3E362C' : '#B9AE9E';
      const tips = (this.data.tips && this.data.tips.length) ? this.data.tips : PET_TRIVIA;
      this.setData({
        strokes: pawStrokes(color),
        tip: tips[Math.floor(Math.random() * tips.length)]
      });
    }
  }
});