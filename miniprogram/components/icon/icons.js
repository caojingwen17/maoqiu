/**
 * 矢量线性图标库（SF Symbols 风格，1:1 对齐原型 doc/app/index.html 的 ICON）
 * 小程序不支持内联 <svg>，故将 SVG 以 data URI 注入目标颜色后交给 <image> 渲染。
 * COLOR 占位符在 svg() 中被替换为目标颜色。
 */

function svg(inner, color, vb, sw) {
  const c = color || '#3E362C';
  const viewBox = vb || '0 0 24 24';
  const strokeW = sw || '1.5';
  const body = inner.replace(/COLOR/g, c);
  const s =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '" fill="none" stroke="' + c +
    '" stroke-width="' + strokeW + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/** 33 个线性图标的内部 path（与原型 ICON 完全一致） */
const ICON = {
  paw: '<ellipse cx="5.4" cy="8.3" rx="1.65" ry="2.2" transform="rotate(-24 5.4 8.3)"/><ellipse cx="9.2" cy="5" rx="1.6" ry="2.25" transform="rotate(-10 9.2 5)"/><ellipse cx="14.8" cy="5" rx="1.6" ry="2.25" transform="rotate(10 14.8 5)"/><ellipse cx="18.6" cy="8.3" rx="1.65" ry="2.2" transform="rotate(24 18.6 8.3)"/><path d="M12 11.2c3 0 5.6 2.1 5.6 4.6 0 1.9-1.5 3.4-3.4 3.4-1 0-1.5-.4-2.2-.4-.7 0-1.2.4-2.2.4-1.9 0-3.4-1.5-3.4-3.4 0-2.5 2.6-4.6 5.6-4.6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  chart: '<path d="M4 4v15.5h16"/><path d="M8 15.5v-4M12.5 15.5v-7M17 15.5v-2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M18 6l-1.7 1.7M7.7 16.3 6 18M18 18l-1.7-1.7M7.7 7.7 6 6"/>',
  syringe: '<path d="M17.5 3.5l3 3M15 5l4 4M14 6.5L7 13.5l3.5 3.5 7-7.5M7 13.5l-3.5 6 1.5.5M10.5 17l1 3"/>',
  shield: '<path d="M12 3.5l7 2.6v5.2c0 4.6-3 7.7-7 9.2-4-1.5-7-4.6-7-9.2V6.1z"/><path d="M9.5 12l2 2 3.5-3.8"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9a4 4 0 018 0z"/><path d="M12 9V7.2M8 16.5h8"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.2 9.7c0-1.2 1.2-2 2.8-2s2.8.8 2.8 2-1 1.7-2.8 2-2.8.8-2.8 2 1.2 2 2.8 2 2.8-.8 2.8-2"/>',
  bowl: '<path d="M4 11h16c0 4-3 7-6.5 7.7v1.8h-3v-1.8C7 18 4 15 4 11z"/><path d="M9 7.5c.8-1.5 2.2-1.5 3 0M13 7.5c.8-1.5 2.2-1.5 3 0"/>',
  pill: '<rect x="4.5" y="9.5" width="15" height="6" rx="3" transform="rotate(-35 12 12.5)"/><path d="M9.8 9.2l4.6 6.6"/>',
  drop: '<path d="M12 3.5s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  flag: '<path d="M6 20.5v-16"/><path d="M6 5h11.5l-2.8 3.8L17.5 12.5H6"/>',
  camera: '<path d="M4 8.5h3.2l1.6-2.5h6.4l1.6 2.5H20v10.5H4z"/><circle cx="12" cy="13" r="3.2"/>',
  box: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>',
  download: '<path d="M12 4v10M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
  bell: '<path d="M6 16.5v-5.8a6 6 0 0112 0v5.8l1.5 2.5h-15z"/><path d="M10 20.5a2.2 2.2 0 004 0"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15.2 15.2L20 20"/>',
  mapPin: '<path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0113 0C18.5 15.7 12 21 12 21z"/><circle cx="12" cy="10.3" r="2.3"/>',
  calc: '<rect x="5.5" y="3.5" width="13" height="17" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4v4h-4"/>',
  fileText: '<path d="M6 3.5h8L18.5 8v12.5H6z"/><path d="M13.5 3.5V8H18M9 12.5h6M9 16h6"/>',
  poop: '<path d="M7 18.5a3 3 0 01-1-5.8 2.6 2.6 0 012.2-4.6A2.9 2.9 0 0114 5.5a2.9 2.9 0 013.8 3.4 3 3 0 01.2 6.1z"/><path d="M7 18.5h10"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  vomit: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/><path d="M12 8a4 4 0 1 0 4 4"/><path d="M17 4.5c.8-.6 2-.4 2.4.5M19.5 7.2h1.4"/>',
  cross: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
  glass: '<path d="M6.5 3.5h11l-1.6 15.2a2 2 0 0 1-2 1.8h-3.8a2 2 0 0 1-2-1.8z"/><path d="M7.1 9.5h9.8"/>',
  bone: '<path d="M8.2 8.2l7.6 7.6M6.4 5.2a1.8 1.8 0 1 1 2.3 2.5M5.2 6.4a1.8 1.8 0 1 1 2.5 2.3M17.6 18.8a1.8 1.8 0 1 1-2.3-2.5M18.8 17.6a1.8 1.8 0 1 1-2.5-2.3"/>',
  heart: '<path d="M12 20.3C7.2 16.4 3.8 13.2 3.8 9.6 3.8 7.1 5.7 5 8.1 5c1.5 0 3 .8 3.9 2.1C12.9 5.8 14.4 5 15.9 5c2.4 0 4.3 2.1 4.3 4.6 0 3.6-3.4 6.8-8.2 10.7z"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.15" fill="COLOR" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="COLOR" stroke="none"/><circle cx="18.5" cy="12" r="1.15" fill="COLOR" stroke="none"/>',
  pencil: '<path d="M4 20l1-4.2L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z"/><path d="M14.5 6.3l3.2 3.2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M8.5 5.8v12.4L18.8 12z" fill="COLOR" stroke="none"/>',
  walk: '<circle cx="13" cy="5" r="1.8"/><path d="M9 20.5l2.2-5-2-2.2 2.3-4.3M11.5 9l2.5 2.5 3.5.8M11.5 9l-3 1.6-1.6 3"/>',
  backspace: '<path d="M20.5 5.5H9.6a2 2 0 0 0-1.55.75L3.5 12l4.55 5.75a2 2 0 0 0 1.55.75h10.9a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1z"/><path d="M12 9.8l4.4 4.4M16.4 9.8L12 14.2"/>'
};

/** 空状态素描插画（单色线条，零 emoji；对齐原型 SKETCH） */
const SKETCH = {
  boxCat: '<path d="M18 34h52v24H18z"/><path d="M18 34l9-9h34l9 9"/><path d="M27 25h12M49 25h12"/><circle cx="44" cy="26" r="9"/><path d="M37 20l-3-7 8 3M51 20l3-7-8 3"/><path d="M40.5 26h.01M47.5 26h.01"/><path d="M64 50q10-2 9-12"/>',
  pawPen: '<circle cx="26" cy="16" r="4"/><circle cx="38" cy="12" r="4.2"/><circle cx="50" cy="12" r="4.2"/><circle cx="62" cy="16" r="4"/><path d="M44 24c9 0 16 6.5 16 13.5 0 5.4-4.3 9.7-9.7 9.7-2.9 0-4-1.2-6.3-1.2s-3.4 1.2-6.3 1.2c-5.4 0-9.7-4.3-9.7-9.7C28 30.5 35 24 44 24z"/><path d="M58 46l16-16 5 5-16 16-7 2z"/><path d="M69 35l5 5"/>',
  dogSun: '<circle cx="16" cy="14" r="6"/><path d="M16 4v3M16 21v3M6 14h3M23 14h3M9 7l2 2M23 19l2 2"/><path d="M30 52q0-12 17-12h9q16 0 16 12z"/><circle cx="66" cy="36" r="9"/><path d="M61 30q-7-6-3-11M71 30q7-6 3-11"/><path d="M63 36h.01M69 36h.01"/><path d="M40 52v6M56 52v6M30 46q-7-2-6-10"/><path d="M76 20l4-4M80 24l4-4"/>',
  framePaw: '<rect x="18" y="8" width="52" height="42" rx="5"/><path d="M18 42l14-12 10 9 8-7 20 16"/><circle cx="60" cy="18" r="3"/><circle cx="38" cy="24" r="1.6"/><circle cx="44" cy="21" r="1.7"/><circle cx="50" cy="24" r="1.6"/><path d="M44 27c3.4 0 6 2.5 6 5.4 0 2.2-1.8 4-4 4-1.2 0-1.5-.5-2-.5s-.8.5-2 .5c-2.2 0-4-1.8-4-4 0-2.9 2.6-5.4 6-5.4z"/>',
  dogCable: '<circle cx="26" cy="32" r="11"/><path d="M17 26q-9 2-7 12M35 26q9 2 7 12"/><path d="M22 32h.01M30 32h.01M26 37h.01"/><rect x="54" y="28" width="11" height="9" rx="2.5"/><path d="M54 30.5h-5M54 34.5h-5M65 32.5h4"/><path d="M71 32.5q9 0 9 9v6"/><path d="M76 50l4 4M80 50l-4 4"/>',
  catBox: '<rect x="22" y="34" width="44" height="24" rx="2"/><path d="M22 40h44"/><circle cx="44" cy="24" r="9"/><path d="M37 18l-3-7 8 3M51 18l3-7-8 3"/><path d="M40.5 24h.01M47.5 24h.01"/><path d="M50 33q8 4 2 9"/>',
  openBox: '<path d="M20 32h48v26H20z"/><path d="M20 32l-8-8M20 32l10-8M68 32l8-8M68 32l-10-8"/><path d="M44 18v-6M36 16l-3-4M52 16l3-4" stroke-dasharray="3 4"/><path d="M34 46h20"/>'
};

/** 渲染图标为 data URI。size 单位 rpx。 */
function icon(name, color, size) {
  const s = Math.round(size || 40);
  const body = ICON[name] ? svg(ICON[name], color, '0 0 24 24') : svg(ICON.paw, color);
  return { src: body, size: s };
}

/** 渲染空状态插画。w/h 为 rpx 尺寸，viewBox 保持 88x66 等比。 */
function sketch(name, color, w, h) {
  const s = SKETCH[name] || SKETCH.boxCat;
  return svg(s, color || '#3E362C', '0 0 88 66', '1.8');
}

/** 猫爪加载：5 段描边（对齐原型 paw-loader 的 trace 逐笔画出） */
const PAW_STROKES = [
  '<ellipse cx="5.4" cy="8.3" rx="1.65" ry="2.2" transform="rotate(-24 5.4 8.3)"/>',
  '<ellipse cx="9.2" cy="5" rx="1.6" ry="2.25" transform="rotate(-10 9.2 5)"/>',
  '<ellipse cx="14.8" cy="5" rx="1.6" ry="2.25" transform="rotate(10 14.8 5)"/>',
  '<ellipse cx="18.6" cy="8.3" rx="1.65" ry="2.2" transform="rotate(24 18.6 8.3)"/>',
  '<path d="M12 11.2c3 0 5.6 2.1 5.6 4.6 0 1.9-1.5 3.4-3.4 3.4-1 0-1.5-.4-2.2-.4-.7 0-1.2.4-2.2.4-1.9 0-3.4-1.5-3.4-3.4 0-2.5 2.6-4.6 5.6-4.6z"/>'
];
function pawStrokes(color) {
  return PAW_STROKES.map((p) => svg(p, color || '#3E362C', '0 0 24 24'));
}

module.exports = {
  ICON,
  SKETCH,
  icon,
  sketch,
  pawStrokes
};