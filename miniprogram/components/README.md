# PawLog 公共组件库速查

设计语言依据：`doc/毛球档案袋-设计语言文档v2-iOS原生质感.md`。所有颜色/圆角/动效走 app.wxss 的 CSS 变量（`var(--primary)` 等），深色模式自动生效；图标全部是 SVG path 描边转 base64 data URI，以 CSS mask 渲染（注册表见 `components/icons.js`）。严禁 emoji。

页面引用方式（页面 json 的 `usingComponents`）：

```json
{ "cell": "/components/cell/index", "sheet": "/components/sheet/index" }
```

## 组件清单

| 组件 | 用途 | 关键属性 | 事件 / 方法 |
|---|---|---|---|
| `paw-loading` | 猫爪描边加载动画（§7.1） | `size='64rpx'`、`type`（page/local）、`variant`（paw/spinner） | — |
| `skeleton` | 骨架屏 shimmer（§7.2） | `type`（card/list/home） | — |
| `cell-group` | inset-grouped 白卡容器（§7.4） | slot 放 `cell` | — |
| `cell` | 分组列表行（§7.6） | `icon`、`title`、`value`、`desc`、`showArrow`、`switchChecked` | `tap`、`switchchange({checked})` |
| `swipe-cell` | 右滑操作行（§7.6，iOS Mail 式） | `actions=[{key,text,icon,theme:success/neutral/danger}]` | `action({key})`；方法 `close()` |
| `sheet` | 底部弹层（§7.7） | `visible`、`height`（half/full）、`title`、slot | `close` |
| `segmented` | 分段选择器（§7.11） | `items=[...]`、`current` | `change({index})` |
| `float-input` | 浮动标签输入框（§7.3） | `label`、`value`、`type`（text/digit/textarea）、`error` | `input({value})`、`confirm({value})` |
| `num-keyboard` | 大数字键盘（§7.3，体重/金额） | `visible`、`mode`（decimal/money）、`max`、`unit` | `confirm({value})`、`close` |
| `toast` | 顶部毛玻璃胶囊提示（§7.8） | — | 方法 `show({type:'success'/'fail', text, duration?})` |
| `empty-state` | 空状态素描占位（§7.10） | `image`（paw-box/dog/chart/calendar）、`title`、`desc`、`btnText` | `btnTap` |
| `fab` | 浮动「+」按钮（§7.9） | `shrink` | `tap` |
| `pet-avatar` | 宠物头像/物种剪影 | `src`、`species`（cat/dog/rabbit/hamster/bird/reptile/other）、`size='104rpx'`、`shape`（square/circle） | — |
| `record-icon` | 16 种记录类型描边图标（§9） | `type`（weight/vaccine/deworm/surgery/wash/walk/milestone/water/medical/medicine/feed/expense/poop/vomit/heat/custom）、`size='56rpx'`、`color`（默认 §2.4 类型色） | — |
| `photo-picker` | 选图→压缩≤500KB→云上传（§8.3） | `photos=[fileID...]`、`max=9` | `change({photos})` |

## 典型用法

```xml
<!-- 加载 / 骨架 -->
<paw-loading type="page" wx:if="{{loading}}" />
<skeleton type="home" wx:if="{{loading}}" />

<!-- 分组列表 -->
<cell-group>
  <cell icon="vaccine" title="狂犬疫苗" value="12 天后" showArrow bindtap="goDetail" />
  <cell title="微信通知" switchChecked="{{notify}}" bindswitchchange="onToggle" />
</cell-group>

<!-- 弹层 + toast -->
<sheet visible="{{show}}" title="选择餐次" bindclose="show=false">…</sheet>
<toast id="toast" />
```

```js
this.selectComponent('#toast').show({ type: 'success', text: '已保存' });
```

## 共享模块

- `components/icons.js`：`maskIcon(name)`（mask 用 data URI）、`colorIcon(name, color)`、
  `sketchIcon(name)`（空状态素描）、`RECORD_COLORS`（§2.4 类型色板）、`RECORD_ICONS`、`SPECIES`。
- `components/utils.js`：`haptic('light'|'medium'|'heavy')`（§6.5）、`rpx2px(rpx)`。

## 实现备忘（与设计文档的出入）

- 小程序不支持内联 SVG，`paw-loading` 的描边生长用 canvas `setLineDash/lineDashOffset` 实现，
  节奏参数照抄 §7.1；canvas 读不了 CSS 变量，描边色为 `--primary`/`--text-tertiary` 的字面色值。
- toast 图标的「path 绘制动画」因 mask 渲染无法逐笔绘制，以 300ms 淡入近似（§7.8）。
- FAB「+」图标色取 `var(--bg-page)`：浅色=米白 `#FAF6EF`，深色随按钮反转变深（§2.2）。
- shimmer 高光带与毛玻璃色值无 CSS token，组件内写了深色媒体查询（§7.2/§5.1 允许的例外）。
- spinner/shimmer 等循环动画用 `steps(12)`/`linear` 节奏（§6.1 曲线约束针对过渡动画）。
