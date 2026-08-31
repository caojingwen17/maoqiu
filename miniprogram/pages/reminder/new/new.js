const app = getApp();
const { DAY, fmtDate, fmtDateCn } = require('../../../utils/date.js');
const homeService = require('../../../services/home.js');
const reminderService = require('../../../services/reminder.js');
const subscription = require('../../../services/subscription.js');
const { guard } = require('../../../utils/guard.js');

// 预设事项（最后一个为自定义入口）
const TASK_OPTS = ['梳毛', '刷牙', '洗澡', '剪指甲', '洁耳', '擦眼睛', '铲屎', '洗猫砂盆', '洗碗', '称体重', '驱虫', '复查', '自定义'];
const UNIT_OPTS = ['天', '周', '月'];
// 事项 → 提醒分类（驱动图标配色与完成后的记录类型联动）
const TASK_CATEGORY = {
  '梳毛': 'groom', '刷牙': 'groom', '洗澡': 'groom', '剪指甲': 'groom', '洁耳': 'groom', '擦眼睛': 'groom',
  '铲屎': 'litter', '洗猫砂盆': 'custom', '洗碗': 'custom',
  '称体重': 'weight', '驱虫': 'deworm', '复查': 'checkup'
};

Page({
  data: {
    sb: 20,
    pets: [],
    taskOpts: TASK_OPTS,
    unitOpts: UNIT_OPTS,
    petIdx: 0,
    taskIdx: 0,
    isCustom: false,
    customTitle: '',
    once: false,
    every: '1',
    unitIdx: 0,
    dateStr: '',
    dateLabel: '',
    time: '21:00',
    notifyScope: 'family',
    saving: false,
    editingId: ''
  },

  onLoad(options) {
    const today = fmtDate(Date.now());
    this.setData({
      sb: app.globalData.statusBarHeight || 20,
      dateStr: today,
      dateLabel: fmtDateCn(Date.now()) + ' · 今天'
    });
    this.loadPets();
    if (options && options.id) {
      this.setData({ editingId: options.id });
      this.loadReminder(options.id);
    }
  },

  async loadReminder(id) {
    try {
      const list = await reminderService.list();
      const r = (list || []).find((x) => x._id === id);
      if (!r) return;
      const d = new Date(r.remindAt);
      const taskIdx = TASK_OPTS.indexOf(r.title);
      const custom = taskIdx < 0;
      const once = !r.repeatType || r.repeatType === 'none';
      const days = Math.max(1, Number(r.repeatDays) || 1);
      const unitIdx = (r.repeatType === 'weekly' && days % 7 === 0) ? 1 : (r.repeatType === 'monthly' && days % 30 === 0 ? 2 : 0);
      const every = unitIdx === 1 ? days / 7 : (unitIdx === 2 ? days / 30 : days);
      this.setData({
        petIdx: Math.max(0, this.data.pets.findIndex((p) => p._id === r.petId)),
        taskIdx: custom ? TASK_OPTS.length - 1 : taskIdx,
        isCustom: custom,
        customTitle: custom ? (r.title || '') : '',
        once,
        every: String(every),
        unitIdx,
        dateStr: fmtDate(r.remindAt),
        dateLabel: fmtDateCn(r.remindAt),
        time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        notifyScope: r.notifyScope === 'self' ? 'self' : 'family'
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提醒加载失败', icon: 'none' });
    }
  },

  async loadPets() {
    try {
      const agg = await homeService.aggregate();
      this.setData({ pets: (agg && agg.pets) || [] });
      if (this.data.editingId) this.loadReminder(this.data.editingId);
    } catch (e) {
      console.error('[reminder.new] 宠物列表加载失败', e);
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/reminder/reminder' });
  },

  onPet(e) {
    this.setData({ petIdx: Number(e.currentTarget.dataset.pi) });
  },
  onTask(e) {
    const ti = Number(e.currentTarget.dataset.ti);
    this.setData({ taskIdx: ti, isCustom: ti === TASK_OPTS.length - 1 });
  },
  onCustomTitle(e) {
    this.setData({ customTitle: e.detail.value });
  },
  onEvery(e) {
    this.setData({ every: e.detail.value });
  },
  onMode(e) {
    this.setData({ once: e.currentTarget.dataset.once === '1' });
  },
  onUnit(e) {
    this.setData({ unitIdx: Number(e.currentTarget.dataset.ui) });
  },
  onTime(e) {
    this.setData({ time: e.detail.value });
  },
  onNotifyScope(e) {
    this.setData({ notifyScope: e.currentTarget.dataset.scope === 'self' ? 'self' : 'family' });
  },
  onDate(e) {
    const dateStr = e.detail.value;
    const ts = new Date(dateStr.replace(/-/g, '/')).getTime();
    this.setData({
      dateStr,
      dateLabel: fmtDateCn(ts) + (dateStr === fmtDate(Date.now()) ? ' · 今天' : '')
    });
  },

  onCreate: guard('save', async function () {
    const pets = this.data.pets || [];
    if (!pets.length) { wx.showToast({ title: '请先添加一只毛孩子', icon: 'none' }); return; }
    const pet = pets[Math.min(this.data.petIdx, pets.length - 1)];

    const title = this.data.isCustom
      ? (this.data.customTitle || '').trim()
      : TASK_OPTS[this.data.taskIdx];
    if (!title) { wx.showToast({ title: '请输入事项名称', icon: 'none' }); return; }
    const category = TASK_CATEGORY[title] || 'custom';

    // 周期：一次性提醒 → none；周期提醒 → 每 N 天/周/月 映射 repeatType + repeatDays
    const every = Math.max(1, parseInt(this.data.every, 10) || 1);
    const totalDays = this.data.once ? 0 : every * ([1, 7, 30][this.data.unitIdx] || 1);
    const repeatType = this.data.once ? 'none'
      : (totalDays === 1 ? 'daily' : (totalDays === 7 ? 'weekly' : (totalDays === 30 ? 'monthly' : 'custom_days')));

    // 首次提醒：严格遵守用户所选的日期 + 时刻（即使已过也保留，列表会显示为今天/逾期，
    // 比悄悄顺延到下一周期更符合「我选了今天就是今天」的预期）
    const hm = String(this.data.time || '21:00').split(':');
    const t = this.data.dateStr
      ? new Date(this.data.dateStr.replace(/-/g, '/'))
      : new Date();
    t.setHours(Number(hm[0]) || 21, Number(hm[1]) || 0, 0, 0);

    // 必须在用户点击保存的同步调用栈中补充额度；未持久允许时不会弹窗。
    subscription.silentRefill('reminder_save');
    try {
      const payload = {
        petId: pet._id,
        title,
        category,
        remindAt: t.getTime(),
        repeatType,
        repeatDays: totalDays,
        advanceDays: 7,
        notifyScope: this.data.notifyScope,
        notifyOpenid: this.data.notifyScope === 'self' ? (app.globalData.openid || '') : ''
      };
      if (this.data.editingId) {
        payload._id = this.data.editingId;
        await reminderService.update(payload);
      } else {
        await reminderService.create(payload);
      }
      wx.showToast({ title: this.data.editingId ? '已保存提醒' : '已创建提醒', icon: 'none' });
      const state = subscription.getState();
      if (!(state.status === 'accept' && state.persistent)) {
        await subscription.guide('reminder_save', { once: true });
      }
      setTimeout(() => this.goBack(), 500);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '创建失败', icon: 'none' });
    }
  }, { flag: 'saving' })
});
