#!/usr/bin/env node
/**
 * 生成 tabBar 图标（8 张 PNG）：未选中（灰 #B9AE9E）+ 选中（焦糖 #C08A4E）
 * 两种状态均为「线性描边」，仅颜色不同 —— 对齐原型 tabbar 的 ICON(20) / currentColor。
 * 纯 Node 无第三方依赖（PNG 用内置 zlib 手写编码）。
 *
 * 运行：node tools/gen-tab-icons.js
 * 输出：miniprogram/assets/tab/{pet,bell,chart,gear}[.png|-active.png]
 *
 * 图标几何在 24×24 坐标空间定义（对齐原型 ICON），按 SCALE 放大到 96×96；
 * 描边宽度 = 原型 stroke-width 1.5 × SCALE = 6px（96 空间）。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 96;
const SCALE = 4; // 24 → 96
const SW = 6;    // 描边宽度（px，96 空间）= 1.5 × SCALE

const GRAY = [185, 174, 158, 255];   // #B9AE9E（未选中）
const POP = [192, 138, 78, 255];     // #C08A4E（选中）

/* ---------------- 画布 ---------------- */
function createCanvas() {
  return { size: SIZE, buf: new Uint8Array(SIZE * SIZE * 4).fill(0) };
}

function setPx(cv, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return;
  const i = (y * cv.size + x) * 4;
  cv.buf[i] = c[0]; cv.buf[i + 1] = c[1]; cv.buf[i + 2] = c[2]; cv.buf[i + 3] = c[3];
}

function fillDisc(cv, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(cv, x, y, c);
    }
  }
}

function ringDisc(cv, cx, cy, r, thk, c) {
  for (let y = Math.floor(cy - r - thk); y <= cy + r + thk; y++) {
    for (let x = Math.floor(cx - r - thk); x <= cx + r + thk; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d <= r && d >= r - thk) setPx(cv, x, y, c);
    }
  }
}

function thickLine(cv, x0, y0, x1, y1, thk, c) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillDisc(cv, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thk / 2, c);
  }
}

/** 圆弧（圆环一段） */
function arc(cv, cx, cy, r, thk, a0, a1, c) {
  const steps = Math.max(1, Math.round(Math.abs(a1 - a0) / (Math.PI / 90)));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    fillDisc(cv, cx + r * Math.cos(a), cy + r * Math.sin(a), thk / 2, c);
  }
}

/** 椭圆描边（旋转 rot） */
function ellipseOutline(cv, cx, cy, rx, ry, rot, thk, c) {
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const t = 2 * Math.PI * i / steps;
    const dx = rx * Math.cos(t);
    const dy = ry * Math.sin(t);
    const x = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
    const y = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
    fillDisc(cv, x, y, thk / 2, c);
  }
}

/* ---------------- 坐标工具 ---------------- */
function T(p) { return p * SCALE; }
function R(cv, p, r, thk, c) { ringDisc(cv, T(p[0]), T(p[1]), T(r), thk, c); }
function L(cv, a, b, thk, c) { thickLine(cv, T(a[0]), T(a[1]), T(b[0]), T(b[1]), thk, c); }

/* ---------------- 图标绘制（24×24 对齐原型 ICON 几何） ---------------- */
const ICONS = {
  /* 爪印：4 趾（旋转椭圆）+ 掌垫（椭圆近似） */
  paw(cv, c) {
    const toes = [
      [5.4, 8.3, 1.65, 2.2, -24 * Math.PI / 180],
      [9.2, 5, 1.6, 2.25, -10 * Math.PI / 180],
      [14.8, 5, 1.6, 2.25, 10 * Math.PI / 180],
      [18.6, 8.3, 1.65, 2.2, 24 * Math.PI / 180]
    ];
    toes.forEach((e) => ellipseOutline(cv, T(e[0]), T(e[1]), T(e[2]), T(e[3]), e[4], SW, c));
    ellipseOutline(cv, T(12), T(15.4), T(5.4), T(3.9), 0, SW, c);
  },

  /* 铃铛：顶圆顶 + 两侧直线 + 喇叭口 + 底边 + 铃锤 */
  bell(cv, c) {
    arc(cv, T(12), T(10.7), T(6), SW, Math.PI, 2 * Math.PI, c);
    L(cv, [6, 10.7], [6, 16.5], SW, c);
    L(cv, [6, 16.5], [4.5, 19], SW, c);
    L(cv, [4.5, 19], [19.5, 19], SW, c);
    L(cv, [19.5, 19], [18, 16.5], SW, c);
    L(cv, [18, 16.5], [18, 10.7], SW, c);
    arc(cv, T(12), T(20.5), T(2.2), SW, Math.PI, 2 * Math.PI, c);
  },

  /* 柱状图：坐标轴 + 三根竖直柱（描边线段，圆头） */
  chart(cv, c) {
    L(cv, [4, 4], [4, 19.5], SW, c);
    L(cv, [4, 19.5], [20, 19.5], SW, c);
    L(cv, [8, 11.5], [8, 15.5], SW, c);
    L(cv, [12.5, 8.5], [12.5, 15.5], SW, c);
    L(cv, [17, 13], [17, 15.5], SW, c);
  },

  /* 齿轮：中心圆 + 8 根辐条（4 直 + 4 斜），无外圈 */
  gear(cv, c) {
    R(cv, [12, 12], 3, SW, c);
    L(cv, [12, 3.5], [12, 5.9], SW, c);
    L(cv, [12, 18.1], [12, 20.5], SW, c);
    L(cv, [18.1, 12], [20.5, 12], SW, c);
    L(cv, [3.5, 12], [5.9, 12], SW, c);
    L(cv, [18, 6], [16.3, 7.7], SW, c);
    L(cv, [7.7, 16.3], [6, 18], SW, c);
    L(cv, [18, 18], [16.3, 16.3], SW, c);
    L(cv, [7.7, 7.7], [6, 6], SW, c);
  }
};

/* ---------------- PNG 编码 ---------------- */
function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(cv) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.size, 0);
  ihdr.writeUInt32BE(cv.size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((cv.size * 4 + 1) * cv.size);
  for (let y = 0; y < cv.size; y++) {
    raw[y * (cv.size * 4 + 1)] = 0;
    for (let x = 0; x < cv.size * 4; x++) {
      raw[y * (cv.size * 4 + 1) + 1 + x] = cv.buf[y * cv.size * 4 + x];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 主流程 ---------------- */
function main() {
  const outDir = path.join(__dirname, '..', 'miniprogram', 'assets', 'tab');
  fs.mkdirSync(outDir, { recursive: true });

  const names = Object.keys(ICONS);
  let count = 0;
  names.forEach((name) => {
    // app.json 引用 pet.png / pet-active.png …（paw 键名对外暴露为 pet，normal 态无后缀）
    const fileBase = name === 'paw' ? 'pet' : name;
    [['normal', GRAY], ['active', POP]].forEach(([suffix, color]) => {
      const cv = createCanvas();
      ICONS[name](cv, color);
      const png = encodePNG(cv);
      const file = path.join(outDir, suffix === 'normal' ? `${fileBase}.png` : `${fileBase}-${suffix}.png`);
      fs.writeFileSync(file, png);
      count++;
      console.log('生成', path.relative(process.cwd(), file), png.length + ' bytes');
    });
  });
  console.log('完成：共 ' + count + ' 张 tab 图标');
}

main();