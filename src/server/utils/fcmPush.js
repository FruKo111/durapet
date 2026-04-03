const { supabaseAdmin } = require("../supabase");

let fcmInitDenendi = false;
let fcmInitOk = false;

function fcmHazirMi() {
  if (fcmInitDenendi) return fcmInitOk;
  fcmInitDenendi = true;
  try {
    // eslint-disable-next-line global-require
    const admin = require("firebase-admin");
    const jsonHam = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (jsonHam) {
      const cred = JSON.parse(jsonHam);
      admin.initializeApp({ credential: admin.credential.cert(cred) });
      fcmInitOk = true;
      return true;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      fcmInitOk = true;
      return true;
    }
  } catch (e) {
    console.warn("[FCM] Baslatilamadi (opsiyonel):", e.message);
  }
  return false;
}

/**
 * Tek kullaniciya bildirim gonderir. Sunucuda FIREBASE_SERVICE_ACCOUNT_JSON veya
 * GOOGLE_APPLICATION_CREDENTIALS tanimli degilse sessizce atlanir.
 */
async function fcmKullaniciyaGonder({
  kullanici_id,
  baslik,
  icerik,
  data = {},
}) {
  if (!fcmHazirMi()) {
    return { gonderildi: false, neden: "fcm_yapilandirma_yok" };
  }
  // eslint-disable-next-line global-require
  const admin = require("firebase-admin");

  const { data: u, error } = await supabaseAdmin
    .from("kullanicilar")
    .select("id, fcm_token")
    .eq("id", kullanici_id)
    .maybeSingle();

  if (error) {
    console.warn("[FCM] Kullanici sorgusu:", error.message);
    return { gonderildi: false, neden: "db_hata" };
  }
  const token = u?.fcm_token;
  if (!token || String(token).length < 10) {
    return { gonderildi: false, neden: "token_yok" };
  }

  const govde = String(icerik || "").slice(0, 500);
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[String(k).slice(0, 40)] = v == null ? "" : String(v).slice(0, 500);
  }

  try {
    await admin.messaging().send({
      token,
      notification: {
        title: String(baslik || "DuraPet").slice(0, 100),
        body: govde,
      },
      data: stringData,
      android: {
        priority: "high",
        notification: {
          channelId: "durapet_alerts",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });
    return { gonderildi: true };
  } catch (e) {
    const kod = e.code || "";
    if (
      kod === "messaging/registration-token-not-registered" ||
      kod === "messaging/invalid-registration-token"
    ) {
      await supabaseAdmin
        .from("kullanicilar")
        .update({ fcm_token: null, fcm_guncelleme: new Date().toISOString() })
        .eq("id", kullanici_id);
    }
    console.warn("[FCM] Gonderim:", kod || e.message);
    return { gonderildi: false, neden: kod || e.message };
  }
}

module.exports = { fcmKullaniciyaGonder, fcmHazirMi };
