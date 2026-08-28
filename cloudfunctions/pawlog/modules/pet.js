/**
 * pet.* —— 宠物 CRUD（create / update / remove / archive）
 * 所有写入经 schema.js 白名单校验（PRD §4.1）。
 */

const { db, _, COLLECTIONS, col, assertOwned, removeWhere } = require('./db.js');
const { validateWrite } = require('../schema.js');
const sec = require('./sec.js');

/** 宠物档案 UGC 文本：名字、品种、性格标签（含自定义） */
function petTexts(clean) {
  return [clean.name, clean.breed].concat(Array.isArray(clean.traits) ? clean.traits : []);
}

async function create(ctx) {
  const { openid, familyId, family } = ctx;
  const chk = validateWrite('pets', ctx.payload, {});
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };

  await sec.assertTextsSafe(openid, petTexts(chk.clean), sec.SCENE.profile);
  if (chk.clean.avatar) await sec.assertCloudImageSafe(chk.clean.avatar);

  const now = Date.now();
  const data = Object.assign({}, chk.clean, {
    _openid: openid,
    familyId,
    createdBy: openid,
    order: chk.clean.order != null ? chk.clean.order : 0,
    archived: chk.clean.archived === true,
    createAt: now,
    updateAt: now
  });
  const res = await col(COLLECTIONS.pets).add({ data });
  await syncAnniversaryReminders(familyId, Object.assign({ _id: res._id }, data), openid).catch((e) => {
    console.error('[pet] anniversary reminder sync failed', e && (e.message || e));
  });
  return { _id: res._id, pet: data };
}

async function update(ctx) {
  const { familyId, openid } = ctx;
  const { _id, ...fields } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const chk = validateWrite('pets', fields, { partial: true });
  if (!chk.ok) throw { code: 'INVALID', message: chk.error };

  const existing = await assertOwned(COLLECTIONS.pets, familyId, _id);

  // 仅校验本次实际改动的文本/图片
  await sec.assertTextsSafe(openid, petTexts(chk.clean), sec.SCENE.profile);
  if (chk.clean.avatar && chk.clean.avatar !== existing.avatar) {
    await sec.assertCloudImageSafe(chk.clean.avatar);
  }

  const data = Object.assign({}, chk.clean, { updateAt: Date.now() });
  // 日期等可选字段允许显式清空；validateWrite 对 null 默认跳过，这里保留用户的清空意图。
  const nullable = ['avatar', 'breed', 'birthDate', 'adoptDate', 'color', 'chipNo', 'certNo', 'insurance', 'vetInfo', 'traits', 'allergies', 'forbiddenFood', 'weightGoal', 'neutered'];
  Object.keys(fields).forEach((key) => {
    if (nullable.indexOf(key) > -1 && fields[key] === null) data[key] = null;
  });
  await col(COLLECTIONS.pets).doc(_id).update({ data });
  const merged = Object.assign({}, existing, chk.clean, { _id });
  Object.keys(fields).forEach((key) => { if (nullable.indexOf(key) > -1 && fields[key] === null) merged[key] = null; });
  await syncAnniversaryReminders(familyId, merged, openid).catch((e) => {
    console.error('[pet] anniversary reminder sync failed', e && (e.message || e));
  });
  return { _id };
}

async function remove(ctx) {
  const { familyId, openid, family } = ctx;
  const { _id } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  if (!family || family.ownerOpenid !== openid) throw { code: 'FORBIDDEN', message: '仅创建者可以删除宠物' };
  await assertOwned(COLLECTIONS.pets, familyId, _id);
  await disablePetReminders(familyId, _id);
  // 库存删除前先按 sourceInventoryId 停用其提醒：
  // disablePetReminders 按 petId 匹配，库存提醒的 petId 可能为空（家庭级库存字段缺省），只靠它会漏网
  const invRes = await col(COLLECTIONS.inventories).where({ familyId, petId: _id }).limit(200).get();
  const invIds = ((invRes && invRes.data) || []).map((it) => it._id).filter(Boolean);
  for (let i = 0; i < invIds.length; i += 20) { // 云数据库 in 查询有元素数量上限，分批
    await col(COLLECTIONS.reminders).where({ familyId, sourceInventoryId: _.in(invIds.slice(i, i + 20)), status: 'active' }).update({
      data: { status: 'disabled', disabledReason: 'pet_removed', updateAt: Date.now() }
    });
  }
  await col(COLLECTIONS.records).where({ familyId, petId: _id }).remove();
  await col(COLLECTIONS.inventories).where({ familyId, petId: _id }).remove();
  // 日记（原级联遗漏）：分页逐条删，带上限保护
  await removeWhere(COLLECTIONS.diaries, { familyId, petId: _id });
  await col(COLLECTIONS.pets).doc(_id).remove();
  return { _id };
}

async function archive(ctx) {
  const { familyId, openid } = ctx;
  const { _id, archived = true } = ctx.payload || {};
  if (!_id) throw { code: 'INVALID', message: '缺少 _id' };
  const pet = await assertOwned(COLLECTIONS.pets, familyId, _id);
  if (archived) await disablePetReminders(familyId, _id, 'archived');
  else {
    await col(COLLECTIONS.reminders).where({ familyId, petId: _id, status: 'disabled', disabledReason: 'archived' }).update({
      data: { status: 'active', disabledReason: null, updateAt: Date.now() }
    });
  }
  await col(COLLECTIONS.pets).doc(_id).update({
    data: { archived: !!archived, updateAt: Date.now() }
  });
  if (!archived) await syncAnniversaryReminders(familyId, Object.assign({}, pet, { archived: false, _id }), openid).catch((e) => {
    console.error('[pet] anniversary reminder sync failed', e && (e.message || e));
  });
  return { _id, archived: !!archived };
}

/** 停用某宠物的全部 active 提醒（删除/归档时，PRD §4.1 / §9.2） */
async function disablePetReminders(familyId, petId, reason) {
  await col(COLLECTIONS.reminders).where({ familyId, petId, status: 'active' }).update({
    data: { status: 'disabled', disabledReason: reason || 'pet_removed', updateAt: Date.now() }
  });
}

function anniversaryAt(baseTs, year) {
  const base = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(baseTs)).reduce((out, p) => { out[p.type] = Number(p.value); return out; }, {});
  const month = Number(base.month);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Number(base.day), last);
  const eventAt = Date.UTC(year, month - 1, day, 9, 0, 0, 0) - 8 * 60 * 60 * 1000;
  return eventAt - 7 * 24 * 60 * 60 * 1000;
}

function nextAnniversaryReminder(baseTs, now) {
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date(now)));
  let at = anniversaryAt(baseTs, currentYear);
  if (at < now - 30 * 60 * 1000) at = anniversaryAt(baseTs, currentYear + 1);
  return at;
}

async function syncAnniversaryReminders(familyId, pet, openid) {
  if (!pet || !pet._id) return;
  const now = Date.now();
  const targets = [
    { type: 'birthday', date: pet.birthDate, title: '生日提醒' },
    { type: 'adopt', date: pet.adoptDate, title: '到家纪念日提醒' }
  ];
  for (const target of targets) {
    const query = { familyId, petId: pet._id, category: 'anniversary', anniversaryType: target.type };
    if (!target.date || pet.archived) {
      await col(COLLECTIONS.reminders).where(query).update({ data: { status: 'disabled', disabledReason: 'date_removed', updateAt: now } });
      continue;
    }
    const remindAt = nextAnniversaryReminder(target.date, now);
    const data = {
      _openid: openid, familyId, petId: pet._id, title: target.title, category: 'anniversary', anniversaryType: target.type,
      anniversaryDate: target.date, offsetDays: -7, timeOfDay: '09:00', scheduleMode: 'fixed', repeatType: 'yearly',
      remindAt, startAt: now, advanceDays: 7, notifyScope: 'family', notifyOpenid: '', status: 'active', updateAt: now
    };
    const got = await col(COLLECTIONS.reminders).where(query).limit(1).get();
    if (got.data && got.data.length) await col(COLLECTIONS.reminders).doc(got.data[0]._id).update({ data });
    else await col(COLLECTIONS.reminders).add({ data: Object.assign({ createAt: now }, data) });
  }
}

module.exports = { create, update, remove, archive, syncAnniversaryReminders };
