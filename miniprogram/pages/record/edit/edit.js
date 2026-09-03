const app = getApp();
const { NAME, ICON_OF, TC, FIELD, FEED_FOOD } = require('../../../utils/recordMeta.js');
const { fmtDate, fmtDateCn } = require('../../../utils/date.js');
const homeService = require('../../../services/home.js');
const recordService = require('../../../services/record.js');
const inventoryService = require('../../../services/inventory.js');
const reminderService = require('../../../services/reminder.js');
const subscription = require('../../../services/subscription.js');
const tracker = require('../../../utils/tracker.js');
const { guard } = require('../../../utils/guard.js');
const { SPECIES, VACCINES } = require('../../../utils/dict.js');

/** 日常视频大小上限（云存储与内容安全考虑，单个 ≤ 10MB） */
const VIDEO_MAX_BYTES = 10 * 1024 * 1024;

const theme = require('../../../utils/theme.js');

Page({
  data: {
    // 主题初始值：首帧即正确，避免跳转闪浅色（onShow 里 attach 会再校正）
    themeClass: theme.rootClass(),
    onPrimary: theme.onPrimaryHex(),
    textColor: theme.textHex(),
    sb: 20,
    type: 'weight',
    name: '体重',
    icon: 'scale',
    color: '#C08A4E',
    fields: [],
    again: false,
    result: false,
    showResult: false,
    resultNext: '',
    petId: '',
    petIdx: 0,
    petName: '',
    petSpecies: '',
    petAvatar: '',
    pets: [],
    photos: [], // 本地临时路径或云端 fileID（编辑态回填），保存时统一处理
    videos: [], // 日常视频：{ path, thumb }，thumb 为 chooseMedia 封面（云端回填时为空，用占位底）
    note: '',
    dateStr: '', // 记录日期（picker 值 YYYY-MM-DD）
    dateLabel: '',
    editing: false, // 编辑态：不展示囤货扣减选择（扣减仅发生在新建）
    invOptions: [], // 可扣减的囤货候选（{ _id, itemName, remainAmount, unit }）
    invSel: -1 // -1 = 不扣减（默认），>=0 为 invOptions 下标
  },

  onShow() {
    theme.attach(this);
  },
  onLoad(options) {
    const today = fmtDate(Date.now());
    this.setData({
      sb: app.globalData.statusBarHeight || 20,
      dateStr: today,
      dateLabel: fmtDateCn(Date.now()) + ' · 今天'
    });
    const type = (options && options.type) || 'weight';
    this.applyType(type);
    // 结果卡「同步记一笔」带分类预填
    if (options && options.cat) this.applyExpenseCat(options.cat);
    // 待办联动预填：疫苗名称（疫苗名存下来，物种字典切换 opts 后需重新匹配）
    if (options && options.v) {
      this._vaccinePrefill = decodeURIComponent(options.v);
      this.applyVaccinePrefill(this._vaccinePrefill);
    }
    // 待办联动预填：洗护项目（梳毛/刷牙/剪指甲等）
    if (options && options.item) this.applyGroomPrefill(decodeURIComponent(options.item));
    // 待办联动预填：自定义类提醒标题（如「洗碗」）→ 填入自定义记录的「标题」
    if (options && options.title) this.applyTitlePrefill(decodeURIComponent(options.title));
    if (options && options.petId) this.setData({ petId: options.petId });
    // 从首页待办进入：保存后联动完成原提醒
    if (options && options.reminderId) this._reminderId = options.reminderId;
    this.loadPet();
    // 编辑模式：回填已有记录
    if (options && options.id) {
      this._editId = options.id;
      this.setData({ editing: true });
      this.loadRecordForEdit(options.id);
    }
  },

  // 花销分类预填（医疗同步记账等入口）
  applyExpenseCat(cat) {
    const fi = this.data.fields.findIndex((f) => f.kind === 'chips' && f.label === '分类');
    if (fi < 0) return;
    const oi = (this.data.fields[fi].opts || []).indexOf(cat);
    if (oi > -1) this.setData({ ['fields[' + fi + '].sel']: oi });
  },

  // 待办联动预填：提醒标题「猫三联疫苗」→ 选中对应疫苗 chip（匹配不上则选「其他」）
  applyVaccinePrefill(name) {
    const fi = this.data.fields.findIndex((f) => f.kind === 'chips' && f.label === '疫苗');
    if (fi < 0) return;
    const opts = this.data.fields[fi].opts || [];
    let oi = opts.indexOf(name);
    if (oi < 0) oi = opts.indexOf('其他');
    if (oi > -1) this.setData({ ['fields[' + fi + '].sel']: oi });
  },

  // 疫苗 chips 按当前宠物物种切换字典（dict.js VACCINES，自带「其他」；物种无字典回退 default）
  // 在 loadPet / onPetChange / loadRecordForEdit 之后调用：
  // - 待办预填（_vaccinePrefill）：精确匹配，匹配不上落「其他」（同 applyVaccinePrefill 语义）
  // - 编辑回填（_vaccineValue）：值不在新字典时临时追加进 opts，避免静默丢失
  applyVaccineDict() {
    if (this.data.type !== 'vaccine') return;
    const fi = this.data.fields.findIndex((f) => f.kind === 'chips' && f.label === '疫苗');
    if (fi < 0) return;
    const opts = (VACCINES[this._species] || VACCINES.default || ['其他']).slice();
    const wanted = this._vaccinePrefill || this._vaccineValue || '';
    let sel = 0;
    if (wanted) {
      sel = opts.indexOf(wanted);
      if (sel < 0 && this._vaccinePrefill) sel = opts.indexOf('其他');
      if (sel < 0) { opts.push(wanted); sel = opts.length - 1; }
      if (sel < 0) sel = 0;
    }
    this.setData({ ['fields[' + fi + '].opts']: opts, ['fields[' + fi + '].sel']: sel });
  },

  // 待办联动预填：洗护类提醒标题（如「梳毛」）→ 选中对应项目 chip（多选字段，预选一项）
  // 注意：模板按 selBools 渲染选中态，sels 改了必须同步重算 selBools
  applyGroomPrefill(item) {
    const fi = this.data.fields.findIndex((f) => f.kind === 'mchips' && f.label === '项目（可多选）');
    if (fi < 0) return;
    const opts = this.data.fields[fi].opts || [];
    const oi = opts.indexOf(item);
    if (oi > -1) this.setData({
      ['fields[' + fi + '].sels']: [oi],
      ['fields[' + fi + '].selBools']: opts.map((_, i) => i === oi)
    });
  },

  // 待办联动预填：自定义类提醒标题 → 填入「标题」输入字段（custom/里程碑等有标题字段的类型）
  applyTitlePrefill(title) {
    if (!title) return;
    const fi = this.data.fields.findIndex((f) => f.kind === 'input' && f.label === '标题');
    if (fi < 0) return;
    this.setData({ ['fields[' + fi + '].val']: title });
  },

  // 编辑模式：按 label 把 data.items 回填进表单字段
  async loadRecordForEdit(id) {
    try {
      const r = await recordService.get(id);
      if (!r) return;
      this.applyType(r.type || 'daily');
      const items = (r.data && Array.isArray(r.data.items)) ? r.data.items : [];
      // 疫苗回填值存下来：物种字典切换 opts 后由 applyVaccineDict 重新匹配/兜底追加
      const vax = items.find((x) => x.label === '疫苗');
      if (vax) this._vaccineValue = vax.value;
      const fields = this.data.fields.map((f) => {
        if (f.kind === 'switch' && f.label === '生成用药提醒') {
          const nf = Object.assign({}, f);
          nf.on = r.data && r.data.medicationReminder === false ? 0 : 1;
          return nf;
        }
        if (f.kind === 'mchips' && f.label === '提醒时间' && r.data && Array.isArray(r.data.medicationTimes)) {
          const nf = Object.assign({}, f);
          nf.sels = r.data.medicationTimes.map((v) => (f.opts || []).indexOf(v)).filter((i) => i > -1);
          return nf;
        }
        const it = items.find((x) => x.label === f.label);
        if (!it) return f;
        const nf = Object.assign({}, f);
        if (f.kind === 'chips') {
          const i = (f.opts || []).indexOf(it.value);
          if (i > -1) nf.sel = i;
        } else if (f.kind === 'mchips') {
          nf.sels = String(it.value).split('、').map((v) => (f.opts || []).indexOf(v)).filter((i) => i > -1);
        } else if (f.kind === 'input') {
          nf.val = (f.unit && String(it.value).endsWith(' ' + f.unit))
            ? String(it.value).slice(0, -(f.unit.length + 1))
            : it.value;
        } else if (f.kind === 'row') {
          nf.val = it.value;
        }
        return nf;
      });
      const patch = {
        fields: withMBools(fields),
        note: r.note || '',
        photos: (r.photos || []).slice(),
        videos: (r.videos || []).map((v) => ({ path: v, thumb: '' }))
      };
      if (r.petId) patch.petId = r.petId;
      if (r.date) {
        patch.dateStr = fmtDate(r.date);
        patch.dateLabel = fmtDateCn(r.date) + (fmtDate(r.date) === fmtDate(Date.now()) ? ' · 今天' : '');
      }
      this.setData(patch);
      this.applyVaccineDict();
    } catch (e) {
      console.error('[record.edit] 编辑回填失败', e);
    }
  },

  // 默认选中第一只宠物（多宠切换在 v1.0 后续接入）
  async loadPet() {
    try {
      const d = await homeService.aggregate();
      const pets = (d && d.pets) || [];
      if (!pets.length) return;
      this.setData({ pets });
      let pet = pets[0];
      if (this.data.petId) pet = pets.find((p) => p._id === this.data.petId) || pets[0];
      this.setData({ petId: pet._id, petIdx: pets.findIndex((p) => p._id === pet._id), petName: pet.name, petSpecies: speciesName(pet.species) || pet.breed || '', petAvatar: pet.avatar || '' });
      this._species = pet.species || '';
      this.applyFeedDefault();
      this.applyVaccineDict();
      this.loadInvOptions();
    } catch (e) {
      console.error('[record.edit] 宠物加载失败', e);
    }
  },

  onPetChange(e) {
    const idx = Number(e.detail.value);
    const pet = this.data.pets[idx];
    if (!pet) return;
    this.setData({ petId: pet._id, petIdx: idx, petName: pet.name, petSpecies: speciesName(pet.species) || pet.breed || '', petAvatar: pet.avatar || '' });
    this._species = pet.species || '';
    this.applyFeedDefault();
    this.applyVaccineDict();
    this.loadInvOptions();
  },

  // 喂食：按物种默认「食物」为该物种主粮名（用户已手填则不覆盖）
  applyFeedDefault() {
    if (this.data.type !== 'feed') return;
    const fi = this.data.fields.findIndex((f) => f.kind === 'input' && f.label === '食物');
    if (fi < 0 || this.data.fields[fi].val) return;
    const food = FEED_FOOD[this._species] || '主粮';
    this.setData({ ['fields[' + fi + '].val']: food });
  },

  applyType(type) {
    const meta = FIELD[type] || FIELD['daily'];
    this.setData({
      type,
      name: NAME[type] || meta.name,
      icon: ICON_OF[type] || 'camera',
      color: TC[type] || '#8A8378',
      fields: withMBools(JSON.parse(JSON.stringify(meta.fields || []))),
      again: !!meta.again,
      result: !!meta.result
    });
    this.loadInvOptions();
  },

  // 囤货扣减候选：喂食按粮食（按量），驱虫/用药按药品（按件 + linkType 匹配）；编辑态不出选择
  async loadInvOptions() {
    const type = this.data.type;
    const supported = type === 'feed' || type === 'deworm' || type === 'medication';
    if (!supported || this._editId) {
      if (this.data.invOptions.length || this.data.invSel !== -1) this.setData({ invOptions: [], invSel: -1 });
      return;
    }
    const today = fmtDate(Date.now());
    try {
      const list = await inventoryService.list();
      const items = (list || []).filter((it) => {
        if (it.expireDate && String(it.expireDate) < today) return false;
        if (type === 'feed') {
          return it.category === '粮食' && it.consumeMode !== 'byPiece' && (!it.petId || it.petId === this.data.petId);
        }
        return it.consumeMode === 'byPiece' && (!it.linkType || it.linkType === type);
      });
      this.setData({ invOptions: items, invSel: -1 });
    } catch (e) {
      // 囤货列表加载失败不阻塞记录保存，仅不提供扣减选项
      console.warn('[record.edit] 囤货列表加载失败', e);
    }
  },
  onInvChip(e) {
    this.setData({ invSel: Number(e.currentTarget.dataset.oi) });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  onBigInput() {
    if (this.data.type === 'weight') {
      wx.redirectTo({ url: '/pages/weight/weight?petId=' + (this.data.petId || '') });
    }
  },

  onChip(e) {
    const fi = e.currentTarget.dataset.fi;
    const oi = e.currentTarget.dataset.oi;
    this.setData({ ['fields[' + fi + '].sel']: Number(oi) });
    const f = this.data.fields[fi];
    if (this.data.type === 'medication' && f && f.label === '频次') this.syncMedicationTimes(Number(oi));
  },
  syncMedicationTimes(freqIndex) {
    const fi = this.data.fields.findIndex((f) => f.kind === 'mchips' && f.label === '提醒时间');
    if (fi < 0) return;
    const defaults = [[3], [1, 3], [0, 2, 3]][freqIndex] || [3];
    this.setData({
      ['fields[' + fi + '].sels']: defaults,
      ['fields[' + fi + '].selBools']: (this.data.fields[fi].opts || []).map((_, i) => defaults.indexOf(i) > -1)
    });
  },
  onMChip(e) {
    const fi = e.currentTarget.dataset.fi;
    const oi = Number(e.currentTarget.dataset.oi);
    const f = this.data.fields[fi];
    const sels = (f.sels && f.sels.slice()) || [];
    const idx = sels.indexOf(oi);
    if (idx > -1) sels.splice(idx, 1);
    else sels.push(oi);
    this.setData({
      ['fields[' + fi + '].sels']: sels,
      ['fields[' + fi + '].selBools[' + oi + ']']: idx === -1
    });
  },
  onFieldInput(e) {
    const fi = e.currentTarget.dataset.fi;
    this.setData({ ['fields[' + fi + '].val']: e.detail.value });
  },
  // row 类字段（下次日期/开始日期等）：日期选择器
  onFieldDate(e) {
    const fi = e.currentTarget.dataset.fi;
    this.setData({ ['fields[' + fi + '].val']: e.detail.value });
  },
  // 记录日期（允许补记）
  onDateChange(e) {
    const v = e.detail.value;
    const ts = new Date(String(v).replace(/-/g, '/') + ' 12:00').getTime();
    const isToday = v === fmtDate(Date.now());
    this.setData({ dateStr: v, dateLabel: fmtDateCn(ts) + (isToday ? ' · 今天' : '') });
  },
  onFieldSwitch(e) {
    const fi = e.currentTarget.dataset.fi;
    this.setData({ ['fields[' + fi + '].on']: e.detail.value ? 1 : 0 });
  },
  noop() { },
  onNoteInput(e) {
    this.setData({ note: (e.detail && e.detail.value) || '' });
  },

  // ===== 照片：选图（最多 9 张）→ 本地预览 → 保存时上传云存储 =====
  onAddPhoto() {
    const left = 9 - this.data.photos.length;
    if (left <= 0) return;
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
        if (paths.length) this.setData({ photos: this.data.photos.concat(paths).slice(0, 9) });
      }
    });
  },
  onDelPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.photos.slice();
    photos.splice(idx, 1);
    this.setData({ photos });
  },
  // 日常：照片+视频混选（合计最多 9 个；单个视频 ≤ 10MB，超限跳过并提示）
  onAddMedia() {
    const toast = this.selectComponent('#toast');
    const left = 9 - this.data.photos.length - this.data.videos.length;
    if (left <= 0) return;
    wx.chooseMedia({
      count: left,
      mediaType: ['image', 'video'],
      sizeType: ['compressed'],
      maxDuration: 60,
      success: (res) => {
        const photos = this.data.photos.slice();
        const videos = this.data.videos.slice();
        let oversize = false;
        (res.tempFiles || []).forEach((f) => {
          if (!f || !f.tempFilePath) return;
          if (f.fileType === 'video') {
            if (f.size > VIDEO_MAX_BYTES) { oversize = true; return; }
            videos.push({ path: f.tempFilePath, thumb: f.thumbTempFilePath || '' });
          } else {
            photos.push(f.tempFilePath);
          }
        });
        if (oversize && toast) toast.show('视频不能超过 10MB，已跳过');
        this.setData({ photos, videos });
      }
    });
  },
  onDelVideo(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const videos = this.data.videos.slice();
    videos.splice(idx, 1);
    this.setData({ videos });
  },
  // 逐条上传视频，失败降级跳过（不阻塞记录保存）；已上传的 cloud:// 原样保留
  async _uploadVideos() {
    const fileIDs = [];
    for (let i = 0; i < this.data.videos.length; i++) {
      const v = this.data.videos[i];
      const p = (v && v.path) || v;
      if (!p) continue;
      if (String(p).indexOf('cloud://') === 0) { fileIDs.push(p); continue; }
      const m = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(p);
      const ext = m ? m[1].toLowerCase() : 'mp4';
      try {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'records/' + Date.now() + '-v' + i + '.' + ext,
          filePath: p
        });
        if (up && up.fileID) fileIDs.push(up.fileID);
      } catch (e) {
        console.warn('[record.edit] 视频上传失败，已跳过', e);
      }
    }
    return fileIDs;
  },
  // 逐张上传，失败降级跳过（不阻塞记录保存）；已上传的 cloud:// 原样保留；返回 fileID 数组
  // cloudPath 扩展名取临时文件真实后缀（chooseMedia 原图未转格式），取不到回退 jpg（压缩图通常为 jpeg）
  async _uploadPhotos() {
    const fileIDs = [];
    for (let i = 0; i < this.data.photos.length; i++) {
      const p = this.data.photos[i];
      if (p.indexOf('cloud://') === 0) { fileIDs.push(p); continue; }
      const m = /\.([a-zA-Z0-9]+)(?:[?#]|$)/.exec(p);
      const ext = m ? m[1].toLowerCase() : 'jpg';
      try {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'records/' + Date.now() + '-' + i + '.' + ext,
          filePath: p
        });
        if (up && up.fileID) fileIDs.push(up.fileID);
      } catch (e) {
        console.warn('[record.edit] 照片上传失败，已跳过', e);
      }
    }
    return fileIDs;
  },

  // 保存防重复：在飞锁 + 500ms 冷却窗（utils/guard.js），配合 doCreate 里的会话级 requestId 双保险
  onSave: guard('save', async function () {
    const toast = this.selectComponent('#toast');
    if (!this.data.petId) {
      if (toast) toast.show('请先添加一只毛孩子');
      return;
    }
    if (!this.validateMedicationReminder()) return;
    subscription.silentRefill('record_save');
    if (this.data.result) {
      const ok = await this.doCreate();
      if (ok) {
        const d = this._lastData || {};
        let resultNext = '';
        if (d.nextDate) resultNext = '下次提醒：' + fmtDateCn(d.nextDate) + ' · 到期前自动推送全家';
        this.setData({ showResult: true, resultNext });
        if (this.isReminderRelevant()) await subscription.guide('record_' + this.data.type, { once: true });
      }
      return;
    }
    const ok = await this.doCreate();
    if (ok) {
      if (toast) toast.show(this.data.type === 'expense' ? '已记账' : '已记下啦');
      if (this.isReminderRelevant()) await subscription.guide('record_' + this.data.type, { once: true });
      setTimeout(() => this.goBack(), 500);
    }
  }, { flag: 'saving' }),

  // 保存并再记一条：真实保存后重置表单，留在当前页
  onSaveMore: guard('saveMore', async function () {
    const toast = this.selectComponent('#toast');
    if (!this.data.petId) {
      if (toast) toast.show('请先添加一只毛孩子');
      return;
    }
    if (!this.validateMedicationReminder()) return;
    subscription.silentRefill('record_save_more');
    const ok = await this.doCreate();
    if (!ok) return;
    if (toast) toast.show('已保存，继续记下一笔');
    if (this.isReminderRelevant()) await subscription.guide('record_' + this.data.type, { once: true });
    this._editId = ''; // 再记一条转为新建
    const note = '';
    const photos = [];
    const videos = [];
    this.applyType(this.data.type);
    this.setData({ note, photos, videos, editing: false });
    this.applyFeedDefault();
  }, { flag: 'saving' }),

  async doCreate() {
    const toast = this.selectComponent('#toast');
    try {
      const photos = await this._uploadPhotos();
      const videos = await this._uploadVideos();
      // 记录日期取用户所选（时分取当前时刻，便于当天排序）
      const now = new Date();
      const base = this.data.dateStr ? new Date(this.data.dateStr.replace(/-/g, '/')) : now;
      base.setHours(now.getHours(), now.getMinutes(), 0, 0);
      const data = buildData(this.data.fields);
      const payload = {
        petId: this.data.petId,
        type: this.data.type,
        date: base.getTime(),
        data,
        note: this.data.note || ''
      };
      if (photos.length) payload.photos = photos;
      if (videos.length) payload.videos = videos;
      // 显式选择囤货才扣减：把选中的库存 id 带给后端，由后端校验归属/linkType/余量
      if (!this._editId && this.data.invSel >= 0 && this.data.invOptions[this.data.invSel]) {
        payload.inventoryId = this.data.invOptions[this.data.invSel]._id;
      }
      if (this._editId) {
        await recordService.update(Object.assign({ _id: this._editId }, payload));
      } else {
        // 会话级幂等键：同一次填写期间连点共享一键，云端按 familyId+requestId 去重兜底；
        // 保存成功后换新键，下一次保存才是新的业务意图（「保存并再记一条」因此不会误伤）。
        if (!this._requestId) this._requestId = recordService.newRequestId();
        payload.requestId = this._requestId;
        await recordService.create(payload);
        this._requestId = recordService.newRequestId();
      }
      // 待办联动：从首页待办进入的新记录，保存后完成原提醒
      // （疫苗除外：云端 deriveFromRecord 已按新周期自动重排原提醒）
      if (this._reminderId && !this._editId) {
        const rid = this._reminderId;
        this._reminderId = '';
        if (this.data.type !== 'vaccine') {
          reminderService.complete(rid).catch(() => {});
        }
      }
      this._lastData = data; // 结果卡展示真实的下次提醒/周期
      tracker.track(tracker.EVENTS.RECORD_SUBMIT, { type: this.data.type, edit: !!this._editId });
      return true;
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败，请重试');
      return false;
    }
  },

  isReminderRelevant() {
    return ['vaccine', 'deworm', 'medication'].indexOf(this.data.type) > -1;
  },

  validateMedicationReminder() {
    if (this.data.type !== 'medication') return true;
    const course = this.data.fields.find((f) => f.label === '疗程');
    const enabled = this.data.fields.find((f) => f.label === '生成用药提醒');
    if (!enabled || enabled.on !== 1) return true;
    const days = parseInt(course && course.val, 10);
    if (!(days >= 1 && days <= 90)) {
      const toast = this.selectComponent('#toast');
      if (toast) toast.show('开启用药提醒时，请填写 1~90 天疗程');
      return false;
    }
    const times = this.data.fields.find((f) => f.label === '提醒时间');
    if (!times || !times.sels || !times.sels.length) {
      const toast = this.selectComponent('#toast');
      if (toast) toast.show('请至少选择一个提醒时间');
      return false;
    }
    return true;
  },

  // 结果卡「同步记一笔花销」：跳转记花销并预填医疗分类
  goExpense() {
    wx.navigateTo({ url: '/pages/record/edit/edit?type=expense&cat=医疗&petId=' + this.data.petId });
  },
  closeResult() {
    this.setData({ showResult: false });
    setTimeout(() => this.goBack(), 300);
  }
});

/**
 * 多选 chips 选中态：WXML 表达式不支持 indexOf 等方法调用，
 * 需要预计算与 opts 平行的布尔数组 selBools 供模板取址。
 */
function withMBools(fields) {
  return (fields || []).map((f) => {
    if (f.kind !== 'mchips') return f;
    const sels = f.sels || [];
    return Object.assign({}, f, {
      selBools: (f.opts || []).map((_, i) => sels.indexOf(i) > -1)
    });
  });
}

/**
 * 字段表单 -> records.data
 * 全量保留用户填写内容：items = [{ label, value }]，供详情页逐条展示；
 * 同时保留派生字段（nextDate/courseDays/amount 等）供提醒/支出逻辑使用。
 */
function buildData(fields) {
  const d = { items: [] };
  (fields || []).forEach((f) => {
    let text = '';
    if (f.kind === 'chips') {
      text = (f.sel != null && f.opts && f.opts[f.sel] != null) ? f.opts[f.sel] : '';
    } else if (f.kind === 'mchips') {
      text = (f.sels || []).map((i) => f.opts[i]).filter(Boolean).join('、');
    } else if (f.kind === 'switch') {
      text = ''; // 提醒开关属于设置项，不进记录内容
    } else if (f.kind === 'stock') {
      text = f.name || '';
    } else {
      text = (f.val || '') + (f.val && f.unit ? ' ' + f.unit : '');
    }
    if (text) d.items.push({ label: f.label, value: text });

    // 派生字段
    if (f.kind === 'row' && f.label === '下次日期') {
      d.nextDate = parseCn(f.val);
    }
    if (f.kind === 'input' && f.label === '疗程' && f.val) d.courseDays = parseInt(f.val, 10);
    if (f.kind === 'switch' && f.label === '生成用药提醒') d.medicationReminder = f.on === 1;
    if (f.kind === 'mchips' && f.label === '提醒时间') d.medicationTimes = (f.sels || []).map((i) => f.opts[i]).filter(Boolean);
    if (f.kind === 'input' && (f.label === '费用' || f.label === '金额') && f.val) {
      const n = Number(f.val);
      if (!isNaN(n)) d.amount = n;
    }
  });
  if (!d.items.length) delete d.items;
  return d;
}

function parseCn(s) {
  if (!s) return null;
  const t = new Date(String(s).replace(/-/g, '/'));
  return isNaN(t.getTime()) ? null : t.getTime();
}

function speciesName(key) {
  const hit = (SPECIES || []).find((s) => s.key === key || s.name === key);
  return hit ? hit.name : (key || '');
}
