// pages/reminder/index.js
// 提醒管理页：进行中（按紧急度分组）/ 已完成（近 30 天）+ 订阅消息授权引导
var reminderService = require('../../services/reminderService.js');
var petService = require('../../services/petService.js');
var settingStore = require('../../stores/settingStore.js');
var petStore = require('../../stores/petStore.js');
var dateUtil = require('../../utils/date.js');
var icons = require('../../components/icons.js');

// 订阅消息模板 ID（占位）：与 cloudfunctions/pawlog/config.js 的 SUBSCRIBE_TEMPLATE_ID
// 同名同值；前端无法引用云函数目录，上线前需同步替换为正式模板 ID
var SUBSCRIBE_TEMPLATE_ID = 'TEMPLATE_ID_PLACEHOLDER';

var REPEAT_OPTIONS = [
  { key: 'none', name: '不重复' },
  { key: 'daily', name: '每天' },
  { key: 'weekly', name: '每周' },
  { key: 'monthly', name: '每月' },
  { key: 'custom_days', name: '自定义天数' },
];

// 提醒分类 -> 类型色（§2.4 色板；checkup/stock 无色板项，就近取医疗/喂食色）
var CATEGORY_COLORS = {
  vaccine: icons.RECORD_COLORS.vaccine,
  deworm: icons.RECORD_COLORS.deworm,
  groom: icons.RECORD_COLORS.groom,
  medication: icons.RECORD_COLORS.medication,
  checkup: icons.RECORD_COLORS.medical,
  stock: icons.RECORD_COLORS.feed,
  custom: icons.RECORD_COLORS.custom,
};

var ACTIVE_ACTIONS = [
  { key: 'done', text: '完成', icon: 'check', theme: 'success' },
  { key: 'delay', text: '延后', icon: 'clock', theme: 'neutral' },
  { key: 'disable', text: '停用', icon: 'close', theme: 'danger' },
];

var DONE_ACTIONS = [
  { key: 'delete', text: '删除', icon: 'trash', theme: 'danger' },
];

// 「2026-08-11」-> 当天 0 点时间戳（iOS 不接受连字符日期，先转斜杠）
function parseDateStr(str) {
  return new Date(String(str).replace(/-/g, '/')).getTime();
}

// 周期提醒的下次到期时间（与云端 reminderCore.applyComplete 同规则）
function nextRemindAt(remindAt, repeatType, repeatDays) {
  var d;
  switch (repeatType) {
    case 'daily':
      return remindAt + dateUtil.DAY_MS;
    case 'weekly':
      return remindAt + 7 * dateUtil.DAY_MS;
    case 'monthly':
      d = new Date(remindAt);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    case 'custom_days':
      return remindAt + (repeatDays || 1) * dateUtil.DAY_MS;
    default:
      return remindAt;
  }
}

function repeatText(r) {
  switch (r.repeatType) {
    case 'daily': return '每天';
    case 'weekly': return '每周';
    case 'monthly': return '每月';
    case 'custom_days': return '每 ' + (r.repeatDays || 1) + ' 天';
    default: return '一次性';
  }
}

// 周期提醒的「上次」时间 = 本次到期往前推一个周期
function lastRemindAt(r) {
  var d;
  switch (r.repeatType) {
    case 'daily': return r.remindAt - dateUtil.DAY_MS;
    case 'weekly': return r.remindAt - 7 * dateUtil.DAY_MS;
    case 'monthly':
      d = new Date(r.remindAt);
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    case 'custom_days': return r.remindAt - (r.repeatDays || 1) * dateUtil.DAY_MS;
    default: return 0;
  }
}

Page({
  data: {
    tabs: ['进行中', '已完成'],
    tab: 0,
    loading: true,
    subscribeAuth: false,
    groups: [],        // 进行中分组 [{key, kind, title, items}]
    doneList: [],      // 已完成（近 30 天）
    activeActions: ACTIVE_ACTIONS,
    doneActions: DONE_ACTIONS,
    bellUri: icons.maskIcon('bell'),
    checkUri: icons.maskIcon('check'),
    // 编辑 / 新建 sheet
    sheetVisible: false,
    editingId: '',
    petOptions: [],
    repeatOptions: REPEAT_OPTIONS,
    form: {
      title: '',
      petId: '',
      dateStr: '',
      repeatType: 'none',
      repeatDays: '30',
      advanceDays: '7',
      category: 'custom',
    },
  },

  onShow: function () {
    this.setData({ subscribeAuth: !!settingStore.get().subscribeAuth });
    this.loadData();
  },

  /* —— 数据加载 —— */
  loadData: function () {
    var self = this;
    this.setData({ loading: true });
    Promise.all([reminderService.listReminders(), this._ensurePets()])
      .then(function (results) {
        var data = results[0] || {};
        self._petMap = results[1];
        self._active = Array.isArray(data.active) ? data.active : [];
        self.setData({
          loading: false,
          groups: self._buildGroups(self._active),
          doneList: self._buildDone(data.done || []),
        });
      })
      .catch(function (err) {
        // 云服务未配置 / 网络失败：空态兜底 + 错误提示，不白屏
        self._active = [];
        self.setData({ loading: false, groups: [], doneList: [] });
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  // 宠物列表：优先 petStore 缓存，失败容忍为空（提醒页不依赖宠物接口）
  _ensurePets: function () {
    var cached = petStore.get().petList;
    if (cached && cached.length) {
      return Promise.resolve(this._mapByPetId(cached));
    }
    return petService.listPets()
      .then(function (list) {
        petStore.setPetList(list);
        return list;
      })
      .catch(function () {
        return [];
      })
      .then(this._mapByPetId.bind(this));
  },

  _mapByPetId: function (list) {
    var map = {};
    (list || []).forEach(function (p) {
      map[p._id] = p;
    });
    return map;
  },

  /* —— 视图模型 —— */
  _buildGroups: function (active) {
    var self = this;
    var buckets = { overdue: [], today: [], week: [], later: [] };
    (active || []).forEach(function (r) {
      var days = dateUtil.diffDays(r.remindAt, Date.now());
      var key = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'week' : 'later';
      buckets[key].push(self._toActiveVM(r, days));
    });
    var defs = [
      { key: 'overdue', kind: 'danger', title: '已逾期' },
      { key: 'today', kind: 'today', title: '今天' },
      { key: 'week', kind: 'week', title: '未来 7 天' },
      { key: 'later', kind: 'later', title: '以后' },
    ];
    return defs
      .filter(function (d) { return buckets[d.key].length > 0; })
      .map(function (d) {
        return { key: d.key, kind: d.kind, title: d.title, items: buckets[d.key] };
      });
  },

  _toActiveVM: function (r, days) {
    var pet = (this._petMap || {})[r.petId];
    var subtitle = repeatText(r);
    var last = lastRemindAt(r);
    if (last > 0) {
      var d = new Date(last);
      subtitle += ' · 上次 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    var pillType = 'grey';
    var pillText = dateUtil.fmtDue(r.remindAt);
    if (days < 0) {
      pillType = 'danger';
      pillText = '逾期 ' + (-days) + ' 天';
    } else if (days === 0) {
      pillType = 'warn';
      pillText = '今天';
    }
    return {
      _id: r._id,
      petId: r.petId || '',
      category: r.category || 'custom',
      title: r.title || '',
      displayTitle: (pet ? pet.name + ' · ' : '') + (r.title || ''),
      subtitle: subtitle,
      color: CATEGORY_COLORS[r.category] || CATEGORY_COLORS.custom,
      pillType: pillType,
      pillText: pillText,
      remindAt: r.remindAt,
      repeatType: r.repeatType || 'none',
      repeatDays: r.repeatDays || 0,
      advanceDays: typeof r.advanceDays === 'number' ? r.advanceDays : 7,
    };
  },

  _buildDone: function (done) {
    var self = this;
    return (done || []).map(function (r) {
      var pet = (self._petMap || {})[r.petId];
      return {
        _id: r._id,
        displayTitle: (pet ? pet.name + ' · ' : '') + (r.title || ''),
        color: CATEGORY_COLORS[r.category] || CATEGORY_COLORS.custom,
        doneAtText: r.updateAt ? dateUtil.fmtDate(r.updateAt) : '',
      };
    });
  },

  _refreshActive: function () {
    this.setData({ groups: this._buildGroups(this._active) });
  },

  _findActive: function (id) {
    var found = null;
    (this._active || []).forEach(function (r) {
      if (r._id === id) found = r;
    });
    return found;
  },

  onTabChange: function (e) {
    this.setData({ tab: e.detail.index });
  },

  _toast: function (type, text) {
    var toast = this.selectComponent('#toast');
    if (toast) toast.show({ type: type, text: text });
  },

  /* —— 订阅消息授权 —— */
  // 发起授权申请；resolve 是否同意。结果写入 settingStore（本地持久化）
  _requestSubscribe: function () {
    var self = this;
    return new Promise(function (resolve) {
      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TEMPLATE_ID],
        success: function (res) {
          var accepted = res && res[SUBSCRIBE_TEMPLATE_ID] === 'accept';
          settingStore.set({ subscribeAuth: accepted, subscribeAsked: true });
          self.setData({ subscribeAuth: accepted });
          resolve(accepted);
        },
        fail: function () {
          // 模板 ID 占位 / 用户拒绝：静默，引导条继续常驻
          settingStore.set({ subscribeAsked: true });
          resolve(false);
        },
      });
    });
  },

  onGuideTap: function () {
    this._requestSubscribe();
  },

  /* —— 进行中：滑动操作 —— */
  onActiveAction: function (e) {
    var key = e.detail.key;
    var id = e.currentTarget.dataset.id;
    if (key === 'done') this._complete(id);
    else if (key === 'delay') this._snooze(id);
    else if (key === 'disable') this._disable(id);
  },

  // 完成：乐观更新，失败回滚；成功后顺带静默补充订阅授权（PRD §5.5）
  _complete: function (id) {
    var self = this;
    var target = this._findActive(id);
    if (!target) return;
    var snapshot = this._active.slice();
    if (target.repeatType && target.repeatType !== 'none') {
      target.remindAt = nextRemindAt(target.remindAt, target.repeatType, target.repeatDays);
      this._active.sort(function (a, b) { return a.remindAt - b.remindAt; });
    } else {
      this._active = this._active.filter(function (r) { return r._id !== id; });
    }
    this._refreshActive();

    reminderService.completeReminder(id)
      .then(function (res) {
        // 以云端返回的新到期时间为准校准
        var cur = self._findActive(id);
        if (cur && res && typeof res.remindAt === 'number') {
          cur.remindAt = res.remindAt;
          self._active.sort(function (a, b) { return a.remindAt - b.remindAt; });
          self._refreshActive();
        }
        self._toast('success', '已完成');
        // 订阅消息一次授权一次推送，完成手势后顺带补充授权（静默，失败不提示）
        if (!settingStore.get().subscribeAuth) {
          self._requestSubscribe();
        }
      })
      .catch(function (err) {
        self._active = snapshot;
        self._refreshActive();
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  // 延后 3 天：乐观更新，失败回滚
  _snooze: function (id) {
    var self = this;
    var target = this._findActive(id);
    if (!target) return;
    var snapshot = this._active.slice();
    target.remindAt = target.remindAt + 3 * dateUtil.DAY_MS;
    this._active.sort(function (a, b) { return a.remindAt - b.remindAt; });
    this._refreshActive();

    reminderService.snoozeReminder(id)
      .then(function (res) {
        var cur = self._findActive(id);
        if (cur && res && typeof res.remindAt === 'number') {
          cur.remindAt = res.remindAt;
          self._refreshActive();
        }
        self._toast('success', '已延后 3 天');
      })
      .catch(function (err) {
        self._active = snapshot;
        self._refreshActive();
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  // 停用：先确认，乐观移除，失败回滚
  _disable: function (id) {
    var self = this;
    wx.showModal({
      title: '停用提醒',
      content: '停用后将不再提醒，确定停用吗？',
      confirmText: '停用',
      confirmColor: '#D24B42',
      success: function (res) {
        if (!res.confirm) return;
        var snapshot = self._active.slice();
        self._active = self._active.filter(function (r) { return r._id !== id; });
        self._refreshActive();
        reminderService.disableReminder(id)
          .then(function () {
            self._toast('success', '已停用');
          })
          .catch(function (err) {
            self._active = snapshot;
            self._refreshActive();
            self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
          });
      },
    });
  },

  /* —— 已完成：仅「删除」（云端无硬删除接口，以停用语义移除） —— */
  onDoneAction: function (e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '删除后不再展示该条完成记录，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#D24B42',
      success: function (res) {
        if (!res.confirm) return;
        var snapshot = self.data.doneList.slice();
        self.setData({
          doneList: self.data.doneList.filter(function (r) { return r._id !== id; }),
        });
        reminderService.disableReminder(id)
          .then(function () {
            self._toast('success', '已删除');
          })
          .catch(function (err) {
            self.setData({ doneList: snapshot });
            self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
          });
      },
    });
  },

  /* —— 编辑 / 新建 sheet —— */
  onOpenEdit: function (e) {
    var r = this._findActive(e.currentTarget.dataset.id);
    if (!r) return;
    this.setData({
      sheetVisible: true,
      editingId: r._id,
      form: {
        title: r.title,
        petId: r.petId,
        dateStr: dateUtil.fmtDate(r.remindAt),
        repeatType: r.repeatType,
        repeatDays: String(r.repeatDays || 30),
        advanceDays: String(r.advanceDays),
        category: r.category,
      },
    });
  },

  onOpenCreate: function () {
    var self = this;
    this.setData({
      sheetVisible: true,
      editingId: '',
      form: {
        title: '',
        petId: '',
        dateStr: dateUtil.fmtDate(Date.now() + dateUtil.DAY_MS),
        repeatType: 'none',
        repeatDays: '30',
        advanceDays: String(settingStore.get().advanceDays || 7),
        category: 'custom',
      },
    });
    // 宠物选项（可为空 = 全局）
    var cached = petStore.get().petList;
    if (cached && cached.length) {
      this.setData({ petOptions: cached });
    } else {
      petService.listPets()
        .then(function (list) {
          petStore.setPetList(list);
          self.setData({ petOptions: list });
        })
        .catch(function () {
          self.setData({ petOptions: [] });
        });
    }
  },

  onSheetClose: function () {
    this.setData({ sheetVisible: false });
  },

  onFormTitle: function (e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onFormPet: function (e) {
    this.setData({ 'form.petId': e.currentTarget.dataset.id });
  },

  onFormDate: function (e) {
    this.setData({ 'form.dateStr': e.detail.value });
  },

  onFormRepeat: function (e) {
    this.setData({ 'form.repeatType': e.currentTarget.dataset.key });
  },

  onFormRepeatDays: function (e) {
    this.setData({ 'form.repeatDays': e.detail.value });
  },

  onFormAdvance: function (e) {
    this.setData({ 'form.advanceDays': e.detail.value });
  },

  // 校验表单；合法返回提醒对象，不合法 toast 并返回 null（表单数据保留）
  _buildReminderFromForm: function () {
    var f = this.data.form;
    var title = String(f.title || '').trim();
    if (!title) {
      this._toast('fail', '请填写提醒标题');
      return null;
    }
    var reminder = {
      title: title,
      category: f.category || 'custom',
      remindAt: parseDateStr(f.dateStr),
      repeatType: f.repeatType,
    };
    if (f.petId) {
      reminder.petId = f.petId;
    }
    if (f.repeatType === 'custom_days') {
      var days = parseInt(f.repeatDays, 10);
      if (!days || days < 1) {
        this._toast('fail', '自定义周期请填写天数');
        return null;
      }
      reminder.repeatDays = days;
    }
    var advance = parseInt(f.advanceDays, 10);
    if (isNaN(advance) || advance < 0 || advance > 30) {
      advance = 7;
    }
    reminder.advanceDays = advance;
    reminder.subscribeAuth = !!settingStore.get().subscribeAuth;
    return reminder;
  },

  onSave: function () {
    var reminder = this._buildReminderFromForm();
    if (!reminder) return;
    if (this.data.editingId) {
      this._submitUpdate(reminder);
    } else {
      this._submitCreateWithAuth(reminder);
    }
  },

  // 更新语义：云端无 updateReminder，先创建新提醒再停用旧提醒
  //（先建后停：建失败时旧提醒仍在，避免数据丢失；停用失败则列表出现两条，可手动停用）
  _submitUpdate: function (reminder) {
    var self = this;
    var oldId = this.data.editingId;
    reminderService.createReminder(reminder)
      .then(function () {
        return reminderService.disableReminder(oldId);
      })
      .then(function () {
        self.setData({ sheetVisible: false });
        self._toast('success', '已保存');
        self.loadData();
      })
      .catch(function (err) {
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
        self.loadData();
      });
  },

  // 首次创建提醒：先 wx.showModal 说明再发起订阅授权，拒绝不打断流程（PRD §5.4）
  _submitCreateWithAuth: function (reminder) {
    var self = this;
    var st = settingStore.get();
    if (st.subscribeAuth || st.subscribeAsked) {
      this._submitCreate(reminder);
      return;
    }
    wx.showModal({
      title: '开启微信通知',
      content: '授权后，疫苗驱虫到期会微信通知你',
      confirmText: '去授权',
      cancelText: '暂不',
      success: function (res) {
        if (res.confirm) {
          self._requestSubscribe().then(function () {
            self._submitCreate(reminder);
          });
        } else {
          settingStore.set({ subscribeAsked: true });
          self._submitCreate(reminder);
        }
      },
      fail: function () {
        self._submitCreate(reminder);
      },
    });
  },

  _submitCreate: function (reminder) {
    var self = this;
    reminderService.createReminder(reminder)
      .then(function () {
        self.setData({ sheetVisible: false });
        self._toast('success', '已创建');
        self.loadData();
      })
      .catch(function (err) {
        // 失败保留表单不清空（PRD §5.3）
        self._toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },
});
