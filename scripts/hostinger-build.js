/**
 * Kök ./ kaldığında Hostinger sadece `npm run build` seçebiliyor.
 * Panel (durapet.com.tr): ortamda DURAPET_BUILD=web tanımla.
 * API (durapet.site): değişken yok (varsayılan api).
 */
const { execSync, spawnSync } = require("child_process");
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

function webBuildEnvKontrol() {
  const eksik = [];
  if (!String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim()) {
    eksik.push("NEXT_PUBLIC_API_BASE_URL (orn. https://durapet.site)");
  }
  if (!String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()) {
    eksik.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (
    !String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim() &&
    !String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "").trim()
  ) {
    eksik.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY veya NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    );
  }
  if (
    !String(process.env.NEXT_PUBLIC_SITE_URL || "").trim() &&
    !String(process.env.NEXT_PUBLIC_QR_PUBLIC_BASE_URL || "").trim()
  ) {
    eksik.push("NEXT_PUBLIC_SITE_URL veya NEXT_PUBLIC_QR_PUBLIC_BASE_URL (orn. https://durapet.com.tr)");
  }
  if (eksik.length) {
    console.error(
      "[hostinger-build] Next build icin Hostinger'da su ortam degiskenleri ZORUNLU (derleme oncesi, bos birakma):"
    );
    eksik.forEach((satir) => console.error("  - " + satir));
    console.error(
      "[hostinger-build] Bunlar olmadan web/src/lib/supabase-browser.ts ve public-env.ts modul yuklemesinde hata olur."
    );
    process.exit(1);
  }
}

function webNodeSurumKontrol() {
  const m = /^v(\d+)\.(\d+)/.exec(process.version);
  const major = m ? parseInt(m[1], 10) : 0;
  const minor = m ? parseInt(m[2], 10) : 0;
  const ok = major > 20 || (major === 20 && minor >= 9);
  if (!ok) {
    console.error(
      `[hostinger-build] Next.js 16 icin Node.js >= 20.9.0 gerekli. Su an: ${process.version}.`
    );
    console.error(
      "[hostinger-build] Hostinger → durapet.com.tr → Ayarlar → Düğüm sürümü: 20.x veya 22.x secin, kaydedip yeniden dagitin."
    );
    process.exit(1);
  }
}

function webBagimlilikKur(webDir) {
  try {
    execSync("npm ci", { cwd: webDir, stdio: "inherit", env: process.env });
  } catch {
    console.warn("[hostinger-build] npm ci basarisiz; npm install deneniyor...");
    execSync("npm install", { cwd: webDir, stdio: "inherit", env: process.env });
  }
}

function webNextDerle(webDir) {
  const sonuc = spawnSync("npm", ["run", "build"], {
    cwd: webDir,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (sonuc.stdout) process.stdout.write(sonuc.stdout);
  if (sonuc.stderr) process.stderr.write(sonuc.stderr);
  if (sonuc.status !== 0) {
    console.error("[hostinger-build] npm run build cikis kodu:", sonuc.status ?? 1);
    if (sonuc.error) console.error("[hostinger-build]", sonuc.error);
    process.exit(sonuc.status ?? 1);
  }
}

if (target === "web") {
  const webDir = path.join(root, "web");
  const pkg = path.join(webDir, "package.json");
  if (!fs.existsSync(pkg)) {
    console.error("hostinger-build: web/package.json bulunamadi.");
    process.exit(1);
  }
  webBuildEnvKontrol();
  webNodeSurumKontrol();
  webBagimlilikKur(webDir);
  webNextDerle(webDir);
} else {
  fs.accessSync(path.join(root, "server", "index.js"));
  console.log("DuraPet API: derleme yok, server/index.js mevcut.");
  console.log(
    "[hostinger-build] UYARI: Next.js panel dağıtımıysa Hostinger'da ortam degiskeni ekleyin: DURAPET_BUILD=web (veya BUILD_TARGET=web). Aksi halde .next olusmaz."
  );
}
