// pages/pet/detail/index.js
// 宠物详情页：档案头卡 + 吸顶分段选择器（时间线 / 健康 / 花销 / 相册）
// 视觉 1:1 对照 doc/index.html「宠物详情 · 时间线」「健康档案」两个效果图
var petService = require('../../../services/petService.js');
var recordService = require('../../../services/recordService.js');
var recordMeta = require('../../../utils/recordMeta.js');
var dateUtil = require('../../../utils/date.js');
var constants = require('../../../utils/constants.js');
var petStore = require('../../../stores/petStore.js');
var icons = require('../../../components/icons.js');
var utils = require('../../../components/utils.js');

// 健康/花销/相册 Tab 数据从时间线前端过滤（不新增请求），最多深载 10 页（200 条）
var DEEP_MAX_PAGES = 10;

var FILTER_TABS = [
  { key: 'all', name: '全部' },
  { key: 'health', name: '健康' },
  { key: 'feed', name: '喂养' },
  { key: 'expense', name: '花销' },
  { key: 'daily', name: '日常' },
];

// 筛选映射（任务约定）：健康 / 喂养 / 花销，其余归入「日常」
var FILTER_GROUPS = {
  health: ['vaccine', 'deworm', 'medical', 'medication', 'surgery'],
  feed: ['feed', 'water'],
  expense: ['expense'],
};

var HEALTH_SECTIONS = [
  { type: 'vaccine', label: '疫苗' },
  { type: 'deworm', label: '驱虫' },
  { type: 'medication', label: '用药' },
  { type: 'medical', label: '就医' },
  { type: 'surgery', label: '手术' },
];

// 花销分类占比条配色：取 §2.4 类型色板，保证全产品色彩纪律
var EXPENSE_CATEGORY_COLORS = {
  food: '#B0803B', snack: '#C08A4E', medical: '#D24B42', supply: '#8A7355',
  toy: '#A87BA8', groom: '#5A9EA8', boarding: '#6B8F4E', insurance: '#4A7FC7',
  other: '#7A7A76',
};

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTime(ts) {
  var d = new Date(ts);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function fmtMMDD(ts) {
  var d = new Date(ts);
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function fmtMoney(cents) {
  return '¥' + ((cents || 0) / 100).toFixed(2);
}

function catName(key) {
  var name = '其他';
  constants.EXPENSE_CATEGORIES.forEach(function (c) {
    if (c.key === key) name = c.name;
  });
  return name;
}

function speciesName(key) {
  var name = '其他';
  constants.SPECIES.forEach(function (s) {
    if (s.key === key) name = s.name;
  });
  return name;
}

function matchFilter(type, filter) {
  if (filter === 'all') return true;
  if (filter === 'daily') {
    return FILTER_GROUPS.health.indexOf(type) === -1 &&
      FILTER_GROUPS.feed.indexOf(type) === -1 &&
      FILTER_GROUPS.expense.indexOf(type) === -1;
  }
  return (FILTER_GROUPS[filter] || []).indexOf(type) !== -1;
}

// data 字段明细（展开卡片用）：按 recordMeta.formFields 逐行格式化
function formatField(f, v, type) {
  if (f.type === 'date') return dateUtil.fmtDate(v);
  if (f.unit === '分') return fmtMoney(v);
  if (type === 'feed' && f.key === 'meal') return recordMeta.MEAL_NAMES[v] || v;
  if (type === 'deworm' && f.key === 'kind') return recordMeta.DEWORM_KIND_NAMES[v] || v;
  if (type === 'poop' && f.key === 'status') return recordMeta.POOP_STATUS_NAMES[v] || v;
  if (type === 'vomit' && f.key === 'content') return recordMeta.VOMIT_CONTENT_NAMES[v] || v;
  if (type === 'expense' && f.key === 'category') return catName(v);
  if (type === 'groom' && f.key === 'items') {
    return v.map(function (k) { return recordMeta.GROOM_ITEM_NAMES[k] || k; }).join('、');
  }
  if (f.key === 'checkins') return '已打卡 ' + v.length + ' 次';
  if (Array.isArray(v)) return v.join('、');
  return ('' + v) + (f.unit ? ' ' + f.unit : '');
}

function buildDetailLines(r) {
  var meta = recordMeta.getMeta(r.type);
  var data = r.data || {};
  var lines = [];
  (meta.formFields || []).forEach(function (f) {
    var v = data[f.key];
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    lines.push({ label: f.label, value: formatField(f, v, r.type) });
  });
  return lines;
}

Page({
  data: {
    petId: '',
    pet: null,
    header: null,
    loading: true,
    loadError: false,

    tabs: ['时间线', '健康', '花销', '相册'],
    tab: 0,

    // 时间线
    filterTabs: FILTER_TABS,
    filter: 'all',
    records: [],      // 已加载记录的视图模型（按 date 倒序）
    groups: [],       // 按日分组后的时间线
    page: 0,
    hasMore: true,
    timelineError: false,
    expandedId: '',

    // 健康
    healthSections: [],
    weightPoints: [],
    chartMonths: [],

    // 花销
    expense: { totalText: '¥0.00', segments: [], recent: [] },
    expenseIconTint: '#4E8A681A',

    // 相册
    albumGroups: [],
    albumUrls: [],

    chevUri: icons.maskIcon('chevron-right'),
  },

  onLoad: function (options) {
    var id = (options && options.id) || '';
    this.setData({ petId: id });
    // 页面间宠物上下文锁定
    petStore.set({ currentPetId: id });
    this.reload();
  },

  onShow: function () {
    // 从记录表单 / 档案编辑返回时刷新
    if (this._needRefresh) {
      this._needRefresh = false;
      this.reload();
    }
  },

  onReachBottom: function () {
    if (this.data.tab !== 0 || !this.data.hasMore || this._loadingRecords) return;
    this._loadTimeline(false);
  },

  /* ---------------- 数据加载 ---------------- */

  reload: function () {
    var self = this;
    this.setData({ loading: true, loadError: false });
    petService.getPet(this.data.petId).then(function (pet) {
      self.setData({ pet: pet, header: self._buildHeader(pet), loading: false });
      self._loadTimeline(true);
    }, function () {
      self.setData({ loading: false, loadError: true });
    });
  },

  retryTimeline: function () {
    this._loadTimeline(true);
  },

  _buildHeader: function (pet) {
    return {
      breedLine: [
        pet.breed || speciesName(pet.species),
        dateUtil.fmtAge(pet.birthDate),
        pet.neutered ? '已绝育' : '未绝育',
      ].join(' · '),
      adoptText: dateUtil.fmtAdoptDays(pet.adoptDate),
      genderSymbol: pet.gender === 'female' ? '♀' : '♂',
      genderClass: pet.gender === 'female' ? 'female' : 'male',
      goalText: pet.weightGoal ? '目标 ' + pet.weightGoal + 'kg' : '',
    };
  },

  _loadTimeline: function (reset) {
    var self = this;
    if (this._loadingRecords) return;
    this._loadingRecords = true;
    var page = reset ? 0 : this.data.page;
    if (reset) {
      this.setData({ records: [], groups: [], page: 0, hasMore: true, timelineError: false, expandedId: '' });
    }
    recordService.getTimeline(this.data.petId, page).then(function (res) {
      self._loadingRecords = false;
      var list = (res.list || []).map(function (r) { return self._buildRecord(r); });
      var records = reset ? list : self.data.records.concat(list);
      self.setData({
        records: records,
        page: (typeof res.page === 'number' ? res.page : page) + 1,
        hasMore: !!res.hasMore,
        groups: self._group(records, self.data.filter),
        timelineError: false,
      });
      self._rebuildTab();
    }, function () {
      self._loadingRecords = false;
      if (reset) {
        self.setData({ timelineError: true });
      } else {
        self._toast('fail', '网络开小差了，请重试');
      }
    });
  },

  // 健康/花销/相册 Tab 打开时，把剩余分页补齐（封顶 DEEP_MAX_PAGES 页）
  _ensureDeep: function (cb) {
    var self = this;
    this._deepCbs = this._deepCbs || [];
    if (cb) this._deepCbs.push(cb);
    if (this._ensuring) return;
    this._ensuring = true;

    function flush() {
      self._ensuring = false;
      var cbs = self._deepCbs;
      self._deepCbs = [];
      cbs.forEach(function (fn) { fn(); });
    }

    function step() {
      if (!self.data.hasMore || self.data.page >= DEEP_MAX_PAGES) {
        flush();
        return;
      }
      if (self._loadingRecords) {
        setTimeout(step, 300);
        return;
      }
      self._loadingRecords = true;
      recordService.getTimeline(self.data.petId, self.data.page).then(function (res) {
        self._loadingRecords = false;
        var list = (res.list || []).map(function (r) { return self._buildRecord(r); });
        var records = self.data.records.concat(list);
        self.setData({
          records: records,
          page: (typeof res.page === 'number' ? res.page : self.data.page) + 1,
          hasMore: !!res.hasMore,
          groups: self._group(records, self.data.filter),
        });
        step();
      }, function () {
        self._loadingRecords = false;
        self._deepCbs = [];
        self._ensuring = false;
        self._toast('fail', '网络开小差了，请重试');
      });
    }
    step();
  },

  _buildRecord: function (r) {
    var meta = recordMeta.getMeta(r.type);
    var data = r.data || {};
    var sub = [fmtTime(r.date)];
    if (data.hospital) sub.push(data.hospital);
    if (data.nextDate) sub.push('下次 ' + dateUtil.fmtDate(data.nextDate));
    return {
      _id: r._id,
      type: r.type,
      date: r.date,
      data: data,
      note: r.note || '',
      photos: r.photos || [],
      thumbs: (r.photos || []).slice(0, 3),
      color: meta.color,
      tint: meta.color + '1A',
      summary: meta.summary(data),
      sub: sub.join(' · '),
      // 疫苗/驱虫带 nextDate 时云端会自动建周期提醒（recordService.saveRecord 约定）
      hasReminder: (r.type === 'vaccine' || r.type === 'deworm') && !!data.nextDate,
      detailLines: buildDetailLines(r),
      collapsing: false,
    };
  },

  _group: function (records, filter) {
    var groups = [];
    var curKey = '';
    records.forEach(function (r) {
      if (!matchFilter(r.type, filter)) return;
      var key = '' + dateUtil.startOfDay(r.date);
      if (key !== curKey) {
        curKey = key;
        groups.push({ key: key, label: dateUtil.fmtDayGroup(r.date), items: [] });
      }
      groups[groups.length - 1].items.push(r);
    });
    return groups;
  },

  _rebuildTab: function () {
    var tab = this.data.tab;
    if (tab === 1) this._buildHealth();
    else if (tab === 2) this._buildExpense();
    else if (tab === 3) this._buildAlbum();
  },

  /* ---------------- Tab 与筛选 ---------------- */

  onTabChange: function (e) {
    var index = e.detail.index;
    var self = this;
    this.setData({ tab: index });
    if (index === 0) return;
    this._ensureDeep(function () {
      self._rebuildTab();
    });
  },

  onFilterTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.filter) return;
    utils.haptic('light');
    this.setData({
      filter: key,
      groups: this._group(this.data.records, key),
      expandedId: '',
    });
  },

  /* ---------------- 时间线条目交互 ---------------- */

  onRecordTap: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  onRecordLongPress: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    utils.haptic('light');
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: function (res) {
        if (res.tapIndex === 0) {
          self._needRefresh = true;
          wx.navigateTo({
            url: '/pages/record/edit/index?recordId=' + id + '&petId=' + self.data.petId,
          });
        } else if (res.tapIndex === 1) {
          self._confirmDeleteRecord(id);
        }
      },
    });
  },

  _confirmDeleteRecord: function (id) {
    var self = this;
    wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确定删除这条记录吗？',
      confirmText: '删除',
      confirmColor: '#D24B42',
      success: function (res) {
        if (res.confirm) self._deleteRecord(id);
      },
    });
  },

  _deleteRecord: function (id) {
    var self = this;
    recordService.deleteRecord(id).then(function () {
      // 行高收起动画（350ms Snap）后再移除数据
      var groups = self.data.groups;
      var patch = {};
      var found = false;
      for (var g = 0; g < groups.length && !found; g++) {
        for (var i = 0; i < groups[g].items.length; i++) {
          if (groups[g].items[i]._id === id) {
            patch['groups[' + g + '].items[' + i + '].collapsing'] = true;
            found = true;
            break;
          }
        }
      }
      self.setData(patch);
      setTimeout(function () {
        var records = self.data.records.filter(function (r) { return r._id !== id; });
        self.setData({
          records: records,
          groups: self._group(records, self.data.filter),
          expandedId: self.data.expandedId === id ? '' : self.data.expandedId,
        });
        self._rebuildTab();
      }, 360);
      self._toast('success', '已删除');
    }, function () {
      self._toast('fail', '网络开小差了，请重试');
    });
  },

  onThumbTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var src = e.currentTarget.dataset.src;
    var record = null;
    this.data.records.forEach(function (r) {
      if (r._id === id) record = r;
    });
    if (!record || !record.photos.length) return;
    wx.previewImage({ current: src, urls: record.photos });
  },

  /* ---------------- 健康 Tab ---------------- */

  _buildHealth: function () {
    var records = this.data.records;
    var now = Date.now();
    var since = now - 90 * dateUtil.DAY_MS;

    // 体重趋势：近 90 天，按时间升序
    var weights = records.filter(function (r) {
      return r.type === 'weight' && r.date >= since;
    }).map(function (r) {
      return { date: r.date, value: Number(r.data.value) || 0 };
    }).filter(function (p) {
      return p.value > 0;
    }).sort(function (a, b) {
      return a.date - b.date;
    });

    // X 轴月份标签：首末点之间等距 4 个
    var months = [];
    if (weights.length >= 3) {
      var first = weights[0].date;
      var last = weights[weights.length - 1].date;
      for (var i = 0; i <= 3; i++) {
        var ts = first + ((last - first) * i) / 3;
        var label = (new Date(ts).getMonth() + 1) + '月';
        if (months.indexOf(label) === -1) months.push(label);
      }
    }

    // 五个健康分区：最近一条 + 状态 pill + 展开最近 5 条
    var old = {};
    this.data.healthSections.forEach(function (s) { old[s.type] = s.expanded; });
    var sections = HEALTH_SECTIONS.map(function (sec) {
      var list = records.filter(function (r) { return r.type === sec.type; });
      var latest = list[0] || null;
      var meta = recordMeta.getMeta(sec.type);
      var title = sec.label;
      var sub = '';
      var pill = null;
      if (latest) {
        title = sec.label + ' · ' + healthShortText(latest);
        var subParts = [dateUtil.fmtDate(latest.date)];
        if (latest.data.hospital) subParts.push(latest.data.hospital);
        if (sec.type === 'medical' && latest.data.cost) subParts.push('花费 ' + fmtMoney(latest.data.cost));
        if (sec.type === 'medication' && latest.data.dailyTimes) subParts.push('每日 ' + latest.data.dailyTimes + ' 次');
        sub = subParts.join(' · ');
        pill = healthPill(latest, now);
      } else {
        title = sec.label + ' · 暂无记录';
      }
      return {
        type: sec.type,
        color: meta.color,
        tint: meta.color + '1A',
        title: title,
        sub: sub,
        pill: pill,
        expanded: !!old[sec.type],
        list: list.slice(0, 5).map(function (r) {
          return { _id: r._id, summary: r.summary, dateText: dateUtil.fmtDate(r.date) };
        }),
      };
    });

    var self = this;
    this.setData({
      healthSections: sections,
      weightPoints: weights,
      chartMonths: months,
    }, function () {
      if (weights.length >= 3) {
        setTimeout(function () { self._drawChart(); }, 80);
      }
    });
  },

  onSectionTap: function (e) {
    var type = e.currentTarget.dataset.type;
    var sections = this.data.healthSections.map(function (s) {
      if (s.type === type) s.expanded = !s.expanded;
      return s;
    });
    utils.haptic('light');
    this.setData({ healthSections: sections });
  },

  // 体重趋势图：canvas type="2d"，2rpx Primary 线 + Primary 16%→0% 面积渐变（全产品唯一渐变）
  // 注意：canvas 读不了 CSS 变量，颜色用 token 字面值（与 paw-loading 组件同一例外）
  _drawChart: function () {
    var self = this;
    this.createSelectorQuery()
      .select('#weightChart')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        var canvas = res[0].node;
        var ctx = canvas.getContext('2d');
        var dpr = 2;
        try { dpr = wx.getWindowInfo().pixelRatio || 2; } catch (e) { /* 旧基础库 */ }
        var w = res[0].width;
        var h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        var pts = self.data.weightPoints;
        var goal = self.data.pet && self.data.pet.weightGoal ? Number(self.data.pet.weightGoal) : 0;
        var values = pts.map(function (p) { return p.value; });
        if (goal) values.push(goal);
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        if (max - min < 0.4) {
          var mid = (max + min) / 2;
          max = mid + 0.2;
          min = mid - 0.2;
        }

        var padL = 6, padR = 6, padT = goal ? 20 : 8, padB = 6;
        var n = pts.length;
        function x(i) { return padL + (i * (w - padL - padR)) / (n - 1); }
        function y(v) { return padT + ((max - v) * (h - padT - padB)) / (max - min); }

        ctx.clearRect(0, 0, w, h);

        // 目标体重虚线 + 标签
        if (goal) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#B9AE9E';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y(goal));
          ctx.lineTo(w, y(goal));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#7E7264';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('目标 ' + goal + 'kg', w - 4, y(goal) - 5);
        }

        // 面积渐变 Primary 16% → 0%
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(62, 54, 44, 0.16)');
        grad.addColorStop(1, 'rgba(62, 54, 44, 0)');
        ctx.beginPath();
        ctx.moveTo(x(0), y(pts[0].value));
        for (var i = 1; i < n; i++) ctx.lineTo(x(i), y(pts[i].value));
        ctx.lineTo(x(n - 1), h);
        ctx.lineTo(x(0), h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 折线
        ctx.beginPath();
        ctx.moveTo(x(0), y(pts[0].value));
        for (var j = 1; j < n; j++) ctx.lineTo(x(j), y(pts[j].value));
        ctx.strokeStyle = '#3E362C';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // 末端点
        ctx.beginPath();
        ctx.arc(x(n - 1), y(pts[n - 1].value), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#3E362C';
        ctx.fill();
      });
  },

  /* ---------------- 花销 Tab ---------------- */

  _buildExpense: function () {
    var records = this.data.records;
    var monthStart = dateUtil.startOfMonth(Date.now());
    var expenses = records.filter(function (r) { return r.type === 'expense'; });
    var month = expenses.filter(function (r) { return r.date >= monthStart; });

    var total = 0;
    var byCat = {};
    month.forEach(function (r) {
      var cents = Number(r.data.amount) || 0;
      total += cents;
      var key = r.data.category || 'other';
      byCat[key] = (byCat[key] || 0) + cents;
    });

    var segments = Object.keys(byCat).map(function (key) {
      return {
        key: key,
        name: catName(key),
        color: EXPENSE_CATEGORY_COLORS[key] || EXPENSE_CATEGORY_COLORS.other,
        cents: byCat[key],
        pct: total > 0 ? Math.round((byCat[key] / total) * 100) : 0,
        amountText: fmtMoney(byCat[key]),
      };
    }).sort(function (a, b) { return b.cents - a.cents; });

    var recent = expenses.slice(0, 5).map(function (r) {
      return {
        _id: r._id,
        title: r.data.itemName || catName(r.data.category),
        sub: dateUtil.fmtDate(r.date) + ' · ' + catName(r.data.category),
        amountText: '-' + fmtMoney(r.data.amount),
      };
    });

    this.setData({
      expense: {
        totalText: fmtMoney(total),
        segments: segments,
        recent: recent,
      },
    });
  },

  goExpenseAll: function () {
    wx.navigateTo({ url: '/pages/expense/index?petId=' + this.data.petId });
  },

  /* ---------------- 相册 Tab ---------------- */

  _buildAlbum: function () {
    var photos = [];
    this.data.records.forEach(function (r) {
      (r.photos || []).forEach(function (src) {
        photos.push({ src: src, date: r.date });
      });
    });
    photos.sort(function (a, b) { return b.date - a.date; });

    var groups = [];
    var keyMap = {};
    var urls = [];
    photos.forEach(function (p) {
      var d = new Date(p.date);
      var key = d.getFullYear() * 100 + d.getMonth();
      if (!keyMap[key]) {
        keyMap[key] = {
          key: '' + key,
          title: d.getFullYear() + '年' + (d.getMonth() + 1) + '月',
          photos: [],
        };
        groups.push(keyMap[key]);
      }
      keyMap[key].photos.push({ src: p.src, flatIndex: urls.length });
      urls.push(p.src);
    });

    this.setData({ albumGroups: groups, albumUrls: urls });
  },

  onPhotoTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var urls = this.data.albumUrls;
    if (!urls.length) return;
    wx.previewImage({ current: urls[index], urls: urls });
  },

  /* ---------------- 跳转 ---------------- */

  goEdit: function () {
    this._needRefresh = true;
    wx.navigateTo({ url: '/pages/pet/edit/index?id=' + this.data.petId });
  },

  goAddRecord: function () {
    this._needRefresh = true;
    wx.navigateTo({ url: '/pages/record/edit/index?petId=' + this.data.petId });
  },

  _toast: function (type, text) {
    var toast = this.selectComponent('#toast');
    if (toast) toast.show({ type: type, text: text });
  },
});

/* ---------------- 健康分区辅助 ---------------- */

// 分区标题的短摘要（「疫苗 · 猫三联」式）
function healthShortText(record) {
  var d = record.data || {};
  switch (record.type) {
    case 'vaccine': return d.vaccineName || record.summary;
    case 'deworm':
      return ((recordMeta.DEWORM_KIND_NAMES[d.kind] || '驱虫') + (d.product ? ' ' + d.product : ''));
    case 'medication': return (d.medicine || '') + (d.dose ? ' ' + d.dose : '');
    case 'medical': return d.diagnosis || d.symptom || record.summary;
    case 'surgery': return d.surgeryName || record.summary;
    default: return record.summary;
  }
}

// 状态 pill：下次日期（焦糖）/ 逾期红 / 进行中绿
function healthPill(record, now) {
  var d = record.data || {};
  if (record.type === 'vaccine' || record.type === 'deworm') {
    if (!d.nextDate) return null;
    var days = dateUtil.diffDays(d.nextDate, now);
    if (days < 0) return { cls: 'danger', text: '逾期 ' + (-days) + ' 天' };
    if (days === 0) return { cls: 'warn', text: '今天到期' };
    return { cls: 'warn', text: '下次 ' + fmtMMDD(d.nextDate) };
  }
  if (record.type === 'medication') {
    var today = dateUtil.startOfDay(now);
    var start = d.startDate ? dateUtil.startOfDay(d.startDate) : 0;
    var end = d.endDate ? dateUtil.startOfDay(d.endDate) : 0;
    if (end && end < today) return { cls: 'grey', text: '已结束' };
    if (start && today >= start && (!end || today <= end)) return { cls: 'ok', text: '进行中' };
    return null;
  }
  return null;
}
