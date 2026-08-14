// modules/home.js
// 首页聚合：一次调用返回首屏全部数据（PRD §6.3/§6.4 与 §15 首屏合并要求）
var cloud = require('wx-server-sdk');
var pet = require('./pet');
var reminder = require('./reminder');

function getDb() {
  return cloud.database();
}

function getOpenid() {
  return cloud.getWXContext().OPENID;
}

// 当月 1 号 0 点
function startOfMonth() {
  var d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 本周周一 0 点
function startOfWeek() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  var day = d.getDay() || 7; // 周日按 7 处理
  d.setDate(d.getDate() - day + 1);
  return d.getTime();
}

// 本月花销合计（分）：expense 记录求和
async function sumMonthExpense(openid) {
  var db = getDb();
  var _ = db.command;
  var total = 0;
  var skip = 0;
  while (true) {
    var res = await db.collection('records')
      .where({ _openid: openid, type: 'expense', date: _.gte(startOfMonth()) })
      .field({ data: true })
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(100)
      .get();
    res.data.forEach(function (r) {
      total += (r.data && r.data.amount) || 0;
    });
    if (res.data.length < 100) {
      break;
    }
    skip += 100;
  }
  return total;
}

// 本周打卡次数：喂食 + 遛狗记录数
async function countWeekCheckins(openid) {
  var db = getDb();
  var _ = db.command;
  var res = await db.collection('records')
    .where({
      _openid: openid,
      type: _.in(['feed', 'walk']),
      date: _.gte(startOfWeek()),
    })
    .count();
  return res.total || 0;
}

// 每只宠物最近一次体重 vs 上一次（±0.1kg 内视为持平，change 记 0）
async function weightChanges(openid, pets) {
  var db = getDb();
  var changes = [];
  await Promise.all(pets.map(async function (p) {
    var res = await db.collection('records')
      .where({ _openid: openid, petId: p._id, type: 'weight' })
      .orderBy('date', 'desc')
      .limit(2)
      .get();
    if (res.data.length === 0) {
      return;
    }
    var latest = res.data[0].data.value;
    var previous = res.data.length > 1 ? res.data[1].data.value : null;
    var change = previous === null ? 0 : Math.round((latest - previous) * 10) / 10;
    if (Math.abs(change) < 0.1) {
      change = 0;
    }
    changes.push({
      petId: p._id,
      name: p.name,
      latest: latest,
      previous: previous,
      change: change,
    });
  }));
  return changes;
}

/**
 * 首页数据一次性拉取
 * @returns {{pets: Array, todos: {list: Array, total: number}, banner: {monthExpense: number, weekCheckins: number, weightChanges: Array}}}
 *   pets 带最新体重与临期提醒；todos.list 最多 3 条（PRD §6.3）；monthExpense 单位分
 */
async function getHomeData() {
  var openid = getOpenid();
  var pets = await pet.listPets({});
  // 首页不展示归档宠物（PRD §6.2 边界）
  var activePets = pets.filter(function (p) { return !p.archived; });
  var results = await Promise.all([
    reminder.getTodos({}),
    sumMonthExpense(openid),
    countWeekCheckins(openid),
    weightChanges(openid, activePets),
  ]);
  var todos = results[0];
  return {
    pets: activePets,
    todos: { list: todos.list.slice(0, 3), total: todos.total },
    banner: {
      monthExpense: results[1],
      weekCheckins: results[2],
      weightChanges: results[3],
    },
  };
}

module.exports = {
  getHomeData: getHomeData,
};
