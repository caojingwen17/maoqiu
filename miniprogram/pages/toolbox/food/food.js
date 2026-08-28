const app = getApp();
const { FOODS, FOOD_LEVELS } = require('../../../utils/dict.js');
const tracker = require('../../../utils/tracker.js');

Page({
  data: {
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
