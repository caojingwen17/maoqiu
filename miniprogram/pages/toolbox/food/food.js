const app = getApp();
const { FOODS, FOOD_LEVELS } = require('../../../utils/dict.js');
const tracker = require('../../../utils/tracker.js');

const theme = require('../../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    levels: [
      { key: 'toxic', name: '剧毒', color: '#D24B42' },
      { key: 'harmful', name: '有害', color: '#B26E4B' },
      { key: 'limited', name: '少量可', color: '#9C6B33' },
      { key: 'safe', name: '安全', color: '#34A05C' }
    ],
    filter: 'all',
    query: '',
    items: FOODS.map((f) => ({ name: f[0], level: f[1], levelName: FOOD_LEVELS[f[1]].name, color: FOOD_LEVELS[f[1]].color }))
  },

  onShow() {
    theme.attach(this);
  },
  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },

  goBack() { wx.navigateBack({ delta: 1 }); },
  onSearch(e) {
    const query = e && e.detail ? e.detail.value : '';
    const filter = this.data.filter;
    const items = FOODS.filter((f) => (!query || f[0].indexOf(query) > -1) && (filter === 'all' || f[1] === filter)).map((f) => ({ name: f[0], level: f[1], levelName: FOOD_LEVELS[f[1]].name, color: FOOD_LEVELS[f[1]].color }));
    this.setData({ query, items });
    if (query || filter !== 'all') tracker.track(tracker.EVENTS.TOOL_USED, { tool: 'food' });
  },
  onLevel(e) {
    const filter = e.currentTarget.dataset.level;
    this.setData({ filter });
    this.onSearch({ detail: { value: this.data.query } });
  }
});
