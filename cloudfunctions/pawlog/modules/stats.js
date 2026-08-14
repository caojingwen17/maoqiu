// modules/stats.js
// 统计模块：体重折线、月度花销柱状、分类饼图（聚合在云端做，单次查询 ≤1000 条）
var cloud = require('wx-server-sdk');
var schema = require('../schema');

function getDb() {
  return cloud.database();
}

function getOpenid() {
  return cloud.getWXContext().OPENID;
}

// 时间范围起点：month 本月 / halfYear 近半年 / year 今年（PRD §11.1）
function rangeStart(range) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'halfYear') {
    d.setDate(1);
    d.setMonth(d.getMonth() - 5); // 含本月共 6 个月
    return d.getTime();
  }
  if (range === 'year') {
    d.setMonth(0, 1);
    return d.getTime();
  }
  d.setDate(1);
  return d.getTime();
}

function monthKey(ts) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  var d = new Date(ts);
  return d.getFullYear() + '-' + p(d.getMonth() + 1);
}

/**
 * 统计数据
 * @param {Object} payload {petId?: 不传为全部宠物, range?: month/halfYear/year}
 * @returns {{weights: Array, expenseByMonth: Array, expenseByCategory: Array}}
 */
async function getStats(payload) {
  var db = getDb();
  var _ = db.command;
  var openid = getOpenid();
  payload = payload || {};
  var start = rangeStart(payload.range || 'month');

  var baseWhere = { _openid: openid, date: _.gte(start) };
  if (payload.petId) {
    baseWhere.petId = payload.petId;
  }

  // 体重序列 + 花销明细并行拉取，各自封顶 1000 条
  var results = await Promise.all([
    db.collection('records')
      .where(Object.assign({}, baseWhere, { type: 'weight' }))
      .field({ petId: true, date: true, data: true })
      .orderBy('date', 'asc')
      .limit(1000)
      .get(),
    db.collection('records')
      .where(Object.assign({}, baseWhere, { type: 'expense' }))
      .field({ date: true, data: true })
      .orderBy('date', 'asc')
      .limit(1000)
      .get(),
  ]);

  // 体重折线：按宠物分组（多宠物多线）
  var weightMap = {};
  results[0].data.forEach(function (r) {
    if (!weightMap[r.petId]) {
      weightMap[r.petId] = [];
    }
    weightMap[r.petId].push({ date: r.date, value: r.data.value });
  });
  var weights = Object.keys(weightMap).map(function (petId) {
    return { petId: petId, points: weightMap[petId] };
  });

  // 花销聚合：按月（柱状）+ 按分类（饼图），金额单位分
  var monthMap = {};
  var categoryMap = {};
  results[1].data.forEach(function (r) {
    var amount = (r.data && r.data.amount) || 0;
    var mk = monthKey(r.date);
    monthMap[mk] = (monthMap[mk] || 0) + amount;
    var cat = (r.data && r.data.category) || 'other';
    categoryMap[cat] = (categoryMap[cat] || 0) + amount;
  });
  var expenseByMonth = Object.keys(monthMap).sort().map(function (m) {
    return { month: m, total: monthMap[m] };
  });
  var expenseByCategory = Object.keys(categoryMap).map(function (c) {
    return { category: c, total: categoryMap[c] };
  }).sort(function (a, b) { return b.total - a.total; });

  return {
    weights: weights,
    expenseByMonth: expenseByMonth,
    expenseByCategory: expenseByCategory,
  };
}

module.exports = {
  getStats: getStats,
};
