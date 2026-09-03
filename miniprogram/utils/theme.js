/**
 * 深浅主题（跟随系统 / 浅色 / 深色）。
 *
 * 页内配色双通道：
 *  - 跟随系统：app.wxss 的 @media (prefers-color-scheme: dark) + theme.json（原生 tabBar/窗口）
 *  - 手动强制：页面根节点绑定 .theme-dark / .theme-light 类（CSS 变量就近覆盖媒体查询），
 *    原生 tabBar 用 wx.setTabBarStyle 运行时覆盖
 * 页面在 onShow 里调用 attach(this) 同步根节点 class；偏好存本地存储。
 */
const KEY = 'app.theme.pref'; // 'auto' | 'light' | 'dark'

let pref = 'auto';
try { pref = wx.getStorageSync(KEY) || 'auto'; } catch (e) { /* ignore */ }

// 与 theme.json / app.wxss 的 token 保持一致（三处同步）
const TAB_STYLE = {
  light: { color: '#B9AE9E', selectedColor: '#C08A4E', backgroundColor: '#FAF6EF', borderStyle: 'black' },
  dark: { color: '#6E6E68', selectedColor: '#D3A266', backgroundColor: '#1C1C1A', borderStyle: 'black' }
};

function systemTheme() {
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
    return info && info.theme === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

/** 当前生效主题：手动偏好优先，否则跟随系统 */
function resolved() {
  return pref === 'auto' ? systemTheme() : pref;
}

/** 页面根节点附加类：手动强制时返回 .theme-*，跟随系统返回空（媒体查询已覆盖） */
function rootClass() {
  if (pref === 'auto') return '';
  return pref === 'dark' ? 'theme-dark' : 'theme-light';
}

/** 实底（--primary）上的图标色：p-icon 颜色烘进 SVG，须由页面 data 绑定 */
function onPrimaryHex() {
  return resolved() === 'dark' ? '#262019' : '#FAF6EF';
}

/** 页面背景上的图标色（= --text 的取值） */
function textHex() {
  return resolved() === 'dark' ? '#F0F0EE' : '#2C2620';
}

const BG_HEX = { dark: '#0E0E0D', light: '#FAF6EF' };

function applyTabBar() {
  if (!wx.setTabBarStyle) return;
  wx.setTabBarStyle(Object.assign({}, TAB_STYLE[resolved()], { fail: () => {} }));
}

/** 页面 onShow 调用：同步根节点主题类 + 图标色，并重申原生窗口背景/tabBar 配色。
 *  - setBackgroundColor：push 动画先露出原生窗口层（theme.json 按系统取值），手动强制
 *    深色（系统浅色）时会闪一下浅色，动态刷掉；
 *  - applyTabBar：原生 tabBar 配色可能在页面切换时被重置，每次 onShow 幂等重申自愈。 */
function attach(page) {
  applyTabBar();
  if (wx.setBackgroundColor) {
    wx.setBackgroundColor({ backgroundColor: BG_HEX[resolved()], fail: () => {} });
  }
  if (!page) return;
  const cls = rootClass();
  const onPrimary = onPrimaryHex();
  const textColor = textHex();
  if (page.data.themeClass !== cls || page.data.onPrimary !== onPrimary || page.data.textColor !== textColor) {
    page.setData({ themeClass: cls, onPrimary, textColor });
  }
}

function setPref(next) {
  pref = next === 'light' || next === 'dark' ? next : 'auto';
  try { wx.setStorageSync(KEY, pref); } catch (e) { /* ignore */ }
  applyTabBar();
  return pref;
}

function getPref() {
  return pref;
}

/** app onLaunch 调用：按偏好应用 tabBar，并监听系统主题变化（跟随系统时即时换 tab 配色） */
function init() {
  applyTabBar();
  if (wx.onThemeChange) {
    wx.onThemeChange(() => {
      if (pref === 'auto') applyTabBar();
    });
  }
}

module.exports = {
  init,
  attach,
  setPref,
  getPref,
  rootClass,
  onPrimaryHex,
  textHex,
  applyTabBar,
  resolved,
  systemTheme
};
