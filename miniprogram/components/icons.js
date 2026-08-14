/**
 * components/icons.js —— 全局 SVG 线性图标注册表（设计文档 §9）
 *
 * 约定：
 * - 全部为 24×24 viewBox 的 path 描边图标，1.5px 等宽描边、几何化、转角微圆
 * - 小程序 <image> 不支持本地 svg 文件，统一转成 base64 data URI 使用
 * - 图标一律以 CSS mask 渲染（maskIcon），颜色由调用方 wxss/内联 style 的 background 决定，
 *   这样颜色可以走 var(--xxx) token，深色模式自动生效
 *
 * 导出：
 * - ICONS            : name -> svg inner（path 片段）注册表
 * - maskIcon(name)   : name -> base64 data URI（黑色描边，供 mask-image 使用）
 * - colorIcon(name, color) : name -> 指定描边色的 data URI（供 <image src> 使用）
 * - RECORD_COLORS    : 16 种记录类型 -> 类型色（§2.4 色板）
 * - RECORD_ICONS     : 16 种记录类型 -> 图标 name
 * - SPECIES          : 物种剪影 icon name 列表（cat/dog/rabbit/hamster/bird/reptile/other）
 */

/* ---------- 纯 JS base64（UTF-8 安全，小程序无 btoa） ---------- */
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str) {
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var c2 = str.charCodeAt(++i);
      var cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return bytes;
}

function base64Encode(str) {
  var bytes = utf8Bytes(str);
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i];
    var b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
    var b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
    out += B64.charAt(b0 >> 2);
    out += B64.charAt(((b0 & 3) << 4) | (b1 === null ? 0 : b1 >> 4));
    out += b1 === null ? '=' : B64.charAt(((b1 & 15) << 2) | (b2 === null ? 0 : b2 >> 6));
    out += b2 === null ? '=' : B64.charAt(b2 & 63);
  }
  return out;
}

function svgDataUri(inner, opts) {
  opts = opts || {};
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (opts.viewBox || '0 0 24 24') + '" ' +
    'fill="none" stroke="' + (opts.color || '#000000') + '" stroke-width="' + (opts.width || 1.5) + '" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  return 'data:image/svg+xml;base64,' + base64Encode(svg);
}

/* ---------- 图标注册表：16 记录类型（§2.4）+ 通用图标 + 物种剪影 + 空状态素描 ---------- */
var ICONS = {
  /* —— 16 种记录类型 —— */
  weight: '<rect x="4" y="3.5" width="16" height="17" rx="3"/>' +
    '<path d="M8.5 12a3.5 3.5 0 0 1 7 0"/><path d="M12 9v1.6"/>',
  vaccine: '<path d="M15 6l3 3-8 8-3-3 8-8z"/><path d="M7 17l-3.5 3.5"/>' +
    '<path d="M17.5 3.5l3 3"/><path d="M16 6.5L20 2.5"/>',
  deworm: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/>' +
    '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8V8.2M12 15.8v-1.6M9.8 12H8.2M15.8 12h-1.6"/>',
  surgery: '<circle cx="7" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/>' +
    '<path d="M9.2 8.8L20 19"/><path d="M9.2 15.2L20 5"/>',
  wash: '<path d="M12 4.5c2.8 3.6 4.6 6 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.6 1.8-5 4.6-8.6z"/>' +
    '<circle cx="18.6" cy="6.4" r="1.6"/><circle cx="5.6" cy="17.8" r="1.3"/>',
  walk: '<circle cx="6.5" cy="6.5" r="3"/>' +
    '<path d="M9.2 8.2C12.5 11.5 14 13 14.5 15.5"/><circle cx="17" cy="18.5" r="2.5"/>',
  milestone: '<path d="M6 21V4"/><path d="M6 5h11l-2.6 3.5L17 12H6"/>',
  water: '<path d="M6 4h12l-1.4 15.6a2 2 0 0 1-2 1.9H9.4a2 2 0 0 1-2-1.9L6 4z"/>' +
    '<path d="M7.1 10c1.6-1.2 3.2-1.2 4.8 0s3.3 1.2 4.9 0"/>',
  medical: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  medicine: '<rect x="8" y="3.5" width="8" height="17" rx="4"/><path d="M8 12h8"/>',
  feed: '<path d="M4 11h16c0 4.4-3.6 8-8 8s-8-3.6-8-8z"/>' +
    '<path d="M9.5 7.2c0-1.2 1-1.4 1-2.6M13.5 7.2c0-1.2 1-1.4 1-2.6"/>',
  expense: '<circle cx="12" cy="12" r="8.5"/>' +
    '<path d="M8.5 6.8L12 11l3.5-4.2M12 11v6.5M9 13.6h6M9 16.4h6"/>',
  poop: '<path d="M12 4c4 0 7 2 7 4.5 0 1.8-1.4 3-3.5 3.5 2.8.4 4.5 1.8 4.5 3.8 0 3-3.6 5.2-8 5.2s-8-2.2-8-5.2c0-2 1.7-3.4 4.5-3.8C6.4 11.5 5 10.3 5 8.5 5 6 8 4 12 4z"/>',
  vomit: '<path d="M4 8.5c2-2.5 4-2.5 6 0s4 2.5 6 0"/>' +
    '<path d="M4 14c2-2.5 4-2.5 6 0s4 2.5 6 0"/><path d="M6.5 19.5c1.6-2 3.2-2 4.8 0s3.2 2 4.7 0"/>',
  heat: '<path d="M12 20s-7-4.3-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5c0 5.2-7 9.5-7 9.5z"/>',
  custom: '<path d="M12 4l2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.6l5.2-.7L12 4z"/>',

  /* —— 通用图标 —— */
  bell: '<path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 2 5.5 2 5.5H4s2-1 2-5.5z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.5 15l4-5 3 3 4.5-6.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/>' +
    '<path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  share: '<path d="M12 14.5V4M8.2 7.4L12 3.6l3.8 3.8"/>' +
    '<path d="M5 12.5V19A1.5 1.5 0 0 0 6.5 20.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
  doc: '<path d="M7 3.5h7l4 4V19.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/>',
  camera: '<path d="M4 8h2.6L8.5 5.5h7L17.4 8H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8z"/>' +
    '<circle cx="12" cy="13.3" r="3.4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.5 2.5 4.8-5.3"/>',
  exclaim: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v6M12 16.6v.4"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  trash: '<path d="M5 7h14M10 7V5.2A1.2 1.2 0 0 1 11.2 4h1.6A1.2 1.2 0 0 1 14 5.2V7"/>' +
    '<path d="M7 7l.9 12.4A1.6 1.6 0 0 0 9.5 21h5a1.6 1.6 0 0 0 1.6-1.6L17 7"/><path d="M10.2 10.8v5.4M13.8 10.8v5.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.4"/>',
  'kbd-delete': '<path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9L3 12l6-7z"/>' +
    '<path d="M11.8 9.3l5 5M16.8 9.3l-5 5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20.2 3.5V8h-4.5"/>',
  download: '<path d="M12 4v10M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  paw: '<circle cx="6.8" cy="7.2" r="1.7"/><circle cx="10.4" cy="5.2" r="1.8"/>' +
    '<circle cx="14" cy="5.2" r="1.8"/><circle cx="17.6" cy="7.2" r="1.7"/>' +
    '<path d="M12.2 10.2c3 0 5.3 2.3 5.3 4.8 0 1.9-1.5 3.4-3.4 3.4-1 0-1.4-.4-1.9-.4s-.9.4-1.9.4c-1.9 0-3.4-1.5-3.4-3.4 0-2.5 2.3-4.8 5.3-4.8z"/>',
  phone: '<path d="M5.5 4h3.4l1.6 4-2.1 1.6a12.5 12.5 0 0 0 6 6L16 13.5l4 1.6v3.4a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/>',
  box: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>',

  /* —— 物种剪影（线性，无头像时占位） —— */
  cat: '<path d="M5 13a7 7 0 0 0 14 0V6l-3.6 1.9a7.6 7.6 0 0 0-6.8 0L5 6v7z"/>',
  dog: '<path d="M5.5 9a6.5 6.5 0 0 1 13 0v4.5a6.5 6.5 0 0 1-13 0V9z"/>' +
    '<path d="M5.5 9C4 9 3.5 10.5 3.5 12.5S4.5 16 6 16M18.5 9c1.5 0 2 1.5 2 3.5S19.5 16 18 16"/>',
  rabbit: '<ellipse cx="9" cy="6" rx="2" ry="3.4"/><ellipse cx="15" cy="6" rx="2" ry="3.4"/>' +
    '<circle cx="12" cy="15.5" r="5.5"/>',
  hamster: '<circle cx="12" cy="14.5" r="6"/><circle cx="7.4" cy="9" r="2.1"/><circle cx="16.6" cy="9" r="2.1"/>',
  bird: '<circle cx="11" cy="13.5" r="6"/><path d="M16.4 10.8L21 9.2l-3.6-2.4"/>' +
    '<path d="M7.6 8.2C8.2 6 9.6 5 11.2 5"/>',
  reptile: '<path d="M6 18.5c4.5 2.2 8.5.4 8.5-2.7 0-2.8-2-4.3-2-6.8 0-2 1.6-3.2 3.5-3.2"/>' +
    '<circle cx="17.4" cy="5.4" r="1.7"/><path d="M6 18.5L4 20.5M9.5 20l-.8 2.5"/>',
  other: '<ellipse cx="12" cy="14.8" rx="4.4" ry="3.4"/>' +
    '<circle cx="6.6" cy="9.8" r="1.6"/><circle cx="10" cy="7.2" r="1.6"/>' +
    '<circle cx="14" cy="7.2" r="1.6"/><circle cx="17.4" cy="9.8" r="1.6"/>'
};

/* —— 空状态素描插画（120×90 viewBox，§7.10） —— */
var SKETCH_VIEWBOX = '0 0 120 90';
var SKETCHES = {
  'paw-box': '<path d="M20 40h80v32a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V40z"/>' +
    '<path d="M14 26h92v14H14z"/>' +
    '<ellipse cx="60" cy="61" rx="4.6" ry="3.6"/>' +
    '<circle cx="51.8" cy="54.4" r="1.8"/><circle cx="56.8" cy="51.8" r="1.8"/>' +
    '<circle cx="63.2" cy="51.8" r="1.8"/><circle cx="68.2" cy="54.4" r="1.8"/>',
  dog: '<path d="M24 66c0-9 11-15 27-15 9 0 17 1.4 22 4"/>' +
    '<ellipse cx="87" cy="52" rx="12" ry="10"/>' +
    '<path d="M80 45c-3-4-2.6-8-.4-10.4M94 44c2.4-3.6 6-4.6 8.4-3.6"/>' +
    '<path d="M22 66h74M30 66c-1.5 3.5-1 6 1.5 8M52 66c-1.5 3.5-1 6 1.5 8"/>',
  chart: '<path d="M24 16v56h76"/>' +
    '<path d="M32 58l16-14 12 8 20-20 14 10"/>' +
    '<ellipse cx="66" cy="22" rx="4" ry="3.2"/>' +
    '<circle cx="60.4" cy="16.8" r="1.5"/><circle cx="71.6" cy="16.8" r="1.5"/>',
  calendar: '<rect x="26" y="20" width="68" height="54" rx="8"/>' +
    '<path d="M26 36h68M43 14v10M77 14v10"/>' +
    '<ellipse cx="60" cy="58" rx="4.2" ry="3.3"/>' +
    '<circle cx="52.8" cy="52.4" r="1.6"/><circle cx="57.4" cy="50" r="1.6"/>' +
    '<circle cx="62.6" cy="50" r="1.6"/><circle cx="67.2" cy="52.4" r="1.6"/>'
};

/* —— 16 种记录类型色板（§2.4） —— */
var RECORD_COLORS = {
  weight: '#C08A4E', vaccine: '#4A7FC7', deworm: '#7D6BAE', surgery: '#B85C5C',
  wash: '#5A9EA8', walk: '#6B8F4E', milestone: '#A8902E', water: '#5E8FB8',
  medical: '#D24B42', medicine: '#A87BA8', feed: '#B0803B', expense: '#4E8A68',
  poop: '#8A7355', vomit: '#A8865E', heat: '#B87B8E', custom: '#7A7A76'
};

/* PRD type 键名别名：recordMeta 用 groom/medication，图标实现叫 wash/medicine */
ICONS.groom = ICONS.wash;
ICONS.medication = ICONS.medicine;
RECORD_COLORS.groom = RECORD_COLORS.wash;
RECORD_COLORS.medication = RECORD_COLORS.medicine;

/* 记录类型 -> 图标名（同名，提醒分类复用同一套） */
var RECORD_ICONS = {};
Object.keys(RECORD_COLORS).forEach(function (k) { RECORD_ICONS[k] = k; });

var SPECIES = ['cat', 'dog', 'rabbit', 'hamster', 'bird', 'reptile', 'other'];

/* 供 mask-image 使用（黑色描边，颜色由 CSS background 控制） */
function maskIcon(name) {
  var inner = ICONS[name];
  if (!inner) inner = ICONS.custom;
  return svgDataUri(inner);
}

/* 供 <image src> 使用（描边色烧录进 SVG） */
function colorIcon(name, color) {
  var inner = ICONS[name];
  if (!inner) inner = ICONS.custom;
  return svgDataUri(inner, { color: color || '#000000' });
}

/* 空状态素描插画（黑色描边，供 mask 使用，颜色走 token） */
function sketchIcon(name) {
  var inner = SKETCHES[name];
  if (!inner) inner = SKETCHES['paw-box'];
  return svgDataUri(inner, { viewBox: SKETCH_VIEWBOX, width: 1.5 });
}

module.exports = {
  ICONS: ICONS,
  maskIcon: maskIcon,
  colorIcon: colorIcon,
  sketchIcon: sketchIcon,
  RECORD_COLORS: RECORD_COLORS,
  RECORD_ICONS: RECORD_ICONS,
  SPECIES: SPECIES
};
