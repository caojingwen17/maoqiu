// pages/home/index.js
// 首页「宠物卡片墙」：大标题 + 全局待办 + 统计速览条 + 宠物信息卡网格 + 快捷记录九宫格
// 首屏数据一次性来自 homeService.getHomeData（PRD §15：首页数据合并为 1 次云函数调用）
var homeService = require('../../services/homeService.js');
var petService = require('../../services/petService.js');
var reminderService = require('../../services/reminderService.js');
var subscribeConstants = require('../../services/constants.js');
var petStore = require('../../stores/petStore.js');
var settingStore = require('../../stores/settingStore.js');
var dateUtil = require('../../utils/date.js');
var tracker = require('../../utils/tracker.js');
var icons = require('../../components/icons.js');

var DAY_MS = dateUtil.DAY_MS;
var WEEK_MS = 7 * DAY_MS;

// 提醒分类 -> 中文名 / 对应记录类型（完成提醒「记一笔」预选用）
var CATEGORY_LABEL = {
  vaccine: '疫苗', deworm: '驱虫', groom: '洗护', medication: '用药',
  checkup: '体检', stock: '补货', custom: '提醒',
};
var CATEGORY_RECORD_TYPE = {
  vaccine: 'vaccine', deworm: 'deworm', groom: 'groom', medication: 'medication',
  checkup: 'medical', stock: 'custom', custom: 'custom',
};

// 触觉反馈（§6.5），旧基础库静默降级
function vibrate(type) {
  try {
    wx.vibrateShort({ type: type });
  } catch (e) {
    try { wx.vibrateShort(); } catch (e2) { /* ignore */ }
  }
}

// 待办状态胶囊文案：逾期 danger「逾期 X 天」；临近 warn「今天/明天/X 天后」
function buildPill(remindAt, now) {
  var days = dateUtil.diffDays(remindAt, now);
  if (days < 0) {
    return { pillText: '逾期 ' + (-days) + ' 天', pillClass: 'danger' };
  }
  if (days === 0) {
    return { pillText: '今天', pillClass: 'warn' };
  }
  if (days === 1) {
    return { pillText: '明天', pillClass: 'warn' };
  }
  return { pillText: days + ' 天后', pillClass: 'warn' };
}

// 宠物卡片视图模型
function buildPetVM(pet, now) {
  var vm = {
    _id: pet._id,
    name: pet.name,
    avatar: pet.avatar || '',
    species: pet.species || 'other',
    genderSymbol: pet.gender === 'male' ? '♂' : '♀',
    genderClass: pet.gender === 'male' ? 'male' : 'female',
  };
  var age = dateUtil.fmtAge(pet.birthDate, now);
  vm.subText = pet.breed ? pet.breed + ' · ' + age : age;

  if (pet.latestWeight && typeof pet.latestWeight.value === 'number') {
    vm.weightText = pet.latestWeight.value + ' kg';
    vm.hasWeight = true;
    vm.weightNew = now - pet.latestWeight.date < WEEK_MS; // 7 天内更新显示「· 新」
  } else {
    vm.weightText = '未记录';
    vm.hasWeight = false;
    vm.weightNew = false;
  }

  var reminder = pet.nextReminder;
  if (reminder && reminder.remindAt) {
    var days = dateUtil.diffDays(reminder.remindAt, now);
    if (days < 0) {
      vm.reminderText = '已逾期 ' + (-days) + ' 天';
      vm.reminderClass = 'danger';
    } else {
      var label = CATEGORY_LABEL[reminder.category] || '提醒';
      vm.reminderText = label + ' ' + (days === 0 ? '今天' : days === 1 ? '明天' : days + '天');
      vm.reminderClass = 'pop';
    }
  } else {
    vm.reminderText = '';
    vm.reminderClass = '';
  }

  vm.adoptText = dateUtil.fmtAdoptDays(pet.adoptDate, now); // 单宠大卡用
  return vm;
}

// 待办视图模型（todos 为提醒原始文档，宠物信息按 petId 本地关联）
function buildTodoVM(reminder, petMap, now) {
  var pet = petMap[reminder.petId] || {};
  var pill = buildPill(reminder.remindAt, now);
  return {
    _id: reminder._id,
    petId: reminder.petId || '',
    petAvatar: pet.avatar || '',
    petSpecies: pet.species || 'other',
    title: pet.name ? pet.name + ' · ' + reminder.title : reminder.title,
    remindAt: reminder.remindAt,
    recordType: CATEGORY_RECORD_TYPE[reminder.category] || 'custom',
    pillText: pill.pillText,
    pillClass: pill.pillClass,
  };
}

// 统计速览条视图模型（金额分转元；超预算变焦糖色 + 角标）
function buildBannerVM(banner) {
  var budget = settingStore.get().budget || 0; // 分
  var expense = banner.monthExpense || 0;
  var over = budget > 0 && expense > budget;

  var weightText = '--';
  var weightClass = 'muted';
  var changes = banner.weightChanges || [];
  var i;
  for (i = 0; i < changes.length; i++) {
    if (changes[i].change !== 0) {
      var change = changes[i].change;
      weightText = (change > 0 ? '↑' : '↓') + Math.abs(change).toFixed(1) + 'kg';
      weightClass = 'pop';
      break;
    }
  }
  if (weightText === '--' && changes.length > 0) {
    weightText = '持平'; // ±0.1kg 内视为持平（云端已按此规则归零）
  }

  return {
    expenseText: '¥' + (expense / 100).toFixed(2),
    expenseOver: over,
    overText: over ? '超 ' + Math.round(((expense - budget) / budget) * 100) + '%' : '',
    checkins: banner.weekCheckins || 0,
    weightText: weightText,
    weightClass: weightClass,
  };
}

// 快捷记录九宫格：第一页 + 「更多」第二页（对照效果图 .grid9）
function buildQuickGrids() {
  var colors = icons.RECORD_COLORS;
  var page1 = [
    { icon: 'weight', nav: 'weight', label: '体重' },
    { icon: 'feed', nav: 'feed', label: '喂食' },
    { icon: 'vaccine', nav: 'vaccine', label: '疫苗' },
    { icon: 'deworm', nav: 'deworm', label: '驱虫' },
    { icon: 'medical', nav: 'medical', label: '就医' },
    { icon: 'expense', nav: 'expense', label: '花销' },
    { icon: 'poop', nav: 'poop', label: '便便' },
    { icon: 'wash', nav: 'groom', label: '洗护' },
    { icon: 'custom', nav: '', label: '更多' },
  ];
  var page2 = [
    { icon: 'vomit', nav: 'vomit', label: '呕吐' },
    { icon: 'walk', nav: 'walk', label: '遛狗' },
    { icon: 'medication', nav: 'medication', label: '用药' },
    { icon: 'water', nav: 'water', label: '饮水' },
    { icon: 'milestone', nav: 'milestone', label: '里程碑' },
    { icon: 'custom', nav: 'custom', label: '自定义' },
    { icon: 'surgery', nav: 'surgery', label: '手术' },
    { icon: 'groom', nav: 'groom', label: '美容' },
    { icon: 'heat', nav: 'heat', label: '发情' },
  ];
  return [page1, page2].map(function (page) {
    return page.map(function (item) {
      var color = colors[item.icon] || colors.custom;
      return {
        iconType: item.icon,
        navType: item.nav,
        label: item.label,
        color: color,
        tint: color + '1A', // 类型色浅底（对照效果图 tint(c) = color + '1A'）
      };
    });
  });
}

Page({
  data: {
    loading: true,
    loadError: false,
    pets: [],
    todos: [],
    todoTotal: 0,
    todoState: 'none', // list / peace / peace-hide / none
    todoActions: [
      { key: 'done', text: '完成', icon: 'check', theme: 'success' },
      { key: 'snooze', text: '延后 3 天', icon: 'clock', theme: 'neutral' },
    ],
    banner: {
      expenseText: '¥0.00', expenseOver: false, overText: '',
      checkins: 0, weightText: '--', weightClass: 'muted',
    },
    editing: false,     // 长按进入的编辑模式
    fabShrink: false,
    // 快捷记录弹层
    sheetVisible: false,
    sheetView: 'grid',  // grid（九宫格）/ pets（宠物选择，同一 sheet 内切换）
    gridPage: 0,
    grids: [],
    selectedPetId: '',
    quickPet: null,
    // 内联 mask 图标 URI
    plusUri: '',
    chevUri: '',
    checkUri: '',
  },

  onLoad: function () {
    try {
      this._winHeight = wx.getWindowInfo().windowHeight || 667;
    } catch (e) {
      try {
        this._winHeight = wx.getSystemInfoSync().windowHeight || 667;
      } catch (e2) {
        this._winHeight = 667;
      }
    }
    this.setData({
      grids: buildQuickGrids(),
      plusUri: icons.maskIcon('plus'),
      chevUri: icons.maskIcon('chevron-right'),
      checkUri: icons.maskIcon('check'),
    });
  },

  onShow: function () {
    tracker.track(tracker.EVENTS.HOME_EXPOSURE);
    this._loadData();
  },

  onHide: function () {
    this._clearPeaceTimers();
  },

  onUnload: function () {
    this._clearPeaceTimers();
  },

  onPullDownRefresh: function () {
    this._loadData({ pullDown: true });
  },

  onPageScroll: function (e) {
    // 滚动超过一屏 FAB 缩小（§7.9）
    var shrink = e.scrollTop > (this._winHeight || 667);
    if (shrink !== this.data.fabShrink) {
      this.setData({ fabShrink: shrink });
    }
  },

  onShareAppMessage: function () {
    return { title: '毛球档案袋 · 每只毛孩子，都值得一份完整的档案' };
  },

  /* ---------------- 数据加载 ---------------- */

  _loadData: function (options) {
    options = options || {};
    var self = this;
    var firstLoad = !this._loadedOnce;
    if (firstLoad) {
      this.setData({ loading: true, loadError: false });
    }
    return homeService.getHomeData()
      .then(function (data) {
        self._loadedOnce = true;
        self._renderData(data || {});
      })
      .catch(function (err) {
        // 云环境未配置/网络失败：已有内容时保留内容仅提示，首屏则进错误态
        if (!self._loadedOnce) {
          self.setData({ loadError: true });
        }
        self.toast('fail', (err && err.msg) || '网络开小差了，请重试');
      })
      .then(function () {
        self.setData({ loading: false });
        if (options.pullDown) {
          wx.stopPullDownRefresh();
        }
      });
  },

  _renderData: function (data) {
    var now = Date.now();
    var rawPets = data.pets || [];
    petStore.setPetList(rawPets);

    var petMap = {};
    rawPets.forEach(function (pet) {
      petMap[pet._id] = pet;
    });

    var todosRaw = (data.todos && data.todos.list) || [];
    var self = this;
    this.setData({
      loadError: false,
      editing: false,
      pets: rawPets.map(function (pet) { return buildPetVM(pet, now); }),
      todos: todosRaw.map(function (r) { return buildTodoVM(r, petMap, now); }),
      todoTotal: (data.todos && data.todos.total) || todosRaw.length,
      banner: buildBannerVM(data.banner || {}),
    }, function () {
      self._updateTodoState();
    });
  },

  onRetry: function () {
    this._loadedOnce = false; // 重新走骨架屏流程
    this._loadData();
  },

  /* ---------------- 全局待办 ---------------- */

  // 待办区状态：有待办 list；无待办显示「今天一切安好」3 秒后折叠收起
  _updateTodoState: function () {
    var self = this;
    this._clearPeaceTimers();
    if (this.data.todos.length > 0) {
      this.setData({ todoState: 'list' });
      return;
    }
    if (this.data.pets.length === 0) {
      this.setData({ todoState: 'none' });
      return;
    }
    this.setData({ todoState: 'peace' });
    this._peaceTimer = setTimeout(function () {
      self.setData({ todoState: 'peace-hide' });
      self._peaceHideTimer = setTimeout(function () {
        self.setData({ todoState: 'none' });
      }, 400); // 与折叠动画时长对齐
    }, 3000);
  },

  _clearPeaceTimers: function () {
    clearTimeout(this._peaceTimer);
    clearTimeout(this._peaceHideTimer);
  },

  goReminders: function () {
    wx.navigateTo({ url: '/pages/reminder/index' });
  },

  onTodoAction: function (e) {
    var index = e.currentTarget.dataset.index;
    var key = e.detail.key;
    if (key === 'done') {
      this._confirmComplete(index);
    } else if (key === 'snooze') {
      this._snoozeTodo(index);
    }
  },

  // 完成：先询问是否同时记一笔对应记录（PRD §6.3）
  _confirmComplete: function (index) {
    var todo = this.data.todos[index];
    if (!todo) return;
    var self = this;
    wx.showModal({
      title: '完成提醒',
      content: '是否同时记一笔对应记录？',
      confirmText: '记一笔',
      cancelText: '仅完成',
      success: function (res) {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/record/edit/index?type=' + todo.recordType +
              '&petId=' + todo.petId + '&reminderId=' + todo._id,
          });
        } else if (res.cancel) {
          self._completeTodo(index);
        }
      },
    });
  },

  _completeTodo: function (index) {
    var self = this;
    var todos = this.data.todos.slice();
    var removed = todos.splice(index, 1)[0];
    if (!removed) return;
    // 乐观移除，失败回滚
    this._applyTodos(todos, this.data.todoTotal - 1);
    reminderService.completeReminder(removed._id)
      .then(function () {
        tracker.track(tracker.EVENTS.REMINDER_COMPLETE);
        self._requestSubscribe();
      })
      .catch(function (err) {
        var rollback = self.data.todos.slice();
        rollback.splice(Math.min(index, rollback.length), 0, removed);
        self._applyTodos(rollback, self.data.todoTotal + 1);
        self.toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  // 延后 3 天：乐观更新胶囊，失败回滚
  _snoozeTodo: function (index) {
    var self = this;
    var todos = this.data.todos.slice();
    var todo = todos[index];
    if (!todo) return;
    var backup = Object.assign({}, todo);
    var newRemindAt = dateUtil.addDays(todo.remindAt, 3);
    var pill = buildPill(newRemindAt, Date.now());
    todos[index] = Object.assign({}, todo, {
      remindAt: newRemindAt,
      pillText: pill.pillText,
      pillClass: pill.pillClass,
    });
    this.setData({ todos: todos });
    reminderService.snoozeReminder(todo._id)
      .catch(function (err) {
        var rollback = self.data.todos.slice();
        rollback[index] = backup;
        self.setData({ todos: rollback });
        self.toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  _applyTodos: function (todos, total) {
    var self = this;
    this.setData({
      todos: todos,
      todoTotal: Math.max(0, total),
    }, function () {
      self._updateTodoState();
    });
  },

  // 完成提醒后顺带补充订阅消息授权（PRD §5.5；模板未配置时静默跳过）
  _requestSubscribe: function () {
    var tmplId = subscribeConstants.SUBSCRIBE_TEMPLATE_ID;
    if (!tmplId || tmplId.indexOf('PLACEHOLDER') > -1) {
      return;
    }
    try {
      wx.requestSubscribeMessage({
        tmplIds: [tmplId],
        success: function () {},
        fail: function () {},
      });
    } catch (e) {
      // 授权流程异常不打断业务
    }
  },

  /* ---------------- 统计速览条 ---------------- */

  goExpense: function () {
    wx.navigateTo({ url: '/pages/expense/index' });
  },

  goStats: function () {
    // stats 是 tabBar 页面，只能 switchTab
    wx.switchTab({ url: '/pages/stats/index' });
  },

  /* ---------------- 宠物卡片网格 ---------------- */

  goAddPet: function () {
    wx.navigateTo({ url: '/pages/pet/edit/index' });
  },

  onPetTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var pet = this.data.pets[index];
    if (!pet) return;
    if (this.data.editing) {
      this._showPetActions(index);
      return;
    }
    wx.navigateTo({ url: '/pages/pet/detail/index?id=' + pet._id });
  },

  // 卡片右上角「+」：快捷记录，预选该宠物
  onQuickAdd: function (e) {
    this._openQuickSheet(e.currentTarget.dataset.id);
  },

  // 长按进入编辑模式：卡片抖动 + 顶部「完成」（§6.5 长按 light 震动）
  onPetLongPress: function () {
    if (this.data.editing) return;
    vibrate('light');
    this.setData({ editing: true });
  },

  onExitEdit: function () {
    this.setData({ editing: false });
  },

  // 编辑模式下点击卡片：编辑档案 / 归档宠物 / 前移一位
  _showPetActions: function (index) {
    var self = this;
    var pet = this.data.pets[index];
    if (!pet) return;
    wx.showActionSheet({
      itemList: ['编辑档案', '归档宠物', '前移一位'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/pet/edit/index?id=' + pet._id });
        } else if (res.tapIndex === 1) {
          self._archivePet(index);
        } else if (res.tapIndex === 2) {
          self._movePetForward(index);
        }
      },
    });
  },

  _archivePet: function (index) {
    var self = this;
    var pet = this.data.pets[index];
    if (!pet) return;
    wx.showModal({
      title: '归档宠物',
      content: '归档后「' + pet.name + '」不再显示在首页，可在「我的 → 归档宠物」中查看',
      confirmText: '归档',
      success: function (res) {
        if (!res.confirm) return;
        // 乐观移除，失败回滚（重新拉全量，保证顺序正确）
        var pets = self.data.pets.slice();
        pets.splice(index, 1);
        self.setData({ pets: pets });
        petService.savePet({ archived: true }, pet._id)
          .catch(function (err) {
            self._loadData();
            self.toast('fail', (err && err.msg) || '网络开小差了，请重试');
          });
      },
    });
  },

  _movePetForward: function (index) {
    var self = this;
    if (index <= 0) {
      this.toast('fail', '已经在最前面啦');
      return;
    }
    var pets = this.data.pets.slice();
    var temp = pets[index - 1];
    pets[index - 1] = pets[index];
    pets[index] = temp;
    this.setData({ pets: pets });
    vibrate('light');
    var petIds = pets.map(function (p) { return p._id; });
    petService.reorderPets(petIds)
      .catch(function (err) {
        self._loadData(); // 回滚：重新拉全量
        self.toast('fail', (err && err.msg) || '网络开小差了，请重试');
      });
  },

  /* ---------------- 快捷记录九宫格 ---------------- */

  onFabTap: function () {
    this._openQuickSheet('');
  },

  _openQuickSheet: function (petId) {
    if (this.data.pets.length === 0) return;
    var selectedId = petId || this._pickDefaultPetId();
    this.setData({
      sheetVisible: true,
      sheetView: 'grid',
      gridPage: 0,
      selectedPetId: selectedId,
      quickPet: this._findPet(selectedId),
    });
  },

  // 默认宠物：最近上下文的宠物（petStore 记录），否则第一只
  _pickDefaultPetId: function () {
    var currentId = petStore.get().currentPetId;
    var pets = this.data.pets;
    var i;
    for (i = 0; i < pets.length; i++) {
      if (pets[i]._id === currentId) {
        return currentId;
      }
    }
    return pets.length > 0 ? pets[0]._id : '';
  },

  _findPet: function (petId) {
    var found = null;
    this.data.pets.forEach(function (pet) {
      if (pet._id === petId) {
        found = pet;
      }
    });
    return found;
  },

  onSheetClose: function () {
    this.setData({ sheetVisible: false });
  },

  // 标题行右侧宠物选择器：同一 sheet 内切换视图，不新开弹层
  onToggleSheetView: function () {
    vibrate('light');
    this.setData({
      sheetView: this.data.sheetView === 'grid' ? 'pets' : 'grid',
    });
  },

  onPickPet: function (e) {
    var petId = e.currentTarget.dataset.id;
    vibrate('light');
    this.setData({
      selectedPetId: petId,
      quickPet: this._findPet(petId),
      sheetView: 'grid',
    });
  },

  onGridSwipe: function (e) {
    this.setData({ gridPage: e.detail.current });
  },

  onDotTap: function (e) {
    this.setData({ gridPage: e.currentTarget.dataset.page });
  },

  // 点类型：直接进表单（当前选中宠物）；「更多」切第二页
  onGridCellTap: function (e) {
    var type = e.currentTarget.dataset.type;
    if (!type) {
      this.setData({ gridPage: 1 });
      return;
    }
    var petId = this.data.selectedPetId;
    if (!petId && this.data.pets.length > 0) {
      petId = this.data.pets[0]._id;
    }
    tracker.track('quick_record_click', { type: type });
    this.setData({ sheetVisible: false });
    wx.navigateTo({
      url: '/pages/record/edit/index?type=' + type + '&petId=' + petId,
    });
  },

  /* ---------------- 通用 ---------------- */

  toast: function (type, text) {
    var toast = this.selectComponent('#toast');
    if (toast) {
      toast.show({ type: type, text: text });
    }
  },
});
