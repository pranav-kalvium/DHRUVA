/**
 * make-phone-frames.mjs
 * Composites each screenshot inside a phone-frame SVG overlay using sharp.
 *
 * Strategy (3-layer):
 *  Layer 1: phone body + screen BG  (bottom SVG — everything except the screen window)
 *  Layer 2: screenshot resized to exact screen dimensions  (middle)
 *  Layer 3: bezel-only overlay  (top SVG — just the frame border, camera dot, buttons, etc.)
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const SRC       = path.join(ROOT, "assets", "screenshots");
const DST       = path.join(ROOT, "assets", "screenshots");
const ASSETS    = path.join(ROOT, "assets");

// ─── Phone dimensions ──────────────────────────────────────────────────────
const PW        = 500;   // total frame width (px)
const PH        = 1000;  // total frame height (px)
const BEZ_LR    = 30;    // left & right bezel
const BEZ_TOP   = 80;    // top bezel (status bar + camera pill)
const BEZ_BOT   = 60;    // bottom bezel (nav bar)
const RADIUS    = 48;    // outer corner radius
const SCR_RADIUS= 8;     // inner screen corner radius
const SCR_W     = PW - BEZ_LR * 2;   // 440
const SCR_H     = PH - BEZ_TOP - BEZ_BOT; // 860
const BODY_COL  = "#111927";          // phone body
const EDGE_COL  = "#1e2d3f";          // edge highlight
const BG_COL    = "#070e1b";          // canvas background
const CAM_X     = PW / 2;
const CAM_Y     = BEZ_TOP / 2;
const CAM_R     = 8;

// ─── Layer 1: phone body + screen window area (filled white) ───────────────
function bodyLayer() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">
    <defs>
      <filter id="sh">
        <feDropShadow dx="0" dy="10" stdDeviation="22" flood-color="#000" flood-opacity="0.7"/>
      </filter>
    </defs>
    <!-- BG -->
    <rect width="${PW}" height="${PH}" fill="${BG_COL}"/>
    <!-- Phone body shadow -->
    <rect x="4" y="4" width="${PW-8}" height="${PH-8}" rx="${RADIUS}" ry="${RADIUS}" fill="${BODY_COL}" filter="url(#sh)"/>
    <!-- Phone body -->
    <rect x="4" y="4" width="${PW-8}" height="${PH-8}" rx="${RADIUS}" ry="${RADIUS}" fill="${BODY_COL}" stroke="${EDGE_COL}" stroke-width="1.5"/>
    <!-- Screen window (white / transparent area where screenshot goes) -->
    <rect x="${BEZ_LR}" y="${BEZ_TOP}" width="${SCR_W}" height="${SCR_H}" rx="${SCR_RADIUS}" ry="${SCR_RADIUS}" fill="#ffffff"/>
  </svg>`);
}

// ─── Layer 3: bezel-only overlay (transparent inside screen area) ──────────
function bezelOverlay() {
  // We punch a transparent hole exactly where the screen is, and draw all
  // chrome elements around it.
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}">
    <defs>
      <!-- Clip everything except the screen hole -->
      <mask id="bezelMask">
        <rect width="${PW}" height="${PH}" fill="white"/>
        <rect x="${BEZ_LR}" y="${BEZ_TOP}" width="${SCR_W}" height="${SCR_H}" rx="${SCR_RADIUS}" ry="${SCR_RADIUS}" fill="black"/>
      </mask>
    </defs>

    <!-- Phone body re-drawn on top, masked so screen area is transparent -->
    <rect x="4" y="4" width="${PW-8}" height="${PH-8}" rx="${RADIUS}" ry="${RADIUS}"
          fill="${BODY_COL}" stroke="${EDGE_COL}" stroke-width="1.5" mask="url(#bezelMask)"/>

    <!-- Top bezel: camera pill -->
    <rect x="${CAM_X - 28}" y="${CAM_Y - 9}" width="56" height="18" rx="9" fill="#0a1422"/>
    <!-- Punch-hole camera -->
    <circle cx="${CAM_X}" cy="${CAM_Y}" r="${CAM_R}" fill="#070e1b"/>
    <circle cx="${CAM_X}" cy="${CAM_Y}" r="4" fill="#0a1520"/>

    <!-- Screen border / inner edge -->
    <rect x="${BEZ_LR}" y="${BEZ_TOP}" width="${SCR_W}" height="${SCR_H}"
          rx="${SCR_RADIUS}" ry="${SCR_RADIUS}"
          fill="none" stroke="#1a2840" stroke-width="1.5"/>

    <!-- Side buttons: volume -->
    <rect x="2" y="210" width="4" height="50" rx="2" fill="${EDGE_COL}"/>
    <rect x="2" y="276" width="4" height="50" rx="2" fill="${EDGE_COL}"/>
    <!-- Power -->
    <rect x="${PW-6}" y="240" width="4" height="70" rx="2" fill="${EDGE_COL}"/>

    <!-- Bottom home bar indicator -->
    <rect x="${PW/2-50}" y="${PH-28}" width="100" height="5" rx="2.5" fill="${EDGE_COL}" opacity="0.5"/>
  </svg>`);
}

// ─── Process one screenshot ────────────────────────────────────────────────
async function processOne({ src, dst }) {
  const srcPath = path.join(SRC, src);
  const dstPath = path.join(DST, dst);

  // Resize screenshot to fill the screen area exactly
  const screenshotBuf = await sharp(srcPath)
    .resize(SCR_W, SCR_H, { fit: "cover", position: "top" })
    .png()
    .toBuffer();

  const body   = bodyLayer();
  const bezel  = bezelOverlay();

  await sharp(body)
    .composite([
      { input: screenshotBuf, top: BEZ_TOP, left: BEZ_LR },  // layer 2: screenshot
      { input: bezel,          top: 0,       left: 0 },        // layer 3: bezel chrome
    ])
    .png({ compressionLevel: 7 })
    .toFile(dstPath);

  const stat = await import("fs").then(m => m.promises.stat(dstPath));
  console.log(`✓ ${dst}  (${(stat.size / 1024).toFixed(0)} KB)`);
}

// ─── GIF thumbnail (static first frame) ────────────────────────────────────
async function makeGifThumbnail() {
  const gifPath = path.join(ASSETS, "DHRUVA GIF.gif");
  const dstPath = path.join(ASSETS, "dhruva-gif-phone-thumb.png");

  try {
    const screenshotBuf = await sharp(gifPath, { pages: 1 })
      .resize(SCR_W, SCR_H, { fit: "cover", position: "top" })
      .png()
      .toBuffer();

    await sharp(bodyLayer())
      .composite([
        { input: screenshotBuf, top: BEZ_TOP, left: BEZ_LR },
        { input: bezelOverlay(), top: 0, left: 0 },
      ])
      .png({ compressionLevel: 7 })
      .toFile(dstPath);

    const stat = await import("fs").then(m => m.promises.stat(dstPath));
    console.log(`✓ dhruva-gif-phone-thumb.png  (${(stat.size / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.warn("⚠ GIF thumbnail failed:", e.message);
  }
}

// ─── Compress GIF (reduce to max-width 360px, fewer colours) ──────────────
async function compressGif() {
  const gifPath = path.join(ASSETS, "DHRUVA GIF.gif");
  const outPath = path.join(ASSETS, "dhruva-demo.gif");

  try {
    await sharp(gifPath, { animated: true, pages: -1, limitInputPixels: false })
      .resize({ width: 360, withoutEnlargement: true })
      .gif({ effort: 1, colours: 128, dither: 0 })
      .toFile(outPath);

    const inStat  = await import("fs").then(m => m.promises.stat(gifPath));
    const outStat = await import("fs").then(m => m.promises.stat(outPath));
    console.log(
      `✓ dhruva-demo.gif  ${(inStat.size/1e6).toFixed(1)} MB → ${(outStat.size/1e6).toFixed(1)} MB`
    );
  } catch (e) {
    console.warn("⚠ GIF compression failed:", e.message);
    // fallback: just copy the original and skip compression
    await import("fs").then(m => m.promises.copyFile(gifPath, outPath));
    console.log("  (copied original GIF without compression)");
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
const screenshots = [
  { src: "01-landing-screen.png",                 dst: "01-landing-screen-phone.png" },
  { src: "02-how-dhruva-works.png",               dst: "02-how-dhruva-works-phone.png" },
  { src: "03-tunnel-outage-visual.png",           dst: "03-tunnel-outage-visual-phone.png" },
  { src: "04-sensor-permissions.png",             dst: "04-sensor-permissions-phone.png" },
  { src: "05-live-navigation-dead-reckoning.png", dst: "05-live-navigation-dead-reckoning-phone.png" },
];

console.log("═══ Building phone-framed screenshots ════");
await Promise.all(screenshots.map(processOne));

console.log("\n═══ Compressing GIF ════");
await compressGif();

console.log("\n═══ GIF phone thumbnail ════");
await makeGifThumbnail();

console.log("\n✅ All done.");
