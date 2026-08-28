#!/usr/bin/env node
/**
 * 生成小程序分享封面图：miniprogram/assets/share-cover.png（1000×800，5:4）
 * 画面：多种宠物围在四周、头朝中间俯看镜头，搞怪表情，粗犷手绘风
 * （抖动描边 + 平涂色块略微溢出轮廓 + 纸张噪点）。
 * 纯 Node 无第三方依赖（PNG 用内置 zlib 手写编码），沿用 tools/gen-tab-icons.js 的模式。
 *
 * 运行：node tools/gen-share-cover.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1000, H = 800;

/* ---------------- 调色板 ---------------- */
const BG = [250, 246, 239, 255];        // #FAF6EF 页面底色
const INK = [74, 63, 48, 255];          // #4A3F30 手绘深棕描边
const CARAMEL = [192, 138, 78, 255];    // #C08A4E 焦糖（tab 选中色）
const GRAY = [185, 174, 158, 255];      // #B9AE9E
const WHITE = [255, 253, 248, 255];
const PINK = [238, 154, 147, 255];      // 舌头/内耳
const BLUSH = [232, 150, 120, 90];      // 腮红（半透明）

const COL = {
  cat: [232, 176, 110, 255], catMuzzle: [247, 231, 206, 255],
  dog: [200, 155, 109, 255], dogEar: [168, 126, 83, 255], dogSpot: [150, 111, 71, 255], dogMuzzle: [240, 220, 192, 255],
  rabbit: [240, 233, 220, 255],
  hamster: [233, 199, 127, 255], hamCheek: [245, 226, 184, 255],
  bird: [168, 198, 173, 255], birdCheek: [232, 151, 90, 255], beak: [232, 176, 75, 255],
  turtle: [147, 178, 126, 255], turtleSpot: [120, 152, 100, 255], turtleMuzzle: [207, 224, 188, 255]
};

/* ---------------- 画布与基础图元 ---------------- */
function createCanvas(w, h, fill) {
  const buf = new Uint8Array(w * h * 4);
  if (fill) for (let i = 0; i < w * h; i++) { buf[i * 4] = fill[0]; buf[i * 4 + 1] = fill[1]; buf[i * 4 + 2] = fill[2]; buf[i * 4 + 3] = fill[3]; }
  return { w, h, buf };
}

function blendPx(cv, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return;
  const a = c[3] / 255;
  const i = (y * cv.w + x) * 4;
  const sa = cv.buf[i + 3] / 255;
  const oa = a + sa * (1 - a);
  if (oa <= 0) return;
  cv.buf[i] = Math.round((c[0] * a + cv.buf[i] * sa * (1 - a)) / oa);
  cv.buf[i + 1] = Math.round((c[1] * a + cv.buf[i + 1] * sa * (1 - a)) / oa);
  cv.buf[i + 2] = Math.round((c[2] * a + cv.buf[i + 2] * sa * (1 - a)) / oa);
  cv.buf[i + 3] = Math.round(oa * 255);
}

function disc(cv, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) blendPx(cv, x, y, c);
    }
}

/** 填充（可旋转）椭圆 */
function ellipse(cv, cx, cy, rx, ry, rot, c) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const R = Math.max(rx, ry);
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy;
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      if ((lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1) blendPx(cv, x, y, c);
    }
}

/** 填充三角形 */
function tri(cv, x0, y0, x1, y1, x2, y2, c) {
  const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (!d) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
      const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
      if (a >= 0 && b >= 0 && a + b <= 1) blendPx(cv, x, y, c);
    }
}

/** 圆头粗线（无抖动） */
function thickLine(cv, x0, y0, x1, y1, thk, c) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(cv, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thk / 2, c);
  }
}

/** 手绘抖动线 */
function wLine(cv, x0, y0, x1, y1, thk, c, jit, seed) {
  jit = jit == null ? 3 : jit; seed = seed || 1;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (!len) return;
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const steps = Math.max(2, Math.round(len * 1.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * 9 + seed * 2.1) * jit + Math.sin(t * 23 + seed) * jit * 0.4;
    disc(cv, x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off, thk / 2, c);
  }
}

/** 手绘抖动椭圆描边 */
function wEllipseStroke(cv, cx, cy, rx, ry, rot, thk, c, seed) {
  seed = seed || 1;
  const steps = Math.max(60, Math.round((rx + ry) * 2.2));
  let px = null, py = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const w = 1 + 0.035 * Math.sin(5 * t + seed * 1.7) + 0.02 * Math.sin(11 * t + seed * 3.3);
    const ex = rx * w * Math.cos(t), ey = ry * w * Math.sin(t);
    const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
    if (px !== null) thickLine(cv, px, py, x, y, thk, c);
    px = x; py = y;
  }
}

/** 圆弧描边（y 轴向下，0 起顺时针为正方向感） */
function arcStroke(cv, cx, cy, r, a0, a1, thk, c) {
  const steps = Math.max(8, Math.round(Math.abs(a1 - a0) * r / 2));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    disc(cv, cx + r * Math.cos(a), cy + r * Math.sin(a), thk / 2, c);
  }
}

/* ---------------- 脸部零件（局部坐标，脸朝向 +y 即下巴朝下） ---------------- */
/** 眼睛：白底 + 瞳孔朝下巴方向偏移（俯看镜头）；wink 画「◠」闭眼弧线 */
function eye(cv, x, y, r, wink) {
  if (wink) { arcStroke(cv, x, y + r * 0.2, r * 0.85, Math.PI * 1.12, Math.PI * 1.88, 7, INK); return; }
  disc(cv, x, y, r, WHITE);
  disc(cv, x, y + r * 0.32, r * 0.5, INK);
  disc(cv, x - r * 0.14, y + r * 0.14, r * 0.15, WHITE); // 高光
}

function tongue(cv, x, y, w, h) {
  thickLine(cv, x, y, x, y + h, w, PINK);
  thickLine(cv, x, y + h * 0.15, x, y + h * 0.8, 2.5, INK); // 舌中线
}

function blush(cv, x, y) { disc(cv, x, y, 13, BLUSH); }

/** 头底色 + 抖动轮廓（色块略大于轮廓，手绘涂出界感） */
function head(cv, cx, cy, rx, ry, fill, seed) {
  ellipse(cv, cx + 2, cy + 2, rx + 1.5, ry + 1.5, 0, fill);
  wEllipseStroke(cv, cx, cy, rx, ry, 0, 8, INK, seed);
}

/* ---------------- 六种宠物（320×320 sprite，头心 ≈ (160,165)） ---------------- */
const SPR = 320, HX = 160, HY = 165, HR = 102;

function drawCat(cv) {
  // 耳朵（先画在头下层）
  tri(cv, 92, 78, 66, 12, 146, 52, COL.cat);
  tri(cv, 228, 78, 254, 12, 174, 52, COL.cat);
  wLine(cv, 92, 78, 66, 12, 7, INK); wLine(cv, 66, 12, 146, 52, 7, INK);
  wLine(cv, 228, 78, 254, 12, 7, INK); wLine(cv, 254, 12, 174, 52, 7, INK);
  tri(cv, 96, 66, 80, 28, 132, 50, PINK);
  tri(cv, 224, 66, 240, 28, 188, 50, PINK);
  head(cv, HX, HY, HR, 96, COL.cat, 2);
  // 搞怪：左眼瞪圆，右眼 wink
  eye(cv, 122, 148, 17, false);
  eye(cv, 202, 148, 15, true);
  // 鼻子 + 嘴 + 舌头
  tri(cv, 154, 180, 170, 180, 162, 190, PINK);
  arcStroke(cv, 152, 192, 10, 0.15 * Math.PI, 0.9 * Math.PI, 5, INK);
  arcStroke(cv, 172, 192, 10, 0.1 * Math.PI, 0.85 * Math.PI, 5, INK);
  tongue(cv, 162, 202, 18, 18);
  // 胡须
  wLine(cv, 96, 178, 52, 168, 3.5, INK); wLine(cv, 96, 192, 50, 194, 3.5, INK); wLine(cv, 96, 206, 54, 220, 3.5, INK);
  wLine(cv, 224, 178, 268, 168, 3.5, INK); wLine(cv, 224, 192, 270, 194, 3.5, INK); wLine(cv, 224, 206, 266, 220, 3.5, INK);
  blush(cv, 104, 206); blush(cv, 218, 206);
}

function drawDog(cv) {
  // 垂耳（深色椭圆，先画）
  ellipse(cv, 82, 96, 30, 52, -0.45, COL.dogEar);
  ellipse(cv, 238, 96, 30, 52, 0.45, COL.dogEar);
  wEllipseStroke(cv, 82, 96, 30, 52, -0.45, 7, INK, 3);
  wEllipseStroke(cv, 238, 96, 30, 52, 0.45, 7, INK, 4);
  head(cv, HX, HY, HR, 98, COL.dog, 5);
  // 左眼斑
  ellipse(cv, 116, 142, 30, 26, -0.2, COL.dogSpot);
  // 眼睛一大一小，瞳孔朝下巴
  eye(cv, 118, 144, 16, false);
  eye(cv, 204, 140, 12, false);
  // 口鼻
  ellipse(cv, 162, 208, 48, 34, 0, COL.dogMuzzle);
  disc(cv, 162, 188, 15, INK);
  disc(cv, 157, 183, 4, WHITE);
  arcStroke(cv, 162, 200, 26, 0.15 * Math.PI, 0.85 * Math.PI, 6, INK);
  tongue(cv, 168, 218, 24, 30);
  blush(cv, 108, 190); blush(cv, 220, 186);
}

function drawRabbit(cv) {
  // 左耳竖、右耳耷拉
  ellipse(cv, 112, 52, 20, 56, -0.16, COL.rabbit);
  wEllipseStroke(cv, 112, 52, 20, 56, -0.16, 7, INK, 6);
  ellipse(cv, 112, 54, 9, 38, -0.16, PINK);
  ellipse(cv, 228, 66, 18, 52, 1.15, COL.rabbit);
  wEllipseStroke(cv, 228, 66, 18, 52, 1.15, 7, INK, 7);
  head(cv, HX, HY, HR - 4, 92, COL.rabbit, 8);
  eye(cv, 122, 146, 15, false);
  eye(cv, 200, 146, 15, false);
  tri(cv, 154, 176, 168, 176, 161, 185, PINK);
  // 大板牙
  thickLine(cv, 152, 190, 152, 212, 13, WHITE);
  thickLine(cv, 168, 190, 168, 212, 13, WHITE);
  thickLine(cv, 160, 192, 160, 210, 3, INK);
  thickLine(cv, 152, 190, 152, 212, 2, INK);
  thickLine(cv, 168, 190, 168, 212, 2, INK);
  wLine(cv, 148, 190, 172, 190, 4, INK);
  blush(cv, 104, 196); blush(cv, 218, 196);
}

function drawHamster(cv) {
  disc(cv, 96, 68, 22, COL.hamster); wEllipseStroke(cv, 96, 68, 22, 22, 0, 7, INK, 9);
  disc(cv, 224, 68, 22, COL.hamster); wEllipseStroke(cv, 224, 68, 22, 22, 0, 7, INK, 10);
  disc(cv, 96, 68, 10, PINK); disc(cv, 224, 68, 10, PINK);
  head(cv, HX, HY, HR, 92, COL.hamster, 11);
  // 鼓鼓的腮帮
  ellipse(cv, 96, 200, 34, 28, 0, COL.hamCheek);
  ellipse(cv, 224, 200, 34, 28, 0, COL.hamCheek);
  eye(cv, 118, 140, 12, false);
  eye(cv, 202, 140, 12, false);
  disc(cv, 160, 172, 8, PINK);
  // 单颗大门牙
  thickLine(cv, 160, 186, 160, 206, 15, WHITE);
  thickLine(cv, 160, 188, 160, 204, 2.5, INK);
  wLine(cv, 152, 186, 168, 186, 4, INK);
  blush(cv, 96, 176); blush(cv, 226, 176);
}

function drawBird(cv) {
  // 头顶呆毛（短粗，贴着头顶）
  wLine(cv, 148, 74, 140, 48, 9, COL.bird, 2, 12);
  wLine(cv, 162, 71, 164, 42, 9, COL.bird, 2, 13);
  wLine(cv, 176, 74, 188, 50, 9, COL.bird, 2, 14);
  head(cv, HX, HY, HR - 6, 94, COL.bird, 15);
  // 玄凤式橙脸蛋
  disc(cv, 100, 186, 18, COL.birdCheek);
  disc(cv, 224, 186, 18, COL.birdCheek);
  // 一高一低的眉毛 = 搞怪
  wLine(cv, 104, 116, 138, 108, 6, INK, 2, 16);
  wLine(cv, 188, 122, 222, 122, 6, INK, 2, 17);
  eye(cv, 122, 140, 15, false);
  eye(cv, 202, 142, 15, false);
  // 向下的尖嘴
  tri(cv, 146, 168, 178, 168, 162, 196, COL.beak);
  wLine(cv, 146, 168, 162, 196, 5, INK, 2, 18);
  wLine(cv, 178, 168, 162, 196, 5, INK, 2, 19);
  wLine(cv, 146, 168, 178, 168, 5, INK, 2, 20);
}

function drawTurtle(cv) {
  head(cv, HX, HY + 6, HR, 90, COL.turtle, 21);
  // 头顶与两侧深绿斑点
  disc(cv, 128, 88, 12, COL.turtleSpot);
  disc(cv, 176, 82, 9, COL.turtleSpot);
  disc(cv, 84, 160, 10, COL.turtleSpot);
  disc(cv, 238, 160, 10, COL.turtleSpot);
  // 眼睛挤一点 + 憨笑（不要口鼻圈，直接在脸上画大笑）
  eye(cv, 128, 138, 16, false);
  eye(cv, 192, 138, 16, false);
  disc(cv, 148, 180, 4.5, INK); disc(cv, 172, 180, 4.5, INK); // 鼻孔
  arcStroke(cv, 160, 182, 36, 0.22 * Math.PI, 0.78 * Math.PI, 8, INK); // 大笑
  disc(cv, 122, 196, 5.5, INK); disc(cv, 198, 196, 5.5, INK); // 嘴角点
  blush(cv, 104, 184); blush(cv, 216, 184);
}

/* ---------------- 旋转贴图 ---------------- */
function blitRot(dst, spr, cx, cy, rot, scale) {
  const half = spr.w / 2;
  const R = half * 1.42 * scale;
  const cs = Math.cos(-rot), sn = Math.sin(-rot);
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy;
      const sx = (dx * cs - dy * sn) / scale + half;
      const sy = (dx * sn + dy * cs) / scale + half;
      const ix = Math.round(sx), iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= spr.w || iy >= spr.h) continue;
      const i = (iy * spr.w + ix) * 4;
      if (spr.buf[i + 3] === 0) continue;
      blendPx(dst, x, y, [spr.buf[i], spr.buf[i + 1], spr.buf[i + 2], spr.buf[i + 3]]);
    }
}

/* ---------------- PNG 编码（宽高版） ---------------- */
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
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((cv.w * 4 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 4 + 1)] = 0;
    for (let x = 0; x < cv.w * 4; x++) raw[y * (cv.w * 4 + 1) + 1 + x] = cv.buf[y * cv.w * 4 + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- 中心装饰：大爪印 + 星星点点 ---------------- */
function pawPrint(cv, cx, cy, s, c) {
  const toes = [
    [-8.6, -6.5, 1.65, 2.3, -24 * Math.PI / 180],
    [-2.8, -9.6, 1.6, 2.35, -10 * Math.PI / 180],
    [2.8, -9.6, 1.6, 2.35, 10 * Math.PI / 180],
    [8.6, -6.5, 1.65, 2.3, 24 * Math.PI / 180]
  ];
  toes.forEach((e) => ellipse(cv, cx + e[0] * s, cy + e[1] * s, e[2] * s, e[3] * s, e[4], c));
  ellipse(cv, cx, cy + 2.6 * s, 5.6 * s, 4.1 * s, 0, c);
}

function sparkle(cv, x, y, r, c) {
  ellipse(cv, x, y, r * 0.26, r, 0, c);
  ellipse(cv, x, y, r * 0.26, r, Math.PI / 2, c);
}

/** 纸张噪点 */
function grain(cv, n, seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const x = rnd() * cv.w, y = rnd() * cv.h;
    const dark = rnd() > 0.5;
    blendPx(cv, x, y, dark ? [70, 55, 30, 10] : [255, 255, 255, 12]);
  }
}

/* ---------------- 主流程 ---------------- */
function main() {
  const cv = createCanvas(W, H, BG);
  grain(cv, 5000, 42);

  // 宠物围圈：头朝中间（下巴指向画面中心），位置/大小略不规则
  const pets = [
    { draw: drawCat, x: 500, y: 128, scale: 1.02 },
    { draw: drawDog, x: 806, y: 240, scale: 0.98 },
    { draw: drawRabbit, x: 812, y: 566, scale: 0.95 },
    { draw: drawHamster, x: 500, y: 662, scale: 0.92 },
    { draw: drawBird, x: 192, y: 560, scale: 0.95 },
    { draw: drawTurtle, x: 194, y: 238, scale: 0.98 }
  ];
  const CX = W / 2, CY = H / 2;
  pets.forEach((p, i) => {
    const spr = createCanvas(SPR, SPR, null);
    p.draw(spr);
    // 下巴（sprite 的 +y 方向）转向画面中心：rot = 指向中心的角度 - 90°
    const phi = Math.atan2(CY - p.y, CX - p.x);
    blitRot(cv, spr, p.x, p.y, phi - Math.PI / 2, p.scale);
  });

  // 中心爪印与点缀
  pawPrint(cv, CX, CY - 6, 7.2, CARAMEL);
  sparkle(cv, CX - 96, CY - 78, 14, CARAMEL);
  sparkle(cv, CX + 104, CY - 52, 10, GRAY);
  sparkle(cv, CX + 88, CY + 84, 13, CARAMEL);
  sparkle(cv, CX - 110, CY + 62, 9, GRAY);
  disc(cv, CX - 140, CY - 10, 6, GRAY);
  disc(cv, CX + 142, CY + 12, 6, CARAMEL);
  disc(cv, CX - 40, CY + 116, 5, GRAY);
  disc(cv, CX + 46, CY - 118, 5, GRAY);

  const out = path.join(__dirname, '..', 'miniprogram', 'assets', 'share-cover.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const png = encodePNG(cv);
  fs.writeFileSync(out, png);
  console.log('生成', path.relative(process.cwd(), out), png.length + ' bytes');
}

main();
