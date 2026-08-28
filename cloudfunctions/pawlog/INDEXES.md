# 云数据库索引清单（pawlog）

根据 `modules/` 内实际 where + orderBy / 范围查询组合整理。微信云数据库对「多字段等值 + 异字段排序」或「范围 + 异字段排序」的查询需要预建组合索引，否则控制台报错或全表扫描超时。

在云开发控制台 → 数据库 → 对应集合 → 索引管理 中按下表创建（顺序即字段顺序）：

## records

| 索引字段 | 用途（代码位置） |
| --- | --- |
| `familyId asc, petId asc, date desc` | record.list 时间线分页 / record.photos 相册（record.js） |
| `familyId asc, type asc, date desc` | home.aggregate 体重趋势（home.js）、record.list 按类型筛选 |
| `familyId asc, type asc, date asc` | stats.summary 体重/花销范围内升序（stats.js） |
| `familyId asc, petId asc, date asc` | diary 生成取当日事件（diary.js eventsFor） |
| `familyId asc, date desc` | record.list 家庭级分页 |
| `familyId asc, requestId asc` | record.create / inventory.inbound 幂等去重 |

## reminders

| 索引字段 | 用途 |
| --- | --- |
| `status asc, remindAt asc` | notification.runCron 全量扫描到期提醒（notification.js） |
| `familyId asc, status asc, remindAt asc` | home.aggregate 今日待办 / reminder.list 进行中（home.js / reminder.js） |
| `familyId asc, status asc, completedAt asc, remindAt asc` | reminder.list 已完成（status=done + completedAt 范围 + remindAt 排序） |
| `familyId asc, sourceRecordId asc` | record.update/remove 派生提醒删除与停用（record.js） |
| `familyId asc, petId asc, category asc, status asc, sourceRecordId asc` | record 派生提醒去重（仅 vaccine，含 sourceRecordId exists 过滤；deworm 已停止派生） |
| `familyId asc, petId asc, category asc, anniversaryType asc` | 宠物周年提醒同步（pet.js syncAnniversaryReminders） |
| `familyId asc, sourceInventoryId asc, status asc` | 库存提醒停用/重建（inventory.js / pet.js remove） |
| `familyId asc, petId asc, status asc` | 宠物删除/归档停用提醒（pet.js disablePetReminders） |

## diaries

| 索引字段 | 用途 |
| --- | --- |
| `familyId asc, petId asc, status asc, diaryDate desc` | diary.list 分页（diary.js） |
| `familyId asc, status asc, diaryDate desc` | home.aggregate 未读最新日记（home.js） |
| `familyId asc, petId asc` | pet.remove 级联删除日记（pet.js） |

## messageGrants

| 索引字段 | 用途 |
| --- | --- |
| `_openid asc, templateId asc, status asc, createAt asc` | reserveGrant 抢占最早可用额度（notification.js） |
| `status asc, updateAt asc` | sweeper 回收 reserved / 清理 invalid+consumed（notification.js） |

## messageDeliveries

| 索引字段 | 用途 |
| --- | --- |
| `deliveryKey asc`（唯一索引） | claimDelivery 幂等抢占（notification.js） |
| `status asc, occurrenceAt asc` | waiting_grant 迟发重试扫描（notification.js） |
| `status asc, updateAt asc` | sweeper 清理 30 天前 sent/failed（notification.js） |

## pets

| 索引字段 | 用途 |
| --- | --- |
| `familyId asc, archived asc, order asc` | home.aggregate 宠物卡片墙（home.js） |
| `familyId asc, archived asc, updateAt desc` | home.aggregate 归档宠物列表（home.js） |

## 单字段等值查询（无需组合索引，列出仅供审计）

- settings: `_openid`
- inventories: `familyId`、`familyId + requestId`、`familyId + petId`（等值无排序）
- families: 全部走 `doc(_id)` 直取
- records: `familyId + createdBy`（settings.js 资料快照回填）、`familyId + date 范围`（home.js 本周打卡/本月花销，等值+单字段范围无需组合索引）
