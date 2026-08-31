const app = getApp();
const { QA_PAGES } = require('../../utils/recordMeta.js');
const { sketch } = require('../../components/icon/icons.js');
const { ageText, daysSince, startOfDay, DAY } = require('../../utils/date.js');
const home = require('../../services/home.js');
const reminderService = require('../../services/reminder.js');
const subscription = require('../../services/subscription.js');
const petService = require('../../services/pet.js');
const tracker = require('../../utils/tracker.js');
const share = require('../../utils/share.js');
const { guard } = require('../../utils/guard.js');

// 头像配色（a1-a4 + paw 染色），按 _id 稳定分配
const AV = [
  { av: 'a1', paw: '#B0803B' },
  { av: 'a2', paw: '#6B8F4E' },
  { av: 'a3', paw: '#B85C5C' },
  { av: 'a4', paw: '#4A7FC7' }
];
function pickAv(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

/** 提醒 category → 中文兜底名（自动生成的提醒可能无 title） */
const CATEGORY_NAME = {
  vaccine: '疫苗', deworm: '驱虫', groom: '洗护', medication: '用药',
  checkup: '检查', stock: '囤货', litter: '铲屎', weight: '称体重', custom: '待办'
};

/** 待办 category → 记录类型（点击待办直接跳到对应记录页） */
const TODO_TYPE = {
  vaccine: 'vaccine', deworm: 'deworm', groom: 'groom', medication: 'medication',
  checkup: 'medical', litter: 'litter', weight: 'weight', custom: 'custom'
};

Page({
  data: {
    sb: 20,
    loading: true,
    loadError: false,
    hasPets: false,
    pets: [],
    todos: [],
    members: [],
    strip: { monthExpense: 0, weekChecks: 0, wtText: '—', wtLabel: '体重变化' },
    showSheet: false,
    qaPage: 0,
    qaPetId: '',
    grid0: [],
    grid1: [],
    calmSrc: '',
    kicked: false,
    kickedName: '',
    // 待办左滑操作（完成 / 忽略）
    todoActions: [
      { label: '完成', color: '#fff', bg: '#9C6B33' },
      { label: '忽略', color: '#fff', bg: '#B9AE9E' }
    ],
    // 「忽略全部」处理中（防重复点击）
    todoIgnoringAll: false,
    // 当前滑开的待办行 id（用于滑开新行时收回旧行）
    openTodoId: '',
    // 统一确认弹窗（p-dialog）：action 区分 ignoreAll / archivePet
    dlg: { show: false, action: '', title: '', content: '', confirmText: '确认' },
    // 宠物长按编辑弹层
    petSheet: false,
    activePetIdx: -1,
    // 是否在卡片墙展示已归档宠物（本次会话内保持，不持久化）
    showArchived: false,
    // 快捷记录可选宠物（始终不含已归档）
    qaPets: []
  },

  onLoad() {
    const sbh = app.globalData.statusBarHeight || 20;
    this.setData({ sb: sbh, calmSrc: sketch('dogSun', '#3E362C') });
    this.setData({ grid0: QA_PAGES[0] || [], grid1: QA_PAGES[1] || [] });
    this._loaded = false;
  },

  onShow() {
    this.setData({
      kicked: app.globalData.kicked === 'kicked',
      kickedName: app.globalData.kickedName || ''
    });
    tracker.track(tracker.EVENTS.HOME_SHOW);
    tracker.track(tracker.EVENTS.TAB_SHOW, { tab: 'home' });
    this.loadHome();
  },

  async loadHome() {
    if (!this._loaded) this.setData({ loading: true });
    try {
      const d = await home.aggregate({ includeArchived: this.data.showArchived });
      const pets = mapPets(d);
      const qaPets = pets.filter((p) => !p.archived);
      this.setData({
        loading: false,
        loadError: false,
        hasPets: pets.length > 0,
        pets,
        qaPets,
        todos: mapTodos(d.todos, pets),
        members: mapMembers(d.members),
        strip: buildStrip(d.strip),
        // 快捷记录默认选中第一只未归档宠物（若当前选中已失效）
        qaPetId: qaPets.some((p) => p.id === this.data.qaPetId) ? this.data.qaPetId : (qaPets[0] ? qaPets[0].id : '')
      });
      this._loaded = true;
    } catch (e) {
      // 加载失败：保留旧数据，展示错误态而非伪装成「无宠物」空态
      console.error('[home] aggregate 失败', e);
      this.setData({ loading: false, loadError: true });
      this._loaded = true;
    }
  },

  onRetry() {
    this._loaded = false;
    this.setData({ loadError: false });
    this.loadHome();
  },

  onAddPet() {
    wx.navigateTo({ url: '/pages/pet/edit/edit' });
  },
  onPet(e) {
    if (this.data.petSheet) return; // 编辑弹层打开时不跳转
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/pet/detail/detail?id=' + id });
  },
  onDiaryHint(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    tracker.track(tracker.EVENTS.DIARY_OPEN, { petId: id, source: 'home_hint' });
    wx.navigateTo({ url: '/pages/pet/detail/detail?id=' + id + '&tab=diary' });
  },
  onPetMeta(e) {
    const id = e.currentTarget.dataset.id;
    const pet = this.data.pets.find((item) => item.id === id);
    if (pet && pet.diaryUnread) this.onDiaryHint(e);
    else if (id) wx.navigateTo({ url: '/pages/pet/detail/detail?id=' + id });
  },

  // ===== 显示已归档开关 =====
  onArchivedSwitch(e) {
    this.setData({ showArchived: !!(e.detail && e.detail.value) });
    this.loadHome();
  },

  // ===== 快捷记录九宫格 =====
  openSheet() {
    this.setData({ showSheet: true });
  },
  closeSheet() {
    this.setData({ showSheet: false });
  },
  onSheetPage(e) {
    this.setData({ qaPage: Number(e.currentTarget.dataset.page) });
  },
  onGridSwipe(e) {
    this.setData({ qaPage: e.detail.current });
  },
  // 宠物卡片右上角加号：打开记一笔弹层并默认选中该宠物
  onQuickAdd(e) {
    const id = e.currentTarget.dataset.id;
    if (id && this.data.qaPets.some((p) => p.id === id)) {
      this.setData({ qaPetId: id });
    }
    this.openSheet();
  },
  onQuickPet(e) {
    const id = e.currentTarget.dataset.pet;
    if (id) this.setData({ qaPetId: id });
  },
  onPickType(e) {
    const t = e.currentTarget.dataset.type;
    if (!t) return;
    if (!this.data.qaPets.length) {
      this.closeSheet();
      wx.navigateTo({ url: '/pages/pet/edit/edit' });
      return;
    }
    this.closeSheet();
    const q = '?petId=' + this.data.qaPetId;
    if (t === 'weight') {
      wx.navigateTo({ url: '/pages/weight/weight' + q });
    } else {
      wx.navigateTo({ url: '/pages/record/edit/edit?type=' + t + '&petId=' + this.data.qaPetId });
    }
  },

  // ===== 待办：点击进入记录；左滑出现完成 / 忽略操作 =====
  onTodo(e) {
    const id = e.currentTarget.dataset.id;
    const todo = this.data.todos.find((t) => t.id === id);
    if (!todo) { this.goReminder(); return; }
    if (todo.category === 'stock') {
      wx.navigateTo({ url: '/pages/stock/stock?highlight=' + encodeURIComponent(todo.sourceInventoryId || '') });
      return;
    }
    const type = TODO_TYPE[todo.category];
    if (!type) {
      // 无对应记录类型：去提醒页处理
      this.goReminder();
      return;
    }
    // 称体重：走独立体重表单页（大数字键盘），保存后同样联动完成原提醒
    if (type === 'weight') {
      wx.navigateTo({ url: '/pages/weight/weight?petId=' + (todo.petId || '') + '&reminderId=' + todo.id });
      return;
    }
    let url = '/pages/record/edit/edit?type=' + type + '&reminderId=' + todo.id;
    if (todo.petId) url += '&petId=' + todo.petId;
    // 联动预填：疫苗名（提醒标题如「猫三联疫苗」）
    if (todo.category === 'vaccine' && todo.title) {
      const v = String(todo.title).replace(/疫苗\s*$/, '');
      if (v) url += '&v=' + encodeURIComponent(v);
    }
    // 洗护类（梳毛/刷牙/剪指甲）：预选中对应项目
    if (todo.category === 'groom' && todo.title) {
      url += '&item=' + encodeURIComponent(todo.title);
    }
    // 自定义类（洗碗等）：预填自定义记录的标题
    if (todo.category === 'custom' && todo.title) {
      url += '&title=' + encodeURIComponent(todo.title);
    }
    wx.navigateTo({ url });
  },
  // 待办左滑操作：0=完成（周期推进/一次性 done），1=忽略本次
  onTodoAction: guard('todoAction', async function (e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ openTodoId: '' });
    if (e.detail.index === 0) {
      this._completeReminder(id);
    } else {
      this._ignoreTodo(id);
    }
  }),
  // 滑开新行时自动收回上一行（组件 action 点击会自行收回，但 close() 不发事件，这里也同步清状态）
  onTodoSwipeOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (e.detail.open) {
      const prev = this.data.openTodoId;
      if (prev && prev !== id) {
        const c = this.selectComponent('#todo-swipe-' + prev);
        if (c) c.close();
      }
      this.setData({ openTodoId: id });
    } else if (this.data.openTodoId === id) {
      this.setData({ openTodoId: '' });
    }
  },
  // 有待办行滑开时，触摸页面其他位置（含滚动起始）即收回；触摸落在该行区域内不动
  onPageTouch(e) {
    const id = this.data.openTodoId;
    if (!id) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    this.createSelectorQuery().select('#todo-swipe-' + id).boundingClientRect((rect) => {
      if (!rect) { this.setData({ openTodoId: '' }); return; }
      const inside = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;
      if (!inside) {
        const c = this.selectComponent('#todo-swipe-' + id);
        if (c) c.close();
        this.setData({ openTodoId: '' });
      }
    }).exec();
  },
  async _ignoreTodo(id) {
    if (!id) return;
    subscription.silentRefill('home_reminder_ignore');
    try {
      await reminderService.ignore(id);
      this.loadHome();
      await this.maybeGuideReminder('home_reminder_ignore');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '忽略失败', icon: 'none' });
    }
  },
  // ===== 待办：忽略全部（积压逾期待办批量清理，提醒本身仍按周期继续） =====
  onTodoIgnoreAll() {
    if (this.data.todoIgnoringAll) return; // 处理中防重复点击
    const ids = this.data.todos.map((t) => t.id).filter(Boolean);
    if (ids.length < 2) return;
    this._dlgIds = ids;
    this.setData({
      dlg: { show: true, action: 'ignoreAll', title: '忽略全部待办', content: '忽略后今日待办将全部清空，提醒本身仍会按周期继续，下次到期会再次出现', confirmText: '全部忽略' }
    });
  },
  closeDlg() {
    this.setData({ 'dlg.show': false });
  },
  onDlgConfirm: guard('dlg', async function () {
    const action = this.data.dlg.action;
    this.closeDlg();
    if (action === 'ignoreAll') {
      this._ignoreAllTodos(this._dlgIds || []);
    } else if (action === 'archivePet') {
      const pet = this._dlgPet;
      this._dlgPet = null;
      if (!pet) return;
      petService.archive(pet.id, true)
        .then(() => this.loadHome())
        .catch((e) => wx.showToast({ title: (e && e.message) || '归档失败', icon: 'none' }));
    }
  }),
  async _ignoreAllTodos(ids) {
    this.setData({ todoIgnoringAll: true });
    subscription.silentRefill('home_reminder_ignore');
    try {
      const results = await Promise.allSettled(ids.map((id) => reminderService.ignore(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.loadHome();
      await this.maybeGuideReminder('home_reminder_ignore');
      if (!failed) {
        wx.showToast({ title: '已忽略 ' + ids.length + ' 条', icon: 'none' });
      } else {
        wx.showToast({ title: '已忽略 ' + (ids.length - failed) + ' 条，' + failed + ' 条失败', icon: 'none' });
      }
    } finally {
      this.setData({ todoIgnoringAll: false });
    }
  },
  async _completeReminder(id) {
    if (!id) return;
    subscription.silentRefill('home_reminder_complete');
    try {
      await reminderService.complete(id);
      this.loadHome();
      await this.maybeGuideReminder('home_reminder_complete');
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' });
    }
  },

  // ===== 宠物长按编辑模式（排序 / 归档，PRD §模块1） =====
  onPetLong(e) {
    const id = e.currentTarget.dataset.id;
    const idx = this.data.pets.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.setData({ petSheet: true, activePetIdx: idx });
  },
  closePetSheet() {
    this.setData({ petSheet: false, activePetIdx: -1 });
  },
  onPetEdit() {
    const pet = this.data.pets[this.data.activePetIdx];
    this.closePetSheet();
    if (pet) wx.navigateTo({ url: '/pages/pet/edit/edit?id=' + pet.id });
  },
  onPetMove: guard('petMove', async function (e) {
    const dir = Number(e.currentTarget.dataset.dir); // -1 上移 / +1 下移
    const pets = this.data.pets;
    const i = this.data.activePetIdx;
    const j = i + dir;
    this.closePetSheet();
    if (i < 0 || j < 0 || j >= pets.length) return;
    // 归一化 order（历史数据可能全为 0），再交换相邻两项
    const orders = pets.map((p, idx) => idx);
    const tmp = orders[i]; orders[i] = orders[j]; orders[j] = tmp;
    try {
      await petService.update({ _id: pets[i].id, order: orders[i] });
      await petService.update({ _id: pets[j].id, order: orders[j] });
      this.loadHome();
    } catch (e2) {
      wx.showToast({ title: (e2 && e2.message) || '排序失败', icon: 'none' });
    }
  }),
  onPetArchive() {
    const pet = this.data.pets[this.data.activePetIdx];
    this.closePetSheet();
    if (!pet) return;
    this._dlgPet = pet;
    this.setData({
      dlg: { show: true, action: 'archivePet', title: '归档 ' + pet.name, content: '归档后提醒将暂停，时间线只读，首页不再展示；可随时长按卡片或在「我的-归档宠物」恢复', confirmText: '归档' }
    });
  },
  onPetUnarchive() {
    const pet = this.data.pets[this.data.activePetIdx];
    this.closePetSheet();
    if (!pet) return;
    petService.archive(pet.id, false)
      .then(() => {
        wx.showToast({ title: '已取消归档', icon: 'none' });
        this.loadHome();
      })
      .catch((e) => wx.showToast({ title: (e && e.message) || '操作失败', icon: 'none' }));
  },

  // ===== 统计速览条下钻 =====
  goExpense() {
    wx.navigateTo({ url: '/pages/expense/expense' });
  },
  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' });
  },
  goWeight() {
    const q = this.data.qaPetId ? '?petId=' + this.data.qaPetId : '';
    wx.navigateTo({ url: '/pages/weight/weight' + q });
  },

  goReminder() {
    subscription.silentRefill('home_reminder_entry');
    wx.switchTab({ url: '/pages/reminder/reminder' });
  },
  async maybeGuideReminder(source) {
    const s = subscription.getState();
    if (!(s.status === 'accept' && s.persistent)) await subscription.guide(source, { once: true });
  },
  goMembers() {
    wx.navigateTo({ url: '/pages/members/members' });
  },
  onShareAppMessage() {
    return share.shareAppMessage();
  },
  onShareTimeline() {
    return share.shareTimeline();
  },
  onBackToMine() {
    app.backToMine();
    this.setData({ kicked: false, kickedName: '' });
    this.loadHome();
  }
});

function mapPets(d) {
  const weightMap = d.weightMap || {};
  const petTodoMap = d.petTodoMap || {};
  const petDiaryMap = d.petDiaryMap || {};
  const list = (d.pets || []).map((p) => {
    const c = pickAv(p._id);
    const w = weightMap[p._id];
    const diary = petDiaryMap[p._id];
    // 右下角：新日记优先，其次最近一条到期提醒，再次到家天数
    let meta = '';
    if (diary) meta = '新日记 · 点开看看';
    else if (petTodoMap[p._id]) meta = petTodoMap[p._id];
    else if (p.adoptDate) meta = '到家 ' + daysSince(p.adoptDate) + ' 天';
    return {
      id: p._id,
      name: p.name,
      breed: p.breed || '',
      age: ageText(p.birthDate),
      gender: p.gender === 'female' ? '♀' : (p.gender === 'male' ? '♂' : ''),
      genderCls: p.gender === 'female' ? 'f' : (p.gender === 'male' ? 'm' : ''),
      avatar: p.avatar || '',
      weight: (typeof w === 'number') ? (w + ' kg') : '—',
      species: speciesName(p.species),
      traits: Array.isArray(p.traits) ? p.traits : [],
      adoptText: p.adoptDate ? ('到家 ' + daysSince(p.adoptDate) + ' 天') : '到家日期未填写',
      meta,
      archived: !!p.archived,
      diaryUnread: !!diary,
      diaryDate: diary ? diary.diaryDate : '',
      av: c.av,
      paw: c.paw
    };
  });
  // 已归档置底：未归档保持原顺序在前，归档的按原顺序排在后面
  const active = list.filter((p) => !p.archived);
  return active.concat(list.filter((p) => p.archived));
}

function speciesName(key) {
  const names = { cat: '猫', dog: '狗', rabbit: '兔', hamster: '仓鼠', bird: '鸟', reptile: '爬宠', fish: '鱼', other: '其他' };
  return names[key] || key || '其他';
}

function mapMembers(members) {
  const list = (members || []).slice(0, 3).map((m, i) => {
    const c = pickAv('member' + i + (m.nickname || ''));
    return { avatar: m.avatar || '', nickname: m.nickname || '家长', av: c.av, paw: c.paw };
  });
  const more = (members || []).length - list.length;
  return { list, more: more > 0 ? more : 0 };
}

function mapTodos(todos, pets) {
  // 客户端兜底再过滤一次：只展示「今天及之前」到期的（按日历日），
  // 云端旧版本（7 天提前窗口）未重新部署时首页也不会混入明天的待办
  const todayEnd = startOfDay(Date.now()) + DAY;
  return (todos || []).filter((t) => t.remindAt < todayEnd).map((t) => {
    const pet = pets.find((p) => p.id === t.petId);
    const c = pickAv(t.petId);
    const m = pillText(t.remindAt);
    return {
      id: t._id,
      petId: t.petId || '',
      sourceInventoryId: t.sourceInventoryId || '',
      pet: pet ? pet.name : '全家',
      petAvatar: (pet && pet.avatar) || '',
      task: t.title || CATEGORY_NAME[t.category] || '待办',
      category: t.category || '',
      title: t.title || '',
      repeatDays: t.repeatDays || 0,
      av: c.av,
      paw: c.paw,
      pill: m.pill,
      kind: m.kind
    };
  });
}

function pillText(remindAt) {
  // 按日历日计算（与提醒页 groupActives 一致）：
  // 今天 21:00 的提醒在下午看仍是「今天」，而不是 ceil(0.3)=1 被错标成「明天」
  const days = Math.round((startOfDay(remindAt) - startOfDay(Date.now())) / DAY);
  if (days < 0) return { pill: '逾期 ' + (-days) + ' 天', kind: 'danger' };
  if (days === 0) return { pill: '今天', kind: 'warn' };
  if (days === 1) return { pill: '明天', kind: 'warn' };
  return { pill: days + ' 天后', kind: 'grey' };
}

function buildStrip(s) {
  const strip = s || {};
  let wtText = '—';
  let wtLabel = '体重变化';
  const wt = strip.weightTrend;
  if (wt) {
    const name = wt.petName || '毛孩子';
    if (wt.date) {
      const d = new Date(wt.date);
      wtLabel = '体重变化 · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    if (typeof wt.delta === 'number' && wt.delta !== 0) {
      wtText = name + ' ' + (wt.delta > 0 ? '↑' : '↓') + Math.abs(wt.delta) + 'kg';
    } else if (typeof wt.weight === 'number') {
      wtText = name + ' ' + wt.weight + 'kg';
    }
  }
  return {
    monthExpense: strip.monthExpense || 0,
    weekChecks: strip.weekChecks || 0,
    wtText,
    wtLabel
  };
}
