// recordService.js
// 记录服务：薄封装，方法名与云端 action 一一对应
var api = require('./api.js');

/**
 * 新增/更新记录（type=vaccine/deworm 时云端自动联动创建/更新周期提醒）
 * @param {Object} record {petId, type, date, data, photos, note}，结构见 PRD §4.2
 * @param {string} [recordId] 更新时传
 * @returns {Promise<{recordId: string, reminderId: string|null}>} reminderId 为联动提醒 _id（无联动为 null）
 */
function saveRecord(record, recordId) {
  return api.call('saveRecord', { record: record, recordId: recordId || '' });
}

/**
 * 时间线分页查询（按 date 倒序，每页 20 条）
 * @param {string} petId
 * @param {number} [page] 页码，从 0 开始
 * @returns {Promise<{list: Array, page: number, hasMore: boolean}>}
 */
function getTimeline(petId, page) {
  return api.call('getTimeline', { petId: petId, page: page || 0 });
}

/**
 * 局部更新记录（仅允许改 date/data/photos/note）
 * @param {string} recordId
 * @param {Object} patch {date?, data?, photos?, note?}
 * @returns {Promise<null>}
 */
function updateRecord(recordId, patch) {
  return api.call('updateRecord', { recordId: recordId, patch: patch });
}

/**
 * 删除记录（同时删除其云存储照片）
 * @param {string} recordId
 * @returns {Promise<null>}
 */
function deleteRecord(recordId) {
  return api.call('deleteRecord', { recordId: recordId });
}

module.exports = {
  saveRecord: saveRecord,
  getTimeline: getTimeline,
  updateRecord: updateRecord,
  deleteRecord: deleteRecord,
};
