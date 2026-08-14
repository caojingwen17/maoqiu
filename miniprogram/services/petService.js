// petService.js
// 宠物档案服务：薄封装，方法名与云端 action 一一对应
var api = require('./api.js');

/**
 * 宠物列表（含每宠最新体重、最近临期提醒）
 * @returns {Promise<Array>} [{_id, name, avatar, species, ..., latestWeight:{value,date}|null, nextReminder:{title,remindAt,category}|null}]
 */
function listPets() {
  return api.call('listPets');
}

/**
 * 单只宠物详情
 * @param {string} petId
 * @returns {Promise<Object>} 宠物文档
 */
function getPet(petId) {
  return api.call('getPet', { petId: petId });
}

/**
 * 新增/更新宠物（传 petId 为更新，否则新增）
 * @param {Object} pet PRD §4.1 字段（name/species/gender 必填）
 * @param {string} [petId] 更新时传
 * @returns {Promise<{petId: string}>}
 */
function savePet(pet, petId) {
  return api.call('savePet', { pet: pet, petId: petId || '' });
}

/**
 * 删除宠物（级联删除 records/reminders/inventories 及云存储图片，不可恢复）
 * @param {string} petId
 * @returns {Promise<{deleted: Object}>} 各集合删除条数与图片数
 */
function deletePet(petId) {
  return api.call('deletePet', { petId: petId });
}

/**
 * 首页排序（按数组顺序批量写入 order）
 * @param {Array<string>} petIds 新顺序的宠物 _id 数组
 * @returns {Promise<{updated: number}>}
 */
function reorderPets(petIds) {
  return api.call('reorderPets', { petIds: petIds });
}

module.exports = {
  listPets: listPets,
  getPet: getPet,
  savePet: savePet,
  deletePet: deletePet,
  reorderPets: reorderPets,
};
