/**
 * swipe-cell —— 滑动操作列表行（设计文档 §7.6 Swipe Actions，iOS Mail 式）
 *
 * 属性：
 *   actions  Array  []  操作块 [{key, text, icon, theme}]
 *                       theme: success（完成绿底）/ neutral（延后 BG-Fill-Deep 底）/ danger（删除红底）
 *                       icon 为 icons.js 注册表 key（如 check/clock/trash）
 *
 * 事件：
 *   action(detail: {key})  操作触发（点按操作块，或右滑超过行宽 40% 松手自动执行第一个 action）
 *
 * 方法：
 *   close()  收起操作块（页面可 selectComponent 后调用）
 *
 * 示例：
 *   <swipe-cell actions="{{[{key:'done',text:'完成',icon:'check',theme:'success'},
 *                           {key:'delay',text:'延后',icon:'clock',theme:'neutral'}]}}" bindaction="onAct">
 *     <view>提醒内容</view>
 *   </swipe-cell>
 *
 * 说明：手指右滑从左侧露出操作块（PRD §6.3），滑过 40% 宽度松手自动执行第一个
 * action；touch 事件实现（比 movable-view 更易控制 40% 阈值与过界阻尼）。
 */
var icons = require('../icons.js');
var utils = require('../utils.js');

var ACTION_W_RPX = 112; // 单个操作块宽
var FULL_TRIGGER = 0.4; // 行宽 40% 触发主操作

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    actions: {
      type: Array,
      value: [],
      observer: function (actions) {
        var list = (actions || []).map(function (a) {
          return {
            key: a.key,
            text: a.text || '',
            iconUri: a.icon ? icons.maskIcon(a.icon) : '',
            theme: a.theme || 'neutral'
          };
        });
        this.setData({ _actions: list });
        this._measure();
      }
    }
  },

  data: {
    _actions: [],
    offsetX: 0,      // px，内容层右移距离
    dragging: false,
    actionsWidthPx: 0
  },

  lifetimes: {
    ready: function () { this._measure(); }
  },

  methods: {
    _measure: function () {
      var self = this;
      this.createSelectorQuery()
        .select('.swipe-cell')
        .boundingClientRect(function (rect) {
          if (!rect) return;
          self._cellWidth = rect.width;
          self.setData({
            actionsWidthPx: utils.rpx2px(ACTION_W_RPX) * self.data._actions.length
          });
        })
        .exec();
    },

    onTouchStart: function (e) {
      if (!this.data._actions.length) return;
      var t = e.touches[0];
      this._startX = t.clientX;
      this._startY = t.clientY;
      this._dir = null; // null=未判定 / 'h'=横滑处理 / 'v'=竖滑放行（不打断页面滚动）
      this._startOffset = this.data.offsetX;
    },

    onTouchMove: function (e) {
      if (this._startX === undefined || this._dir === 'v') return;
      var t = e.touches[0];
      var dx = t.clientX - this._startX;
      var dy = t.clientY - this._startY;

      if (this._dir === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // 死区
        this._dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (this._dir === 'v') return;
        this.setData({ dragging: true });
      }

      var max = this._cellWidth || 375;
      var next = this._startOffset + dx;
      if (next < 0) next = 0;
      // 越过操作区宽度后加阻尼，提示还能继续滑向全滑触发
      var aw = this.data.actionsWidthPx;
      if (next > aw) next = aw + (next - aw) * 0.45;
      if (next > max * 0.75) next = max * 0.75;
      this.setData({ offsetX: next });
    },

    onTouchEnd: function () {
      if (this._startX === undefined) return;
      this._startX = undefined;
      if (this._dir !== 'h') { this._dir = null; return; }
      this._dir = null;
      var offset = this.data.offsetX;
      var cellW = this._cellWidth || 375;
      var aw = this.data.actionsWidthPx;
      this.setData({ dragging: false });

      if (offset > cellW * FULL_TRIGGER) {
        // 全滑触发：自动执行第一个 action（iOS Mail 式）
        this._fireAction(this.data._actions[0], true);
      } else if (offset > aw / 2) {
        this.setData({ offsetX: aw }); // 吸附展开
      } else {
        this.setData({ offsetX: 0 });
      }
    },

    onActionTap: function (e) {
      var idx = e.currentTarget.dataset.index;
      this._fireAction(this.data._actions[idx], false);
    },

    _fireAction: function (action, isFullSwipe) {
      if (!action) return;
      if (action.theme === 'danger') utils.haptic('heavy');   // §6.5 删除确认
      else if (action.theme === 'success') utils.haptic('medium'); // 打卡完成
      else utils.haptic('light');
      this.close();
      this.triggerEvent('action', { key: action.key, fullSwipe: !!isFullSwipe });
    },

    close: function () {
      this.setData({ offsetX: 0 });
    }
  }
});
