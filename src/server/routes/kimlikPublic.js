const express = require("express");
const { createHash } = require("crypto");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { supabaseAdmin } = require("../supabase");
const { dogrula } = require("../middleware/validate");
const { hata } = require("../utils/http");
const shemalar = require("../schemas/v1");
const { bildirimOlustur } = require("../utils/notify");
const { storageSignedUrlUret } = require("../utils/storage");

const router = express.Router();

const kimlikPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.KIMLIK_PUBLIC_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return ipKeyGenerator(req.ip || "");
  },
  message: {
    kod: "COK_FAZLA_ISTEK",
    hata: "Bu sayfa icin cok fazla istek gonderildi. Lutfen kisa sure sonra tekrar deneyin.",
    detay: null,
  },
});

router.use(kimlikPublicLimiter);

function hataDon(res, durum, kod, mesaj, detay = null) {
  return hata(res, durum, kod, mesaj, detay);
}

function telefonNormalizeEt(telefon) {
  const ham = String(telefon || "").trim();
  if (!ham) return "";
  return ham.replace(/[^\d+]/g, "");
}

function telefonMaskele(telefon) {
  const ham = String(telefon || "").replace(/[^\d+]/g, "");
  if (!ham) return null;
  if (ham.length <= 4) return `${"*".repeat(Math.max(0, ham.length - 2))}${ham.slice(-2)}`;
  return `${ham.slice(0, 3)}****${ham.slice(-3)}`;
}

/** Tasma/künye public ekranı: adın yalnızca baş harfi (TR yerelleştirmeli). */
function adHalkaKisalt(ad) {
  const s = String(ad || "").trim();
  if (!s) return null;
  const ch = s.slice(0, 1).toLocaleUpperCase("tr-TR");
  return `${ch}.`;
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

router.get("/kimlik/dogrula/:kimlikNo", async (req, res) => {
  const kimlikNo = String(req.params.kimlikNo || "").trim();
  const token = String(req.query.t || "").trim();
  if (!kimlikNo) return hataDon(res, 400, "GECERSIZ_KIMLIK_NO", "Gecersiz kimlik numarasi.");
  if (!token) return hataDon(res, 403, "TOKEN_GEREKLI", "Kimlik dogrulama token gerekli.");

  const { data, error } = await supabaseAdmin
    .from("hayvan_kimlikleri")
    .select("id, hayvan_id, benzersiz_kimlik_no, qr_dogrulama_token, kayip_hayvan_iletisim_izni, kayip_hayvan_notu, foto_url")
    .eq("benzersiz_kimlik_no", kimlikNo)
    .maybeSingle();
  if (error) return hataDon(res, 500, "KIMLIK_SORGU_HATASI", "Islem su anda tamamlanamiyor.");
  if (!data?.hayvan_id) return hataDon(res, 404, "KIMLIK_BULUNAMADI", "Kimlik kaydi bulunamadi.");
  if (!data.qr_dogrulama_token || token !== data.qr_dogrulama_token) {
    return hataDon(res, 403, "TOKEN_GECERSIZ", "Kimlik dogrulama token gecersiz.");
  }

  const hayvanSonuc = await supabaseAdmin
    .from("hayvanlar")
    .select("id, sahibi_id, ad, tur, irk")
    .eq("id", data.hayvan_id)
    .maybeSingle();
  const { data: hayvan, error: hayvanErr } = hayvanSonuc;
  if (hayvanErr || !hayvan) return hataDon(res, 404, "HAYVAN_BULUNAMADI", "Hayvan bilgisi bulunamadi.");

  const { data: sahipSatir, error: sahipErr } = await supabaseAdmin
    .from("kullanicilar")
    .select("id, ad, soyad, telefon")
    .eq("id", hayvan.sahibi_id)
    .maybeSingle();
  if (sahipErr || !sahipSatir) return hataDon(res, 500, "SAHIP_BILGI_HATASI", "Islem su anda tamamlanamiyor.");

  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;
  await supabaseAdmin.from("kayip_hayvan_erisim_kayitlari").insert({
    kimlik_id: data.id,
    hayvan_id: data.hayvan_id,
    token_hash: tokenHash(token),
    erisim_durumu: "dogrulandi",
    ip_adresi: ip,
    kullanici_araci: userAgent,
  });

  let hayvan_foto_erisim_url = null;
  if (data.foto_url) {
    hayvan_foto_erisim_url = await storageSignedUrlUret("hayvan-kimlik-fotolari", data.foto_url, 600);
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.json({
    kimlik: {
      id: data.id,
      benzersiz_kimlik_no: data.benzersiz_kimlik_no,
      hayvan: { id: hayvan.id, ad: hayvan.ad, tur: hayvan.tur, irk: hayvan.irk },
      hayvan_foto_erisim_url,
      kayip_hayvan_notu: data.kayip_hayvan_notu || null,
      iletisim_izni_var: Boolean(data.kayip_hayvan_iletisim_izni),
      sahip: {
        ad: adHalkaKisalt(sahipSatir.ad),
        soyad: sahipSatir.soyad ? `${String(sahipSatir.soyad).slice(0, 1).toLocaleUpperCase("tr-TR")}.` : null,
        telefon_maskeli: telefonMaskele(sahipSatir.telefon),
      },
    },
  });
});

router.post("/kimlik/dogrula/:kimlikNo/iletisim-talebi", dogrula(shemalar.kimlikIletisimTalebi), async (req, res) => {
  const kimlikNo = String(req.params.kimlikNo || "").trim();
  const token = String(req.query.t || "").trim();
  const { bulan_ad, bulan_telefon, mesaj } = req.body || {};

  if (!token) return hataDon(res, 403, "TOKEN_GEREKLI", "Kimlik dogrulama token gerekli.");

  const { data: kimlik, error: kimlikErr } = await supabaseAdmin
    .from("hayvan_kimlikleri")
    .select("id, hayvan_id, qr_dogrulama_token, kayip_hayvan_iletisim_izni")
    .eq("benzersiz_kimlik_no", kimlikNo)
    .maybeSingle();
  if (kimlikErr || !kimlik?.id) return hataDon(res, 404, "KIMLIK_BULUNAMADI", "Kimlik kaydi bulunamadi.");
  if (!kimlik.qr_dogrulama_token || kimlik.qr_dogrulama_token !== token) {
    return hataDon(res, 403, "TOKEN_GECERSIZ", "Kimlik dogrulama token gecersiz.");
  }
  if (!kimlik.kayip_hayvan_iletisim_izni) {
    return hataDon(res, 403, "ILETISIM_IZNI_YOK", "Sahip bu kimlik icin iletisim talebini kapatmis.");
  }

  const { data: hayvan, error: hayvanErr } = await supabaseAdmin
    .from("hayvanlar")
    .select("id, sahibi_id, ad")
    .eq("id", kimlik.hayvan_id)
    .maybeSingle();
  if (hayvanErr || !hayvan?.sahibi_id) return hataDon(res, 404, "HAYVAN_BULUNAMADI", "Hayvan bilgisi bulunamadi.");

  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;
  const tokenHashDegeri = tokenHash(token);

  const { data: talep, error: talepErr } = await supabaseAdmin
    .from("kayip_hayvan_iletisim_talepleri")
    .insert({
      kimlik_id: kimlik.id,
      hayvan_id: hayvan.id,
      sahib_id: hayvan.sahibi_id,
      bulan_ad: String(bulan_ad || "").trim(),
      bulan_telefon: telefonNormalizeEt(bulan_telefon),
      mesaj: String(mesaj || "").trim(),
      token_hash: tokenHashDegeri,
      ip_adresi: ip,
      kullanici_araci: userAgent,
      durum: "beklemede",
    })
    .select("id, olusturma_tarihi")
    .single();
  if (talepErr) return hataDon(res, 500, "ILETISIM_TALEP_HATASI", "Islem su anda tamamlanamiyor.");

  await supabaseAdmin.from("kayip_hayvan_erisim_kayitlari").insert({
    kimlik_id: kimlik.id,
    hayvan_id: hayvan.id,
    token_hash: tokenHashDegeri,
    erisim_durumu: "iletisim_talebi",
    ip_adresi: ip,
    kullanici_araci: userAgent,
  });

  await bildirimOlustur({
    kullanici_id: hayvan.sahibi_id,
    tur: "kayip_hayvan_iletisim_talebi",
    baslik: `${hayvan.ad} icin iletisim talebi`,
    icerik: `${String(bulan_ad || "").trim()} isimli kisi ${telefonNormalizeEt(bulan_telefon)} ile ulasim talebi birakti.`,
    referans_hayvan_id: hayvan.id,
    kanal: "push",
    fallback_tetikle: false,
  });

  return res.status(201).json({
    mesaj: "Iletisim talebiniz sahip tarafina iletildi.",
    talep_id: talep.id,
    olusturma_tarihi: talep.olusturma_tarihi,
  });
});

router.post("/kimlik/dogrula/:kimlikNo/konum-bildir", dogrula(shemalar.kimlikKonumBildir), async (req, res) => {
  const kimlikNo = String(req.params.kimlikNo || "").trim();
  const token = String(req.query.t || "").trim();
  const { enlem, boylam, dogruluk_metre: dogrulukMetre } = req.body || {};

  if (!token) return hataDon(res, 403, "TOKEN_GEREKLI", "Kimlik dogrulama token gerekli.");

  const { data: kimlik, error: kimlikErr } = await supabaseAdmin
    .from("hayvan_kimlikleri")
    .select("id, hayvan_id, qr_dogrulama_token")
    .eq("benzersiz_kimlik_no", kimlikNo)
    .maybeSingle();
  if (kimlikErr || !kimlik?.id) return hataDon(res, 404, "KIMLIK_BULUNAMADI", "Kimlik kaydi bulunamadi.");
  if (!kimlik.qr_dogrulama_token || kimlik.qr_dogrulama_token !== token) {
    return hataDon(res, 403, "TOKEN_GECERSIZ", "Kimlik dogrulama token gecersiz.");
  }

  const { data: hayvan, error: hayvanErr } = await supabaseAdmin
    .from("hayvanlar")
    .select("id, sahibi_id, ad")
    .eq("id", kimlik.hayvan_id)
    .maybeSingle();
  if (hayvanErr || !hayvan?.sahibi_id) return hataDon(res, 404, "HAYVAN_BULUNAMADI", "Hayvan bilgisi bulunamadi.");

  const lat = Number(enlem);
  const lng = Number(boylam);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return hataDon(res, 400, "GECERSIZ_KONUM", "Enlem ve boylam gecerli sayilar olmalidir.");
  }

  const tokenHashDegeri = tokenHash(token);
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;

  const { error: konumErr } = await supabaseAdmin.from("kayip_hayvan_bulunan_konumlar").insert({
    kimlik_id: kimlik.id,
    hayvan_id: hayvan.id,
    sahibi_id: hayvan.sahibi_id,
    enlem: lat,
    boylam: lng,
    dogruluk_metre: dogrulukMetre != null && Number.isFinite(Number(dogrulukMetre)) ? Number(dogrulukMetre) : null,
    token_hash: tokenHashDegeri,
  });
  if (konumErr) return hataDon(res, 500, "KONUM_KAYIT_HATASI", "Konum kaydedilemedi.");

  await supabaseAdmin.from("kayip_hayvan_erisim_kayitlari").insert({
    kimlik_id: kimlik.id,
    hayvan_id: hayvan.id,
    token_hash: tokenHashDegeri,
    erisim_durumu: "konum_paylasildi",
    ip_adresi: ip,
    kullanici_araci: userAgent,
  });

  await bildirimOlustur({
    kullanici_id: hayvan.sahibi_id,
    tur: "kayip_hayvan_bulundu_konum",
    baslik: `${hayvan.ad} icin konum paylasildi`,
    icerik: "Biri hayvaninizi buldugunu ve konumunu paylastigini bildirdi. Haritadan gorebilirsiniz.",
    referans_hayvan_id: hayvan.id,
    referans_enlem: lat,
    referans_boylam: lng,
    kanal: "push",
    fallback_tetikle: false,
    ekstra_fcm_data: { hayvan_ad: String(hayvan.ad || "").slice(0, 80) },
  });

  return res.status(201).json({
    mesaj: "Konum sahibe iletildi. Tesekkurler!",
  });
});

router.get("/public/gunun-sansli-patisi", async (req, res) => {
  const gun = bugunTarihAl();
  const { data: kimlikSatirlari, error } = await supabaseAdmin.from("hayvan_kimlikleri").select(`
      hayvan_id,
      foto_url,
      hayvanlar!inner (
        id,
        ad,
        tur,
        irk,
        aktif,
        topluluk_patisi_goster,
        foto_url
      )
    `);

  if (error) return hataDon(res, 500, "PATISI_SORGU_HATASI", "Islem su anda tamamlanamiyor.");

  const liste = [];
  for (const row of kimlikSatirlari || []) {
    const h = row.hayvanlar;
    if (!h || !h.aktif || !h.topluluk_patisi_goster) continue;
    const ref = String(row.foto_url || h.foto_url || "").trim();
    if (!ref) continue;
    liste.push({
      hayvan_id: h.id,
      ad: h.ad,
      tur: h.tur,
      irk: h.irk,
      foto_ref: ref,
    });
  }

  if (liste.length === 0) {
    return res.json({
      pati: null,
      gun,
      mesaj: "Bugun listelenecek gonullu pati yok.",
    });
  }

  const tohum = hashGunVeListe(
    gun,
    liste.map((x) => x.hayvan_id)
  );
  const idx = tohum % liste.length;
  const secilen = liste[idx];

  let asiHatirlatma = null;
  const { data: hat } = await supabaseAdmin
    .from("hatirlatmalar")
    .select("islem_turu, hedef_tarih")
    .eq("hayvan_id", secilen.hayvan_id)
    .eq("durum", "planlandi")
    .order("hedef_tarih", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (hat?.hedef_tarih) {
    asiHatirlatma = { islem_turu: hat.islem_turu || "Hatirlatma", hedef_tarih: hat.hedef_tarih };
  }

  let fotoUrl = null;
  const ref = secilen.foto_ref;
  if (/^https?:\/\//i.test(ref)) {
    fotoUrl = ref;
  } else {
    const signed = await storageSignedUrlUret("hayvan-kimlik-fotolari", ref, 7200);
    if (signed) fotoUrl = signed;
  }

  return res.json({
    gun,
    pati: {
      hayvan_id: secilen.hayvan_id,
      ad: secilen.ad,
      tur: secilen.tur,
      irk: secilen.irk,
      foto_url: fotoUrl,
      asi_hatirlatma: asiHatirlatma,
    },
  });
});

function bugunTarihAl() {
  return new Date().toISOString().slice(0, 10);
}

function hashGunVeListe(gun, idler) {
  const s = `${gun}|${idler.slice().sort((a, b) => a - b).join(",")}`;
  return parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16);
}

module.exports = router;
