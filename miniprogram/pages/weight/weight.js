const app = getApp();
const { parseWeightToKg, weight: validWeight } = require('../../utils/validate.js');
const recordService = require('../../services/record.js');
const reminderService = require('../../services/reminder.js');
const homeService = require('../../services/home.js');
const subscription = require('../../services/subscription.js');
const { fmtDateCn } = require('../../utils/date.js');
const { SPECIES } = require('../../utils/dict.js');

/** 物种英文 key -> 中文名；拼品种展示 */
function speciesLabel(pet) {
  const hit = (SPECIES || []).find((s) => s.key === pet.species);
  const parts = [hit ? hit.name : (pet.species || ''), pet.breed || ''].filter(Boolean);
  return parts.join(' · ');
}

Page({
  data: {
    sb: 20,
    petId: '',
    petIdx: 0,
    pets: [],
    petName: '',
    petSpecies: '',
    petAvatar: '',
    value: '',
    showPad: false,
    prev: null, // { date, val, diff }
    saving: false,
    dateLabel: ''
  },

  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20, dateLabel: fmtDateCn(Date.now()) + ' · 今天' });
    if (options && options.petId) this.setData({ petId: options.petId });
    // 从首页待办（称体重提醒）进入：保存后联动完成原提醒
    if (options && options.reminderId) this._reminderId = options.reminderId;
    this.loadPet();
  },

  // 默认第一只宠物；读取最近一次体重用于「比上次」对比
  async loadPet() {
    try {
      const d = await homeService.aggregate();
      const pets = (d && d.pets) || [];
      if (!pets.length) return;
      let pet = pets[0];
      if (this.data.petId) pet = pets.find((p) => p._id === this.data.petId) || pets[0];
      this.setData({ pets, petId: pet._id, petIdx: pets.findIndex((p) => p._id === pet._id), petName: pet.name, petSpecies: speciesLabel(pet), petAvatar: pet.avatar || '' });

      const list = await recordService.list(pet._id, 'weight');
      const last = Array.isArray(list) ? list[0] : null;
      if (last) {
        const w = readWeight(last);
        if (w != null) {
          this._prevWeight = w;
          this.setData({
            prev: { date: fmtDateCn(last.date), val: w + ' kg', diff: '' },
            value: String(w)
          });
        }
      }
    } catch (e) {
      console.error('[weight] 加载失败', e);
    }
  },

  onPetChange(e) {
    const idx = Number(e.detail.value);
    const pet = this.data.pets[idx];
    if (!pet) return;
    this.setData({ petIdx: idx, petId: pet._id, petName: pet.name, petSpecies: speciesLabel(pet), petAvatar: pet.avatar || '', prev: null, value: '' });
    this.loadPrevious(pet._id);
  },

  async loadPrevious(petId) {
    const list = await recordService.list(petId, 'weight');
    const last = (Array.isArray(list) ? list[0] : null);
    if (!last) return;
    const w = readWeight(last);
    if (w != null) this.setData({ prev: { date: fmtDateCn(last.date), val: w + ' kg', diff: '' }, value: String(w) });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  openPad() {
    this.setData({ showPad: true });
  },
  closePad() {
    this.setData({ showPad: false });
  },

  onKey(e) {
    const k = e.detail.key;
    let v = this.data.value;
    if (k === 'del') {
      v = v.slice(0, -1);
    } else {
      if (v.indexOf('.') > -1 && k === '.') return;
      v = v + k;
    }
    this.setData({ value: v });
  },

  // stay=false 保存后返回；stay=true「保存并再记一条」：重置数值输入，停留本页继续记
  async _save(stay) {
    if (this.data.saving) return;
    const toast = this.selectComponent('#toast');
    if (!this.data.petId) {
      if (toast) toast.show('请先添加一只毛孩子', 'warn');
      return;
    }
    const chk = validWeight(parseWeightToKg(this.data.value));
    if (!chk.ok) {
      if (toast) toast.show(chk.msg, 'warn');
      return;
    }
    subscription.silentRefill(stay ? 'weight_save_more' : 'weight_save');
    this.setData({ saving: true });
    try {
      await recordService.create({
        petId: this.data.petId,
        type: 'weight',
        date: Date.now(),
        data: { weight: chk.value },
        note: ''
      });
      // 待办联动：从首页待办进入的称重，保存后完成原提醒
      if (this._reminderId) {
        const rid = this._reminderId;
        this._reminderId = '';
        reminderService.complete(rid).catch(() => {});
      }
      let msg = '已记下啦';
      if (typeof this._prevWeight === 'number') {
        const diff = Math.round((chk.value - this._prevWeight) * 10) / 10;
        if (diff !== 0) msg += ' · 比上次 ' + (diff > 0 ? '↑' : '↓') + Math.abs(diff) + 'kg';
      }
      if (toast) toast.show(msg);
      if (stay) {
        // 再记一条：清空数值、刷新「上次记录」为刚保存的这条，宠物与日期（今天）保持不变
        this._prevWeight = chk.value;
        this.setData({
          saving: false,
          value: '',
          prev: { date: fmtDateCn(Date.now()), val: chk.value + ' kg', diff: '' }
        });
      } else {
        setTimeout(() => this.goBack(), 600);
      }
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败，请重试', 'warn');
      this.setData({ saving: false });
    }
  },

  onSave() {
    this._save(false);
  },

  onSaveMore() {
    this._save(true);
  }
});

function readWeight(r) {
  const d = (r && r.data) || {};
  if (typeof d.weight === 'number') return d.weight;
  if (typeof d.value === 'number') return d.value;
  if (typeof d.kg === 'number') return d.kg;
  return null;
}
