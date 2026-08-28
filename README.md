# 毛球档案袋 PawLog

面向养宠人士的宠物信息记录与管理工具（微信小程序 · 云开发）。
产品与设计依据：`doc/毛球档案袋-产品需求文档PRD.md`、`doc/毛球档案袋-设计语言文档v2-iOS原生质感.md`、页面视觉基准 `doc/app/index.html`。

## 目录结构

```
miniprogram/
├── app.json / app.wxss      # 宠物 / 提醒 / 统计 / 我的四 Tab；设计 token（§10）+ hairline/glass 工具类
├── services/                # api.js（云函数调用封装：失败重试 1 次 + 错误归一化）+ 各域薄封装
├── utils/                   # date / validate / dict（品种·疫苗·禁忌食物离线字典）/ recordMeta（18 类型元数据）/ tracker
├── components/              # 17 个公共组件
└── pages/                   # 22 个页面
    ├── home/                # Tab1 首页：卡片墙（含「显示已归档」开关，归档置底 + 已归档 tag）+ 待办 + 统计条 + 快捷九宫格
    ├── reminder/            # Tab2 提醒（进行中 / 已完成 + 订阅消息引导）
    ├── stats/               # Tab3 统计（体重曲线 / 花销柱状 / 打卡热力近 15 周）
    ├── mine/                # Tab4 我的（设置 / 归档宠物 / 工具箱 / 订阅授权）
    ├── pet/detail|edit/     # 宠物详情（时间线/健康/花销/相册；归档宠物只读）、档案表单
    ├── record/edit|detail/  # 18 种记录共用的配置驱动表单（recordMeta.js）+ 记录详情（照片可预览）
    └── expense/             # 花销记账（月度总览 + 可设置的预算进度 + 账单列表）
cloudfunctions/
└── pawlog/                  # 单云函数多 action 路由（36 个 action + reminderCron 5 分钟 / diaryCron 凌晨 00:30 双定时器）
                             # schema.js 写入校验闸门；timeUtil.js 统一 Asia/Shanghai 时区；INDEXES.md 索引清单
                             # __tests__ 提醒/日记规则单测（node __tests__/reminder.test.js）
tools/
└── gen-tab-icons.js         # tabBar 图标 PNG 生成脚本（纯 Node，无依赖）
```

## 上线前待办

1. `miniprogram/envList.js` 云环境 ID 已填；微信开发者工具中上传部署 `pawlog` 云函数（右键「上传并部署：云端安装依赖」）。
2. 云数据库集合由 `pawlog` 首次访问自动创建（`modules/db.js` ensureCollections）；需人工确认权限为「仅创建者可读写」，并按 `cloudfunctions/pawlog/INDEXES.md` 建齐索引——尤其 `reminders(status+remindAt asc)` 是 reminderCron 扫描的硬性依赖，缺索引会报错。
3. 订阅消息模板 ID 前后端已填真实值（`cloudfunctions/pawlog/config.js` 与 `miniprogram/services/subscription.js`）；注意模板字段为 thing1 标题 / time2 到期时间 / thing4 备注，若更换模板需与 `modules/notification.js` 的发送字段保持一致。
4. 提交前自查：全局搜索 emoji unicode 区间必须为零（设计红线 §1.3）。
