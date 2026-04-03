/* eslint-disable no-console */
const BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";
const RUN_RATE_LIMIT = process.argv.includes("--rate-limit");

async function istek(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  let json = null;
  try {
    json = await response.json();
  } catch (_) {
    json = null;
  }
  return { response, json };
}

function sonucYaz(testAdi, ok, detay = "") {
  const icon = ok ? "PASS" : "FAIL";
  console.log(`[${icon}] ${testAdi}${detay ? ` -> ${detay}` : ""}`);
}

async function testDurum() {
  const { response, json } = await istek("/api/v1/durum");
  const ok = response.status === 200 && json?.durum === "hazir";
  sonucYaz("Durum endpoint", ok, `status=${response.status}`);
  if (!ok) {
    throw new Error("Durum endpoint beklenen cevabi donmedi.");
  }
}

async function testHealth() {
  const live = await istek("/health/live");
  const ready = await istek("/health/ready");
  const liveOk = live.response.status === 200 && live.json?.durum === "live";
  const readyOk = ready.response.status === 200 && ready.json?.durum === "ready";
  sonucYaz("Health live", liveOk, `status=${live.response.status}`);
  sonucYaz("Health ready", readyOk, `status=${ready.response.status}`);
  if (!liveOk || !readyOk) {
    throw new Error("Health endpoint testleri basarisiz.");
  }
}

async function testAuthKoruma() {
  const { response, json } = await istek("/api/v1/profilim");
  const ok = response.status === 401;
  const detay = `status=${response.status}, kod=${json?.kod || "yok"}`;
  sonucYaz("Auth koruma (/profilim)", ok, detay);
  if (!ok) {
    throw new Error("Auth koruma testi basarisiz.");
  }
}

async function testAuthKorumaPost() {
  const { response, json } = await istek("/api/v1/sahip/randevular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const ok = response.status === 401;
  const detay = `status=${response.status}, kod=${json?.kod || "yok"}`;
  sonucYaz("Auth koruma (POST /sahip/randevular)", ok, detay);
  if (!ok) {
    throw new Error("POST auth koruma testi basarisiz.");
  }
}

async function testRateLimit() {
  let limitYakalandi = false;
  for (let i = 0; i < 240; i += 1) {
    const { response } = await istek("/api/v1/durum");
    if (response.status === 429) {
      limitYakalandi = true;
      break;
    }
  }

  sonucYaz("Rate limit", limitYakalandi, limitYakalandi ? "429 yakalandi" : "429 yakalanmadi");
  if (!limitYakalandi) {
    throw new Error("Rate limit testi basarisiz.");
  }
}

async function calistir() {
  console.log(`API smoke test basladi: ${BASE_URL}`);
  await testDurum();
  await testHealth();
  await testAuthKoruma();
  await testAuthKorumaPost();

  if (RUN_RATE_LIMIT) {
    await testRateLimit();
  } else {
    console.log("[SKIP] Rate limit testi (calistirmak icin --rate-limit kullan)");
  }

  console.log("Tum smoke testler basarili.");
}

calistir().catch((err) => {
  console.error("Smoke test hatasi:", err.message);
  process.exit(1);
});

