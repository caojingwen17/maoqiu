/**
 * cell —— iOS inset-grouped 列表行（设计文档 §7.6）
 *
 * 属性：
 *   icon          String   ''       图标 key（16 种记录类型自动取类型色；bell/gear/chart/
 *                                   calendar/share/info/doc 等通用图标取 Text-Secondary）
 *   title         String   ''       主标题（Headline）
 *   value         String   ''       右侧值（Subhead/Text-Secondary）
 *   desc          String   ''       副标题（Footnote，有值时行高 128rpx 双行）
 *   showArrow     Boolean  false    右侧 › 细箭头
 *   switchChecked Boolean  null     传布尔值即为开关行（开启 Primary，滑块 300ms Snap 微回弹）
 *
 * 事件：
 *   tap(detail: {})                     行点击（开关行不触发）
 *   switchchange(detail: {checked})     开关切换
 *
 * 示例：
 *   <cell icon="vaccine" title="狂犬疫苗" value="12 天后" showArrow bindtap="go" />
 *   <cell title="微信通知" switchChecked="{{notify}}" bindswitchchange="onToggle" />
 *
 * 说明：组内行间 0.5px hairline 左缩进分隔由本组件渲染（cell-group 通过
 * relations 告知位次，首行不画）；按下整行 BG-Fill-Deep 反馈，无缩放（§5.3）。
 */
var icons = require('../icons.js');
var utils = require('../utils.js');

Component({
  options: { multipleSlots: true, styleIsolation: 'isolated' },

  relations: {
    '../cell-group/index': { type: 'parent' }
  },

  properties: {
    icon: { type: String, value: '' },
    title: { type: String, value: '' },
    value: { type: String, value: '' },
    desc: { type: String, value: '' },
    showArrow: { type: Boolean, value: false },
    switchChecked: { type: null, value: null }
  },

  data: {
    _first: true,
    iconUri: '',
    iconStyle: '',
    arrowUri: icons.maskIcon('chevron-right')
  },

  observers: {
    'icon': function (icon) {
      if (!icon) {
        this.setData({ iconUri: '', iconStyle: '' });
        return;
      }
      var typeColor = icons.RECORD_COLORS[icon];
      this.setData({
        iconUri: icons.maskIcon(icon),
        // 记录类型图标取类型色（§2.4），通用图标走 wxss 默认 Text-Secondary
        iconStyle: typeColor ? 'background: ' + typeColor + ';' : ''
      });
    }
  },

  methods: {
    onTap: function () {
      if (this.data.switchChecked !== null) return; // 开关行整行热区归开关
      this.triggerEvent('tap', {});
    },

    onSwitchTap: function () {
      var checked = !this.data.switchChecked;
      utils.haptic('light'); // §6.5 开关切换
      this.setData({ switchChecked: checked });
      this.triggerEvent('switchchange', { checked: checked });
    }
  }
});
