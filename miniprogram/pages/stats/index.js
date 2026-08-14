// pages/stats/index.js
// 统计页：宠物/时间范围筛选 + 体重折线（canvas 2d）+ 月度花销柱状 + 近 98 天打卡热力
//
// 数据口径：
// - 体重序列 / 月度花销 / 范围分类占比：statsService.getStats（云端聚合，金额单位分）
// - 打卡热力与「柱子下钻的当月分类明细」云端没有对应接口，采用任务允许的兜底方案：
//   聚合各宠物 timeline 第一页（每宠最近 20 条）在前端统计。因此热力与下钻只覆盖
//   近期数据，超出各宠最近 20 条的历史不体现（属已知简化，见结项报告）。
var statsService = require('../../services/statsService.js');
var recordService = require('../../services/recordService.js');
var petService = require('../../services/petService.js');
var petStore = require('../../stores/petStore.js');
var dateUtil = require('../../utils/date.js');
var constants = require('../../utils/constants.js');

var RANGES = ['month', 'halfYear', 'year'];

// canvas 读不到 CSS 变量，以下字面色值对应设计 token（§2.1/§2.2）：
var COLOR_PRIMARY = '#3E362C'; // --primary（浅色模式）
var COLOR_TEXT2 = '#7E7264';   // --text-secondary
var COLOR_TEXT3 = '#B9AE9E';   // --text-tertiary
var COLOR_PROBE = 'rgba(70, 55, 30, 0.15)'; // 探针 hairline
var MULTI_COLORS = ['#C08A4E', '#4A7FC7', '#7D6BAE', '#B85C5C', '#5A9EA8']; // §2.4 色板前 5 色循环

// 花销分类 -> 类型色（§2.4 就近取色，无对应 token 故写字面量）
var CATEGORY_COLORS = {
  food: '#B0803B',
  snack: '#C08A4E',
  medical: '#D24B42',
  supply: '#8A7355',
  toy: '#A8902E',
  groom: '#5A9EA8',
  boarding: '#6B8F4E',
  insurance: '#4A7FC7',
  other: '#7A7A76',
};

var CATEGORY_NAMES = {};
constants.EXPENSE_CATEGORIES.forEach(function (c) {
  CATEGORY_NAMES[c.key] = c.name;
});

// 与云端 stats.js rangeStart 对齐：month 本月 / halfYear 近半年（含本月 6 个月）/ year 今年
function rangeStart(range) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'halfYear') {
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.getTime();
  }
  if (range === 'year') {
    d.setMonth(0, 1);
    return d.getTime();
  }
  d.setDate(1);
  return d.getTime();
}

Page({
  data: {
    petChips: [{ _id: '', name: '全部' }],
    petId: '',
    rangeItems: ['本月', '近半年', '今年'],
    rangeIndex: 0,
    loading: true,
    loadFail: false,
    // 体重曲线
    weightEmpty: false,
    weightSub: '',
    // 花销柱状
    bars: [],
    expenseSub: '',
    selectedMonth: '',
    selectedMonthLabel: '',
    drillList: [],
    drillEmpty: false,
    // 打卡热力
    heatCells: [],
  },

  onLoad: function () {
    this._pets = [];
    this._aggRecords = [];
    this._chart = null;
    this._probeActive = false;
    this._lastProbe = null;
    this.load();
  },

  onShow: function () {
    if (this._shownOnce) {
      this.load(true);
    }
    this._shownOnce = true;
  },

  _range: function () {
    return RANGES[this.data.rangeIndex];
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

  load: function (quiet) {
    var self = this;
    if (!quiet) {
      this.setData({ loading: true, loadFail: false });
    }
    this._ensurePets()
      .then(function (pets) {
        self._pets = pets;
        self.setData({
          petChips: [{ _id: '', name: '全部' }].concat(
            pets.map(function (p) {
              return { _id: p._id, name: p.name };
            })
          ),
        });
        var statsCall = statsService.getStats({ petId: self.data.petId, range: self._range() });
        // 热力/下钻用的时间线聚合：单宠失败不拖垮整页
        var timelineCalls = pets.map(function (p) {
          return recordService.getTimeline(p._id, 0).then(function (res) {
            return res.list || [];
          }, function () {
            return [];
          });
        });
        return Promise.all([statsCall, Promise.all(timelineCalls)]);
      })
      .then(function (results) {
        var stats = results[0];
        var lists = results[1];
        var agg = [];
        lists.forEach(function (l) {
          agg = agg.concat(l);
        });
        self._aggRecords = agg;
        self._renderAll(stats);
        self.setData({ loading: false, loadFail: false });
      })
      .catch(function () {
        self.setData({ loading: false, loadFail: true });
      });
  },

  onRetry: function () {
    this.load();
  },

  onPetChip: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.petId) {
      return;
    }
    this.setData({ petId: id, selectedMonth: '', drillList: [] });
    this.load();
  },

  onRange: function (e) {
    var index = e.detail.index;
    if (index === this.data.rangeIndex) {
      return;
    }
    this.setData({ rangeIndex: index, selectedMonth: '', drillList: [] });
    this.load();
  },

  /* ================= 渲染编排 ================= */

  _renderAll: function (stats) {
    var self = this;
    var petMap = {};
    this._pets.forEach(function (p) {
      petMap[p._id] = p;
    });

    /* —— 体重折线 —— */
    var rawSeries = (stats && stats.weights) || [];
    var totalPoints = 0;
    rawSeries.forEach(function (s) {
      totalPoints += (s.points || []).length;
    });
    var series = rawSeries
      .filter(function (s) {
        return (s.points || []).length > 0;
      })
      .map(function (s, i) {
        var pet = petMap[s.petId];
        return {
          petId: s.petId,
          name: pet ? pet.name : '宠物',
          weightGoal: pet && pet.weightGoal ? pet.weightGoal : 0,
          points: s.points.slice().sort(function (a, b) { return a.date - b.date; }),
        };
      });
    // 单线 = Primary 炭棕 + 面积渐变；多线 = §2.4 前 5 色循环（§8.4）
    var single = series.length === 1;
    series.forEach(function (s, i) {
      s.color = single ? COLOR_PRIMARY : MULTI_COLORS[i % MULTI_COLORS.length];
    });
    this._weightSeries = series;
    this._weightSingle = single;
    // 少于 3 个点 = empty-state（PRD §5.2）
    var weightEmpty = totalPoints < 3;
    this.setData(
      {
        weightEmpty: weightEmpty,
        weightSub: single ? series[0].name : series.length > 1 ? series.length + ' 只宠物' : '',
        expenseSub: this._expenseSub(stats),
        bars: this._buildBars(stats),
        heatCells: this._buildHeat(),
      },
      function () {
        if (!weightEmpty) {
          self._initChart();
        } else {
          self._chart = null;
        }
      }
    );
  },

  _expenseSub: function (stats) {
    var list = (stats && stats.expenseByMonth) || [];
    var total = 0;
    list.forEach(function (m) {
      total += m.total || 0;
    });
    return total > 0 ? '合计 ¥' + (total / 100).toFixed(2) : '';
  },

  /* ================= 花销柱状 ================= */

  // 范围内完整月份序列（缺月补 0），返回 [{month, label, total, heightPct, current}]
  _buildBars: function (stats) {
    var totalMap = {};
    ((stats && stats.expenseByMonth) || []).forEach(function (m) {
      totalMap[m.month] = m.total || 0;
    });
    var now = new Date();
    var start = new Date(rangeStart(this._range()));
    var curKey = now.getFullYear() + '-' + (now.getMonth() + 1);
    var months = [];
    var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor.getTime() <= now.getTime()) {
      var key = cursor.getFullYear() + '-' + (cursor.getMonth() + 1);
      months.push({ month: key, label: cursor.getMonth() + 1 + '月', total: totalMap[key] || 0, current: key === curKey });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    var max = 0;
    months.forEach(function (m) {
      if (m.total > max) {
        max = m.total;
      }
    });
    months.forEach(function (m) {
      // 有最大值的月份按比例；无数据月份留 4% 底柱占位
      m.heightPct = max > 0 ? Math.max(4, Math.round((m.total / max) * 100)) : 4;
    });
    return months;
  },

  // 点击柱子下钻：该月分类占比（来自 timeline 聚合，见文件头数据口径）
  onBarTap: function (e) {
    var month = e.currentTarget.dataset.month;
    if (this.data.selectedMonth === month) {
      this.setData({ selectedMonth: '', drillList: [], drillEmpty: false });
      return;
    }
    var parts = month.split('-');
    var mStart = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).getTime();
    var mEnd = new Date(Number(parts[0]), Number(parts[1]), 1).getTime();
    var catMap = {};
    var total = 0;
    this._aggRecords.forEach(function (r) {
      if (r.type !== 'expense' || r.date < mStart || r.date >= mEnd) {
        return;
      }
      var amount = (r.data && r.data.amount) || 0;
      var cat = (r.data && r.data.category) || 'other';
      catMap[cat] = (catMap[cat] || 0) + amount;
      total += amount;
    });
    var drillList = Object.keys(catMap)
      .map(function (cat) {
        return {
          key: cat,
          name: CATEGORY_NAMES[cat] || '其他',
          total: catMap[cat],
          amountText: '¥' + (catMap[cat] / 100).toFixed(2),
          pct: total > 0 ? Math.max(3, Math.round((catMap[cat] / total) * 100)) : 0,
          color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.other,
        };
      })
      .sort(function (a, b) {
        return b.total - a.total;
      });
    this.setData({
      selectedMonth: month,
      selectedMonthLabel: Number(parts[1]) + '月',
      drillList: drillList,
      drillEmpty: drillList.length === 0,
    });
  },

  /* ================= 打卡热力 ================= */

  // 近 98 天（14 列 × 7 行），喂食/遛狗打卡次数分四档
  _buildHeat: function () {
    var todayStart = dateUtil.startOfDay(Date.now());
    var counts = {};
    this._aggRecords.forEach(function (r) {
      if (r.type !== 'feed' && r.type !== 'walk') {
        return;
      }
      var key = dateUtil.startOfDay(r.date);
      counts[key] = (counts[key] || 0) + 1;
    });
    var cells = [];
    for (var i = 97; i >= 0; i--) {
      var ts = todayStart - i * dateUtil.DAY_MS;
      var n = counts[ts] || 0;
      // 四档：0=fill / 1~2=pop 25% / 3~4=pop 50% / ≥5=pop 实心
      var level = n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
      cells.push({ key: 'h' + i, level: level });
    }
    return cells;
  },

  /* ================= 体重折线（canvas 2d） ================= */

  _initChart: function () {
    var self = this;
    wx.createSelectorQuery()
      .in(this)
      .select('#weightChart')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var info = res && res[0];
        if (!info || !info.node || !info.width) {
          return;
        }
        var dpr = 2;
        try {
          dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        } catch (err) {
          dpr = 2;
        }
        var canvas = info.node;
        canvas.width = info.width * dpr;
        canvas.height = info.height * dpr;
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        self._chart = { canvas: canvas, ctx: ctx, width: info.width, height: info.height };
        self._prepareGeometry();
        self._renderChart(null, 1);
      });
  },

  // 坐标换算：x 按时间线性铺满，y 留 10% 边距；目标体重纳入值域
  _prepareGeometry: function () {
    var chart = this._chart;
    var padL = 6;
    var padR = 6;
    var padT = 46; // 顶部留探针气泡位
    var padB = 20; // 底部 X 轴月份小字
    var x0 = rangeStart(this._range());
    var x1 = dateUtil.startOfDay(Date.now()) + dateUtil.DAY_MS - 1;
    var min = Infinity;
    var max = -Infinity;
    this._weightSeries.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.value < min) {
          min = p.value;
        }
        if (p.value > max) {
          max = p.value;
        }
      });
    });
    var goal = 0;
    if (this._weightSingle && this._weightSeries[0] && this._weightSeries[0].weightGoal) {
      goal = this._weightSeries[0].weightGoal;
      if (goal < min) {
        min = goal;
      }
      if (goal > max) {
        max = goal;
      }
    }
    var span = max - min;
    if (span <= 0) {
      span = 1;
    }
    min -= span * 0.1;
    max += span * 0.1;
    var w = chart.width - padL - padR;
    var h = chart.height - padT - padB;
    function toX(date) {
      return padL + ((date - x0) / (x1 - x0)) * w;
    }
    function toY(value) {
      return padT + (1 - (value - min) / (max - min)) * h;
    }
    this._geo = {
      padL: padL,
      padR: padR,
      padT: padT,
      padB: padB,
      x0: x0,
      x1: x1,
      toX: toX,
      toY: toY,
      goal: goal,
      seriesPx: this._weightSeries.map(function (s) {
        return {
          name: s.name,
          color: s.color,
          pts: s.points.map(function (p) {
            return { x: toX(p.date), y: toY(p.value), date: p.date, value: p.value };
          }),
        };
      }),
    };
  },

  // 全量重绘；probe={x} 时叠加探针，probeAlpha 控制探针淡入淡出
  _renderChart: function (probe, probeAlpha) {
    var chart = this._chart;
    var geo = this._geo;
    if (!chart || !geo) {
      return;
    }
    var ctx = chart.ctx;
    var w = chart.width;
    var h = chart.height;
    ctx.clearRect(0, 0, w, h);

    /* —— 目标体重虚线 —— */
    if (geo.goal) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = COLOR_TEXT3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      var gy = geo.toY(geo.goal);
      ctx.moveTo(geo.padL, gy);
      ctx.lineTo(w - geo.padR, gy);
      ctx.stroke();
      ctx.restore();
    }

    /* —— 面积渐变（单线专属，Primary 14% 到 0%，全产品唯一渐变 §8.4） —— */
    geo.seriesPx.forEach(function (s) {
      if (s.pts.length < 2) {
        return;
      }
      if (geo.seriesPx.length === 1) {
        var grad = ctx.createLinearGradient(0, geo.padT, 0, h - geo.padB);
        grad.addColorStop(0, 'rgba(62, 54, 44, 0.14)');
        grad.addColorStop(1, 'rgba(62, 54, 44, 0)');
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        s.pts.forEach(function (p) {
          ctx.lineTo(p.x, p.y);
        });
        ctx.lineTo(s.pts[s.pts.length - 1].x, h - geo.padB);
        ctx.lineTo(s.pts[0].x, h - geo.padB);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      // 折线：2px 无数据点装饰
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      s.pts.forEach(function (p) {
        ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    /* —— X 轴月份灰小字 —— */
    ctx.fillStyle = COLOR_TEXT3;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    this._xTicks().forEach(function (t) {
      ctx.fillText(t.label, t.x, h - 4);
    });

    /* —— 探针 —— */
    if (probe) {
      this._drawProbe(probe, probeAlpha === undefined ? 1 : probeAlpha);
    }
  },

  // X 轴刻度：跨月标月份（M月），同月内标 4 个日期（M/D）
  _xTicks: function () {
    var geo = this._geo;
    var ticks = [];
    var start = new Date(geo.x0);
    var end = new Date(geo.x1);
    var sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
    if (sameMonth) {
      var daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      var anchors = [1, Math.round(daysInMonth / 3), Math.round((daysInMonth * 2) / 3), daysInMonth];
      anchors.forEach(function (d) {
        var ts = new Date(start.getFullYear(), start.getMonth(), d).getTime();
        ticks.push({ x: geo.toX(ts), label: start.getMonth() + 1 + '/' + d });
      });
    } else {
      var cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor.getTime() <= end.getTime()) {
        ticks.push({ x: geo.toX(cursor.getTime()), label: cursor.getMonth() + 1 + '月' });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return ticks;
  },

  _drawProbe: function (probe, alpha) {
    var chart = this._chart;
    var geo = this._geo;
    var ctx = chart.ctx;
    var h = chart.height;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 各线取离手指最近的点
    var hits = geo.seriesPx.map(function (s) {
      var best = null;
      var bestDist = Infinity;
      s.pts.forEach(function (p) {
        var d = Math.abs(p.x - probe.x);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      });
      return { name: s.name, color: s.color, pt: best };
    }).filter(function (hit) {
      return hit.pt;
    });
    if (!hits.length) {
      ctx.restore();
      return;
    }
    var px = hits[0].pt.x;

    // 竖直 hairline
    ctx.strokeStyle = COLOR_PROBE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, geo.padT - 8);
    ctx.lineTo(px, h - geo.padB);
    ctx.stroke();

    // 当前点描边圆（探针时才显示数据点 §8.4）
    hits.forEach(function (hit) {
      ctx.beginPath();
      ctx.arc(hit.pt.x, hit.pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = hit.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // 顶部白卡数据气泡
    var d = new Date(hits[0].pt.date);
    var lines = [d.getMonth() + 1 + '月' + d.getDate() + '日'];
    hits.forEach(function (hit) {
      lines.push((geo.seriesPx.length > 1 ? hit.name + ' ' : '') + hit.pt.value + 'kg');
    });
    ctx.font = '600 11px sans-serif';
    var textW = 0;
    lines.forEach(function (t) {
      textW = Math.max(textW, ctx.measureText(t).width);
    });
    var bw = textW + 24;
    var bh = lines.length * 16 + 12;
    var bx = Math.min(Math.max(px - bw / 2, 2), chart.width - bw - 2);
    var by = 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(70, 55, 30, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, 6);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.textAlign = 'center';
    lines.forEach(function (t, i) {
      ctx.fillText(t, bx + bw / 2, by + 18 + i * 16);
    });
    ctx.restore();
  },

  /* —— 探针手势：长按出现，跟手滑动，松手 300ms 淡出 —— */
  onProbeStart: function (e) {
    if (!this._chart || !this._geo) {
      return;
    }
    this._probeActive = true;
    this._updateProbe(e);
  },

  onProbeMove: function (e) {
    if (!this._probeActive) {
      return;
    }
    this._updateProbe(e);
  },

  _updateProbe: function (e) {
    var t = e.touches && e.touches[0];
    if (!t) {
      return;
    }
    this._lastProbe = { x: t.x };
    this._renderChart(this._lastProbe, 1);
  },

  onProbeEnd: function () {
    if (!this._probeActive) {
      return;
    }
    this._probeActive = false;
    var self = this;
    var probe = this._lastProbe;
    // 300ms 淡出：三帧透明度衰减近似（canvas 无 CSS 过渡）
    [0.5, 0.25, 0].forEach(function (a, i) {
      setTimeout(function () {
        self._renderChart(a > 0 ? probe : null, a);
      }, 100 * (i + 1));
    });
  },
});
