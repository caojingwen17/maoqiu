// pages/pet/edit/index.js
// 宠物档案表单页（添加 / 编辑）：iOS 分组列表风格，设计文档 §8.3
var petService = require('../../../services/petService.js');
var petStore = require('../../../stores/petStore.js');
var validate = require('../../../utils/validate.js');
var dict = require('../../../utils/dict.js');
var dateUtil = require('../../../utils/date.js');
var constants = require('../../../utils/constants.js');
var icons = require('../../../components/icons.js');

var SIZE_LIMIT = 500 * 1024; // 头像压缩上限 500KB
var TRAIT_PRESETS = ['亲人', '胆小', '活泼', '拆家', '高冷', '吃货'];
var TRAIT_MAX = 5;

// 本地日期字符串 'YYYY-MM-DD' → 当日 0 点时间戳（避免 UTC 解析偏差）
function parseLocalDate(str) {
  return new Date(str.replace(/-/g, '/')).getTime();
}

function buildTraitChips(traits) {
  return TRAIT_PRESETS.map(function (name) {
    return { name: name, on: traits.indexOf(name) !== -1 };
  });
}

function customTraitsOf(traits) {
  return traits.filter(function (t) {
    return TRAIT_PRESETS.indexOf(t) === -1;
  });
}

Page({
  data: {
    petId: '',
    isEdit: false,
    loading: false,
    saving: false,

    form: {
      avatar: '',
      name: '',
      species: '',
      gender: 'male',
      breed: '',
      birthDate: 0,
      adoptDate: 0,
      color: '',
      neutered: false,
      chipNo: '',
      certNo: '',
      insCompany: '',
      insPolicyNo: '',
      insExpireAt: 0,
      vetHospital: '',
      vetDoctor: '',
      vetPhone: '',
      allergies: [],
      forbiddenFood: [],
      traits: [],
      weightGoal: '',
    },
    errors: {},

    speciesList: constants.SPECIES,
    isCatOrDog: false,
    todayStr: '',
    birthDateStr: '',
    adoptDateStr: '',
    insExpireStr: '',

    // 折叠组：默认收起
    folds: { identity: false, medical: false, traits: false },

    // 性格标签
    traitChips: buildTraitChips([]),
    customTraits: [],
    traitInput: '',

    // 标签输入（过敏源 / 禁忌食物）
    allergyInput: '',
    foodInput: '',

    // 品种选择弹层
    breedSheet: false,
    breedKeyword: '',
    breedOptions: [],

    // 头像上传
    avatarUploading: false,
    avatarProgress: 0,
    avatarFailed: false,

    chevUri: icons.maskIcon('chevron-right'),
    closeUri: icons.maskIcon('close'),
  },

  onLoad: function (options) {
    var id = (options && options.id) || '';
    this.setData({ todayStr: dateUtil.fmtDate(Date.now()) });
    if (id) {
      this.setData({ petId: id, isEdit: true, loading: true });
      wx.setNavigationBarTitle({ title: '编辑档案' });
      this._loadPet(id);
    } else {
      wx.setNavigationBarTitle({ title: '添加宠物' });
    }
  },

  _loadPet: function (id) {
    var self = this;
    petService.getPet(id).then(function (pet) {
      var ins = pet.insurance || {};
      var vet = pet.vetInfo || {};
      var traits = Array.isArray(pet.traits) ? pet.traits : [];
      self.setData({
        loading: false,
        form: {
          avatar: pet.avatar || '',
          name: pet.name || '',
          species: pet.species || '',
          gender: pet.gender || 'male',
          breed: pet.breed || '',
          birthDate: pet.birthDate || 0,
          adoptDate: pet.adoptDate || 0,
          color: pet.color || '',
          neutered: !!pet.neutered,
          chipNo: pet.chipNo || '',
          certNo: pet.certNo || '',
          insCompany: ins.company || '',
          insPolicyNo: ins.policyNo || '',
          insExpireAt: ins.expireAt || 0,
          vetHospital: vet.hospital || '',
          vetDoctor: vet.doctor || '',
          vetPhone: vet.phone || '',
          allergies: Array.isArray(pet.allergies) ? pet.allergies : [],
          forbiddenFood: Array.isArray(pet.forbiddenFood) ? pet.forbiddenFood : [],
          traits: traits,
          weightGoal: pet.weightGoal ? '' + pet.weightGoal : '',
        },
        isCatOrDog: pet.species === 'cat' || pet.species === 'dog',
        birthDateStr: pet.birthDate ? dateUtil.fmtDate(pet.birthDate) : '',
        adoptDateStr: pet.adoptDate ? dateUtil.fmtDate(pet.adoptDate) : '',
        insExpireStr: ins.expireAt ? dateUtil.fmtDate(ins.expireAt) : '',
        traitChips: buildTraitChips(traits),
        customTraits: customTraitsOf(traits),
      });
      // 初始载入不算改动
      self._dirty = false;
    }, function () {
      self.setData({ loading: false });
      self._toast('fail', '网络开小差了，请重试');
    });
  },

  /* ---------------- 改动追踪与离开拦截 ---------------- */

  _markDirty: function () {
    if (this._dirty) return;
    this._dirty = true;
    if (wx.enableAlertBeforeUnload) {
      wx.enableAlertBeforeUnload({ message: '放弃这次编辑吗？' });
    }
  },

  _clearDirty: function () {
    this._dirty = false;
    if (wx.disableAlertBeforeUnload) {
      wx.disableAlertBeforeUnload();
    }
  },

  _setField: function (key, value) {
    var patch = {};
    patch['form.' + key] = value;
    this.setData(patch);
    this._markDirty();
  },

  /* ---------------- 必填组 ---------------- */

  onAvatarTap: function () {
    var self = this;
    if (this.data.avatarUploading) return;
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: function (res) {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: res.tapIndex === 0 ? ['camera'] : ['album'],
          success: function (r) {
            var file = r.tempFiles && r.tempFiles[0];
            if (file) self._startAvatarUpload(file.tempFilePath);
          },
        });
      },
    });
  },

  onAvatarRetry: function () {
    if (this._avatarTempPath) {
      this._startAvatarUpload(this._avatarTempPath);
    } else {
      this.onAvatarTap();
    }
  },

  _startAvatarUpload: function (tempFilePath) {
    var self = this;
    this._avatarTempPath = tempFilePath;
    this.setData({ avatarUploading: true, avatarFailed: false, avatarProgress: 0 });
    this._compressAvatar(tempFilePath, 80, function (filePath) {
      self._uploadAvatar(filePath);
    });
  },

  // 压缩至 ≤500KB（与 photo-picker 同一策略：质量递减）
  _compressAvatar: function (filePath, quality, cb) {
    var self = this;
    wx.compressImage({
      src: filePath,
      quality: quality,
      success: function (res) {
        wx.getFileInfo({
          filePath: res.tempFilePath,
          success: function (info) {
            if (info.size > SIZE_LIMIT && quality > 30) {
              self._compressAvatar(res.tempFilePath, quality - 25, cb);
            } else {
              cb(res.tempFilePath);
            }
          },
          fail: function () { cb(res.tempFilePath); },
        });
      },
      fail: function () { cb(filePath); }, // 非 jpg 等情况直接传原图
    });
  },

  _uploadAvatar: function (filePath) {
    var self = this;
    var cloudPath = 'avatars/' + (this.data.petId || 'new') + '-' + Date.now() + '.jpg';
    var task = wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function (res) {
        self.setData({ avatarUploading: false, avatarFailed: false });
        self._setField('avatar', res.fileID);
      },
      fail: function () {
        self.setData({ avatarUploading: false, avatarFailed: true });
        self._toast('fail', '头像上传失败，点重试');
      },
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(function (e) {
        self.setData({ avatarProgress: e.progress });
      });
    }
  },

  onNameInput: function (e) {
    this._setField('name', e.detail.value);
    if (this.data.errors.name) this._clearError('name');
  },

  onSpeciesTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.form.species) return;
    this._setField('species', key);
    this.setData({ isCatOrDog: key === 'cat' || key === 'dog' });
    if (this.data.errors.species) this._clearError('species');
  },

  onGenderTap: function (e) {
    this._setField('gender', e.currentTarget.dataset.v);
  },

  /* ---------------- 基础组 ---------------- */

  onBreedTap: function () {
    var list = this.data.form.species === 'cat' ? dict.CAT_BREEDS : dict.DOG_BREEDS;
    this.setData({ breedSheet: true, breedKeyword: '', breedOptions: list });
  },

  onBreedSearch: function (e) {
    var keyword = e.detail.value.trim();
    var list = this.data.form.species === 'cat' ? dict.CAT_BREEDS : dict.DOG_BREEDS;
    this.setData({
      breedKeyword: e.detail.value,
      breedOptions: keyword
        ? list.filter(function (b) { return b.indexOf(keyword) !== -1; })
        : list,
    });
  },

  onBreedPick: function (e) {
    this._setField('breed', e.currentTarget.dataset.name);
    this.setData({ breedSheet: false });
  },

  onBreedClose: function () {
    this.setData({ breedSheet: false });
  },

  onBreedInput: function (e) {
    this._setField('breed', e.detail.value);
  },

  onBirthChange: function (e) {
    var v = e.detail.value;
    this._setField('birthDate', parseLocalDate(v));
    this.setData({ birthDateStr: v });
    if (this.data.errors.birthDate) this._clearError('birthDate');
  },

  onAdoptChange: function (e) {
    var v = e.detail.value;
    this._setField('adoptDate', parseLocalDate(v));
    this.setData({ adoptDateStr: v });
    if (this.data.errors.adoptDate) this._clearError('adoptDate');
  },

  onColorInput: function (e) {
    this._setField('color', e.detail.value);
  },

  onNeuteredTap: function () {
    this._setField('neutered', !this.data.form.neutered);
  },

  /* ---------------- 折叠组 ---------------- */

  onFoldTap: function (e) {
    var key = e.currentTarget.dataset.key;
    var patch = {};
    patch['folds.' + key] = !this.data.folds[key];
    this.setData(patch);
  },

  onChipInput: function (e) { this._setField('chipNo', e.detail.value); },
  onCertInput: function (e) { this._setField('certNo', e.detail.value); },
  onInsCompanyInput: function (e) { this._setField('insCompany', e.detail.value); },
  onInsPolicyInput: function (e) { this._setField('insPolicyNo', e.detail.value); },

  onInsExpireChange: function (e) {
    var v = e.detail.value;
    this._setField('insExpireAt', parseLocalDate(v));
    this.setData({ insExpireStr: v });
  },

  onVetHospitalInput: function (e) { this._setField('vetHospital', e.detail.value); },
  onVetDoctorInput: function (e) { this._setField('vetDoctor', e.detail.value); },
  onVetPhoneInput: function (e) { this._setField('vetPhone', e.detail.value); },

  onCallDoctor: function () {
    var phone = this.data.form.vetPhone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  /* ---------------- 标签输入（过敏源 / 禁忌食物） ---------------- */

  onTagTyping: function (e) {
    var field = e.currentTarget.dataset.field;
    var patch = {};
    patch[field === 'allergies' ? 'allergyInput' : 'foodInput'] = e.detail.value;
    this.setData(patch);
  },

  onTagConfirm: function (e) {
    var field = e.currentTarget.dataset.field;
    var inputKey = field === 'allergies' ? 'allergyInput' : 'foodInput';
    var value = (this.data[inputKey] || '').trim();
    if (!value) return;
    var list = this.data.form[field].slice();
    if (list.indexOf(value) !== -1) {
      this.setData(this._patch(inputKey, ''));
      return;
    }
    list.push(value);
    var patch = {};
    patch['form.' + field] = list;
    patch[inputKey] = '';
    this.setData(patch);
    this._markDirty();
  },

  onTagRemove: function (e) {
    var field = e.currentTarget.dataset.field;
    var patch = {};
    if (field === 'traits') {
      var name = e.currentTarget.dataset.name;
      var traits = this.data.form.traits.filter(function (t) { return t !== name; });
      patch['form.traits'] = traits;
      patch.traitChips = buildTraitChips(traits);
      patch.customTraits = customTraitsOf(traits);
    } else {
      var index = e.currentTarget.dataset.index;
      var list = this.data.form[field].slice();
      list.splice(index, 1);
      patch['form.' + field] = list;
    }
    this.setData(patch);
    this._markDirty();
  },

  _patch: function (key, value) {
    var p = {};
    p[key] = value;
    return p;
  },

  /* ---------------- 性格标签 / 目标体重 ---------------- */

  onTraitTap: function (e) {
    var name = e.currentTarget.dataset.name;
    var traits = this.data.form.traits.slice();
    var i = traits.indexOf(name);
    if (i !== -1) {
      traits.splice(i, 1);
    } else {
      if (traits.length >= TRAIT_MAX) {
        this._toast('fail', '最多 ' + TRAIT_MAX + ' 个标签');
        return;
      }
      traits.push(name);
    }
    this.setData({
      'form.traits': traits,
      traitChips: buildTraitChips(traits),
      customTraits: customTraitsOf(traits),
    });
    this._markDirty();
  },

  onTraitInput: function (e) {
    this.setData({ traitInput: e.detail.value });
  },

  onTraitConfirm: function () {
    var value = (this.data.traitInput || '').trim();
    if (!value) return;
    var traits = this.data.form.traits.slice();
    if (traits.indexOf(value) !== -1) {
      this.setData({ traitInput: '' });
      return;
    }
    if (traits.length >= TRAIT_MAX) {
      this._toast('fail', '最多 ' + TRAIT_MAX + ' 个标签');
      return;
    }
    traits.push(value);
    this.setData({
      'form.traits': traits,
      traitChips: buildTraitChips(traits),
      customTraits: customTraitsOf(traits),
      traitInput: '',
    });
    this._markDirty();
  },

  onGoalInput: function (e) {
    this._setField('weightGoal', e.detail.value);
    if (this.data.errors.weightGoal) this._clearError('weightGoal');
  },

  _clearError: function (key) {
    var errors = {};
    for (var k in this.data.errors) {
      if (k !== key) errors[k] = this.data.errors[k];
    }
    this.setData({ errors: errors });
  },

  /* ---------------- 保存 ---------------- */

  onSave: function () {
    var self = this;
    if (this.data.saving) return;
    var f = this.data.form;

    var goal = f.weightGoal === '' ? '' : Number(f.weightGoal);
    var result = validate.validatePetForm({
      name: f.name,
      species: f.species,
      birthDate: f.birthDate,
      adoptDate: f.adoptDate,
      weightGoal: goal,
    });
    this.setData({ errors: result.errors });
    if (!result.ok) {
      this._toast('fail', result.firstError || '请检查填写内容');
      return;
    }

    var pet = {
      name: f.name.trim(),
      avatar: f.avatar,
      species: f.species,
      gender: f.gender,
      breed: (f.breed || '').trim(),
      color: (f.color || '').trim(),
      neutered: !!f.neutered,
      chipNo: (f.chipNo || '').trim(),
      certNo: (f.certNo || '').trim(),
      traits: f.traits,
      allergies: f.allergies,
      forbiddenFood: f.forbiddenFood,
    };
    // 目标体重：合法值才传数值，留空/非法传 0（云端将 0 视为「未设置」，用于编辑时清空旧值）
    pet.weightGoal = (goal !== '' && !isNaN(goal)) ? goal : 0;
    if (f.birthDate) pet.birthDate = f.birthDate;
    if (f.adoptDate) pet.adoptDate = f.adoptDate;
    if (f.insCompany || f.insPolicyNo || f.insExpireAt) {
      pet.insurance = {
        company: (f.insCompany || '').trim(),
        policyNo: (f.insPolicyNo || '').trim(),
        expireAt: f.insExpireAt || 0,
      };
    }
    if (f.vetHospital || f.vetDoctor || f.vetPhone) {
      pet.vetInfo = {
        hospital: (f.vetHospital || '').trim(),
        doctor: (f.vetDoctor || '').trim(),
        phone: (f.vetPhone || '').trim(),
      };
    }

    this.setData({ saving: true });
    petService.savePet(pet, this.data.petId).then(function (res) {
      self._clearDirty();
      // 更新 petStore 列表缓存，来源页 onShow 直接读到新数据
      var newId = (res && res.petId) || self.data.petId;
      var list = petStore.get().petList.slice();
      var idx = -1;
      list.forEach(function (p, i) { if (p._id === newId) idx = i; });
      var entry = idx !== -1 ? list[idx] : {};
      for (var k in pet) entry[k] = pet[k];
      entry._id = newId;
      if (idx !== -1) list[idx] = entry; else list.unshift(entry);
      petStore.setPetList(list);
      petStore.set({ currentPetId: newId });

      self._toast('success', '已保存');
      setTimeout(function () {
        wx.navigateBack();
      }, 700);
    }, function () {
      self.setData({ saving: false });
      self._toast('fail', '网络开小差了，请重试');
    });
  },

  /* ---------------- 删除宠物 ---------------- */

  onDeleteTap: function () {
    var self = this;
    var name = this.data.form.name;
    wx.showModal({
      title: '删除宠物',
      content: '删除后，' + name + ' 的所有记录、照片、提醒将一并删除，且无法恢复',
      confirmText: '继续',
      confirmColor: '#D24B42',
      success: function (res) {
        if (!res.confirm) return;
        wx.showModal({
          title: '最后确认',
          editable: true,
          placeholderText: '输入「' + name + '」确认删除',
          confirmText: '永久删除',
          confirmColor: '#D24B42',
          success: function (r2) {
            if (!r2.confirm) return;
            if ((r2.content || '').trim() !== name) {
              self._toast('fail', '名字不一致，已取消删除');
              return;
            }
            self._doDelete();
          },
        });
      },
    });
  },

  _doDelete: function () {
    var self = this;
    petService.deletePet(this.data.petId).then(function () {
      self._clearDirty();
      var list = petStore.get().petList.filter(function (p) {
        return p._id !== self.data.petId;
      });
      petStore.setPetList(list);
      self._toast('success', '已删除');
      setTimeout(function () {
        wx.switchTab({ url: '/pages/home/index' });
      }, 700);
    }, function () {
      self._toast('fail', '网络开小差了，请重试');
    });
  },

  _toast: function (type, text) {
    var toast = this.selectComponent('#toast');
    if (toast) toast.show({ type: type, text: text });
  },
});
