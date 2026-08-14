// pages/expense/index.js
// 花销记账页：月度总览（含预算进度条）+ 按日分组账单列表（上拉分页、滑动删除）
//
// 数据口径：
// - 月度总支出：statsService.getStats({petId, range:'month'}) 的 expenseByMonth 取当月（云端聚合，单位分）
// - 预算：settingStore.budget（分，0 = 未设置，不显示进度条）
// - 账单列表：云端 getTimeline 必须按 petId 分页（无全量接口），单宠 = 直接分页后前端
//   过滤 type=expense；「全部宠物」= 每只宠物各自维护分页游标并行拉取、前端合并按 date
//   倒序（任务允许的简化方案，每轮每只宠物取一页）。
var recordService = require('../../services/recordService.js');
var statsService = require('../../services/statsService.js');
var petService = require('../../services/petService.js');
var petStore = require('../../stores/petStore.js');
var settingStore = require('../../stores/settingStore.js');
var dateUtil = require('../../utils/date.js');
var constants = require('../../utils/constants.js');

var CATEGORY_NAMES = {};
constants.EXPENSE_CATEGORIES.forEach(function (c) {
  CATEGORY_NAMES[c.key] = c.name;
});

// 分类 -> record-icon 类型（record-icon 只支持 16 种记录类型，无 box/toy 图标，
// 粮食/零食=feed、医疗=medical、美容=groom，其余用 expense 通用图标）
var CATEGORY_ICON = {
  food: 'feed',
  snack: 'feed',
  medical: 'medical',
  groom: 'groom',
};

// 每轮上拉最多连续翻页数（防止一页里 expense 太稀疏时死循环拉取）
var MAX_ROUND = 5;

Page({
  data: {
    petId: '',
    petName: '全部宠物',
    petOptions: [],
    pickerVisible: false,
    // 月度总览
    monthLabel: '',
    totalInt: '0',
    totalDec: '.00',
    hasBudget: false,
    overBudget: false,
    overPct: 0,
    budgetText: '',
    usedPct: 0,
    barPct: 0,
    // 列表
    groups: [],
    loading: true,
    loadFail: false,
    loadingMore: false,
    noMore: false,
    empty: false,
  },

  onLoad: function (options) {
    var self = this;
    this._pets = [];
    this._items = [];     // 已拉取的 expense 记录（合并、按 date 倒序）
    this._cursors = [];   // 每宠分页游标 {petId, page, hasMore}
    this._listGen = 0;    // 列表代次：refresh 重置时作废在途分页
    this._petId = (options && options.petId) || '';
    // 预算变更跟随（设置页改完回来即生效）
    this._offSettings = settingStore.subscribe(function () {
      self._renderOverview(self._monthTotal);
    });
    this._init();
  },

  _init: function () {
    var self = this;
    this._ensurePets()
      .then(function (pets) {
        self._pets = pets;
        self.setData({
          petId: self._petId,
          petName: self._nameOf(self._petId),
          petOptions: [{ _id: '', name: '全部宠物' }].concat(
            pets.map(function (p) {
              return { _id: p._id, name: p.name };
            })
          ),
        });
        self._loaded = true;
        self.refresh();
      })
      .catch(function () {
        self.setData({ loading: false, loadFail: true });
      });
  },

  onUnload: function () {
    if (this._offSettings) {
      this._offSettings();
    }
  },

  onShow: function () {
    // 记完账回来静默刷新
    if (this._shownOnce && this._loaded) {
      this.refresh(true);
    }
    this._shownOnce = true;
  },

  onReachBottom: function () {
    this._loadMore();
  },

  _ensurePets: function () {
    var cached = petStore.get().petList;
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return petService.listPets().then(function (list) {
      petStore.setPetList(list || []);
      return petStore.get().petList;
    });
  },

  _nameOf: function (petId) {
    if (!petId) {
      return '全部宠物';
    }
    var found = null;
    this._pets.forEach(function (p) {
      if (p._id === petId) {
        found = p;
      }
    });
    return found ? found.name : '全部宠物';
  },

  /* ================= 月度总览 ================= */

  // 整体刷新：总览（stats 月聚合）+ 列表（重置分页）
  refresh: function (quiet) {
    var self = this;
    if (!quiet) {
      this.setData({ loading: true, loadFail: false });
    }
    this._resetList();
    statsService
      .getStats({ petId: this.data.petId, range: 'month' })
      .then(function (stats) {
        var now = new Date();
        var curKey = now.getFullYear() + '-' + (now.getMonth() + 1);
        var total = 0;
        ((stats && stats.expenseByMonth) || []).forEach(function (m) {
          if (m.month === curKey) {
            total = m.total || 0;
          }
        });
        self._monthTotal = total;
        self._renderOverview(total);
        self.setData({ loading: false, loadFail: false });
      })
      .catch(function () {
        self.setData({ loading: false, loadFail: true });
      });
    this._loadMore();
  },

  _renderOverview: function (total) {
    total = total || 0;
    var now = new Date();
    var parts = (total / 100).toFixed(2).split('.');
    var budget = settingStore.get().budget || 0; // 分
    var patch = {
      monthLabel: now.getMonth() + 1 + '月总支出',
      totalInt: parts[0],
      totalDec: '.' + parts[1],
      hasBudget: budget > 0,
    };
    if (budget > 0) {
      var usedPct = Math.round((total / budget) * 100);
      patch.usedPct = usedPct;
      patch.barPct = Math.min(100, usedPct);
      patch.overBudget = total > budget;
      patch.overPct = usedPct - 100;
      // 预算文案：整元不带小数
      patch.budgetText = '预算 ¥' + (budget % 100 === 0 ? budget / 100 : (budget / 100).toFixed(2));
    }
    this.setData(patch);
  },

  onRetry: function () {
    if (!this._loaded) {
      // 宠物列表都没拉到的场景，整页重来
      this.setData({ loading: true, loadFail: false });
      this._init();
      return;
    }
    this.refresh();
  },

  /* ================= 宠物筛选 ================= */

  onOpenPicker: function () {
    this.setData({ pickerVisible: true });
  },

  onClosePicker: function () {
    this.setData({ pickerVisible: false });
  },

  onPickPet: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({
      petId: id,
      petName: this._nameOf(id),
      pickerVisible: false,
    });
    this.refresh();
  },

  /* ================= 账单列表（分页） ================= */

  _resetList: function () {
    this._listGen += 1; // 作废旧筛选条件下的在途分页回调
    this._items = [];
    var petIds = this.data.petId
      ? [this.data.petId]
      : this._pets.map(function (p) {
          return p._id;
        });
    this._cursors = petIds.map(function (id) {
      return { petId: id, page: 0, hasMore: true };
    });
    this.setData({ groups: [], loadingMore: false, noMore: this._cursors.length === 0, empty: false });
  },

  _loadMore: function () {
    if (this.data.loadingMore || this.data.noMore || !this._cursors.length) {
      return;
    }
    this.setData({ loadingMore: true });
    this._loadRound(this._listGen, 0);
  },

  // 一轮：每只未完宠物各翻一页，过滤 expense 合并；不足 20 条且还有下一页则继续翻
  _loadRound: function (gen, round) {
    var self = this;
    var active = this._cursors.filter(function (c) {
      return c.hasMore;
    });
    if (!active.length || round >= MAX_ROUND) {
      this._finishRound(gen, active.length > 0);
      return;
    }
    var calls = active.map(function (c) {
      return recordService.getTimeline(c.petId, c.page).then(function (res) {
        c.page += 1;
        c.hasMore = !!(res && res.hasMore);
        return ((res && res.list) || []).filter(function (r) {
          return r.type === 'expense';
        });
      }, function () {
        c.hasMore = false; // 单宠失败停止翻它的页，不影响其他宠物
        return [];
      });
    });
    Promise.all(calls).then(function (lists) {
      if (gen !== self._listGen) {
        return; // 期间发生了 refresh/换宠物，丢弃这批旧数据
      }
      var got = 0;
      lists.forEach(function (l) {
        got += l.length;
        self._items = self._items.concat(l);
      });
      var anyMore = self._cursors.some(function (c) {
        return c.hasMore;
      });
      if (got < 20 && anyMore && round + 1 < MAX_ROUND) {
        self._loadRound(gen, round + 1);
      } else {
        self._finishRound(gen, anyMore);
      }
    });
  },

  _finishRound: function (gen, anyMore) {
    if (gen !== this._listGen) {
      return;
    }
    this._items.sort(function (a, b) {
      return b.date - a.date;
    });
    this.setData({
      groups: this._groupItems(this._items),
      loadingMore: false,
      noMore: !anyMore,
      empty: this._items.length === 0,
    });
  },

  // 按日分组：「8月10日 周日」
  _groupItems: function (items) {
    var petMap = {};
    this._pets.forEach(function (p) {
      petMap[p._id] = p.name;
    });
    var showPet = !this.data.petId;
    var groups = [];
    var index = {};
    items.forEach(function (r) {
      var dayKey = dateUtil.startOfDay(r.date);
      var g = index[dayKey];
      if (!g) {
        g = { key: 'g' + dayKey, title: dateUtil.fmtDayGroup(r.date), items: [] };
        index[dayKey] = g;
        groups.push(g);
      }
      var data = r.data || {};
      var cat = data.category || 'other';
      var catName = CATEGORY_NAMES[cat] || '其他';
      var d = new Date(r.date);
      var sub = catName + ' · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
      if (showPet && petMap[r.petId]) {
        sub += ' · ' + petMap[r.petId];
      }
      g.items.push({
        id: r._id,
        icon: CATEGORY_ICON[cat] || 'expense',
        title: data.itemName || catName,
        sub: sub,
        amountText: '-¥' + ((data.amount || 0) / 100).toFixed(2),
      });
    });
    // items 已按 date 倒序，分组按首次出现顺序即为日期倒序
    return groups;
  },

  /* ================= 行操作 ================= */

  onSwipeAction: function (e) {
    var self = this;
    if (e.detail.key !== 'del') {
      return;
    }
    var id = e.currentTarget.dataset.id;
    recordService
      .deleteRecord(id)
      .then(function () {
        self.selectComponent('#toast').show({ type: 'success', text: '已删除' });
        // 本地移除并同步月度总支出
        var removed = null;
        self._items = self._items.filter(function (r) {
          if (r._id === id) {
            removed = r;
            return false;
          }
          return true;
        });
        if (removed && removed.date >= dateUtil.startOfMonth(Date.now())) {
          self._monthTotal = Math.max(0, (self._monthTotal || 0) - ((removed.data && removed.data.amount) || 0));
          self._renderOverview(self._monthTotal);
        }
        self.setData({
          groups: self._groupItems(self._items),
          empty: self._items.length === 0,
        });
      })
      .catch(function (err) {
        self.selectComponent('#toast').show({ type: 'fail', text: (err && err.msg) || '网络开小差了，请重试' });
      });
  },

  onFab: function () {
    wx.navigateTo({
      url: '/pages/record/edit/index?type=expense&petId=' + this.data.petId,
    });
  },
});
