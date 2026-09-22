/**
 * Serves the built APK over the LAN so the phone can download it directly:
 *   http://192.168.1.21:3100/apk
 *
 * Static file with explicit Android APK content type; zero dependencies.
 * Run: node scripts/serve-apk.mjs  (starts alongside the dev server, same port
 * family; the Next dev server itself cannot serve arbitrary root files.)
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const apkPath = join(root, "..", "DHRUVA-debug.apk");
const PORT = 3110;

if (!existsSync(apkPath)) {
  console.error("APK not found at", apkPath, "- run the gradle build first.");
  process.exit(1);
}

createServer((req, res) => {
  if (req.url === "/apk" || req.url === "/apk/") {
    const apk = readFileSync(apkPath);
    res.writeHead(200, {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": apk.length,
      "Content-Disposition": 'attachment; filename="DHRUVA-debug.apk"',
    });
    res.end(apk);
    console.log(`[serve-apk] ${new Date().toLocaleTimeString()} served APK (${(apk.length / 1e6).toFixed(1)} MB)`);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DHRUVA APK</title></head>` +
      `<body style="font-family:system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem">` +
      `<h1>DHRUVA Android app</h1><p>Tap to download the debug APK (5 MB):</p>` +
      `<p><a href="/apk" style="display:inline-block;background:#0a2540;color:#fff;padding:0.9rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:600">Download DHRUVA-debug.apk</a></p>` +
      `<p style="color:#555;font-size:0.9rem">After download: open the file, allow "Install unknown apps" for your browser when prompted, then Install.</p>` +
      `</body></html>`,
  );
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[serve-apk] APK server on http://0.0.0.0:${PORT}/apk`);
});
