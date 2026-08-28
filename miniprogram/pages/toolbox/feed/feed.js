const app = getApp();
const tracker = require('../../../utils/tracker.js');

/**
 * 每日建议喂食量（兽医通用口径）：
 *   RER（静息能量需求）= 70 × 体重kg^0.75  (kcal/天)
 *   MER（维持能量需求）= RER × 系数（物种 × 年龄阶段 × 绝育状态）
 *   建议克数 = MER ÷ 干粮代谢能（普通干粮约 3.8 kcal/g）
 */
const KCAL_PER_G = 3.8;
const FACTOR = {
  cat: { young: 2.0, adult: [1.2, 1.4], senior: [1.1, 1.3] }, // [已绝育, 未绝育]
  dog: { young: 2.0, adult: [1.6, 1.8], senior: [1.4, 1.6] }
};
const SPECIES_OPTS = ['猫', '狗'];
const AGE_OPTS = ['幼年', '成年', '老年'];
const NEUTER_OPTS = ['已绝育', '未绝育'];

Page({
  data: {
    sb: 20,
    speciesOpts: SPECIES_OPTS,
    ageOpts: AGE_OPTS,
    neuterOpts: NEUTER_OPTS,
    speciesIdx: 0,
    ageIdx: 1,
    neuterIdx: 0,
    weight: '',
    result: '—',
    kcalText: '',
    note: '按 RER/MER 标准公式估算，干粮按 3.8 kcal/g 折算；不同品牌热量差异较大，请以粮袋建议与兽医意见为准'
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
  },

  goBack() { wx.navigateBack({ delta: 1 }); },
  onSpecies(e) { this.setData({ speciesIdx: Number(e.currentTarget.dataset.index) }, () => this.calc()); },
  onAge(e) { this.setData({ ageIdx: Number(e.currentTarget.dataset.index) }, () => this.calc()); },
  onNeuter(e) { this.setData({ neuterIdx: Number(e.currentTarget.dataset.index) }, () => this.calc()); },
  onWeight(e) {
    this.setData({ weight: e.detail.value }, () => this.calc());
  },

  calc() {
    const kg = Number(this.data.weight);
    if (!(kg > 0 && kg <= 500)) {
      this.setData({ result: '—', kcalText: '' });
      return;
    }
    const species = this.data.speciesIdx === 0 ? 'cat' : 'dog';
    const stage = this.data.ageIdx === 0 ? 'young' : (this.data.ageIdx === 2 ? 'senior' : 'adult');
    const f = FACTOR[species][stage];
    const factor = Array.isArray(f) ? f[this.data.neuterIdx === 0 ? 0 : 1] : f;
    const rer = 70 * Math.pow(kg, 0.75);
    const kcal = Math.round(rer * factor);
    const grams = Math.round(kcal / KCAL_PER_G);
    this.setData({
      result: '约 ' + grams + ' g / 天',
      kcalText: '每日所需热量约 ' + kcal + ' kcal'
    });
    tracker.track(tracker.EVENTS.TOOL_USED, { tool: 'feed' });
  }
});
