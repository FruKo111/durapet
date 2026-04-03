/**
 * Kök ./ kaldığında Hostinger sadece `npm run build` seçebiliyor.
 * Panel (durapet.com.tr): ortamda DURAPET_BUILD=web tanımla.
 * API (durapet.site): değişken yok (varsayılan api).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { resolveTarget, rawTargetEnv } = require("./hostinger-target");

const root = path.join(__dirname, "..");
const target = resolveTarget();
const raw = rawTargetEnv();
console.log(
  "[hostinger-build] hedef=%s (DURAPET_BUILD/BUILD_TARGET/HB_PANEL=%s)",
  target,
  raw === "" ? "bos -> api" : JSON.stringify(String(raw).trim())
);

if (target === "web") {
  const webDir = path.join(root, "web");
  const pkg = path.join(webDir, "package.json");
  if (!fs.existsSync(pkg)) {
    console.error("hostinger-build: web/package.json bulunamadi.");
    process.exit(1);
  }
  execSync("npm ci && npm run build", {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });
} else {
  fs.accessSync(path.join(root, "server", "index.js"));
  console.log("DuraPet API: derleme yok, server/index.js mevcut.");
  console.log(
    "[hostinger-build] UYARI: Next.js panel dağıtımıysa Hostinger'da ortam degiskeni ekleyin: DURAPET_BUILD=web (veya BUILD_TARGET=web). Aksi halde .next olusmaz."
  );
}
