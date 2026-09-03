const app = getApp();
const { GROUPS, TC, ICON_OF, NAME } = require('../../../utils/recordMeta.js');
const { ageText, daysSince, fmtDateCn, pad } = require('../../../utils/date.js');
const homeService = require('../../../services/home.js');
const recordService = require('../../../services/record.js');
const diaryService = require('../../../services/diary.js');
const tracker = require('../../../utils/tracker.js');
const subscription = require('../../../services/subscription.js');

// 头像配色（与首页一致，按 _id 稳定分配）
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

const theme = require('../../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    petId: '',
    pet: { name: '', gender: 'female', paw: '#B0803B', av: 'a1' },
    isArchived: false,
    segItems: ['时间线', '相册', '日记本'],
    seg: 0,
    groupKeys: Object.keys(GROUPS),
    activeGroup: 0,
    hasRecords: false,
    groupEmpty: false, // 有记录但当前分组为空
    timeline: [],
    albumPhotos: [],
    albumLoading: false,
    albumHasMore: false,
    albumError: false,
    recordsLoading: false,
    recordsHasMore: false,
    diaries: [],
    diaryLoading: false,
    diaryLoadingMore: false,
    diaryHasMore: false,
    diaryError: false,
  },

  onShow() {
    theme.attach(this);
    // 编辑页保存后 navigateBack 只触发 onShow：非首次显示时刷新宠物资料/头像
    if (this._ready && this.data.petId) this.loadPet(this.data.petId);
  },
  onReady() {
    // 首屏渲染完成标记：其前的 onShow 属于首次进入（onLoad 已拉取），不重复请求
    this._ready = true;
  },
  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    const id = options && options.id;
    const diaryTab = options && options.tab === 'diary';
    const albumTab = options && options.tab === 'album';
    if (id) this.setData({ petId: id, seg: diaryTab ? 2 : (albumTab ? 1 : 0) });
    // 浏览型触点（被邀请者高频路径）：进入详情页引导开启提醒。guide 先弹自绘/原生弹窗，
    // 点「去开启」那一次新点击才调系统授权，故无需手势调用栈；once 是全局一次性标记，
    // 与其他 once 来源共享，装机至多弹一次；已持久授权/持久拒绝时 guide 内部直接跳过
    setTimeout(() => subscription.guide('pet_detail_view', { once: true }), 600);
    this.load(id, diaryTab, albumTab);
  },

  async load(id, diaryTab, albumTab) {
    if (id) await this.loadPet(id);
    await this.loadRecords(id);
    if (diaryTab) await this.loadDiary(id);
    if (albumTab) await this.loadAlbum(id);
  },

  async loadPet(id) {
    try {
      // includeArchived：已归档宠物也能打开详情（只读模式）
      const d = await homeService.aggregate({ includeArchived: true });
      const p = (d.pets || []).find((x) => x._id === id);
      if (p) this.setData({ pet: mapPet(p), isArchived: !!p.archived });
    } catch (e) {
      console.error('[detail] 宠物加载失败', e);
    }
  },

  async loadRecords(id) {
    if (!id) return;
    this._records = [];
    this._recordsCursor = '';
    this.setData({ recordsLoading: false, recordsHasMore: false, timeline: [], hasRecords: false, groupEmpty: false });
    await this.loadRecordsPage(id, true);
  },

  async loadRecordsPage(id, reset) {
    if (!id || this.data.recordsLoading) return;
    if (!reset && !this.data.recordsHasMore) return;
    this.setData({ recordsLoading: true });
    try {
      const page = await recordService.listPage(id, '', { limit: 30, before: reset ? '' : this._recordsCursor });
      const list = page.items || [];
      this._records = reset ? list : (this._records || []).concat(list);
      this._recordsCursor = page.nextCursor || '';
      this.setData({ recordsHasMore: !!page.hasMore });
      this.renderDerived();
    } catch (e) {
      console.error('[detail] 时间线加载失败', e);
      if (reset) { this._records = []; this.renderDerived(); }
    } finally { this.setData({ recordsLoading: false }); }
  },

  // 由当前页记录派生时间线；相册使用独立的照片分页接口
  renderDerived() {
    const list = this._records || [];
    const group = this.data.groupKeys[this.data.activeGroup];
    const allow = GROUPS[group];
    const filtered = allow ? list.filter((r) => allow.indexOf(r.type || 'daily') > -1) : list;

    this.setData({
      hasRecords: list.length > 0,
      groupEmpty: list.length > 0 && filtered.length === 0,
      timeline: groupTimeline(filtered)
    });
  },

  goBack() { this._back(); },
  _back() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  onSeg(e) {
    const index = Number(e.detail.index);
    this.setData({ seg: index });
    if (index === 2 && !this._diaryLoaded) {
      // 点击栈内静默补订：已持久授权的用户借浏览动作补足一次性下发额度；
      // 未持久授权时 silentRefill 是空操作，绝不会弹窗
      subscription.silentRefill('pet_diary_tab');
      this.loadDiary(this.data.petId);
    }
    if (index === 1 && !this._albumLoaded) this.loadAlbum(this.data.petId);
  },
  onGroup(e) {
    this.setData({ activeGroup: Number(e.currentTarget.dataset.index) });
    this.renderDerived();
  },
  noop() { },

  async loadDiary(id) {
    if (!id || this.data.diaryLoading) return;
    this._diaryLoaded = false;
    this._diaryCursor = '';
    this.setData({ diaries: [], diaryHasMore: false, diaryLoading: true, diaryLoadingMore: false, diaryError: false });
    await this.loadDiaryPage(id, true);
  },

  async loadDiaryPage(id, reset) {
    if (!id || this.data.diaryLoading === true && !reset) return;
    if (!reset && !this.data.diaryHasMore) return;
    const initial = !!reset;
    this.setData({ diaryLoading: initial, diaryLoadingMore: !initial, diaryError: false });
    try {
      const page = await diaryService.listPage(id, { limit: 20, before: reset ? '' : this._diaryCursor });
      const diaries = (page.items || []).map((item) => Object.assign({}, item, { dateLabel: diaryDateLabel(item.diaryDate) }));
      const merged = reset ? diaries : (this.data.diaries || []).concat(diaries);
      this._diaryCursor = page.nextCursor || '';
      this._diaryLoaded = true;
      this.setData({ diaries: merged, diaryHasMore: !!page.hasMore, diaryLoading: false, diaryLoadingMore: false });
      tracker.track(tracker.EVENTS.DIARY_OPEN, { petId: id, source: 'detail_tab' });
      if (reset && diaries.length) {
        const latest = diaries[0].diaryDate;
        try {
          await diaryService.markRead(id, latest);
          tracker.track(tracker.EVENTS.DIARY_READ, { petId: id, throughDate: latest });
        } catch (readError) {
          // 日记内容已经加载成功，已读同步失败不应遮挡用户正在看的内容。
          console.warn('[detail] 日记已读状态同步失败', readError);
        }
      }
    } catch (e) {
      console.error('[detail] 日记加载失败', e);
      this.setData({ diaryLoading: false, diaryLoadingMore: false, diaryError: !!reset });
      if (!reset) wx.showToast({ title: '更多日记加载失败', icon: 'none' });
    }
  },
  onDiaryRetry() { this.loadDiary(this.data.petId); },

  onReachBottom() {
    this.onLoadMore();
  },

  onLoadMore() {
    if (this.data.seg === 2) this.loadDiaryPage(this.data.petId, false);
    else if (this.data.seg === 1) this.loadAlbumPage(this.data.petId, false);
    else this.loadRecordsPage(this.data.petId, false);
  },

  async loadAlbum(id) {
    if (!id || this.data.albumLoading) return;
    this._albumLoaded = false;
    this._albumCursor = '';
    this.setData({ albumPhotos: [], albumHasMore: false, albumLoading: true, albumError: false });
    await this.loadAlbumPage(id, true);
  },

  async loadAlbumPage(id, reset) {
    if (!id || this.data.albumLoading && !reset) return;
    if (!reset && !this.data.albumHasMore) return;
    const initial = !!reset;
    this.setData({ albumLoading: true });
    try {
      const page = await recordService.listPhotosPage(id, { limit: 30, before: reset ? '' : this._albumCursor });
      const merged = reset ? (page.items || []) : (this.data.albumPhotos || []).concat(page.items || []);
      this._albumCursor = page.nextCursor || '';
      this._albumLoaded = true;
      this.setData({ albumPhotos: merged, albumHasMore: !!page.hasMore, albumLoading: false, albumError: false });
    } catch (e) {
      console.error('[detail] 相册加载失败', e);
      this.setData({ albumLoading: false, albumError: !!reset });
    }
  },

  onAlbumRetry() { this.loadAlbum(this.data.petId); },

  onRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: '/pages/record/detail/detail?id=' + id });
  },

  async onPhoto(e) {
    const index = Number(e.currentTarget.dataset.index);
    const rawUrls = (this.data.albumPhotos || []).filter(Boolean);
    if (!rawUrls.length) return;
    const urls = rawUrls.slice();
    const cloudUrls = rawUrls.filter((url) => String(url).indexOf('cloud://') === 0);
    if (cloudUrls.length && wx.cloud && wx.cloud.getTempFileURL) {
      try {
        const result = await wx.cloud.getTempFileURL({ fileList: cloudUrls });
        const mapped = {};
        (result.fileList || []).forEach((item) => {
          if (item.fileID && item.tempFileURL) mapped[item.fileID] = item.tempFileURL;
        });
        rawUrls.forEach((url, i) => { if (mapped[url]) urls[i] = mapped[url]; });
      } catch (e2) {
        // 预览仍尝试使用原始地址，兼容开发者工具或临时 URL。
      }
    }
    wx.previewImage({ current: urls[index] || urls[0], urls });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/pet/edit/edit?id=' + this.data.petId });
  },
  openQuick() {
    wx.navigateTo({ url: '/pages/record/edit/edit?type=weight&petId=' + this.data.petId });
  }
});

function mapPet(p) {
  const c = pickAv(p._id);
  const sub = [
    p.breed || '',
    ageText(p.birthDate),
    p.neutered === true ? '已绝育' : (p.neutered === false ? '未绝育' : '')
  ].filter(Boolean).join(' · ');
  return {
    id: p._id,
    name: p.name,
    avatar: p.avatar || '',
    gender: p.gender === 'male' ? 'male' : (p.gender === 'female' ? 'female' : ''),
    av: c.av,
    paw: c.paw,
    sub: sub || '新伙伴',
    homeDays: '到家 ' + daysSince(p.adoptDate) + ' 天',
    goal: p.weightGoal ? ('目标 ' + p.weightGoal + 'kg') : ''
  };
}

function groupTimeline(records) {
  const groups = {};
  records.forEach((r) => {
    const key = r.date ? new Date(r.date).toDateString() : 'unknown';
    if (!groups[key]) groups[key] = { date: fmtDateCn(r.date || Date.now()), items: [] };
    groups[key].items.push(mapRecord(r));
  });
  return Object.keys(groups).map((k) => groups[k]);
}

function fmtHm(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function diaryDateLabel(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || !parts[0]) return '某一天';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return d.getMonth() + 1 + '月' + d.getDate() + '日 周' + week;
}

/**
 * 时间线条目映射（对齐原型 tlHTML）：
 *  - daily：标题仅类型名，正文文字 + 照片条展示在条目下方；
 *  - expense：标题取「明细」（无明细用分类），右侧金额；
 *  - 其余类型：标题带类型名，并拼接前两个字段值（如「喂食 · 晚餐 · 猫粮」）；
 *    副标题 = 剩余字段值 + 时间 + 记录人。
 *  - deworm：周期属于提醒配置，不在时间线摘要中展示。
 */
function mapRecord(r) {
  const type = r.type || 'daily';
  const d = r.data || {};
  let items = Array.isArray(d.items) ? d.items : [];
  if (type === 'deworm') items = items.filter((it) => it.label !== '周期');
  const by = r.createdByName ? r.createdByName + ' 记' : '';
  const time = fmtHm(r.date);
  let title = NAME[type] || '记录';
  let sub = [time, by].filter(Boolean).join(' · ');
  if (type === 'expense') {
    const cat = items.find((it) => it.label === '分类');
    const det = items.find((it) => it.label === '明细');
    const detailTitle = (det && det.value) || (cat && cat.value);
    title = [title, detailTitle].filter(Boolean).join(' · ');
    if (det && cat) sub = [cat.value, time, by].filter(Boolean).join(' · ');
  } else if (type !== 'daily' && type !== 'weight' && items.length) {
    title = [title].concat(items.slice(0, 2).map((it) => it.value)).filter(Boolean).join(' · ');
    sub = items.slice(2).map((it) => it.value).concat([time, by]).filter(Boolean).join(' · ');
  }
  return {
    id: r._id,
    icon: ICON_OF[type] || 'camera',
    color: TC[type] || '#8A8378',
    title,
    sub,
    val: recordVal(r),
    note: type === 'daily' ? (r.note || '') : '',
    photos: type === 'daily' ? (r.photos || []) : [],
    videos: type === 'daily' ? (r.videos || []) : []
  };
}

function recordVal(r) {
  const d = r.data || {};
  if (r.type === 'weight' && typeof d.weight === 'number') return d.weight + ' kg';
  if (r.type === 'expense' && typeof d.amount === 'number') return '-¥' + d.amount;
  return '';
}
