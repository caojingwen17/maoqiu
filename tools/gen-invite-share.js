#!/usr/bin/env node
/**
 * 生成家庭成员邀请分享图候选：tools/out/invite-A~D.png（1000×800，5:4）
 * 与 share-cover 同一套粗犷手绘引擎（抖动描边 + 涂出界 + 纸张噪点），
 * 邀请语义构图各不相同，供挑选后替换 miniprogram/assets/invite-share.jpg。
 *
 * 运行：node tools/gen-invite-share.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 1000, H = 800;

/* ---------------- 调色板 ---------------- */
const BG = [250, 246, 239, 255];        // #FAF6EF 页面底色
const INK = [74, 63, 48, 255];          // #4A3F30 手绘深棕描边
const CARAMEL = [192, 138, 78, 255];    // #C08A4E 焦糖
const GRAY = [185, 174, 158, 255];      // #B9AE9E
const WHITE = [255, 253, 248, 255];
const PINK = [238, 154, 147, 255];      // 舌头/内耳
const BLUSH = [232, 150, 120, 90];      // 腮红（半透明）
const HEART = [214, 106, 90, 255];      // 爱心红
const PAPER = [255, 252, 245, 255];     // 信封/档案夹纸色
const PAPER_DEEP = [240, 228, 206, 255];

const COL = {
  cat: [232, 176, 110, 255], catMuzzle: [247, 231, 206, 255],
  dog: [200, 155, 109, 255], dogEar: [168, 126, 83, 255], dogSpot: [150, 111, 71, 255], dogMuzzle: [240, 220, 192, 255],
  rabbit: [240, 233, 220, 255],
  hamster: [233, 199, 127, 255], hamCheek: [245, 226, 184, 255],
  bird: [168, 198, 173, 255], birdCheek: [232, 151, 90, 255], beak: [232, 176, 75, 255],
  turtle: [147, 178, 126, 255], turtleSpot: [120, 152, 100, 255]
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

function rectFill(cv, x0, y0, x1, y1, c) {
  for (let y = Math.round(y0); y <= y1; y++)
    for (let x = Math.round(x0); x <= x1; x++) blendPx(cv, x, y, c);
}

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

/** 手绘抖动矩形描边 */
function wRectStroke(cv, x0, y0, x1, y1, thk, c, seed) {
  wLine(cv, x0, y0, x1, y0, thk, c, 3, seed);
  wLine(cv, x1, y0, x1, y1, thk, c, 3, seed + 1);
  wLine(cv, x1, y1, x0, y1, thk, c, 3, seed + 2);
  wLine(cv, x0, y1, x0, y0, thk, c, 3, seed + 3);
}

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

function arcStroke(cv, cx, cy, r, a0, a1, thk, c) {
  const steps = Math.max(8, Math.round(Math.abs(a1 - a0) * r / 2));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    disc(cv, cx + r * Math.cos(a), cy + r * Math.sin(a), thk / 2, c);
  }
}

/* ---------------- 脸部零件 ---------------- */
function eye(cv, x, y, r, wink) {
  if (wink) { arcStroke(cv, x, y + r * 0.2, r * 0.85, Math.PI * 1.12, Math.PI * 1.88, 7, INK); return; }
  disc(cv, x, y, r, WHITE);
  disc(cv, x, y + r * 0.32, r * 0.5, INK);
  disc(cv, x - r * 0.14, y + r * 0.14, r * 0.15, WHITE);
}

function tongue(cv, x, y, w, h) {
  thickLine(cv, x, y, x, y + h, w, PINK);
  thickLine(cv, x, y + h * 0.15, x, y + h * 0.8, 2.5, INK);
}

function blush(cv, x, y) { disc(cv, x, y, 13, BLUSH); }

function head(cv, cx, cy, rx, ry, fill, seed) {
  ellipse(cv, cx + 2, cy + 2, rx + 1.5, ry + 1.5, 0, fill);
  wEllipseStroke(cv, cx, cy, rx, ry, 0, 8, INK, seed);
}

/* ---------------- 六种宠物（320×320 sprite，头心 ≈ (160,165)） ---------------- */
const SPR = 320, HX = 160, HY = 165, HR = 102;

function drawCat(cv) {
  tri(cv, 92, 78, 66, 12, 146, 52, COL.cat);
  tri(cv, 228, 78, 254, 12, 174, 52, COL.cat);
  wLine(cv, 92, 78, 66, 12, 7, INK); wLine(cv, 66, 12, 146, 52, 7, INK);
  wLine(cv, 228, 78, 254, 12, 7, INK); wLine(cv, 254, 12, 174, 52, 7, INK);
  tri(cv, 96, 66, 80, 28, 132, 50, PINK);
  tri(cv, 224, 66, 240, 28, 188, 50, PINK);
  head(cv, HX, HY, HR, 96, COL.cat, 2);
  eye(cv, 122, 148, 17, false);
  eye(cv, 202, 148, 15, true);
  tri(cv, 154, 180, 170, 180, 162, 190, PINK);
  arcStroke(cv, 152, 192, 10, 0.15 * Math.PI, 0.9 * Math.PI, 5, INK);
  arcStroke(cv, 172, 192, 10, 0.1 * Math.PI, 0.85 * Math.PI, 5, INK);
  tongue(cv, 162, 202, 18, 18);
  wLine(cv, 96, 178, 52, 168, 3.5, INK); wLine(cv, 96, 192, 50, 194, 3.5, INK); wLine(cv, 96, 206, 54, 220, 3.5, INK);
  wLine(cv, 224, 178, 268, 168, 3.5, INK); wLine(cv, 224, 192, 270, 194, 3.5, INK); wLine(cv, 224, 206, 266, 220, 3.5, INK);
  blush(cv, 104, 206); blush(cv, 218, 206);
}

function drawDog(cv) {
  ellipse(cv, 82, 96, 30, 52, -0.45, COL.dogEar);
  ellipse(cv, 238, 96, 30, 52, 0.45, COL.dogEar);
  wEllipseStroke(cv, 82, 96, 30, 52, -0.45, 7, INK, 3);
  wEllipseStroke(cv, 238, 96, 30, 52, 0.45, 7, INK, 4);
  head(cv, HX, HY, HR, 98, COL.dog, 5);
  ellipse(cv, 116, 142, 30, 26, -0.2, COL.dogSpot);
  eye(cv, 118, 144, 16, false);
  eye(cv, 204, 140, 12, false);
  ellipse(cv, 162, 208, 48, 34, 0, COL.dogMuzzle);
  disc(cv, 162, 188, 15, INK);
  disc(cv, 157, 183, 4, WHITE);
  arcStroke(cv, 162, 200, 26, 0.15 * Math.PI, 0.85 * Math.PI, 6, INK);
  tongue(cv, 168, 218, 24, 30);
  blush(cv, 108, 190); blush(cv, 220, 186);
}

function drawRabbit(cv) {
  ellipse(cv, 112, 52, 20, 56, -0.16, COL.rabbit);
  wEllipseStroke(cv, 112, 52, 20, 56, -0.16, 7, INK, 6);
  ellipse(cv, 112, 54, 9, 38, -0.16, PINK);
  ellipse(cv, 228, 66, 18, 52, 1.15, COL.rabbit);
  wEllipseStroke(cv, 228, 66, 18, 52, 1.15, 7, INK, 7);
  head(cv, HX, HY, HR - 4, 92, COL.rabbit, 8);
  eye(cv, 122, 146, 15, false);
  eye(cv, 200, 146, 15, true); // 右眼 wink，更搞怪
  tri(cv, 154, 176, 168, 176, 161, 185, PINK);
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
  ellipse(cv, 96, 200, 34, 28, 0, COL.hamCheek);
  ellipse(cv, 224, 200, 34, 28, 0, COL.hamCheek);
  eye(cv, 118, 140, 12, false);
  eye(cv, 202, 140, 12, false);
  disc(cv, 160, 172, 8, PINK);
  thickLine(cv, 160, 186, 160, 206, 15, WHITE);
  thickLine(cv, 160, 188, 160, 204, 2.5, INK);
  wLine(cv, 152, 186, 168, 186, 4, INK);
  blush(cv, 96, 176); blush(cv, 226, 176);
}

function drawBird(cv) {
  wLine(cv, 148, 74, 140, 48, 9, COL.bird, 2, 12);
  wLine(cv, 162, 71, 164, 42, 9, COL.bird, 2, 13);
  wLine(cv, 176, 74, 188, 50, 9, COL.bird, 2, 14);
  head(cv, HX, HY, HR - 6, 94, COL.bird, 15);
  disc(cv, 100, 186, 18, COL.birdCheek);
  disc(cv, 224, 186, 18, COL.birdCheek);
  wLine(cv, 104, 116, 138, 108, 6, INK, 2, 16);
  wLine(cv, 188, 122, 222, 122, 6, INK, 2, 17);
  eye(cv, 122, 140, 15, false);
  eye(cv, 202, 142, 15, false);
  tri(cv, 146, 168, 178, 168, 162, 196, COL.beak);
  wLine(cv, 146, 168, 162, 196, 5, INK, 2, 18);
  wLine(cv, 178, 168, 162, 196, 5, INK, 2, 19);
  wLine(cv, 146, 168, 178, 168, 5, INK, 2, 20);
}

function drawTurtle(cv) {
  head(cv, HX, HY + 6, HR, 90, COL.turtle, 21);
  disc(cv, 128, 88, 12, COL.turtleSpot);
  disc(cv, 176, 82, 9, COL.turtleSpot);
  disc(cv, 84, 160, 10, COL.turtleSpot);
  disc(cv, 238, 160, 10, COL.turtleSpot);
  eye(cv, 128, 138, 16, false);
  eye(cv, 192, 138, 16, false);
  disc(cv, 148, 180, 4.5, INK); disc(cv, 172, 180, 4.5, INK);
  arcStroke(cv, 160, 182, 36, 0.22 * Math.PI, 0.78 * Math.PI, 8, INK);
  disc(cv, 122, 196, 5.5, INK); disc(cv, 198, 196, 5.5, INK);
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

function drawPet(dst, drawFn, cx, cy, rot, scale) {
  const spr = createCanvas(SPR, SPR, null);
  drawFn(spr);
  blitRot(dst, spr, cx, cy, rot, scale);
}

/* ---------------- 小装饰 ---------------- */
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

/** 手绘爱心：填充用两圆+尖角（深重叠无缝），描边沿心形参数曲线走一圈（抖动） */
function heart(cv, cx, cy, s, c, seed) {
  disc(cv, cx - s * 0.42, cy - s * 0.3, s * 0.52, c);
  disc(cv, cx + s * 0.42, cy - s * 0.3, s * 0.52, c);
  tri(cv, cx - s * 0.88, cy - s * 0.12, cx + s * 0.88, cy - s * 0.12, cx, cy + s * 0.98, c);
  const sd = seed || 30;
  const steps = 90;
  let px = null, py = null;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const w = 1 + 0.045 * Math.sin(4 * t + sd * 1.3) + 0.02 * Math.sin(9 * t + sd * 2.9);
    const x = cx + (16 * Math.pow(Math.sin(t), 3)) * (s / 16) * w;
    const y = cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * (s / 16) * w - s * 0.08;
    if (px !== null) thickLine(cv, px, py, x, y, Math.max(4, s * 0.16), INK);
    px = x; py = y;
  }
}

/** 打开的信封：宠物头从封口探出（先画头再画信封下半身遮挡） */
function envelope(cv, cx, cy, w, h, seed) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  // 打开的翻盖（向上倒三角）
  tri(cv, x0 + 6, y0 + 4, x1 - 6, y0 + 4, cx, y0 - h * 0.62, PAPER_DEEP);
  wLine(cv, x0 + 6, y0 + 4, cx, y0 - h * 0.62, 7, INK, 3, seed);
  wLine(cv, x1 - 6, y0 + 4, cx, y0 - h * 0.62, 7, INK, 3, seed + 1);
  // 信封主体
  rectFill(cv, x0, y0, x1, y1, PAPER);
  wRectStroke(cv, x0, y0, x1, y1, 8, INK, seed + 2);
  // 正面折痕（下三角）
  wLine(cv, x0 + 4, y0 + 6, cx, cy + h * 0.16, 5, INK, 2, seed + 3);
  wLine(cv, x1 - 4, y0 + 6, cx, cy + h * 0.16, 5, INK, 2, seed + 4);
  wLine(cv, x0 + 4, y1 - 4, cx, cy + h * 0.16, 5, INK, 2, seed + 5);
  wLine(cv, x1 - 4, y1 - 4, cx, cy + h * 0.16, 5, INK, 2, seed + 6);
}

/** 档案夹：大本子 + 右上标签页 + 封面记录横线与爪印 */
function folder(cv, cx, cy, w, h, seed) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  rectFill(cv, x0, y0, x1, y1, PAPER);
  // 标签页
  rectFill(cv, x1 - w * 0.3, y0 - h * 0.1, x1 - w * 0.06, y0 + 2, PAPER_DEEP);
  wRectStroke(cv, x1 - w * 0.3, y0 - h * 0.1, x1 - w * 0.06, y0 + 2, 6, INK, seed + 8);
  wRectStroke(cv, x0, y0, x1, y1, 8, INK, seed);
  // 封面记录横线 + 爪印
  wLine(cv, x0 + w * 0.12, y0 + h * 0.32, x1 - w * 0.12, y0 + h * 0.32, 4, GRAY, 2, seed + 6);
  wLine(cv, x0 + w * 0.12, y0 + h * 0.5, x1 - w * 0.12, y0 + h * 0.5, 4, GRAY, 2, seed + 7);
  pawPrint(cv, cx + w * 0.08, y0 + h * 0.76, 4.5, CARAMEL);
}

/** 搭在边缘的小爪子 */
function pawsOn(cv, cx, edgeY, gap, c) {
  [-gap / 2, gap / 2].forEach((dx) => {
    ellipse(cv, cx + dx, edgeY, 22, 16, 0, c);
    wEllipseStroke(cv, cx + dx, edgeY, 22, 16, 0, 5, INK, 40 + dx);
    wLine(cv, cx + dx - 7, edgeY - 8, cx + dx - 7, edgeY + 2, 3, INK, 1.5, 50 + dx);
    wLine(cv, cx + dx + 7, edgeY - 8, cx + dx + 7, edgeY + 2, 3, INK, 1.5, 60 + dx);
  });
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

/* ================= 四个候选构图 ================= */

/** A. 信封里弹出猫狗：邀请语义最直接 */
function sceneA() {
  const cv = createCanvas(W, H, BG);
  // 先画宠物头（信封会遮住下半）
  drawPet(cv, drawCat, 385, 300, 0, 0.92);
  drawPet(cv, drawDog, 620, 306, 0, 0.98);
  // 信封
  envelope(cv, 500, 540, 620, 330, 70);
  // 爪子在信封口
  pawsOn(cv, 380, 388, 90, COL.cat);
  pawsOn(cv, 625, 392, 95, COL.dog);
  // 飘出的爱心与点缀
  heart(cv, 500, 128, 34, HEART, 80);
  heart(cv, 245, 165, 20, CARAMEL, 84);
  heart(cv, 775, 150, 22, HEART, 87);
  sparkle(cv, 160, 300, 13, CARAMEL);
  sparkle(cv, 855, 290, 11, GRAY);
  pawPrint(cv, 130, 660, 3.2, GRAY);
  pawPrint(cv, 880, 690, 3.6, CARAMEL);
  grain(cv, 5000, 7);
  return cv;
}

/** B. 六宠围圈 + 中心信封（与分享封面同族，中心换成邀请符号） */
function sceneB() {
  const cv = createCanvas(W, H, BG);
  const pets = [
    { draw: drawCat, x: 500, y: 122, scale: 0.95 },
    { draw: drawDog, x: 812, y: 235, scale: 0.9 },
    { draw: drawRabbit, x: 816, y: 562, scale: 0.88 },
    { draw: drawHamster, x: 500, y: 668, scale: 0.85 },
    { draw: drawBird, x: 186, y: 556, scale: 0.88 },
    { draw: drawTurtle, x: 190, y: 232, scale: 0.9 }
  ];
  const CX = W / 2, CY = H / 2;
  pets.forEach((p) => {
    const phi = Math.atan2(CY - p.y, CX - p.x);
    drawPet(cv, p.draw, p.x, p.y, phi - Math.PI / 2, p.scale);
  });
  // 中心小信封 + 爱心
  envelope(cv, CX, CY + 6, 240, 150, 90);
  heart(cv, CX + 2, CY - 128, 22, HEART, 95);
  sparkle(cv, CX - 120, CY - 92, 12, CARAMEL);
  sparkle(cv, CX + 126, CY + 78, 11, GRAY);
  grain(cv, 5000, 11);
  return cv;
}

/** C. 三只趴在档案夹上（贴近原图构图，手绘化） */
function sceneC() {
  const cv = createCanvas(W, H, BG);
  // 宠物头（档案夹会遮下半）
  drawPet(cv, drawCat, 265, 395, 0, 0.95);
  drawPet(cv, drawDog, 500, 375, 0, 1.05);
  drawPet(cv, drawRabbit, 735, 395, 0, 0.95);
  // 档案夹
  folder(cv, 500, 600, 720, 320, 100);
  // 小爪搭在夹子上缘
  pawsOn(cv, 268, 452, 88, COL.cat);
  pawsOn(cv, 505, 448, 96, COL.dog);
  pawsOn(cv, 738, 452, 88, COL.rabbit);
  // 上方飘饰
  heart(cv, 500, 145, 30, HEART, 110);
  heart(cv, 165, 220, 17, CARAMEL, 113);
  heart(cv, 845, 205, 18, HEART, 116);
  sparkle(cv, 340, 110, 12, CARAMEL);
  sparkle(cv, 690, 105, 10, GRAY);
  pawPrint(cv, 110, 380, 3, CARAMEL);
  pawPrint(cv, 895, 360, 2.8, GRAY);
  grain(cv, 5000, 13);
  return cv;
}

/** D. 中心大爱心 + 爪印，四宠四角探头朝中间 */
function sceneD() {
  const cv = createCanvas(W, H, BG);
  const CX = W / 2, CY = H / 2;
  // 中心爱心 + 爪印
  heart(cv, CX, CY - 30, 62, HEART, 120);
  pawPrint(cv, CX, CY + 150, 5, CARAMEL);
  // 四角宠物，头朝中心
  const pets = [
    { draw: drawCat, x: 205, y: 185, scale: 0.95 },
    { draw: drawDog, x: 795, y: 180, scale: 1.0 },
    { draw: drawBird, x: 205, y: 615, scale: 0.9 },
    { draw: drawHamster, x: 795, y: 618, scale: 0.9 }
  ];
  pets.forEach((p) => {
    const phi = Math.atan2(CY - p.y, CX - p.x);
    drawPet(cv, p.draw, p.x, p.y, phi - Math.PI / 2, p.scale);
  });
  sparkle(cv, CX - 165, CY + 40, 12, CARAMEL);
  sparkle(cv, CX + 170, CY - 60, 11, GRAY);
  heart(cv, CX - 150, CY - 150, 14, CARAMEL, 126);
  heart(cv, CX + 155, CY + 130, 13, HEART, 129);
  grain(cv, 5000, 17);
  return cv;
}

/* ---------------- 主流程 ---------------- */
function main() {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const scenes = { 'invite-A': sceneA, 'invite-B': sceneB, 'invite-C': sceneC, 'invite-D': sceneD };
  Object.keys(scenes).forEach((name) => {
    const png = encodePNG(scenes[name]());
    const out = path.join(outDir, name + '.png');
    fs.writeFileSync(out, png);
    console.log('生成', path.relative(process.cwd(), out), png.length + ' bytes');
  });
  // 选定方案 C：同步输出为正式邀请分享图
  const official = path.join(__dirname, '..', 'miniprogram', 'assets', 'invite-share.png');
  const png = encodePNG(sceneC());
  fs.writeFileSync(official, png);
  console.log('生成', path.relative(process.cwd(), official), png.length + ' bytes');
}

main();
