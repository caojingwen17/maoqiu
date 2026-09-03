const app = getApp();
const { TC } = require('../../utils/recordMeta.js');
const { startOfDay, DAY } = require('../../utils/date.js');
const reminderService = require('../../services/reminder.js');
const subscription = require('../../services/subscription.js');
const tracker = require('../../utils/tracker.js');
const share = require('../../utils/share.js');
const { guard } = require('../../utils/guard.js');

// 完成面板「同时记一笔」：提醒分类 → 记录类型
const DONE_RECORD_TYPE = {
  vaccine: 'vaccine', deworm: 'deworm', groom: 'groom', medication: 'medication',
  checkup: 'medical', stock: 'expense', litter: 'litter', custom: 'custom'
};

const theme = require('../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    seg: 0,
    segItems: ['进行中', '已完成'],
    groups: [],
    doneGroups: [],
    pets: [],
    subscriptionEnabled: false,
    subscriptionRejected: false,
    subscriptionSwOff: false, // 授权仍在但微信订阅消息总开关被关
    loadError: false,
    loading: true, // 首次加载中（paw-loading 全屏动效）
    showSheet: false,
    pending: null,
    delayDateLabel: ''
  },

  onLoad() {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    this.refreshSubscription();
  },

  onShow() {
    theme.attach(this);
    tracker.track(tracker.EVENTS.TAB_SHOW, { tab: 'reminder' });
    this.refreshSubscription();
    this.loadData();
  },

  async refreshSubscription() {
    await subscription.refresh();
    const s = subscription.getState();
    this.setData({
      subscriptionEnabled: s.status === 'accept' && s.persistent && s.mainSwitch !== false,
      subscriptionRejected: s.persistent && (s.status === 'reject' || s.status === 'ban'),
      subscriptionSwOff: s.status === 'accept' && s.persistent && s.mainSwitch === false
    });
  },

  async onSubscriptionGuide() {
    const s = subscription.getState();
    if (s.persistent && (s.status === 'accept' || s.status === 'reject' || s.status === 'ban')) await subscription.openSettings();
    else await subscription.guide('reminder_center');
    this.refreshSubscription();
  },

  async loadData() {
    try {
      // 单次调用拿全屏数据（进行中 + 已完成 + 宠物名册），云端内部并行查询
      const res = await reminderService.listAll();
      const pets = (res && res.pets) || [];
      this._loadedOk = true;
      this.setData({
        groups: groupActives((res && res.actives) || [], pets),
        doneGroups: groupDone((res && res.dones) || [], pets),
        pets,
        loadError: false,
        loading: false
      });
    } catch (e) {
      console.error('[reminder] 加载失败', e);
      // 保留旧数据不清空；仅从未加载成功过时展示失败态，避免误导性空态
      if (!this._loadedOk) this.setData({ loadError: true });
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  onSeg(e) {
    this.setData({ seg: e.detail.index });
  },
  goNew() {
    // 新建提醒已改为独立 push 页（对齐原型 V.reminderForm）
    subscription.silentRefill('reminder_new');
    wx.navigateTo({ url: '/pages/reminder/new/new' });
  },
  onShareAppMessage() {
    return share.shareAppMessage();
  },
  onShareTimeline() {
    return share.shareTimeline();
  },
  closeSheet() {
    this.setData({ showSheet: false });
  },

  onTodo(e) {
    const gi = e.currentTarget.dataset.gi;
    const ti = e.currentTarget.dataset.ti;
    const item = this.data.groups[gi] && this.data.groups[gi].items[ti];
    // 「延后 3 天」选项展示真实的延后日期
    const d = new Date(Date.now() + 3 * DAY);
    this.setData({
      showSheet: true,
      pending: item,
      delayDateLabel: '改为 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 提醒，不算逾期'
    });
  },

  onDoneChoice: guard('doneChoice', async function (e) {
    const choice = e.currentTarget.dataset.choice;
    const t = this.data.pending;
    this.setData({ showSheet: false });
    if (!t) return;
    if (choice === 'only' || choice === 'delay') subscription.silentRefill('reminder_' + choice);
    const toast = this.selectComponent('#toast');
    try {
      if (choice === 'record') {
        // 称体重：走独立体重表单页（大数字键盘），与首页待办行为一致，保存后联动完成原提醒
        if (t.category === 'weight') {
          wx.navigateTo({ url: '/pages/weight/weight?petId=' + (t.petId || '') + '&reminderId=' + t.id });
          return;
        }
        const type = DONE_RECORD_TYPE[t.category] || 'custom';
        let url = '/pages/record/edit/edit?type=' + type + '&petId=' + (t.petId || '') + '&reminderId=' + t.id;
        // 洗护类（梳毛/刷牙/剪指甲）：预选中对应项目
        if (t.category === 'groom' && t.title) url += '&item=' + encodeURIComponent(t.title);
        // 自定义类（洗碗等）：预填自定义记录的标题
        if (t.category === 'custom' && t.title) url += '&title=' + encodeURIComponent(t.title);
        wx.navigateTo({ url });
      } else if (choice === 'edit') {
        wx.navigateTo({ url: '/pages/reminder/new/new?id=' + t.id });
      } else if (choice === 'disable') {
        await reminderService.disable(t.id);
        if (toast) toast.show('已停用提醒');
      } else if (choice === 'delay') {
        await reminderService.postpone(t.id, 3);
        tracker.track(tracker.EVENTS.REMINDER_POSTPONE, { category: t.category });
        if (toast) toast.show('已延后 3 天');
      } else {
        await reminderService.complete(t.id);
        tracker.track(tracker.EVENTS.REMINDER_DONE, { category: t.category });
        if (toast) toast.show('已完成');
      }
      if (choice === 'only' || choice === 'delay' || choice === 'disable') {
        const s = subscription.getState();
        if (!(s.status === 'accept' && s.persistent)) await subscription.guide('reminder_' + choice, { once: true });
      }
      if (choice !== 'record') this.loadData();
    } catch (err) {
      if (toast) toast.show((err && err.message) || '操作失败');
    }
  }, { cooldown: 0 }),

  onEdit(e) {
    const gi = e.currentTarget.dataset.gi;
    const ti = e.currentTarget.dataset.ti;
    const item = this.data.groups[gi] && this.data.groups[gi].items[ti];
    if (!item || !item.id) return;
    wx.navigateTo({ url: '/pages/reminder/new/new?id=' + item.id });
  },
  onDisable(e) {
    const gi = e.currentTarget.dataset.gi;
    const ti = e.currentTarget.dataset.ti;
    const item = this.data.groups[gi] && this.data.groups[gi].items[ti];
    if (!item || !item.id) return;
    reminderService.disable(item.id).then(() => this.loadData()).catch((err) => {
      wx.showToast({ title: (err && err.message) || '停用失败', icon: 'none' });
    });
  }
});

function groupActives(actives, pets) {
  const now = Date.now();
  const today = startOfDay(now);
  const buckets = [
    { label: '已逾期', labelColor: 'danger', items: [] },
    { label: '今天', labelColor: 'pop', items: [] },
    { label: '未来 7 天', labelColor: 't2', items: [] }
  ];
  actives.forEach((r) => {
    const d = startOfDay(r.remindAt);
    let idx;
    if (d < today) idx = 0;
    else if (d === today) idx = 1;
    else if ((d - today) / DAY <= 7) idx = 2;
    else return;
    buckets[idx].items.push(mapReminder(r, pets));
  });
  return buckets.filter((b) => b.items.length > 0);
}

function groupDone(dones, pets) {
  const sorted = (dones || []).slice().sort((a, b) => (b.completedAt || b.updateAt || b.remindAt || 0) - (a.completedAt || a.updateAt || a.remindAt || 0));
  return sorted.map((r) => mapReminder(r, pets));
}

function mapReminder(r, pets) {
  const now = Date.now();
  const pet = pets.find((p) => p._id === r.petId);
  const days = Math.ceil((startOfDay(r.remindAt) - startOfDay(now)) / DAY);
  let pill, pillType;
  if (days < 0) { pill = '逾期 ' + (-days) + ' 天'; pillType = 'danger'; }
  else if (days === 0) { pill = '今天'; pillType = 'warn'; }
  else if (days === 1) { pill = '明天'; pillType = 'warn'; }
  else { pill = days + ' 天后'; pillType = 'grey'; }
  return {
    id: r._id,
    petId: r.petId,
    sourceInventoryId: r.sourceInventoryId || '',
    category: r.category,
    dot: TC[r.category] || '#C08A4E',
    name: (pet ? pet.name + ' · ' : '') + (r.title || r.category || '提醒'),
    sub: cycleSub(r),
    pill,
    pillType,
    medical: ['vaccine', 'deworm', 'medication'].indexOf(r.category) > -1,
    completedText: r.completedAt ? ('完成于 ' + new Date(r.completedAt).toLocaleDateString()) : ''
  };
}

function cycleSub(r) {
  switch (r.repeatType) {
    case 'daily': return '每天';
    case 'weekly': return '每周';
    case 'monthly': return '每月';
    case 'custom_days': return '每 ' + (r.repeatDays || 1) + ' 天';
    default: return '一次性';
  }
}
