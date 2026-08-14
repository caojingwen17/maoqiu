/**
 * paw-loading —— 猫爪描边加载动画（设计文档 §7.1）
 *
 * 属性：
 *   size    String   '64rpx'  整体尺寸（rpx/px 均可）
 *   type    String   'page'   page=页面级（Primary 色）/ local=局部（Text-Tertiary 色）
 *   variant String   'paw'    paw=猫爪描边生长循环 / spinner=按钮内 12 辐条白色旋转（16rpx）
 *
 * 事件：无
 *
 * 示例：
 *   <paw-loading type="page" size="64rpx" />
 *   <paw-loading variant="spinner" />
 *
 * 实现说明：小程序不支持内联 SVG，描边生长用 canvas type="2d" 的
 * setLineDash/lineDashOffset 实现，节奏参数照抄 §7.1（1.3s：60% 生长 / 20% 停留 / 20% 淡出）。
 * canvas 无法读取 CSS 变量，描边色取自 --primary(#3E362C) 与 --text-tertiary(#B9AE9E) 的色值。
 */
var COLORS = { page: '#3E362C', local: '#B9AE9E' };
var CYCLE = 1300; // 1.3s 一轮
var DRAW_END = 0.6; // 0~60% 描边生长
var FADE_START = 0.8; // 80%~100% 淡出

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    size: { type: String, value: '64rpx' },
    type: { type: String, value: 'page' },
    variant: { type: String, value: 'paw' }
  },

  data: {
    spokes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  },

  lifetimes: {
    ready: function () {
      if (this.data.variant === 'spinner') return;
      this._initCanvas();
    },
    detached: function () {
      this._stopped = true;
    }
  },

  methods: {
    _initCanvas: function () {
      var self = this;
      this.createSelectorQuery()
        .select('#pawCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) return;
          var canvas = res[0].node;
          var ctx = canvas.getContext('2d');
          var info = { windowWidth: 375 };
          try { info = wx.getWindowInfo(); } catch (e) { /* 旧基础库 */ }
          var dpr = info.pixelRatio || 2;
          var w = res[0].width;
          var h = res[0].height;
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);
          ctx.lineWidth = Math.max(1.5, w * 0.045);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = COLORS[self.data.type] || COLORS.page;
          self._canvas = canvas;
          self._ctx = ctx;
          self._size = w;
          self._paths = self._buildPaths(w);
          self._raf = canvas.requestAnimationFrame
            ? canvas.requestAnimationFrame.bind(canvas)
            : function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
          self._start = 0;
          self._stopped = false;
          self._tick = self._tick.bind(self);
          self._raf(self._tick);
        });
    },

    /* 构建 5 段子路径（掌心 + 4 趾），并估算各自长度供 dashoffset 使用 */
    _buildPaths: function (w) {
      function u(x) { return x * w; }
      var paths = [];

      // 掌心：四段贝塞尔围成的肉垫
      var palm = [
        [0.30, 0.66], [0.30, 0.58], [0.40, 0.52], [0.50, 0.52],
        [0.60, 0.52], [0.70, 0.58], [0.70, 0.66],
        [0.70, 0.76], [0.60, 0.83], [0.50, 0.83],
        [0.40, 0.83], [0.30, 0.76], [0.30, 0.66]
      ];
      paths.push({ kind: 'bezier', pts: palm, len: this._bezierLen(palm, u) });

      // 4 趾：小圆
      var toes = [[0.19, 0.42], [0.35, 0.26], [0.65, 0.26], [0.81, 0.42]];
      var r = 0.062 * w;
      for (var i = 0; i < toes.length; i++) {
        paths.push({
          kind: 'circle', cx: u(toes[i][0]), cy: u(toes[i][1]), r: r,
          len: 2 * Math.PI * r
        });
      }
      return paths;
    },

    _bezierLen: function (pts, u) {
      // 折线采样估算闭合贝塞尔链长度
      var len = 0;
      for (var s = 0; s < pts.length - 3; s += 3) {
        var p0 = pts[s], p1 = pts[s + 1], p2 = pts[s + 2], p3 = pts[s + 3];
        var px = u(p0[0]), py = u(p0[1]);
        for (var t = 0.1; t <= 1.001; t += 0.1) {
          var mt = 1 - t;
          var x = mt * mt * mt * u(p0[0]) + 3 * mt * mt * t * u(p1[0]) + 3 * mt * t * t * u(p2[0]) + t * t * t * u(p3[0]);
          var y = mt * mt * mt * u(p0[1]) + 3 * mt * mt * t * u(p1[1]) + 3 * mt * t * t * u(p2[1]) + t * t * t * u(p3[1]);
          len += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
          px = x; py = y;
        }
      }
      return len;
    },

    _strokePath: function (p) {
      var ctx = this._ctx;
      ctx.beginPath();
      if (p.kind === 'circle') {
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      } else {
        var u = function (x) { return x * this._size; }.bind(this);
        ctx.moveTo(u(p.pts[0][0]), u(p.pts[0][1]));
        for (var s = 1; s < p.pts.length - 2; s += 3) {
          ctx.bezierCurveTo(
            u(p.pts[s][0]), u(p.pts[s][1]),
            u(p.pts[s + 1][0]), u(p.pts[s + 1][1]),
            u(p.pts[s + 2][0]), u(p.pts[s + 2][1])
          );
        }
        ctx.closePath();
      }
      ctx.stroke();
    },

    _tick: function (ts) {
      if (this._stopped) return;
      if (!this._start) this._start = ts;
      var t = ((ts - this._start) % CYCLE) / CYCLE;
      var frac = t < DRAW_END ? t / DRAW_END : 1;
      var alpha = t < FADE_START ? 1 : 1 - (t - FADE_START) / (1 - FADE_START);
      var ctx = this._ctx;
      ctx.clearRect(0, 0, this._size, this._size);
      ctx.globalAlpha = Math.max(0, alpha);
      for (var i = 0; i < this._paths.length; i++) {
        var p = this._paths[i];
        ctx.setLineDash([p.len, p.len * 2]);
        ctx.lineDashOffset = p.len * (1 - frac);
        this._strokePath(p);
      }
      ctx.globalAlpha = 1;
      this._raf(this._tick);
    }
  }
});
