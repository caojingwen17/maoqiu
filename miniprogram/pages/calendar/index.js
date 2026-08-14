// pages/calendar/index.js
// 日历页：白卡月历 + 类型色圆点 + 点击日期 half 档 sheet 看当日（记录 + 提醒）
//
// 数据口径（简化说明）：云端没有「按日期范围查记录」的接口，recordService.getTimeline
// 必须按 petId 分页查。这里采用任务允许的兜底方案：切月时聚合当前用户各宠物
// timeline 第一页（每宠最近 20 条）+ reminderService.listReminders 的进行中提醒，
// 过滤出当月数据。因此超出各宠最近 20 条的历史月份不会出现圆点，属已知简化。
var recordService = require('../../services/recordService.js');
var reminderService = require('../../services/reminderService.js');
var petService = require('../../services/petService.js');
var petStore = require('../../stores/petStore.js');
var recordMeta = require('../../utils/recordMeta.js');
var dateUtil = require('../../utils/date.js');
var icons = require('../../components/icons.js');

// 圆点分类（PRD §12：健康=红 / 喂养=绿 / 花销=黄 / 提醒=蓝，颜色走 wxss var）
var HEALTH_TYPES = ['vaccine', 'deworm', 'medical', 'medication', 'surgery'];
var FEED_TYPES = ['feed', 'water'];
var DOT_ORDER = ['health', 'feed', 'expense', 'reminder'];

function dotKind(type) {
  if (HEALTH_TYPES.indexOf(type) > -1) {
    return 'health';
  }
  if (FEED_TYPES.indexOf(type) > -1) {
    return 'feed';
  }
  if (type === 'expense') {
    return 'expense';
  }
  return '';
}

Page({
  data: {
    year: 2026,
    month: 0,
    monthTitle: '',
    cells: [],
    loading: true,
    loadFail: false,
    // 当日 sheet
    sheetVisible: false,
    dayTitle: '',
    dayRecords: [],
    dayReminders: [],
    dayEmpty: false,
    chevUri: '',
  },

  onLoad: function () {
    var now = new Date();
    this._pets = [];
    this._selectedTs = 0;
    this._recordDays = {};
    this._reminderDays = {};
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth(),
      // colorIcon 描边色烧录进 SVG，无法走 CSS 变量；#7E7264 = --text-secondary
      chevUri: icons.colorIcon('chevron-right', '#7E7264'),
    });
    this._loaded = true;
    this.loadMonth();
  },

  onShow: function () {
    // 首次 onLoad 已加载；之后回到本页静默刷新（可能记了新记录）
    if (this._shownOnce) {
      this.loadMonth(true);
    }
    this._shownOnce = true;
  },

  // 宠物列表：优先读全局缓存，缺失时拉取并回填
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

  // 拉当月数据并重绘；quiet=true 时不出骨架屏（sheet 打开中/静默刷新）
  loadMonth: function (quiet) {
    var self = this;
    if (!quiet) {
      this.setData({ loading: true, loadFail: false });
    }
    return this._ensurePets()
      .then(function (pets) {
        self._pets = pets;
        var recordCalls = pets.map(function (p) {
          return recordService.getTimeline(p._id, 0).then(function (res) {
            return res.list || [];
          }, function () {
            return null; // 单宠失败不拖垮整月
          });
        });
        var reminderCall = reminderService.listReminders().then(function (res) {
          return res;
        }, function () {
          return null;
        });
        return Promise.all([Promise.all(recordCalls), reminderCall]);
      })
      .then(function (results) {
        var lists = results[0];
        var reminders = results[1];
        var anyRecordOk = lists.some(function (l) { return l !== null; });
        // 有宠物但记录与提醒全挂 = 判为整体失败（云服务未配置场景）
        if (!anyRecordOk && reminders === null && self._pets.length > 0) {
          self.setData({ loading: false, loadFail: true });
          return;
        }
        self._buildBuckets(lists, reminders);
        self._renderMonth();
        self.setData({ loading: false, loadFail: false });
      })
      .catch(function () {
        self.setData({ loading: false, loadFail: true });
      });
  },

  // 记录/提醒按「日 0 点」分桶，只保留当前展示月
  _buildBuckets: function (lists, reminders) {
    var monthStart = new Date(this.data.year, this.data.month, 1).getTime();
    var monthEnd = new Date(this.data.year, this.data.month + 1, 1).getTime();
    var recordDays = {};
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (r) {
        if (r.date >= monthStart && r.date < monthEnd) {
          var key = dateUtil.startOfDay(r.date);
          (recordDays[key] = recordDays[key] || []).push(r);
        }
      });
    });
    var reminderDays = {};
    var active = (reminders && reminders.active) || [];
    active.forEach(function (rem) {
      if (rem.remindAt >= monthStart && rem.remindAt < monthEnd) {
        var key = dateUtil.startOfDay(rem.remindAt);
        (reminderDays[key] = reminderDays[key] || []).push(rem);
      }
    });
    this._recordDays = recordDays;
    this._reminderDays = reminderDays;
  },

  _dotsFor: function (ts, todayStart) {
    var kinds = {};
    // 未来日期只显示提醒圆点（PRD §12）
    if (ts <= todayStart) {
      (this._recordDays[ts] || []).forEach(function (r) {
        var k = dotKind(r.type);
        if (k) {
          kinds[k] = true;
        }
      });
    }
    if ((this._reminderDays[ts] || []).length) {
      kinds.reminder = true;
    }
    return DOT_ORDER.filter(function (k) { return kinds[k]; }).slice(0, 3);
  },

  _renderMonth: function () {
    var year = this.data.year;
    var month = this.data.month;
    var lead = (new Date(year, month, 1).getDay() + 6) % 7; // 周一起
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var prevDays = new Date(year, month, 0).getDate();
    var todayStart = dateUtil.startOfDay(Date.now());
    var selectedTs = this._selectedTs;
    var cells = [];
    var i;
    for (i = lead - 1; i >= 0; i--) {
      cells.push({ key: 'p' + i, day: prevDays - i, ts: 0, dim: true, today: false, selected: false, dots: [] });
    }
    for (i = 1; i <= daysInMonth; i++) {
      var ts = new Date(year, month, i).getTime();
      cells.push({
        key: 'd' + i,
        day: i,
        ts: ts,
        dim: false,
        today: ts === todayStart,
        selected: ts === selectedTs,
        dots: this._dotsFor(ts, todayStart),
      });
    }
    var trail = (7 - (cells.length % 7)) % 7;
    for (i = 1; i <= trail; i++) {
      cells.push({ key: 't' + i, day: i, ts: 0, dim: true, today: false, selected: false, dots: [] });
    }
    this.setData({
      cells: cells,
      monthTitle: year + '年' + (month + 1) + '月',
    });
  },

  onRetry: function () {
    this.loadMonth();
  },

  prevMonth: function () {
    this._shiftMonth(-1);
  },

  nextMonth: function () {
    this._shiftMonth(1);
  },

  _shiftMonth: function (delta) {
    var m = this.data.month + delta;
    var y = this.data.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    this._selectedTs = 0;
    this.setData({ year: y, month: m });
    this.loadMonth();
  },

  onDayTap: function (e) {
    var ts = Number(e.currentTarget.dataset.ts);
    if (!ts) {
      return; // 补位灰格不可点
    }
    this._selectedTs = ts;
    var cells = this.data.cells.map(function (c) {
      return Object.assign({}, c, { selected: c.ts === ts });
    });
    this.setData({ cells: cells });
    this._openDay(ts);
  },

  _openDay: function (ts) {
    var todayStart = dateUtil.startOfDay(Date.now());
    var isFuture = ts > todayStart;
    var petMap = {};
    (this._pets || []).forEach(function (p) {
      petMap[p._id] = p.name;
    });
    var records = isFuture ? [] : (this._recordDays[ts] || []).slice();
    records.sort(function (a, b) { return a.date - b.date; });
    var dayRecords = records.map(function (r) {
      var meta = recordMeta.getMeta(r.type);
      var d = new Date(r.date);
      var hh = d.getHours();
      var mm = d.getMinutes();
      return {
        id: r._id,
        iconType: meta.iconKey,
        summary: (petMap[r.petId] ? petMap[r.petId] + ' · ' : '') + meta.summary(r.data || {}),
        time: (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm),
      };
    });
    var dayReminders = (this._reminderDays[ts] || []).map(function (rem) {
      return {
        id: rem._id,
        iconType: rem.category || 'custom',
        title: (rem.petId && petMap[rem.petId] ? petMap[rem.petId] + ' · ' : '') + rem.title,
        dueText: dateUtil.fmtDue(rem.remindAt),
        overdue: rem.remindAt < Date.now(),
      };
    });
    this.setData({
      dayTitle: dateUtil.fmtDayGroup(ts),
      dayRecords: dayRecords,
      dayReminders: dayReminders,
      dayEmpty: dayRecords.length === 0 && dayReminders.length === 0,
      sheetVisible: true,
    });
  },

  onSheetClose: function () {
    this.setData({ sheetVisible: false });
  },

  onCompleteReminder: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    reminderService.completeReminder(id)
      .then(function () {
        self.selectComponent('#toast').show({ type: 'success', text: '已完成' });
        // 静默重拉（提醒可能推进到下一周期），再刷新 sheet 内容
        return self.loadMonth(true).then(function () {
          if (self.data.sheetVisible && self._selectedTs) {
            self._openDay(self._selectedTs);
          }
        });
      })
      .catch(function (err) {
        self.selectComponent('#toast').show({ type: 'fail', text: (err && err.msg) || '网络开小差了，请重试' });
      });
  },
});
