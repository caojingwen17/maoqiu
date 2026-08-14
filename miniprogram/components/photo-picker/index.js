/**
 * photo-picker —— 照片选择 + 压缩 + 云上传（PRD §5.3 / 设计文档 §8.3 照片槽位）
 *
 * 属性：
 *   photos  Array   []   已上传照片的 fileID 数组（页面绑回，组件内部也自维护一份）
 *   max     Number  9    最多张数（≤9）
 *
 * 事件：
 *   change(detail: {photos})  fileID 数组变化（每张上传成功/删除后触发；
 *                             失败张不进入数组，保留在界面上等重传）
 *
 * 示例：
 *   <photo-picker photos="{{photos}}" bindchange="e => this.setData({photos: e.detail.photos})" />
 *
 * 流程：wx.chooseMedia 选图 → wx.compressImage 压缩至 ≤500KB（jpg，质量递减）→
 * wx.cloud.uploadFile 逐张上传（cloudPath: uploads/{YYYYMMDD}/{随机16位}.jpg）。
 * 单张失败不影响其他张，失败张显示重传角标（点击重传，PRD §5.3）；
 * 上传中显示进度遮罩；长按照片可删除（§6.5 light 触觉）。
 * 注意：失败重传依赖微信临时文件路径，页面存活期内有效。
 */
var icons = require('../icons.js');
var utils = require('../utils.js');

var SIZE_LIMIT = 500 * 1024; // 500KB

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  properties: {
    photos: {
      type: Array,
      value: [],
      observer: function (photos) {
        // 页面侧重置/回绑时同步（与内部 committed 不同才采纳）
        if (JSON.stringify(photos || []) !== JSON.stringify(this._committed || [])) {
          this._committed = (photos || []).slice();
          this._render();
        }
      }
    },
    max: { type: Number, value: 9 }
  },

  data: {
    items: [], // [{key, src, status: 'done'|'uploading'|'failed', progress}]
    cameraUri: icons.maskIcon('camera'),
    retryUri: icons.maskIcon('retry')
  },

  lifetimes: {
    attached: function () {
      this._committed = (this.data.photos || []).slice();
      this._pending = [];
      this._seq = 0;
      this._render();
    }
  },

  methods: {
    /* —— 渲染：committed(fileID) + pending(本地待传/失败) —— */
    _render: function () {
      var items = this._committed.map(function (fid) {
        return { key: 'c_' + fid, src: fid, status: 'done', progress: 100 };
      }).concat(this._pending);
      this.setData({ items: items });
    },

    _emitChange: function () {
      this.triggerEvent('change', { photos: this._committed.slice() });
    },

    /* —— 选图 —— */
    onAdd: function () {
      var self = this;
      var remain = this.data.max - this._committed.length - this._pending.length;
      if (remain <= 0) return;
      wx.chooseMedia({
        count: Math.min(remain, 9),
        mediaType: ['image'],
        sizeType: ['compressed'],
        success: function (res) {
          (res.tempFiles || []).forEach(function (f) {
            self._enqueue(f.tempFilePath);
          });
        }
      });
    },

    _enqueue: function (tempFilePath) {
      var item = {
        key: 'p_' + (++this._seq) + '_' + Date.now(),
        src: tempFilePath,
        tempFilePath: tempFilePath,
        status: 'uploading',
        progress: 0
      };
      this._pending.push(item);
      this._render();
      this._process(item);
    },

    /* 压缩 ≤500KB → 上传 */
    _process: function (item) {
      var self = this;
      this._compress(item.tempFilePath, 80, function (filePath) {
        self._upload(item, filePath);
      });
    },

    _compress: function (filePath, quality, cb) {
      var self = this;
      wx.compressImage({
        src: filePath,
        quality: quality,
        success: function (res) {
          wx.getFileInfo({
            filePath: res.tempFilePath,
            success: function (info) {
              if (info.size > SIZE_LIMIT && quality > 30) {
                self._compress(res.tempFilePath, quality - 25, cb);
              } else {
                cb(res.tempFilePath);
              }
            },
            fail: function () { cb(res.tempFilePath); }
          });
        },
        fail: function () { cb(filePath); } // 非 jpg 等情况直接传原图
      });
    },

    _cloudPath: function () {
      var d = new Date();
      var day = '' + d.getFullYear() +
        ('0' + (d.getMonth() + 1)).slice(-2) +
        ('0' + d.getDate()).slice(-2);
      var rand = '';
      var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      for (var i = 0; i < 16; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      return 'uploads/' + day + '/' + rand + '.jpg';
    },

    _upload: function (item, filePath) {
      var self = this;
      var task = wx.cloud.uploadFile({
        cloudPath: this._cloudPath(),
        filePath: filePath,
        success: function (res) {
          self._removePending(item);
          self._committed.push(res.fileID);
          self._render();
          self._emitChange();
        },
        fail: function () {
          item.status = 'failed';
          self._render();
        }
      });
      if (task && task.onProgressUpdate) {
        task.onProgressUpdate(function (e) {
          if (item.status === 'uploading') {
            item.progress = e.progress;
            self._render();
          }
        });
      }
    },

    _removePending: function (item) {
      var i = this._pending.indexOf(item);
      if (i !== -1) this._pending.splice(i, 1);
    },

    /* —— 失败张点击重传 —— */
    onSlotTap: function (e) {
      var key = e.currentTarget.dataset.key;
      var item = null;
      this._pending.forEach(function (p) { if (p.key === key) item = p; });
      if (!item || item.status !== 'failed') return;
      item.status = 'uploading';
      item.progress = 0;
      this._render();
      this._process(item);
    },

    /* —— 长按删除（§6.5 light 触觉） —— */
    onLongPress: function (e) {
      var self = this;
      var key = e.currentTarget.dataset.key;
      utils.haptic('light');
      wx.showActionSheet({
        itemList: ['删除照片'],
        success: function () {
          var idx = -1;
          self._committed.forEach(function (fid, i) {
            if ('c_' + fid === key) idx = i;
          });
          if (idx !== -1) {
            self._committed.splice(idx, 1);
          } else {
            self._pending = self._pending.filter(function (p) { return p.key !== key; });
          }
          self._render();
          self._emitChange();
        }
      });
    }
  }
});
