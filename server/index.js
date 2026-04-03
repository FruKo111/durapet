require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const crypto = require("crypto");
const v1Router = require("./routes/v1");
const { hata } = require("./utils/http");
const { guvenlikLoguYaz } = require("./utils/log");
const { endpointAnahtariAl, istekBaslat, istekBitir } = require("./utils/metrics");
const { fallbackKuyruguIsle } = require("./utils/notify");
const { supabaseAdmin } = require("./supabase");

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const productionModu = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.istekId = crypto.randomUUID();
  res.setHeader("X-Istek-Id", req.istekId);
  req.istekBaslangic = process.hrtime.bigint();
  istekBaslat();

  res.on("finish", () => {
    const bitis = process.hrtime.bigint();
    const sureMs = Number(bitis - req.istekBaslangic) / 1_000_000;
    const endpoint = endpointAnahtariAl(req);
    istekBitir({
      endpoint,
      durumKodu: res.statusCode,
      sureMs,
    });
  });
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
const izinliOriginler = (process.env.CORS_ORIGINS || "")
  .split(/[;,]/)
  .map((x) => x.trim())
  .filter(Boolean);

if (productionModu && izinliOriginler.length === 0) {
  throw new Error("Production modunda CORS_ORIGINS zorunludur.");
}

function originIzinliMi(origin) {
  if (!origin) return true;
  if (izinliOriginler.length === 0) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  }
  return izinliOriginler.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!originIzinliMi(origin)) {
    return hata(res, 403, "CORS_ENGELI", "Bu origin icin erisim izni yok.");
  }
  return next();
});

app.use(
  cors({
    origin(origin, cb) {
      return cb(null, originIzinliMi(origin));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));

const apiLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const auth = req.headers.authorization || "";
    const tokenParcasi = auth.startsWith("Bearer ") ? auth.slice(7, 32) : "";
    const ipAnahtari = ipKeyGenerator(req.ip || "");
    const ham = `${ipAnahtari}|${tokenParcasi}|${req.path || ""}`;
    return crypto.createHash("sha256").update(ham).digest("hex");
  },
  message: {
    kod: "COK_FAZLA_ISTEK",
    hata: "Cok fazla istek gonderildi. Lutfen biraz bekleyin.",
    detay: null,
  },
});

app.get("/", (req, res) => {
  res.json({
    servis: "durapet-api",
    surum: "v1",
    durum: "hazir",
  });
});

app.get("/health/live", (req, res) => {
  return res.status(200).json({ durum: "live", servis: "durapet-api-v1" });
});

app.get("/health/ready", async (req, res) => {
  const { error } = await supabaseAdmin.from("roller").select("id").limit(1);
  if (error) {
    return res.status(503).json({ durum: "not_ready" });
  }
  return res.status(200).json({ durum: "ready", servis: "durapet-api-v1" });
});

app.use("/api/v1", apiLimit, v1Router);
// Tanımsız /api/v1/* istekleri HTML 404 yerine JSON dönsün (mobil istemci ayrıştırabilsin).
app.use("/api/v1", (req, res) => {
  return hata(res, 404, "ENDPOINT_BULUNAMADI", "Istenen API yolu bulunamadi.", {
    method: req.method,
    yol: req.originalUrl || req.url,
  });
});

app.use((err, req, res, next) => {
  console.error("Beklenmeyen hata:", req.istekId, err);
  guvenlikLoguYaz({
    seviye: "kritik",
    olay_turu: "api_beklenmeyen_hata",
    aciklama: `Istek ${req.istekId}: ${err?.message || "Bilinmeyen hata"}`,
    iliskili_kullanici_id: req.kullanici?.id || null,
  }).catch(() => {});
  return hata(res, 500, "SUNUCU_HATASI", "Beklenmeyen sunucu hatasi.", {
    istek_id: req.istekId,
  });
});

const server = app.listen(port, host, () => {
  console.log(`DuraPet API calisiyor: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  if (host === "0.0.0.0") {
    console.log("LAN uzerinden telefon/emulator: Mac'in Wi-Fi IP'sini kullan (ornek http://192.168.x.x:4000)");
  }
});

let fallbackWorkerTimer = null;
if (String(process.env.FALLBACK_WORKER_ENABLED || "false").toLowerCase() === "true") {
  const intervalMs = Math.max(5000, Number(process.env.FALLBACK_WORKER_INTERVAL_MS || 30000));
  const batchSize = Math.max(1, Math.min(100, Number(process.env.FALLBACK_WORKER_BATCH_SIZE || 20)));
  fallbackWorkerTimer = setInterval(async () => {
    try {
      const sonuc = await fallbackKuyruguIsle(batchSize);
      if (sonuc.hata) {
        console.error("Fallback worker hatasi:", sonuc.hata);
      } else if ((sonuc.sonuc || []).length > 0) {
        console.log(`Fallback worker: ${sonuc.sonuc.length} kayit islendi.`);
      }
    } catch (err) {
      console.error("Fallback worker beklenmeyen hata:", err?.message || err);
    }
  }, intervalMs);
  console.log(`Fallback worker aktif. interval=${intervalMs}ms batch=${batchSize}`);
}

server.on("error", (err) => {
  console.error("API sunucusu baslatilamadi:", err);
  process.exitCode = 1;
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
  guvenlikLoguYaz({
    seviye: "kritik",
    olay_turu: "node_unhandled_rejection",
    aciklama: String(err?.message || err || "Bilinmeyen hata"),
  }).catch(() => {});
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  guvenlikLoguYaz({
    seviye: "kritik",
    olay_turu: "node_uncaught_exception",
    aciklama: String(err?.message || err || "Bilinmeyen hata"),
  }).catch(() => {});
});

process.on("beforeExit", (code) => {
  if (fallbackWorkerTimer) clearInterval(fallbackWorkerTimer);
  console.warn("Node process kapanmak uzere. Kod:", code);
});

