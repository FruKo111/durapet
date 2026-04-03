const { supabaseAdmin } = require("../supabase");
const { secretCoz } = require("./secrets");

function telefonNormalizeEt(telefon) {
  const ham = String(telefon || "").trim();
  if (!ham) return "";
  const sade = ham.replace(/[^\d+]/g, "");
  if (!sade) return "";
  if (sade.startsWith("+")) return sade;
  const sadeceRakam = sade.replace(/\D/g, "");
  if (!sadeceRakam) return "";
  // TR yerel: 10 hane (5xx...) -> +90xxxxxxxxxx
  if (sadeceRakam.length === 10) return `+90${sadeceRakam}`;
  // TR yerel: 11 hane (0 5xx...) -> +90xxxxxxxxxx
  if (sadeceRakam.length === 11 && sadeceRakam.startsWith("0")) return `+9${sadeceRakam}`;
  // Ulke kodu ile: 90xxxxxxxxxx -> +90xxxxxxxxxx
  if (sadeceRakam.startsWith("90")) return `+${sadeceRakam}`;
  return `+${sadeceRakam}`;
}

async function hedefTelefonuGetir(kullaniciId) {
  const { data, error } = await supabaseAdmin
    .from("kullanicilar")
    .select("id, telefon")
    .eq("id", kullaniciId)
    .maybeSingle();
  if (error) return { hata: error.message, telefon: "" };
  return { hata: null, telefon: telefonNormalizeEt(data?.telefon) };
}

async function veterinerKlinikKoduGetir(veterinerId) {
  if (!veterinerId) return { hata: null, klinikKodu: null };
  const sonuc = await supabaseAdmin
    .from("veteriner_profilleri")
    .select("id, klinik_kodu")
    .eq("id", veterinerId)
    .maybeSingle();
  if (sonuc.error) {
    const kolonYok = String(sonuc.error.message || "").includes("klinik_kodu");
    if (!kolonYok) return { hata: sonuc.error.message, klinikKodu: null };
    return { hata: null, klinikKodu: null };
  }
  return { hata: null, klinikKodu: sonuc.data?.klinik_kodu || null };
}

async function klinikBildirimAyariGetir(klinikKodu) {
  if (!klinikKodu) return { hata: null, ayar: null };
  let { data, error } = await supabaseAdmin
    .from("klinik_bildirim_ayarlari")
    .select(
      "klinik_kodu, provider, twilio_account_sid, twilio_auth_token, twilio_whatsapp_from, webhook_url, webhook_token, infobip_base_url, infobip_api_key, infobip_sender, aktif"
    )
    .eq("klinik_kodu", klinikKodu)
    .maybeSingle();
  if (
    error &&
    (String(error.message || "").includes("infobip_base_url") ||
      String(error.message || "").includes("infobip_api_key") ||
      String(error.message || "").includes("infobip_sender"))
  ) {
    const eski = await supabaseAdmin
      .from("klinik_bildirim_ayarlari")
      .select("klinik_kodu, provider, twilio_account_sid, twilio_auth_token, twilio_whatsapp_from, webhook_url, webhook_token, aktif")
      .eq("klinik_kodu", klinikKodu)
      .maybeSingle();
    data = eski.data ? { ...eski.data, infobip_base_url: null, infobip_api_key: null, infobip_sender: null } : eski.data;
    error = eski.error;
  }
  if (error) {
    const tabloYok = String(error.message || "").includes("klinik_bildirim_ayarlari");
    if (tabloYok) return { hata: null, ayar: null };
    return { hata: error.message, ayar: null };
  }
  if (!data || data.aktif === false) return { hata: null, ayar: null };
  data.twilio_auth_token = data.twilio_auth_token ? secretCoz(data.twilio_auth_token) : null;
  data.webhook_token = data.webhook_token ? secretCoz(data.webhook_token) : null;
  data.infobip_api_key = data.infobip_api_key ? secretCoz(data.infobip_api_key) : null;
  return { hata: null, ayar: data };
}

async function webhookIleGonder({ kanal, mesaj, telefon, ayar = null }) {
  const url = ayar?.webhook_url || process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return { hata: "NOTIFY_WEBHOOK_URL tanimli degil.", disMesajId: null };

  const token = ayar?.webhook_token || process.env.NOTIFY_WEBHOOK_TOKEN;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kanal, mesaj, telefon }),
  });
  const metin = await response.text();
  if (!response.ok) {
    return { hata: `Webhook gonderimi basarisiz (${response.status}): ${metin.slice(0, 300)}`, disMesajId: null };
  }
  return { hata: null, disMesajId: `webhook-${Date.now()}` };
}

async function twilioWhatsAppIleGonder({ mesaj, telefon, ayar = null }) {
  const sid = ayar?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const token = ayar?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const from = ayar?.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    return { hata: "Twilio ayarlari eksik (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM).", disMesajId: null };
  }

  const body = new URLSearchParams();
  body.set("From", `whatsapp:${from}`);
  body.set("To", `whatsapp:${telefon}`);
  body.set("Body", mesaj);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    json = {};
  }
  if (!response.ok) {
    return { hata: `Twilio gonderimi basarisiz (${response.status}): ${JSON.stringify(json).slice(0, 300)}`, disMesajId: null };
  }
  return { hata: null, disMesajId: json?.sid || `twilio-${Date.now()}` };
}

async function infobipWhatsAppIleGonder({ mesaj, telefon, ayar = null }) {
  const baseUrl = String(ayar?.infobip_base_url || "").replace(/\/+$/, "");
  const apiKey = ayar?.infobip_api_key || "";
  const from = ayar?.infobip_sender || "";
  if (!baseUrl || !apiKey || !from) {
    return { hata: "Infobip ayarlari eksik (infobip_base_url, infobip_api_key, infobip_sender).", disMesajId: null };
  }

  const response = await fetch(`${baseUrl}/whatsapp/1/message/text`, {
    method: "POST",
    headers: {
      Authorization: `App ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from,
      to: telefon,
      content: {
        text: mesaj,
      },
    }),
  });

  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    json = {};
  }
  if (!response.ok) {
    return { hata: `Infobip gonderimi basarisiz (${response.status}): ${JSON.stringify(json).slice(0, 300)}`, disMesajId: null };
  }
  const disMesajId = json?.messages?.[0]?.messageId || json?.requestId || `infobip-${Date.now()}`;
  return { hata: null, disMesajId };
}

async function disKanalaGonder({ kanal, mesaj, telefon, ayar = null }) {
  const provider = String(ayar?.provider || process.env.NOTIFY_PROVIDER || "mock").toLowerCase();
  if (provider === "webhook") {
    return webhookIleGonder({ kanal, mesaj, telefon, ayar });
  }
  if (provider === "twilio" && kanal === "whatsapp") {
    return twilioWhatsAppIleGonder({ mesaj, telefon, ayar });
  }
  if (provider === "infobip" && kanal === "whatsapp") {
    return infobipWhatsAppIleGonder({ mesaj, telefon, ayar });
  }
  return { hata: null, disMesajId: `mock-${kanal}-${Date.now()}` };
}

async function bildirimOlustur({
  kullanici_id,
  tur,
  baslik,
  icerik,
  referans_oda_id = null,
  referans_hayvan_id = null,
  referans_randevu_id = null,
  referans_enlem = null,
  referans_boylam = null,
  mesaj_sablon_adi = null,
  kaynak_veteriner_id = null,
  klinik_kodu = null,
  kanal = "push",
  fallback_kanal = "whatsapp",
  fallback_tetikle = false,
  ekstra_fcm_data = null,
}) {
  let klinikKodu = klinik_kodu;
  if (!klinikKodu && kaynak_veteriner_id) {
    const sonuc = await veterinerKlinikKoduGetir(kaynak_veteriner_id);
    if (sonuc.hata) return { hata: sonuc.hata, bildirim: null };
    klinikKodu = sonuc.klinikKodu;
  }
  const payload = {
    kullanici_id,
    tur,
    baslik,
    icerik,
    kanal,
    durum: "bekliyor",
    referans_oda_id,
    referans_hayvan_id,
    referans_randevu_id,
    referans_enlem,
    referans_boylam,
    mesaj_sablon_adi,
    kaynak_veteriner_id,
    klinik_kodu: klinikKodu || null,
    gonderim_zamani: new Date().toISOString(),
    fallback_kanal,
    fallback_durum: fallback_tetikle ? "sirada" : "beklemede",
  };

  let { data, error } = await supabaseAdmin
    .from("bildirimler")
    .insert(payload)
    .select("id, kullanici_id, tur, baslik, durum, kanal, fallback_kanal, fallback_durum, retry_sayisi")
    .single();
  const kolondanKaynakliHata =
    String(error?.message || "").includes("referans_hayvan_id") ||
    String(error?.message || "").includes("referans_randevu_id") ||
    String(error?.message || "").includes("referans_enlem") ||
    String(error?.message || "").includes("referans_boylam") ||
    String(error?.message || "").includes("mesaj_sablon_adi") ||
    String(error?.message || "").includes("kaynak_veteriner_id") ||
    String(error?.message || "").includes("klinik_kodu");
  if (error && kolondanKaynakliHata) {
    const eskiUyumluPayload = {
      kullanici_id,
      tur,
      baslik,
      icerik,
      kanal,
      durum: "bekliyor",
      referans_oda_id,
      referans_hayvan_id,
      referans_randevu_id,
      gonderim_zamani: new Date().toISOString(),
      fallback_kanal,
      fallback_durum: fallback_tetikle ? "sirada" : "beklemede",
    };
    const tekrar = await supabaseAdmin
      .from("bildirimler")
      .insert(eskiUyumluPayload)
      .select("id, kullanici_id, tur, baslik, durum, kanal, fallback_kanal, fallback_durum, retry_sayisi")
      .single();
    data = tekrar.data;
    error = tekrar.error;
  }
  if (error) return { hata: error.message, bildirim: null };

  try {
    const { fcmKullaniciyaGonder } = require("./fcmPush");
    const temelData = {
      tur: String(tur || ""),
      bildirim_id: String(data.id),
      referans_oda_id: referans_oda_id != null ? String(referans_oda_id) : "",
      referans_randevu_id: referans_randevu_id != null ? String(referans_randevu_id) : "",
      referans_hayvan_id: referans_hayvan_id != null ? String(referans_hayvan_id) : "",
      referans_enlem: referans_enlem != null && Number.isFinite(Number(referans_enlem)) ? String(referans_enlem) : "",
      referans_boylam: referans_boylam != null && Number.isFinite(Number(referans_boylam)) ? String(referans_boylam) : "",
    };
    const ek = ekstra_fcm_data && typeof ekstra_fcm_data === "object" ? ekstra_fcm_data : {};
    void fcmKullaniciyaGonder({
      kullanici_id,
      baslik,
      icerik,
      data: { ...temelData, ...ek },
    }).catch(() => {});
  } catch (_) {
    /* fcm modulu yok / firebase kurulu degil */
  }

  if (fallback_tetikle) {
    const fallback = await fallbackDenemeYap(data.id, {
      kanal: fallback_kanal,
      mesaj: icerik,
    });
    if (fallback.hata) {
      return { hata: fallback.hata, bildirim: data };
    }
    data = {
      ...data,
      fallback_durum: fallback.fallback_durum || data.fallback_durum,
      dis_kanal_mesaj_id: fallback.dis_kanal_mesaj_id || null,
      son_hata: fallback.son_hata || null,
      retry_sayisi: Number(fallback.retry_sayisi ?? data.retry_sayisi ?? 0),
    };
  }

  return { hata: null, bildirim: data };
}

async function fallbackDenemeYap(bildirimId, { kanal = "whatsapp", mesaj = "" } = {}) {
  let { data: mevcut, error: mevcutHata } = await supabaseAdmin
    .from("bildirimler")
    .select("id, kullanici_id, retry_sayisi, klinik_kodu, kaynak_veteriner_id")
    .eq("id", bildirimId)
    .maybeSingle();
  if (mevcutHata && String(mevcutHata.message || "").includes("klinik_kodu")) {
    const tekrar = await supabaseAdmin.from("bildirimler").select("id, kullanici_id, retry_sayisi").eq("id", bildirimId).maybeSingle();
    mevcut = tekrar.data;
    mevcutHata = tekrar.error;
  }
  if (mevcutHata) return { hata: mevcutHata.message };
  if (!mevcut) return { hata: "Bildirim bulunamadi." };

  const telefonSonuc = await hedefTelefonuGetir(mevcut.kullanici_id);
  if (telefonSonuc.hata) return { hata: telefonSonuc.hata };
  if (!telefonSonuc.telefon) {
    const { error } = await supabaseAdmin
      .from("bildirimler")
      .update({
        fallback_durum: "hata",
        son_hata: "Hedef kullanici telefon bilgisi bos.",
        son_denemede: new Date().toISOString(),
        retry_sayisi: Number(mevcut.retry_sayisi || 0) + 1,
      })
      .eq("id", bildirimId);
    if (error) return { hata: error.message };
    return {
      hata: null,
      dis_kanal_mesaj_id: null,
      fallback_durum: "hata",
      son_hata: "Hedef kullanici telefon bilgisi bos.",
      retry_sayisi: Number(mevcut.retry_sayisi || 0) + 1,
    };
  }

  let guncel = {
    fallback_durum: "gonderildi",
    son_hata: null,
    dis_kanal_mesaj_id: null,
    son_denemede: new Date().toISOString(),
  };
  if (mesaj.length > 1200) {
    guncel.fallback_durum = "hata";
    guncel.son_hata = "Mesaj dis kanal limiti asiyor.";
  } else {
    let klinikKodu = mevcut.klinik_kodu || null;
    if (!klinikKodu && mevcut.kaynak_veteriner_id) {
      const kodSonuc = await veterinerKlinikKoduGetir(mevcut.kaynak_veteriner_id);
      if (kodSonuc.hata) return { hata: kodSonuc.hata };
      klinikKodu = kodSonuc.klinikKodu;
    }
    const ayarSonuc = await klinikBildirimAyariGetir(klinikKodu);
    if (ayarSonuc.hata) return { hata: ayarSonuc.hata };
    const gonderim = await disKanalaGonder({ kanal, mesaj, telefon: telefonSonuc.telefon, ayar: ayarSonuc.ayar });
    if (gonderim.hata) {
      guncel.fallback_durum = "hata";
      guncel.son_hata = gonderim.hata;
    } else {
      guncel.dis_kanal_mesaj_id = gonderim.disMesajId;
    }
  }

  const { error } = await supabaseAdmin
    .from("bildirimler")
    .update({
      ...guncel,
      retry_sayisi: Number(mevcut.retry_sayisi || 0) + 1,
    })
    .eq("id", bildirimId);
  if (error) return { hata: error.message };

  return {
    hata: null,
    dis_kanal_mesaj_id: guncel.dis_kanal_mesaj_id,
    fallback_durum: guncel.fallback_durum,
    son_hata: guncel.son_hata || null,
    retry_sayisi: Number(mevcut.retry_sayisi || 0) + 1,
  };
}

function yenidenDenemeBeklemeMs(retrySayisi) {
  const taban = Math.max(1000, Number(process.env.NOTIFY_BACKOFF_BASE_MS || 30_000));
  const ustSinir = Math.max(taban, Number(process.env.NOTIFY_BACKOFF_MAX_MS || 15 * 60_000));
  const deneme = Math.max(0, Number(retrySayisi || 0));
  // retry=0 -> hemen, retry=1 -> taban, retry=2 -> 2x ...
  if (deneme === 0) return 0;
  const ms = taban * 2 ** (deneme - 1);
  return Math.min(ustSinir, ms);
}

function islemeHazirMi(kayit, nowMs) {
  const retry = Number(kayit.retry_sayisi || 0);
  const bekleme = yenidenDenemeBeklemeMs(retry);
  if (bekleme === 0) return true;
  const sonDenemeMs = kayit.son_denemede ? new Date(kayit.son_denemede).getTime() : 0;
  if (!sonDenemeMs) return true;
  return nowMs - sonDenemeMs >= bekleme;
}

async function fallbackKuyruguIsle(limit = 20) {
  const maxRetry = Number(process.env.NOTIFY_MAX_RETRY || 3);
  const guvenliLimit = Math.max(1, Math.min(100, Number(limit || 20)));
  const adilTaramaLimit = Math.max(guvenliLimit * 5, guvenliLimit);
  const { data, error } = await supabaseAdmin
    .from("bildirimler")
    .select("id, fallback_kanal, icerik, retry_sayisi, son_denemede")
    .in("fallback_durum", ["sirada", "hata"])
    .lt("retry_sayisi", maxRetry)
    .order("olusturma_tarihi", { ascending: true })
    .limit(adilTaramaLimit);
  if (error) return { hata: error.message, sonuc: [] };

  const nowMs = Date.now();
  const islenecekler = (data || []).filter((kayit) => islemeHazirMi(kayit, nowMs)).slice(0, guvenliLimit);
  const sonuc = [];
  for (const kayit of islenecekler) {
    // Basit seri isleme: dis servis oran limitlerinde patlamayi engeller.
    const deneme = await fallbackDenemeYap(kayit.id, {
      kanal: kayit.fallback_kanal || "whatsapp",
      mesaj: kayit.icerik || "",
    });
    sonuc.push({
      bildirim_id: kayit.id,
      hata: deneme.hata || null,
      fallback_durum: deneme.fallback_durum || "hata",
      dis_kanal_mesaj_id: deneme.dis_kanal_mesaj_id || null,
    });
  }
  return { hata: null, sonuc };
}

module.exports = {
  bildirimOlustur,
  disKanalaGonder,
  veterinerKlinikKoduGetir,
  klinikBildirimAyariGetir,
  fallbackDenemeYap,
  fallbackKuyruguIsle,
  yenidenDenemeBeklemeMs,
};
