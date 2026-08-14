# 毛球档案袋 PawLog

面向养宠人士的宠物信息记录与管理工具（微信小程序 · 云开发）。
产品与设计依据：`doc/毛球档案袋-产品需求文档PRD.md`、`doc/毛球档案袋-设计语言文档v2-iOS原生质感.md`、页面视觉基准 `doc/app/index.html`。

## 目录结构

```
miniprogram/
├── app.json / app.wxss      # 宠物 / 提醒 / 统计 / 我的四 Tab；设计 token（§10）+ hairline/glass 工具类
├── stores/                  # 极简 store：petStore（当前宠物上下文）、settingStore（偏好，持久化）
├── services/                # api.js（云函数调用封装：8s 超时 + 重试 1 次 + 错误归一化）+ 各域薄封装
├── utils/                   # date / validate / dict（品种·疫苗·禁忌食物离线字典）/ recordMeta（16 类型元数据）/ tracker
├── components/              # 15 个公共组件（见 components/README.md）
└── pages/
    ├── home/                # Tab1 首页：卡片墙 + 待办 + 统计条 + 快捷九宫格
    ├── reminder/            # Tab2 提醒（进行中 / 已完成 + 订阅消息引导）
    ├── stats/               # Tab3 统计（体重曲线 / 花销柱状 / 打卡热力）
    ├── mine/                # Tab4 我的（设置 / 归档宠物 / 订阅授权）
    ├── pet/detail|edit/     # 宠物详情（时间线/健康/花销/相册）、档案表单
    ├── record/edit/         # 16 种记录共用的配置驱动表单（formMap.js）
    └── expense/             # 花销记账（月度总览 + 预算进度 + 账单列表）
cloudfunctions/
└── pawlog/                  # 单云函数多 action 路由（19 个 action + 每小时 remindPush 定时器）
                             # schema.js 写入校验闸门；__tests__ 提醒规则单测（node __tests__/reminder.test.js）
tools/
└── gen-tab-icons.js         # tabBar 图标 PNG 生成脚本（纯 Node，无依赖）
```

## 上线前待办

1. `miniprogram/envList.js` 填入云环境 ID；微信开发者工具中上传部署 `pawlog` 云函数（右键「上传并部署：云端安装依赖」）。
2. 云数据库建集合 `pets / records / reminders / inventories / settings`（权限「仅创建者可读写」）；建索引 `records(petId+date desc)`、`reminders(status+remindAt asc)`。
3. MP 后台申请订阅消息模板（字段 thing1 标题 / date2 到期时间 / thing3 备注），替换 `cloudfunctions/pawlog/config.js` 与 `miniprogram/services/constants.js` 中的 `TEMPLATE_ID_PLACEHOLDER`。
4. 提交前自查：全局搜索 emoji unicode 区间必须为零（设计红线 §1.3）。
