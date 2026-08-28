const app = getApp();
const homeService = require('../../../services/home.js');
const { ageText, fmtDateFull } = require('../../../utils/date.js');
const tracker = require('../../../utils/tracker.js');

/**
 * 各物种「宠物年龄 → 人类年龄」换算规则
 * 注：以下系数均为业界常见近似值，仅供趣味参考，非精确医学结论
 * calc(years, months)：years 为整岁、months 为总月龄；返回约合人类岁数，null 表示无通用公式
 * note：结果卡片底部的规则说明
 */
const AGE_RULES = {
  // 猫：1 岁 ≈ 15，2 岁 ≈ 24，之后每岁 +4；未满 1 岁按月折算
  cat: {
    calc: (y, m) => (y < 1 ? Math.max(1, Math.round(m * 1.25)) : y === 1 ? 15 : y === 2 ? 24 : 24 + (y - 2) * 4),
    note: '猫 1 岁 ≈ 人 15 岁；2 岁 ≈ 24 岁；之后每岁 +4'
  },
  // 狗：以中型犬为参照，1 岁 ≈ 15，之后每岁 +5（体型越大老得越快）
  dog: {
    calc: (y, m) => (y < 1 ? Math.max(1, Math.round(m * 1.25)) : y === 1 ? 15 : 15 + (y - 1) * 5),
    note: '狗 1 岁 ≈ 人 15 岁；之后每岁 +5（中型犬近似，体型越大老得越快）'
  },
  // 兔：1 岁 ≈ 20，之后每岁 +6；未满 1 岁按月折算
  rabbit: {
    calc: (y, m) => (y < 1 ? Math.max(1, Math.round(m * 1.7)) : 20 + (y - 1) * 6),
    note: '兔 1 岁 ≈ 人 20 岁；之后每岁 +6'
  },
  // 仓鼠：寿命约 2–3 年，按 1 个月 ≈ 人 2.5 岁折算
  hamster: {
    calc: (y, m) => Math.max(1, Math.round(m * 2.5)),
    note: '仓鼠寿命约 2–3 年，1 个月 ≈ 人 2.5 岁'
  },
  // 鸟：以中小型鹦鹉为参照，1 岁 ≈ 10，之后每岁 +5（鸟种间寿命差异很大）
  bird: {
    calc: (y, m) => (y < 1 ? Math.max(1, m) : 10 + (y - 1) * 5),
    note: '鸟 1 岁 ≈ 人 10 岁；之后每岁 +5（中小型鹦鹉近似，鸟种间差异大）'
  },
  // 爬宠：约 3 个月 ≈ 人 1 岁（守宫/龟类寿命跨度极大，仅粗略参考）
  reptile: {
    calc: (y, m) => Math.max(1, Math.round(m / 3)),
    note: '爬宠 1 岁 ≈ 人 4 岁（种类间寿命差异极大，仅粗略参考）'
  },
  // 鱼：以金鱼等常见观赏鱼为参照，1 岁 ≈ 人 8 岁
  fish: {
    calc: (y, m) => Math.max(1, Math.round(m * 0.7)),
    note: '鱼 1 岁 ≈ 人 8 岁（以金鱼等常见观赏鱼为参照）'
  },
  // 其他：无通用公式，提示按平均寿命比例估算
  other: {
    calc: () => null,
    note: '该物种暂无通用换算公式，可参考「平均寿命 ÷ 人类约 80 岁」自行估算'
  }
};

Page({
  data: {
    sb: 20,
    pets: [],
    active: 0,
    birthLabel: '—',
    speciesLabel: '—',
    result: { src: '', real: '请选择宠物', human: '—', note: '' }
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    this.loadPets();
  },

  async loadPets() {
    try {
      const d = await homeService.aggregate();
      const pets = (d.pets || []).map((p) => ({ name: p.name, species: p.species, speciesLabel: speciesName(p.species), birthDate: p.birthDate }));
      this.setData({ pets });
      if (pets.length) this.updateResult(0);
    } catch (e) {}
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
  onPet(e) {
    const i = Number(e.currentTarget.dataset.index);
    this.setData({ active: i });
    this.updateResult(i);
  },

  updateResult(i) {
    const p = this.data.pets[i];
    if (!p) return;
    const rule = AGE_RULES[p.species] || AGE_RULES.other;
    if (!p.birthDate) {
      this.setData({
        result: { src: p.speciesLabel, real: '未填写生日', human: '—', note: rule.note },
        birthLabel: '—',
        speciesLabel: p.speciesLabel
      });
      return;
    }
    const now = new Date();
    const b = new Date(p.birthDate);
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    months = Math.max(0, months);
    const years = Math.floor(months / 12);
    const humanYears = rule.calc(years, months);
    this.setData({
      result: {
        src: p.speciesLabel,
        real: ageText(p.birthDate) || (years + ' 岁'),
        human: humanYears === null ? '—' : '约 ' + humanYears + ' 岁',
        note: rule.note
      },
      birthLabel: fmtDateFull(p.birthDate),
      speciesLabel: p.speciesLabel
    });
    tracker.track(tracker.EVENTS.TOOL_USED, { tool: 'age' });
  }
});

function speciesName(key) { return ({ cat: '猫', dog: '狗', rabbit: '兔', hamster: '仓鼠', bird: '鸟', reptile: '爬宠', fish: '鱼' })[key] || '其他'; }
