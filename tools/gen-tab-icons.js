/**
 * tools/gen-tab-icons.js —— 生成 tabBar 矢量线性图标 PNG（设计文档 §9）
 *
 * 无第三方依赖：解析式光栅化（4x 超采样抗锯齿）+ 纯 JS PNG 编码。
 * 输出 81x81 PNG（微信 tabBar 推荐尺寸）：
 *   miniprogram/images/icons/tab-{paw,calendar,chart,gear}.png         未选中 #B9AE9E（Text-Tertiary）
 *   miniprogram/images/icons/tab-{paw,calendar,chart,gear}-active.png  选中   #C08A4E（Pop 焦糖）
 *
 * 运行：node tools/gen-tab-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;      // 输出尺寸
const SS = 4;         // 超采样倍数
const VB = 24;        // viewBox
const K = SIZE / VB;  // viewBox -> px
const SW = 1.5 * K;   // 描边宽度 px

const NORMAL = [185, 174, 158]; // #B9AE9E
const ACTIVE = [192, 138, 78];  // #C08A4E

/* ---------- 距离场基元（坐标均为 viewBox 单位） ---------- */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function distCircleStroke(px, py, cx, cy, r) {
  return Math.abs(Math.hypot(px - cx, py - cy) - r);
}
// 圆角矩形边界距离（sdRoundBox 的绝对值）
function distRoundRectStroke(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const bx = w / 2 - r, by = h / 2 - r;
  const qx = Math.abs(px - cx) - bx, qy = Math.abs(py - cy) - by;
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return Math.abs(sd);
}

/* ---------- 4 个图标的几何定义：返回 viewBox 坐标下的最小距离 ---------- */
const ICONS = {
  paw(px, py) {
    let d = Infinity;
    const toes = [[6.8, 7.2, 1.7], [10.4, 5.2, 1.8], [14, 5.2, 1.8], [17.6, 7.2, 1.7]];
    for (const [x, y, r] of toes) d = Math.min(d, distCircleStroke(px, py, x, y, r));
    // 掌心：椭圆近似为圆
    d = Math.min(d, distCircleStroke(px, py, 12.2, 14.6, 4.4));
    return d;
  },
  calendar(px, py) {
    let d = distRoundRectStroke(px, py, 4, 5.5, 16, 14.5, 2.5);
    d = Math.min(d, distSeg(px, py, 4, 10, 20, 10));
    d = Math.min(d, distSeg(px, py, 8.5, 3.5, 8.5, 7.5));
    d = Math.min(d, distSeg(px, py, 15.5, 3.5, 15.5, 7.5));
    return d;
  },
  chart(px, py) {
    let d = distSeg(px, py, 4, 4, 4, 19.5);
    d = Math.min(d, distSeg(px, py, 4, 19.5, 20, 19.5));
    d = Math.min(d, distSeg(px, py, 7.5, 15.5, 11, 10));
    d = Math.min(d, distSeg(px, py, 11, 10, 14, 13));
    d = Math.min(d, distSeg(px, py, 14, 13, 18.5, 6.5));
    return d;
  },
  gear(px, py) {
    let d = distCircleStroke(px, py, 12, 12, 7);
    d = Math.min(d, distCircleStroke(px, py, 12, 12, 3));
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const x1 = 12 + Math.cos(a) * 8.3, y1 = 12 + Math.sin(a) * 8.3;
      const x2 = 12 + Math.cos(a) * 10.4, y2 = 12 + Math.sin(a) * 10.4;
      d = Math.min(d, distSeg(px, py, x1, y1, x2, y2));
    }
    return d;
  }
};

/* ---------- 光栅化：返回 RGBA buffer（81x81） ---------- */
function rasterize(distFn, rgb) {
  const N = SIZE * SS;
  const cov = new Float32Array(N * N);
  const half = SW * SS / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const vx = (x + 0.5) / SS / K, vy = (y + 0.5) / SS / K;
      const d = distFn(vx, vy) * K * SS; // 距离换算到超采样像素
      // 1px 宽平滑过渡带
      cov[y * N + x] = Math.max(0, Math.min(1, half + 0.75 - d));
    }
  }
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++)
          a += cov[(y * SS + sy) * N + (x * SS + sx)];
      a /= SS * SS;
      const i = (y * SIZE + x) * 4;
      out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2];
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/* ---------- 纯 JS PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 生成 ---------- */
const outDir = path.join(__dirname, '..', 'miniprogram', 'images', 'icons');
for (const name of Object.keys(ICONS)) {
  for (const [suffix, rgb] of [['', NORMAL], ['-active', ACTIVE]]) {
    const file = path.join(outDir, `tab-${name}${suffix}.png`);
    fs.writeFileSync(file, encodePNG(rasterize(ICONS[name], rgb), SIZE));
    console.log('written', path.relative(process.cwd(), file));
  }
}
