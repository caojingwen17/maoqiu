const app = getApp();
const { SPECIES, SPECIES_FORM } = require('../../../utils/dict.js');
const validate = require('../../../utils/validate.js');
const petService = require('../../../services/pet.js');
const homeService = require('../../../services/home.js');
const subscription = require('../../../services/subscription.js');
const tracker = require('../../../utils/tracker.js');

const TRAIT_OPTIONS = ['亲人', '胆小', '活泼', '拆家', '高冷', '吃货', '粘人', '爱玩', '安静', '怕生'];

Page({
  data: {
    sb: 20,
    title: '新增宠物',
    _id: '',
    speciesKeys: SPECIES.map((s) => s.name),
    species: '猫',
    form: SPECIES_FORM['猫'],
    speciesIdx: 0,
    name: '',
    birthDate: '',
    adoptDate: '',
    neuteredIdx: 1,
    identityIdx: 1,
    breed: '', // 品种/种类（自由文本，placeholder 随物种给出示例）
    traitOptions: TRAIT_OPTIONS,
    traitItems: TRAIT_OPTIONS.map((name) => ({ name, on: false })),
    traits: [],
    customTrait: '',
    // 头像：本地临时路径（预览用）或云端 fileID（已保存）
    avatar: '',
    // 裁剪浮层：选图后先裁剪正方形再作为头像
    cropShow: false,
    cropSrc: ''
  },

  onLoad(options) {
    this.setData({ sb: app.globalData.statusBarHeight || 20 });
    if (options && options.id) {
      this.setData({ title: '编辑宠物', _id: options.id });
      this.loadPet(options.id);
    }
  },

  // 编辑态：从 aggregate 找到目标宠物并回填（复用 home.aggregate，无额外 action）
  async loadPet(id) {
    try {
      const d = await homeService.aggregate();
      const pet = (d.pets || []).find((p) => p._id === id);
      if (!pet) return;
      const sp = SPECIES.find((s) => s.key === pet.species);
      const species = sp ? sp.name : '其他';
      const form = SPECIES_FORM[species] || SPECIES_FORM['其他'];
      this.setData({
        species,
        form,
        speciesIdx: this.data.speciesKeys.indexOf(species),
        name: pet.name || '',
        avatar: pet.avatar || '',
        breed: pet.breed || '',
        birthDate: this._tsToDate(pet.birthDate, ''),
        adoptDate: this._tsToDate(pet.adoptDate, ''),
        identityIdx: this._identityIdxOf(form, pet.gender),
        neuteredIdx: pet.neutered === true ? 0 : (pet.neutered === false ? 1 : 2),
        traits: Array.isArray(pet.traits) ? pet.traits : [],
        customTrait: (Array.isArray(pet.traits) ? pet.traits : []).find((t) => TRAIT_OPTIONS.indexOf(t) < 0) || '',
        traitItems: this._traitItems(pet.traits || [])
      });
    } catch (e) {
      // 编辑态回填失败不阻塞，仍可保存
    }
  },

  _identityIdxOf(form, gender) {
    if (form.identity !== '性别') return 1;
    if (gender === 'female') return 0;
    if (gender === 'male') return 1;
    return 2;
  },
  _genderOf(form, idx) {
    if (form.identity !== '性别') return 'unknown';
    return ['female', 'male', 'unknown'][idx] || 'unknown';
  },
  _neuteredOf(form, idx) {
    if (!form.needNeutered) return null;
    return [true, false, null][idx];
  },
  _tsToDate(ts, fallback) {
    if (!ts) return fallback;
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/home/home' });
  },

  onSpecies(e) {
    const name = e.currentTarget.dataset.name;
    const idx = this.data.speciesKeys.indexOf(name);
    this.setData({ species: name, speciesIdx: idx, form: SPECIES_FORM[name], identityIdx: 1 });
  },
  onIdentity(e) {
    this.setData({ identityIdx: Number(e.currentTarget.dataset.index) });
  },
  onNeutered(e) {
    this.setData({ neuteredIdx: Number(e.currentTarget.dataset.index) });
  },
  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onBreed(e) {
    this.setData({ breed: e.detail.value });
  },
  onTrait(e) {
    const trait = e.currentTarget.dataset.trait;
    const traits = (this.data.traits || []).slice();
    const idx = traits.indexOf(trait);
    if (idx > -1) traits.splice(idx, 1);
    else if (traits.length < 5) traits.push(trait);
    else { wx.showToast({ title: '最多选择 5 个性格', icon: 'none' }); return; }
    this.setData({ traits, traitItems: this._traitItems(traits) });
  },
  _traitItems(traits) {
    return TRAIT_OPTIONS.map((name) => ({ name, on: (traits || []).indexOf(name) > -1 }));
  },
  onCustomTrait(e) {
    this.setData({ customTrait: e.detail.value });
  },
  onPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        // 先弹裁剪浮层裁成正方形，确认后再作为头像
        this.setData({ cropSrc: file.tempFilePath, cropShow: true });
      }
    });
  },
  onCropConfirm(e) {
    const path = e.detail && e.detail.tempFilePath;
    // 裁剪输出 ≤800px jpg，体积远小于 PRD §7.1 的 500KB 上限，无需再压缩
    this.setData({ cropShow: false, avatar: path || this.data.avatar });
  },
  onCropCancel() {
    this.setData({ cropShow: false });
  },

  // 头像为本地临时路径时上传云存储，返回 fileID；失败返回空（降级不带头像）
  // 注意：开发者工具临时路径是 http://127.0.0.1/... 开头，真机可能是 http://tmp/...
  // 所以只有 cloud://（云存储 fileID）和 https://（微信头像等永久外链）才视为已上传
  _uploadAvatar() {
    const avatar = this.data.avatar;
    if (!avatar || avatar.indexOf('cloud://') === 0 || avatar.indexOf('https://') === 0) {
      return Promise.resolve(avatar || '');
    }
    return wx.cloud.uploadFile({
      cloudPath: 'pets/avatar/' + Date.now() + '.jpg', // 裁剪组件输出 fileType: 'jpg'
      filePath: avatar
    }).then((up) => up.fileID).catch(() => '');
  },
  onBirth(e) {
    this.setData({ birthDate: e.detail.value });
  },
  onAdopt(e) {
    this.setData({ adoptDate: e.detail.value });
  },

  async onSave() {
    const toast = this.selectComponent('#toast');
    const chk = validate.petName(this.data.name);
    if (!chk.ok) { if (toast) toast.show(chk.msg); return; }

    const speciesKey = (SPECIES.find((s) => s.name === this.data.species) || {}).key || 'other';
    const form = this.data.form;
    const birthTs = this.data.birthDate ? new Date(this.data.birthDate.replace(/-/g, '/')).getTime() : null;
    const adoptTs = this.data.adoptDate ? new Date(this.data.adoptDate.replace(/-/g, '/')).getTime() : null;

    if (birthTs && !validate.birthDate(birthTs).ok) { if (toast) toast.show('出生日期不能是未来'); return; }
    if (birthTs && adoptTs && !validate.adoptDate(birthTs, adoptTs).ok) { if (toast) toast.show('到家日期应晚于出生日期'); return; }
    subscription.silentRefill('pet_save');

    const customTrait = (this.data.customTrait || '').trim();
    const traits = (this.data.traits || []).slice();
    if (customTrait && traits.indexOf(customTrait) < 0) {
      if (traits.length >= 5) { if (toast) toast.show('最多选择 5 个性格'); return; }
      traits.push(customTrait);
    }
    const payload = {
      name: chk.value,
      species: speciesKey,
      breed: (this.data.breed || '').trim(),
      gender: this._genderOf(form, this.data.identityIdx),
      neutered: this._neuteredOf(form, this.data.neuteredIdx),
      traits: traits.slice(0, 5),
      birthDate: birthTs,
      adoptDate: adoptTs
    };

    try {
      const avatarFileID = await this._uploadAvatar();
      if (avatarFileID) payload.avatar = avatarFileID;
      if (this.data._id) {
        await petService.update(Object.assign({ _id: this.data._id }, payload));
        if (toast) toast.show('已保存修改');
      } else {
        await petService.create(payload);
        tracker.track(tracker.EVENTS.PET_CREATED, { species: speciesKey });
        if (toast) toast.show('已加入档案袋');
      }
      if (birthTs || adoptTs) await subscription.guide('pet_anniversary', { once: true });
      setTimeout(() => this.goBack(), 400);
    } catch (e) {
      if (toast) toast.show((e && e.message) || '保存失败，请重试');
    }
  }
});
