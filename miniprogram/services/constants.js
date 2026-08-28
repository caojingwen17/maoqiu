/**
 * 服务层常量：集合名 / 云函数名
 */

const CLOUD_FN = 'pawlog';

/** 云数据库集合名（PRD §4） */
const COLLECTIONS = {
  pets: 'pets',
  records: 'records',
  reminders: 'reminders',
  diaries: 'diaries',
  inventories: 'inventories',
  settings: 'settings',
  families: 'families'
};

/** 云函数 action 名（与 cloudfunctions/pawlog 路由对齐） */
const ACTIONS = {
  HOME_AGGREGATE: 'home.aggregate',
  PET_CREATE: 'pet.create',
  PET_UPDATE: 'pet.update',
  PET_REMOVE: 'pet.remove',
  PET_ARCHIVE: 'pet.archive',
  RECORD_CREATE: 'record.create',
  RECORD_UPDATE: 'record.update',
  RECORD_REMOVE: 'record.remove',
  RECORD_LIST: 'record.list',
  RECORD_PHOTOS: 'record.photos',
  RECORD_GET: 'record.get',
  REMINDER_CREATE: 'reminder.create',
  REMINDER_UPDATE: 'reminder.update',
  REMINDER_COMPLETE: 'reminder.complete',
  REMINDER_POSTPONE: 'reminder.postpone',
  REMINDER_DISABLE: 'reminder.disable',
  REMINDER_IGNORE: 'reminder.ignore',
  REMINDER_LIST: 'reminder.list',
  DIARY_LIST: 'diary.list',
  DIARY_MARK_READ: 'diary.markRead',
  DIARY_MANUAL_GENERATE: 'diary.manualGenerate',
  SUBSCRIPTION_SYNC: 'subscription.sync',
  INVENTORY_INBOUND: 'inventory.inbound',
  INVENTORY_LIST: 'inventory.list',
  INVENTORY_CONSUME: 'inventory.consume',
  INVENTORY_UPDATE: 'inventory.update',
  INVENTORY_REMOVE: 'inventory.remove',
  FAMILY_INVITE: 'family.invite',
  FAMILY_JOIN: 'family.join',
  FAMILY_LEAVE: 'family.leave',
  FAMILY_REMOVE_MEMBER: 'family.removeMember',
  FAMILY_DISSOLVE: 'family.dissolve',
  FAMILY_RESOLVE: 'family.resolve',
  FAMILY_PREVIEW: 'family.preview',
  STATS_SUMMARY: 'stats.summary',
  SETTINGS_GET: 'settings.get',
  SETTINGS_UPDATE: 'settings.update'
};

module.exports = {
  CLOUD_FN,
  COLLECTIONS,
  ACTIONS
};
