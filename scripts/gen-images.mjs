/**
 * Generates brand PNG/ICO assets with zero dependencies using the shared
 * minimal PNG encoder. Output: public/favicon.ico (32px),
 * public/apple-touch-icon.png (180px), public/og.png (1200x630).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { encodePng } from "./png-lib.mjs";

const NAVY = [10, 37, 64];
const NAVY_DEEP = [7, 26, 44];
const ORANGE = [255, 107, 53];
const WHITE = [255, 255, 255];
const STEEL = [100, 129, 159];

class Canvas {
  constructor(w, h, bg) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = bg[0];
      this.data[i * 4 + 1] = bg[1];
      this.data[i * 4 + 2] = bg[2];
      this.data[i * 4 + 3] = 255;
    }
  }
  px(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }
  rect(x0, y0, w, h, c) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.px(x, y, c);
  }
  /** Thick line via Bresenham with squared brush. */
  line(x0, y0, x1, y1, c, t = 1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      const half = Math.floor(t / 2);
      this.rect(x - half, y - half, t, t, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  /** Four-point star (pole star) centered at cx,cy with radius r. */
  star(cx, cy, r, c) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        const thin = Math.max(Math.abs(dx), Math.abs(dy));
        if (d <= r * 0.55 || (thin <= Math.max(1, r * 0.14) && d <= r)) {
          this.px(Math.round(cx + dx), Math.round(cy + dy), c);
        }
      }
    }
  }
}

// 5x7 bitmap font, only the letters we need.
const FONT = {
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "11110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
};

function drawText(canvas, text, x, y, scale, color, spacing = 1) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) { cx += (5 + spacing) * scale; continue; }
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") {
          canvas.rect(cx + gx * scale, y + gy * scale, scale, scale, color);
        }
      }
    }
    cx += (5 + spacing) * scale;
  }
  return cx - x;
}

/** Draw the DHRUVA mark: orange pole star above an orange route arc. */
function drawMark(canvas, cx, cy, r) {
  canvas.star(cx, cy, r, ORANGE);
  const arcY = Math.round(cy + r * 1.8);
  const t = Math.max(2, Math.round(r * 0.28));
  // Bresenham needs integer endpoints or its termination check never fires.
  canvas.line(Math.round(cx - r * 2.4), Math.round(arcY + r * 0.6), Math.round(cx - r * 0.8), arcY, ORANGE, t);
  canvas.line(Math.round(cx - r * 0.8), arcY, Math.round(cx + r * 0.4), Math.round(arcY - r * 0.5), ORANGE, t);
}

function roundedSquare(size, radius, bg) {
  const c = new Canvas(size, size, bg);
  // Simulated rounded corners by knocking out corner pixels to transparency.
  const r2 = radius * radius;
  for (let y = 0; y < radius; y++) {
    for (let x = 0; x < radius; x++) {
      const dx = radius - x - 1, dy = radius - y - 1;
      if (dx * dx + dy * dy > r2) {
        for (const [px, py] of [[x, y], [size - 1 - x, y], [x, size - 1 - y], [size - 1 - x, size - 1 - y]]) {
          const i = (py * size + px) * 4;
          c.data[i + 3] = 0;
        }
      }
    }
  }
  return c;
}

// favicon.ico: 32x32 PNG wrapped in ICO container.
const favCanvas = roundedSquare(32, 6, NAVY);
drawMark(favCanvas, 16, 14, 7);
const favPng = encodePng(32, 32, favCanvas.data);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type icon
icoHeader.writeUInt16LE(1, 4); // count
const dirEntry = Buffer.alloc(16);
dirEntry[0] = 32; dirEntry[1] = 32; // width, height
dirEntry[2] = 0; dirEntry[3] = 0; // palette
dirEntry.writeUInt16LE(1, 4); // planes
dirEntry.writeUInt16LE(32, 6); // bpp
dirEntry.writeUInt32LE(favPng.length, 8);
dirEntry.writeUInt32LE(22, 12); // offset
mkdirSync("public", { recursive: true });
writeFileSync("public/favicon.ico", Buffer.concat([icoHeader, dirEntry, favPng]));

// apple-touch-icon.png: 180x180.
const touch = roundedSquare(180, 32, NAVY);
drawMark(touch, 90, 78, 40);
writeFileSync("public/apple-touch-icon.png", encodePng(180, 180, touch.data));

// og.png: 1200x630 navy, mark + wordmark + tagline bar.
const og = new Canvas(1200, 630, NAVY);
for (let x = 0; x < 1200; x++) {
  for (let y = 0; y < 630; y++) {
    if (y > 560) og.px(x, y, NAVY_DEEP);
  }
}
drawMark(og, 190, 220, 58);
drawText(og, "DHRUVA", 330, 170, 14, WHITE, 2);
og.rect(330, 300, 540, 6, ORANGE);
drawText(og, "DHRUVA", 330, 330, 6, STEEL, 1); // subtitle row (decorative)
og.rect(330, 420, 300, 4, STEEL);
og.rect(330, 440, 380, 4, STEEL);
writeFileSync("public/og.png", encodePng(1200, 630, og.data));

// PWA icons: maskable 192 and 512 (full-bleed navy, mark centered in the
// 80% safe zone so Android's adaptive-icon masking cannot clip the star).
for (const size of [192, 512]) {
  const c = new Canvas(size, size, NAVY);
  drawMark(c, Math.round(size / 2), Math.round(size * 0.4), Math.round(size * 0.16));
  writeFileSync(`public/pwa-${size}.png`, encodePng(size, size, c.data));
}

console.log("assets generated: favicon.ico, apple-touch-icon.png, og.png, pwa-192.png, pwa-512.png");
