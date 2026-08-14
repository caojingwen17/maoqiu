// petStore.js
// 宠物全局缓存：当前选中宠物 + 宠物列表（首页与详情页共享，避免重复拉取）
var storeModule = require('./store.js');
var createStore = storeModule.createStore;

var petStore = createStore({
  currentPetId: '', // 当前上下文锁定的宠物 _id
  petList: [],      // 宠物列表缓存（结构同 petService.listPets 返回）
});

// 设置当前宠物
function setCurrentPetId(petId) {
  petStore.set({ currentPetId: petId || '' });
}

// 读取当前宠物（从列表缓存里找）
function getCurrentPet() {
  var state = petStore.get();
  var found = null;
  state.petList.forEach(function (pet) {
    if (pet._id === state.currentPetId) {
      found = pet;
    }
  });
  return found;
}

// 更新列表缓存
function setPetList(list) {
  petStore.set({ petList: Array.isArray(list) ? list : [] });
}

module.exports = {
  get: petStore.get,
  set: petStore.set,
  subscribe: petStore.subscribe,
  setCurrentPetId: setCurrentPetId,
  getCurrentPet: getCurrentPet,
  setPetList: setPetList,
};
