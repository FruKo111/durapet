const express = require("express");
const { randomUUID } = require("crypto");
const { supabaseAdmin } = require("../supabase");
const { authZorunlu } = require("../middleware/auth");
const { rolGerekli } = require("../middleware/rol");
const { dogrula } = require("../middleware/validate");
const { serviceRoleGerekli } = require("../middleware/serviceRole");
const kimlikPublicRouter = require("./kimlikPublic");
const { erisimLoguYaz } = require("../utils/log");
const {
  bildirimOlustur,
  disKanalaGonder,
  veterinerKlinikKoduGetir,
  klinikBildirimAyariGetir,
  fallbackDenemeYap,
  fallbackKuyruguIsle,
  yenidenDenemeBeklemeMs,
} = require("../utils/notify");
const { ozetGetir } = require("../utils/metrics");
const { hata } = require("../utils/http");
const { hayvanSahibininMi, veterinerHayvanaErisimVarMi } = require("../utils/erisim");
const { storagePublicUrlYolCoz, storageRefYolCoz, storageSignedUrlUret, storageRefOlustur } = require("../utils/storage");
const { secretSifrele } = require("../utils/secrets");
const shemalar = require("../schemas/v1");

const router = express.Router();
router.use(kimlikPublicRouter);

const ROLLER = {
  ADMIN: 1,
  VETERINER: 2,
  HAYVAN_SAHIBI: 3,
};

const RANDEVU_AKTIF_DURUMLAR = ["beklemede", "onaylandi", "geldi", "muayenede"];
const RANDEVU_BITMIS_DURUMLAR = ["tamamlandi", "iptal", "no_show"];
const RANDEVU_GECIS_KURALLARI = {
  onaylandi: ["beklemede"],
  geldi: ["beklemede", "onaylandi"],
  muayenede: ["onaylandi", "geldi"],
  tamamlandi: ["onaylandi", "geldi", "muayenede"],
  no_show: ["beklemede", "onaylandi", "geldi"],
  iptal: ["beklemede", "onaylandi", "geldi", "muayenede"],
};

function benzersizIdler(dizi) {
  return [...new Set((dizi || []).filter(Boolean))];
}

function limitAl(req, varsayilan = 100, maksimum = 500) {
  const ham = Number(req.query.limit || varsayilan);
  if (!Number.isFinite(ham) || ham <= 0) return varsayilan;
  return Math.min(ham, maksimum);
}

function offsetAl(req) {
  const ham = Number(req.query.offset || 0);
  if (!Number.isFinite(ham) || ham < 0) return 0;
  return Math.floor(ham);
}

function telefonNormalizeEt(telefon) {
  const ham = String(telefon || "").trim();
  if (!ham) return "";
  const sade = ham.replace(/[^\d+]/g, "");
  if (!sade) return "";
  if (sade.startsWith("+")) return sade;
  const rakam = sade.replace(/\D/g, "");
  if (!rakam) return "";
  if (rakam.length === 10) return `+90${rakam}`;
  if (rakam.length === 11 && rakam.startsWith("0")) return `+9${rakam}`;
  if (rakam.startsWith("90")) return `+${rakam}`;
  return `+${rakam}`;
}

async function telefonCakisiyorMu(telefon, haricKullaniciId = null) {
  const ham = telefonNormalizeEt(telefon) || String(telefon || "").trim();
  if (!ham) return { hata: null, cakisma: false };

  const { data, error } = await supabaseAdmin.rpc("kullanicilar_telefon_cakisma_var_mi", {
    p_telefon: ham,
    p_haric_kullanici_id: haricKullaniciId ?? null,
  });
  if (error) return { hata: error.message, cakisma: false };
  return { hata: null, cakisma: Boolean(data) };
}

async function epostaCakisiyorMu(epostaNormalized) {
  const n = String(epostaNormalized || "").trim().toLowerCase();
  if (!n) return { hata: null, cakisma: false };
  const { data, error } = await supabaseAdmin.from("kullanicilar").select("id").eq("eposta", n).maybeSingle();
  if (error) return { hata: error.message, cakisma: false };
  return { hata: null, cakisma: Boolean(data) };
}

function supabaseHataYorumla(error, varsayilanMesaj = "Islem basarisiz.") {
  const kod = String(error?.code || "");
  const mesaj = String(error?.message || varsayilanMesaj);

  if (kod === "23505") {
    return { durum: 409, mesaj: "Ayni tarih/saatte aktif bir randevu zaten bulunuyor." };
  }
  if (kod === "23503" || kod === "23514" || kod === "P0001") {
    return { durum: 400, mesaj };
  }
  return { durum: 500, mesaj };
}

function hataDon(res, durum, kod, mesaj, detay = null) {
  return hata(res, durum, kod, mesaj, detay);
}

function genelSunucuHatasiMesaji() {
  return "Islem su anda tamamlanamiyor. Lutfen daha sonra tekrar deneyin.";
}

function telefonMaskele(telefon) {
  const ham = String(telefon || "").replace(/[^\d+]/g, "");
  if (!ham) return null;
  if (ham.length <= 4) return `${"*".repeat(Math.max(0, ham.length - 2))}${ham.slice(-2)}`;
  return `${ham.slice(0, 3)}****${ham.slice(-3)}`;
}

function metinMaskele(metin, acik = 4) {
  const ham = String(metin || "").trim();
  if (!ham) return null;
  if (ham.length <= acik * 2) return `${"*".repeat(Math.max(0, ham.length - acik))}${ham.slice(-acik)}`;
  return `${ham.slice(0, acik)}${"*".repeat(Math.max(0, ham.length - acik * 2))}${ham.slice(-acik)}`;
}

function bugunTarih() {
  return new Date().toISOString().slice(0, 10);
}

async function kullaniciKlinikHaritasiGetir(kullaniciIdler) {
  const ids = benzersizIdler(kullaniciIdler);
  if (ids.length === 0) return { hata: null, harita: {} };

  const { data: kullanicilar, error: kullaniciHata } = await supabaseAdmin
    .from("kullanicilar")
    .select("id, rol_id")
    .in("id", ids);
  if (kullaniciHata) return { hata: kullaniciHata.message, harita: {} };

  const vetIds = (kullanicilar || []).filter((x) => x.rol_id === ROLLER.VETERINER).map((x) => x.id);
  const sahipIds = (kullanicilar || []).filter((x) => x.rol_id === ROLLER.HAYVAN_SAHIBI).map((x) => x.id);
  const harita = {};

  if (vetIds.length > 0) {
    const { data: vetProfiller, error: vetHata } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id, klinik_adi")
      .in("id", vetIds);
    if (vetHata) return { hata: vetHata.message, harita: {} };
    for (const vet of vetProfiller || []) {
      harita[vet.id] = String(vet.klinik_adi || "Atanmamis Klinik");
    }
  }

  if (sahipIds.length > 0) {
    const { data: sonRandevular, error: randevuHata } = await supabaseAdmin
      .from("randevular")
      .select("sahibi_id, veteriner_id, guncelleme_tarihi")
      .in("sahibi_id", sahipIds)
      .order("guncelleme_tarihi", { ascending: false });
    if (randevuHata) return { hata: randevuHata.message, harita: {} };

    const sahipVetMap = {};
    for (const randevu of sonRandevular || []) {
      if (!sahipVetMap[randevu.sahibi_id]) {
        sahipVetMap[randevu.sahibi_id] = randevu.veteriner_id;
      }
    }

    const sahipVetIds = benzersizIdler(Object.values(sahipVetMap));
    const { data: sahipVetProfilleri, error: sahipVetHata } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id, klinik_adi")
      .in("id", sahipVetIds);
    if (sahipVetHata) return { hata: sahipVetHata.message, harita: {} };

    const klinikByVet = {};
    for (const vet of sahipVetProfilleri || []) {
      klinikByVet[vet.id] = String(vet.klinik_adi || "Atanmamis Klinik");
    }

    for (const sahipId of sahipIds) {
      const vetId = sahipVetMap[sahipId];
      harita[sahipId] = vetId ? klinikByVet[vetId] || "Atanmamis Klinik" : "Atanmamis Klinik";
    }
  }

  for (const id of ids) {
    if (!harita[id]) harita[id] = "Atanmamis Klinik";
  }
  return { hata: null, harita };
}

function randevuDurumGecisiGecerliMi(kaynakDurum, hedefDurum) {
  const izinliKaynaklar = RANDEVU_GECIS_KURALLARI[hedefDurum] || [];
  return izinliKaynaklar.includes(kaynakDurum);
}

function randevuSonrakiDurum(mevcutDurum) {
  if (mevcutDurum === "beklemede") return "onaylandi";
  if (mevcutDurum === "onaylandi") return "geldi";
  if (mevcutDurum === "geldi") return "muayenede";
  return null;
}

function saatNormalizasyonu(saat) {
  const ham = String(saat || "").trim();
  if (!ham) return ham;
  return /^\d{2}:\d{2}$/.test(ham) ? `${ham}:00` : ham;
}

function metinKisalt(metin, max = 160) {
  const ham = String(metin || "").trim();
  if (!ham) return "";
  if (ham.length <= max) return ham;
  return `${ham.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function dataUrlCoz(dataUrl) {
  const ham = String(dataUrl || "").trim();
  const eslesme = ham.match(/^data:([^;]+);base64,(.+)$/);
  if (!eslesme) return null;
  const mime = eslesme[1];
  const b64 = eslesme[2];
  let buffer = null;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch (_) {
    buffer = null;
  }
  if (!buffer || buffer.length === 0) return null;
  return { mime, buffer };
}

function aiMetinNormalizeEt(metin) {
  const ham = String(metin || "").toLocaleLowerCase("tr-TR");
  return ham
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aiKelimeVarMi(metin, kok) {
  if (!kok) return false;
  if (
    metin.includes(`${kok} yok`) ||
    metin.includes(`${kok} degil`) ||
    metin.includes(`yok ${kok}`) ||
    metin.includes(`degil ${kok}`)
  ) {
    return false;
  }
  return metin.includes(kok);
}

function aiSkorHesapla(metin, kurallar) {
  let puan = 0;
  const eslesenler = [];
  for (const kural of kurallar) {
    if ((kural.kokler || []).some((kok) => aiKelimeVarMi(metin, kok))) {
      puan += Number(kural.puan || 0);
      eslesenler.push(kural.etiket);
    }
  }
  return { puan, eslesenler };
}

function hayvanYasYilHesapla(dogumTarihi) {
  if (!dogumTarihi) return null;
  const dt = new Date(`${dogumTarihi}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  const farkMs = Date.now() - dt.getTime();
  if (farkMs < 0) return null;
  return Number((farkMs / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1));
}

function brakisefalikRiskliIrkMi(tur, irk) {
  const turN = aiMetinNormalizeEt(tur || "");
  const irkN = aiMetinNormalizeEt(irk || "");
  if (!irkN) return false;
  const kopekRisk = ["pug", "fransiz bulldog", "bulldog", "pekinese", "shih tzu", "boxer", "boston terrier"];
  const kediRisk = ["persian", "iran kedisi", "himalayan", "scottish fold"];
  const liste = turN.includes("kedi") ? kediRisk : kopekRisk;
  return liste.some((x) => irkN.includes(aiMetinNormalizeEt(x)));
}

function aiOnYonlendirmeAnalizEt(sikayetOzet, yapisal = {}) {
  const normalize = aiMetinNormalizeEt(sikayetOzet);
  const tokenlar = normalize.split(" ").filter(Boolean);
  const harfler = normalize.replace(/\s+/g, "");
  const sesliSayisi = (harfler.match(/[aeiou]/g) || []).length;
  const sesliOrani = harfler.length ? sesliSayisi / harfler.length : 0;
  const metinKalitesi =
    harfler.length < 12 || tokenlar.length < 3 || sesliOrani < 0.20 ? "dusuk" : harfler.length < 30 ? "orta" : "yuksek";

  const acilSkor = aiSkorHesapla(normalize, [
    { etiket: "Solunum sikintisi", kokler: ["nefes alam", "nefes darl", "bogul", "solunum"], puan: 6 },
    { etiket: "Kanama / travma", kokler: ["kanama", "travma", "carpma", "kaza", "yaralan"], puan: 5 },
    { etiket: "Nobet / bilinc", kokler: ["nobet", "bayil", "bilinc", "felc"], puan: 6 },
    { etiket: "Zehirlenme suphe", kokler: ["zehir", "kimyasal", "ilac icti"], puan: 6 },
    { etiket: "Kanli kusma/diski", kokler: ["kusmukta kan", "kanli kus", "kanli diski", "idrarda kan"], puan: 5 },
  ]);
  const oncelikSkor = aiSkorHesapla(normalize, [
    { etiket: "Kusma", kokler: ["kusma", "kustu"], puan: 2 },
    { etiket: "Ishal", kokler: ["ishal", "sulu diski"], puan: 2 },
    { etiket: "Ates", kokler: ["ates", "titreme"], puan: 2 },
    { etiket: "Istahsizlik / halsizlik", kokler: ["istahsiz", "halsiz", "yemek yemiyor"], puan: 2 },
    { etiket: "Agri / topallama", kokler: ["agri", "topall", "yuruyem"], puan: 2 },
    { etiket: "Yara / kasinti", kokler: ["yara", "kasinti", "deri"], puan: 1 },
  ]);
  const rutinSkor = aiSkorHesapla(normalize, [
    { etiket: "Rutin kontrol", kokler: ["rutin", "kontrol", "checkup"], puan: 2 },
    { etiket: "Asi / parazit", kokler: ["asi", "parazit"], puan: 2 },
    { etiket: "Bakim / beslenme", kokler: ["mama", "bakim", "tirnak", "temizlik"], puan: 1 },
  ]);
  const siddetSkor = aiSkorHesapla(normalize, [
    { etiket: "Siddet artisi", kokler: ["siddetli", "artan", "durmayan", "surekli", "aniden"], puan: 2 },
    { etiket: "Uzun sure", kokler: ["2 gun", "3 gun", "24 saat", "geceden beri"], puan: 1 },
  ]);
  let acilPuan = acilSkor.puan;
  let oncelikPuan = oncelikSkor.puan;
  let rutinPuan = rutinSkor.puan;
  const acilEslesen = [...acilSkor.eslesenler];
  const oncelikEslesen = [...oncelikSkor.eslesenler];
  const rutinEslesen = [...rutinSkor.eslesenler];

  const semptomSuresiSaat = Number(yapisal?.semptom_suresi_saat || 0);
  const kusmaSayisi = Number(yapisal?.kusma_sayisi || 0);
  const yapisalBool = (x) => x === true;

  if (yapisalBool(yapisal.solunum_sikintisi)) {
    acilPuan += 7;
    acilEslesen.push("Yapisal veri: Solunum sikintisi");
  }
  if (yapisalBool(yapisal.nobet_var)) {
    acilPuan += 7;
    acilEslesen.push("Yapisal veri: Nobet");
  }
  if (yapisalBool(yapisal.zehirlenme_suphesi)) {
    acilPuan += 7;
    acilEslesen.push("Yapisal veri: Zehirlenme suphe");
  }
  if (yapisalBool(yapisal.kanama_var)) {
    acilPuan += 5;
    acilEslesen.push("Yapisal veri: Kanama");
  }
  if (yapisalBool(yapisal.travma_oykusu)) {
    acilPuan += 4;
    acilEslesen.push("Yapisal veri: Travma oykusu");
  }
  if (yapisalBool(yapisal.ates_var)) {
    oncelikPuan += 2;
    oncelikEslesen.push("Yapisal veri: Ates");
  }
  if (yapisalBool(yapisal.ishal_var)) {
    oncelikPuan += 2;
    oncelikEslesen.push("Yapisal veri: Ishal");
  }
  if (kusmaSayisi >= 6) {
    acilPuan += 3;
    acilEslesen.push("Yapisal veri: Sik kusma");
  } else if (kusmaSayisi >= 3) {
    oncelikPuan += 2;
    oncelikEslesen.push("Yapisal veri: Tekrarlayan kusma");
  }
  if (yapisal.istah_durumu === "hic_yemiyor") {
    oncelikPuan += 3;
    oncelikEslesen.push("Yapisal veri: Istah yok");
  } else if (yapisal.istah_durumu === "azaldi") {
    oncelikPuan += 1;
  }
  if (yapisal.aktivite_durumu === "cok_dusuk") {
    oncelikPuan += 3;
    oncelikEslesen.push("Yapisal veri: Aktivite cok dusuk");
  } else if (yapisal.aktivite_durumu === "azaldi") {
    oncelikPuan += 1;
  }
  if (yapisal.su_tuketimi === "hic_icmiyor") {
    oncelikPuan += 3;
    oncelikEslesen.push("Yapisal veri: Su tuketimi yok");
  } else if (yapisal.su_tuketimi === "azaldi") {
    oncelikPuan += 1;
  }
  if (semptomSuresiSaat >= 48) {
    oncelikPuan += 2;
    oncelikEslesen.push("Yapisal veri: Semptom suresi 48+ saat");
  } else if (semptomSuresiSaat >= 24) {
    oncelikPuan += 1;
  }

  const riskFaktorleri = [];
  const yasYil = hayvanYasYilHesapla(yapisal?.hayvan_dogum_tarihi);
  if (yasYil != null) {
    if (yasYil < 1) {
      oncelikPuan += 1;
      riskFaktorleri.push("Yas profili: Yavru");
    } else if (yasYil >= 10) {
      oncelikPuan += 2;
      riskFaktorleri.push("Yas profili: Geriatrik");
    } else {
      riskFaktorleri.push("Yas profili: Yetiskin");
    }
  }
  if (brakisefalikRiskliIrkMi(yapisal?.hayvan_tur, yapisal?.hayvan_irk)) {
    riskFaktorleri.push("Irk profili: Brakisefalik risk");
    if (yapisalBool(yapisal.solunum_sikintisi) || aiKelimeVarMi(normalize, "nefes")) {
      acilPuan += 2;
      acilEslesen.push("Profil etkisi: Brakisefalik + solunum bulgusu");
    }
  }
  if (String(yapisal?.hayvan_tur || "").toLocaleLowerCase("tr-TR").includes("kedi") && yapisalBool(yapisal.ishal_var)) {
    oncelikPuan += 1;
    riskFaktorleri.push("Tur profili: Kedi + GIS semptom");
  }

  const sinyalSayisi = new Set([...acilEslesen, ...oncelikEslesen, ...rutinEslesen]).size;
  const metinYetersiz = metinKalitesi === "dusuk" && sinyalSayisi === 0;

  let ai_oncelik = null;
  if (metinYetersiz) {
    ai_oncelik = null;
  } else if (acilPuan >= 7 || (acilPuan >= 5 && siddetSkor.puan >= 2)) {
    ai_oncelik = "acil";
  } else if (oncelikPuan + siddetSkor.puan >= 4) {
    ai_oncelik = "oncelikli";
  } else if (sinyalSayisi === 0) {
    ai_oncelik = null;
  } else {
    ai_oncelik = "rutin";
  }

  const hamGuven = ai_oncelik
    ? 45 + Math.max(acilPuan, oncelikPuan, rutinPuan) * 6 + Math.min(15, sinyalSayisi * 3)
    : 22 + Math.min(20, harfler.length);
  const guven_puani = Math.max(20, Math.min(96, Math.round(hamGuven)));

  const gerekceler = [
    ...acilEslesen.map((x) => `Acil sinyal: ${x}`),
    ...oncelikEslesen.map((x) => `Oncelikli sinyal: ${x}`),
    ...rutinEslesen.map((x) => `Rutin sinyal: ${x}`),
  ].slice(0, 6);
  if (gerekceler.length === 0) {
    gerekceler.push("Belirgin klinik semptom yakalanamadi.");
  }
  if (metinKalitesi === "dusuk") {
    gerekceler.push("Sikayet metni kisa/belirsiz; daha net semptom yazimi onerilir.");
  }

  return {
    ai_oncelik,
    guven_puani,
    metin_kalitesi: metinKalitesi,
    gerekceler,
    risk_faktorleri: riskFaktorleri,
    skorlar: {
      acil: acilPuan,
      oncelikli: oncelikPuan,
      rutin: rutinPuan,
      siddet: siddetSkor.puan,
      sinyal: sinyalSayisi,
    },
  };
}

function kaliciSilmeOnayiGecerliMi(metin) {
  const ham = String(metin || "").trim();
  if (!ham) return false;
  const normalize = ham
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/İ/g, "I");
  return normalize === "SIL";
}

async function hayvanAktifRandevuSayisi(hayvanId) {
  const { count, error } = await supabaseAdmin
    .from("randevular")
    .select("id", { count: "exact", head: true })
    .eq("hayvan_id", hayvanId)
    .in("durum", RANDEVU_AKTIF_DURUMLAR);
  if (error) return { hata: error.message, sayi: 0 };
  return { hata: null, sayi: count || 0 };
}

async function hayvanSilmeOncesiBaglantilariTemizle(hayvanId) {
  const { error } = await supabaseAdmin
    .from("erisim_loglari")
    .update({ hayvan_id: null })
    .eq("hayvan_id", hayvanId);
  if (error) return { hata: error.message };
  return { hata: null };
}

async function randevuCakismaVarMi(veterinerId, randevuTarihi, randevuSaati, haricRandevuId = null) {
  let sorgu = supabaseAdmin
    .from("randevular")
    .select("id, durum")
    .eq("veteriner_id", veterinerId)
    .eq("randevu_tarihi", randevuTarihi)
    .eq("randevu_saati", saatNormalizasyonu(randevuSaati))
    .in("durum", RANDEVU_AKTIF_DURUMLAR);

  if (haricRandevuId) {
    sorgu = sorgu.neq("id", haricRandevuId);
  }

  const { data, error } = await sorgu.limit(1);
  if (error) return { hata: error.message, cakisma: false };
  return { hata: null, cakisma: (data || []).length > 0 };
}

async function randevuHatirlatmalariniPlanla(randevu) {
  const kaynakRandevuId = randevu.id;
  const hedefler = [];
  const randevuTarihNesne = new Date(`${randevu.randevu_tarihi}T00:00:00Z`);

  const birGunOnce = new Date(randevuTarihNesne.getTime() - 86400000).toISOString().slice(0, 10);
  if (birGunOnce >= bugunTarih()) {
    hedefler.push({ islem_turu: "randevu_hatirlatma_24s", hedef_tarih: birGunOnce });
  }
  if (randevu.randevu_tarihi >= bugunTarih()) {
    hedefler.push({ islem_turu: "randevu_hatirlatma_gunici", hedef_tarih: randevu.randevu_tarihi });
  }

  if (hedefler.length === 0) return { hata: null };

  const satirlar = hedefler.map((h) => ({
    hayvan_id: randevu.hayvan_id,
    sahibi_id: randevu.sahibi_id,
    veteriner_id: randevu.veteriner_id,
    islem_turu: h.islem_turu,
    hedef_tarih: h.hedef_tarih,
    durum: "planlandi",
    kaynak_randevu_id: kaynakRandevuId,
  }));

  const { error } = await supabaseAdmin.from("hatirlatmalar").insert(satirlar);
  if (error) return { hata: error.message };
  return { hata: null };
}

async function randevuHatirlatmalariniIptalEt(randevuId) {
  const { error } = await supabaseAdmin
    .from("hatirlatmalar")
    .update({ durum: "iptal" })
    .eq("kaynak_randevu_id", randevuId)
    .eq("durum", "planlandi");
  if (error) return { hata: error.message };
  return { hata: null };
}

async function hayvanKimlikDetayiGetir(hayvanId) {
  const { data: kimlik, error: kimlikHata } = await supabaseAdmin
    .from("hayvan_kimlikleri")
    .select(
      "id, hayvan_id, benzersiz_kimlik_no, qr_icerik, qr_dogrulama_token, foto_url, imza_url, pdf_url, kimlik_notu, mikrocip_no, kayip_hayvan_iletisim_izni, kayip_hayvan_notu, olusturma_tarihi, guncelleme_tarihi"
    )
    .eq("hayvan_id", hayvanId)
    .maybeSingle();
  if (kimlikHata) return { hata: kimlikHata.message, veri: null };
  if (!kimlik) return { hata: "Hayvan kimligi bulunamadi.", veri: null, bulunamadi: true };

  const { data: hayvan, error: hayvanHata } = await supabaseAdmin
    .from("hayvanlar")
    .select("id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo")
    .eq("id", hayvanId)
    .maybeSingle();
  if (hayvanHata) return { hata: hayvanHata.message, veri: null };
  if (!hayvan) return { hata: "Hayvan bulunamadi.", veri: null, bulunamadi: true };

  const [kullaniciSonuc, sahipProfilSonuc] = await Promise.all([
    supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad, telefon")
      .eq("id", hayvan.sahibi_id)
      .maybeSingle(),
    supabaseAdmin
      .from("hayvan_sahibi_profilleri")
      .select("id, adres, acil_durum_iletisim, tc_kimlik_no, il, ilce")
      .eq("id", hayvan.sahibi_id)
      .maybeSingle(),
  ]);

  if (kullaniciSonuc.error) return { hata: kullaniciSonuc.error.message, veri: null };
  if (sahipProfilSonuc.error) return { hata: sahipProfilSonuc.error.message, veri: null };

  const [pdf_erisim_url, foto_erisim_url, imza_erisim_url] = await Promise.all([
    kimlik.pdf_url ? storageSignedUrlUret("hayvan-kimlik-pdf", kimlik.pdf_url, 180) : Promise.resolve(null),
    kimlik.foto_url ? storageSignedUrlUret("hayvan-kimlik-fotolari", kimlik.foto_url, 180) : Promise.resolve(null),
    kimlik.imza_url ? storageSignedUrlUret("hayvan-kimlik-fotolari", kimlik.imza_url, 180) : Promise.resolve(null),
  ]);

  return {
    hata: null,
    veri: {
      ...kimlik,
      pdf_erisim_url,
      foto_erisim_url,
      imza_erisim_url,
      hayvan: {
        id: hayvan.id,
        ad: hayvan.ad,
        tur: hayvan.tur,
        irk: hayvan.irk,
        cinsiyet: hayvan.cinsiyet,
        kan_grubu: hayvan.kan_grubu,
        dogum_tarihi: hayvan.dogum_tarihi,
        kilo: hayvan.kilo,
      },
      sahip: {
        id: hayvan.sahibi_id,
        ad: kullaniciSonuc.data?.ad || null,
        soyad: kullaniciSonuc.data?.soyad || null,
        telefon: kullaniciSonuc.data?.telefon || null,
        adres: sahipProfilSonuc.data?.adres || null,
        il: sahipProfilSonuc.data?.il || null,
        ilce: sahipProfilSonuc.data?.ilce || null,
        acil_durum_iletisim: sahipProfilSonuc.data?.acil_durum_iletisim || null,
      },
    },
  };
}

async function kimlikGuncellemeGecmisiGetir(hayvanId, limit = 20) {
  const { data, error } = await supabaseAdmin
    .from("hayvan_kimlik_guncelleme_gecmisi")
    .select("id, kimlik_id, hayvan_id, guncelleyen_kullanici_id, onceki_pdf_url, yeni_pdf_url, onceki_qr_icerik, yeni_qr_icerik, not_ozeti, olusturma_tarihi")
    .eq("hayvan_id", hayvanId)
    .order("olusturma_tarihi", { ascending: false })
    .limit(limit);
  if (error) return { hata: error.message, kayitlar: [] };
  const kayitlar = await Promise.all(
    (data || []).map(async (x) => ({
      ...x,
      yeni_pdf_erisim_url: x.yeni_pdf_url ? await storageSignedUrlUret("hayvan-kimlik-pdf", x.yeni_pdf_url, 180) : null,
      onceki_pdf_erisim_url: x.onceki_pdf_url ? await storageSignedUrlUret("hayvan-kimlik-pdf", x.onceki_pdf_url, 180) : null,
    }))
  );
  return { hata: null, kayitlar };
}

async function mesajOdasiYetkiKontrol(odaId, kullanici) {
  const { data: oda, error } = await supabaseAdmin
    .from("mesaj_odalar")
    .select("id, hayvan_id, veteriner_id, sahibi_id, olusturma_tarihi")
    .eq("id", odaId)
    .maybeSingle();
  if (error) return { hata: error.message, oda: null };
  if (!oda) return { hata: "Mesaj odasi bulunamadi.", oda: null, bulunamadi: true };

  const izinli =
    kullanici.rolId === ROLLER.ADMIN ||
    (kullanici.rolId === ROLLER.VETERINER && oda.veteriner_id === kullanici.id) ||
    (kullanici.rolId === ROLLER.HAYVAN_SAHIBI && oda.sahibi_id === kullanici.id);

  if (!izinli) return { hata: "Bu mesaj odasina erisim yetkin yok.", oda: null, yetkiYok: true };
  return { hata: null, oda };
}

async function mesajOdaOzetleriGetir(kullanici) {
  let odaSorgu = supabaseAdmin
    .from("mesaj_odalar")
    .select("id, hayvan_id, veteriner_id, sahibi_id, olusturma_tarihi")
    .order("olusturma_tarihi", { ascending: false })
    .limit(300);

  if (kullanici.rolId === ROLLER.VETERINER) odaSorgu = odaSorgu.eq("veteriner_id", kullanici.id);
  if (kullanici.rolId === ROLLER.HAYVAN_SAHIBI) odaSorgu = odaSorgu.eq("sahibi_id", kullanici.id);

  const { data: odalar, error: odaHata } = await odaSorgu;
  if (odaHata) return { hata: odaHata.message, odalar: [] };
  if (!odalar || odalar.length === 0) return { hata: null, odalar: [] };

  const odaIdler = odalar.map((x) => x.id);
  const hayvanIdler = benzersizIdler(odalar.map((x) => x.hayvan_id));
  const sahipIdler = benzersizIdler(odalar.map((x) => x.sahibi_id));
  const veterinerIdler = benzersizIdler(odalar.map((x) => x.veteriner_id));

  const [hayvanSonuc, sahipSonuc, veterinerSonuc, sonMesajSonuc, okunmamisSonuc] = await Promise.all([
    hayvanIdler.length
      ? supabaseAdmin.from("hayvanlar").select("id, ad").in("id", hayvanIdler)
      : Promise.resolve({ data: [], error: null }),
    sahipIdler.length
      ? supabaseAdmin.from("kullanicilar").select("id, ad, soyad").in("id", sahipIdler)
      : Promise.resolve({ data: [], error: null }),
    veterinerIdler.length
      ? supabaseAdmin.from("kullanicilar").select("id, ad, soyad").in("id", veterinerIdler)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("mesajlar")
      .select("id, oda_id, gonderen_id, icerik, okundu, olusturma_tarihi")
      .in("oda_id", odaIdler)
      .order("olusturma_tarihi", { ascending: false })
      .limit(3000),
    supabaseAdmin
      .from("mesajlar")
      .select("oda_id, gonderen_id")
      .in("oda_id", odaIdler)
      .eq("okundu", false)
      .neq("gonderen_id", kullanici.id)
      .limit(3000),
  ]);

  if (hayvanSonuc.error) return { hata: hayvanSonuc.error.message, odalar: [] };
  if (sahipSonuc.error) return { hata: sahipSonuc.error.message, odalar: [] };
  if (veterinerSonuc.error) return { hata: veterinerSonuc.error.message, odalar: [] };
  if (sonMesajSonuc.error) return { hata: sonMesajSonuc.error.message, odalar: [] };
  if (okunmamisSonuc.error) return { hata: okunmamisSonuc.error.message, odalar: [] };

  const hayvanMap = (hayvanSonuc.data || []).reduce((acc, x) => {
    acc[x.id] = x;
    return acc;
  }, {});
  const sahipMap = (sahipSonuc.data || []).reduce((acc, x) => {
    acc[x.id] = x;
    return acc;
  }, {});
  const veterinerMap = (veterinerSonuc.data || []).reduce((acc, x) => {
    acc[x.id] = x;
    return acc;
  }, {});
  const sonMesajMap = {};
  for (const m of sonMesajSonuc.data || []) {
    if (!sonMesajMap[m.oda_id]) sonMesajMap[m.oda_id] = m;
  }
  const okunmamisMap = {};
  for (const m of okunmamisSonuc.data || []) {
    okunmamisMap[m.oda_id] = (okunmamisMap[m.oda_id] || 0) + 1;
  }

  const zenginOdalar = odalar.map((oda) => ({
    ...oda,
    hayvan: hayvanMap[oda.hayvan_id] || null,
    sahip: sahipMap[oda.sahibi_id] || null,
    veteriner: veterinerMap[oda.veteriner_id] || null,
    son_mesaj: sonMesajMap[oda.id] || null,
    okunmamis_sayi: okunmamisMap[oda.id] || 0,
  }));

  zenginOdalar.sort((a, b) => {
    const aTarih = a.son_mesaj?.olusturma_tarihi || a.olusturma_tarihi;
    const bTarih = b.son_mesaj?.olusturma_tarihi || b.olusturma_tarihi;
    return String(bTarih).localeCompare(String(aTarih));
  });

  return { hata: null, odalar: zenginOdalar };
}

router.get("/durum", async (req, res) => {
  const { error } = await supabaseAdmin.from("roller").select("id").limit(1);
  if (error) {
    return res.status(500).json({ durum: "hata" });
  }
  return res.json({ durum: "hazir", servis: "durapet-api-v1" });
});

router.get("/yasal-metinler", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("yasal_metinler")
    .select("anahtar, baslik, icerik, guncelleme_tarihi")
    .order("anahtar", { ascending: true });
  if (error) {
    console.error("yasal_metinler okuma:", error?.message || error);
    return hataDon(res, 500, "YASAL_METIN_OKUMA_HATASI", genelSunucuHatasiMesaji());
  }
  return res.json({ metinler: data || [] });
});

router.post("/auth/sahip-kayit", dogrula(shemalar.sahipKayitOl), async (req, res) => {
  const { ad, soyad, telefon, eposta, sifre, pazarlama_riza } = req.body || {};
  const epostaNorm = String(eposta || "").trim().toLowerCase();
  const telefonNormalized = telefonNormalizeEt(telefon);
  if (!telefonNormalized) {
    return hataDon(res, 400, "TELEFON_ZORUNLU", "Telefon zorunludur.");
  }

  const telCakisma = await telefonCakisiyorMu(telefonNormalized);
  if (telCakisma.hata) return hataDon(res, 500, "TELEFON_KONTROL_HATASI", telCakisma.hata);
  if (telCakisma.cakisma) {
    return hataDon(
      res,
      409,
      "TELEFON_KULLANIMDA",
      "Bu telefon numarası ile zaten bir hesap var. Aynı telefonla ikinci hesap açılamaz; giriş yapmayı deneyin."
    );
  }

  const epostaCakisma = await epostaCakisiyorMu(epostaNorm);
  if (epostaCakisma.hata) return hataDon(res, 500, "EPOSTA_KONTROL_HATASI", epostaCakisma.hata);
  if (epostaCakisma.cakisma) {
    return hataDon(
      res,
      409,
      "EPOSTA_KULLANIMDA",
      "Bu e-posta adresi ile zaten bir hesap var. Aynı e-posta ile ikinci hesap açılamaz; giriş yapmayı deneyin."
    );
  }

  const { data: authKullanici, error: authHata } = await supabaseAdmin.auth.admin.createUser({
    email: epostaNorm,
    password: sifre,
    email_confirm: true,
    user_metadata: { ad, soyad },
  });
  if (authHata || !authKullanici?.user?.id) {
    const amsg = String(authHata?.message || "").toLowerCase();
    if (
      amsg.includes("already been registered") ||
      amsg.includes("already registered") ||
      amsg.includes("user already exists") ||
      amsg.includes("duplicate") ||
      amsg.includes("unique")
    ) {
      return hataDon(
        res,
        409,
        "EPOSTA_KULLANIMDA",
        "Bu e-posta adresi ile zaten bir hesap var. Aynı e-posta ile ikinci hesap açılamaz; giriş yapmayı deneyin."
      );
    }
    return hataDon(res, 500, "AUTH_SAHIP_KAYIT_HATASI", authHata?.message || "Hesap olusturulamadi.");
  }

  const yeniKullaniciId = authKullanici.user.id;
  const { error: kullaniciHata } = await supabaseAdmin.from("kullanicilar").insert({
    id: yeniKullaniciId,
    rol_id: ROLLER.HAYVAN_SAHIBI,
    ad,
    soyad,
    telefon: telefonNormalized,
    eposta: epostaNorm,
    aktif: true,
    kvkk_acik_riza_onay: true,
    kvkk_acik_riza_tarihi: new Date().toISOString(),
    pazarlama_riza_izni: Boolean(pazarlama_riza),
  });
  if (kullaniciHata) {
    await supabaseAdmin.auth.admin.deleteUser(yeniKullaniciId);
    const msg = String(kullaniciHata.message || "");
    const msgL = msg.toLowerCase();
    if (msgL.includes("kullanicida kayitli") || (msgL.includes("telefon") && msg.includes("23505"))) {
      return hataDon(
        res,
        409,
        "TELEFON_KULLANIMDA",
        "Bu telefon numarası ile zaten bir hesap var. Aynı telefonla ikinci hesap açılamaz; giriş yapmayı deneyin."
      );
    }
    if (msgL.includes("eposta") || msgL.includes("email") || msgL.includes("duplicate key") && msgL.includes("eposta")) {
      return hataDon(
        res,
        409,
        "EPOSTA_KULLANIMDA",
        "Bu e-posta adresi ile zaten bir hesap var. Aynı e-posta ile ikinci hesap açılamaz; giriş yapmayı deneyin."
      );
    }
    if (msg.includes("23505")) {
      return hataDon(
        res,
        409,
        "KAYIT_CAKISMA",
        "Bu bilgilerle zaten bir hesap olabilir. Telefon veya e-posta ile giriş yapmayı deneyin."
      );
    }
    return hataDon(res, 500, "KULLANICI_KAYIT_HATASI", kullaniciHata.message);
  }

  const { error: profilHata } = await supabaseAdmin.from("hayvan_sahibi_profilleri").insert({ id: yeniKullaniciId });
  if (profilHata) {
    await supabaseAdmin.from("kullanicilar").delete().eq("id", yeniKullaniciId);
    await supabaseAdmin.auth.admin.deleteUser(yeniKullaniciId);
    return hataDon(res, 500, "SAHIP_PROFIL_KAYIT_HATASI", profilHata.message);
  }

  return res.status(201).json({
    mesaj: "Hesabiniz olusturuldu.",
    kullanici: { id: yeniKullaniciId, ad, soyad, eposta: epostaNorm, telefon: telefonNormalized },
  });
});

router.get(
  "/admin/operasyon/ozet",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  async (req, res) => {
    const limit = limitAl(req, 20, 200);
    const performans = ozetGetir(limit);

    const [guvenlikSonuc, erisimSonuc] = await Promise.all([
      supabaseAdmin
        .from("guvenlik_loglari")
        .select("id, seviye, olay_turu, aciklama, olusturma_tarihi")
        .order("olusturma_tarihi", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("erisim_loglari")
        .select("id, kullanici_id, eylem, kaynak, olusturma_tarihi")
        .order("olusturma_tarihi", { ascending: false })
        .limit(30),
    ]);

    if (guvenlikSonuc.error) return hataDon(res, 500, "GUVENLIK_LOG_HATASI", guvenlikSonuc.error.message);
    if (erisimSonuc.error) return hataDon(res, 500, "ERISIM_LOG_HATASI", erisimSonuc.error.message);

    return res.json({
      performans,
      guvenlik_loglari: guvenlikSonuc.data || [],
      erisim_loglari: erisimSonuc.data || [],
    });
  }
);

router.get(
  "/admin/klinik-kpi",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  async (req, res) => {
    const bugun = bugunTarih();
    const baslangic = String(req.query.baslangic || "").trim() || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const bitis = String(req.query.bitis || "").trim() || bugun;

    const { data: randevular, error } = await supabaseAdmin
      .from("randevular")
      .select("durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani")
      .gte("randevu_tarihi", baslangic)
      .lte("randevu_tarihi", bitis);
    if (error) return hataDon(res, 500, "ADMIN_KPI_HATASI", error.message);

    const toplam = (randevular || []).length;
    const tamamlanan = (randevular || []).filter((x) => x.durum === "tamamlandi").length;
    const noShow = (randevular || []).filter((x) => x.durum === "no_show").length;
    const checkoutlu = (randevular || []).filter((x) => x.durum === "tamamlandi" && Boolean(x.checkout_zamani)).length;
    const beklemeDakikalari = (randevular || [])
      .filter((x) => x.hasta_kabul_zamani && x.muayene_baslama_zamani)
      .map((x) => Math.max(0, Math.round((new Date(x.muayene_baslama_zamani).getTime() - new Date(x.hasta_kabul_zamani).getTime()) / 60000)));
    const ortBekleme = beklemeDakikalari.length
      ? Math.round(beklemeDakikalari.reduce((acc, x) => acc + x, 0) / beklemeDakikalari.length)
      : 0;

    return res.json({
      donem: { baslangic, bitis },
      toplam_randevu: toplam,
      tamamlanan_randevu: tamamlanan,
      no_show_randevu: noShow,
      no_show_orani: toplam ? Number(((noShow / toplam) * 100).toFixed(2)) : 0,
      checkout_tamamlama_orani: tamamlanan ? Number(((checkoutlu / tamamlanan) * 100).toFixed(2)) : 0,
      ortalama_bekleme_dk: ortBekleme,
    });
  }
);

router.get("/profilim", authZorunlu, async (req, res) => {
  const k = { ...req.kullanici };
  if (k.rolId === ROLLER.HAYVAN_SAHIBI) {
    const { data: sp, error } = await supabaseAdmin
      .from("hayvan_sahibi_profilleri")
      .select("profil_foto_yolu")
      .eq("id", k.id)
      .maybeSingle();
    if (!error && sp?.profil_foto_yolu) {
      const url = await storageSignedUrlUret("sahip-profil-fotolari", sp.profil_foto_yolu, 3600);
      if (url) k.profilFotoErisimUrl = url;
    }
  }
  if (k.rolId === ROLLER.VETERINER) {
    const { data: vp, error: vpErr } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("profil_foto_yolu")
      .eq("id", k.id)
      .maybeSingle();
    if (!vpErr && vp?.profil_foto_yolu) {
      const url = await storageSignedUrlUret("veteriner-profil-fotolari", vp.profil_foto_yolu, 3600);
      if (url) k.profilFotoErisimUrl = url;
    }
  }
  return res.json({ kullanici: k });
});

router.post(
  "/sahip/profil/foto",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipProfilFotoYukle),
  async (req, res) => {
    const { content_type, data_url } = req.body || {};
    const cozulmus = dataUrlCoz(data_url);
    if (!cozulmus) return hataDon(res, 400, "GECERSIZ_DATA_URL", "Gecersiz dosya icerigi.");
    if (String(content_type || "").toLowerCase() !== String(cozulmus.mime || "").toLowerCase()) {
      return hataDon(res, 400, "MIME_ESLESMEDI", "Dosya tipi ile icerik tipi eslesmiyor.");
    }
    const izinliMime = ["image/jpeg", "image/png", "image/webp"];
    if (!izinliMime.includes(String(cozulmus.mime || "").toLowerCase())) {
      return hataDon(res, 400, "MIME_IZINLI_DEGIL", "Sadece JPEG, PNG veya WebP yuklenebilir.");
    }
    const boyut = Number(cozulmus.buffer.length || 0);
    if (boyut <= 0 || boyut > 1.5 * 1024 * 1024) {
      return hataDon(res, 400, "DOSYA_BOYUT", "Dosya boyutu 1,5MB sinirini asiyor.");
    }
    const kullaniciId = req.kullanici.id;
    const extMap = {
      "image/webp": "webp",
      "image/png": "png",
      "image/jpeg": "jpg",
    };
    const ext = extMap[String(content_type).toLowerCase()] || "jpg";
    const bucket = "sahip-profil-fotolari";
    const dosyaYolu = `${kullaniciId}/avatar.${ext}`;
    const yukleme = await supabaseAdmin.storage.from(bucket).upload(dosyaYolu, cozulmus.buffer, {
      contentType: content_type,
      upsert: true,
      cacheControl: "3600",
    });
    if (yukleme.error) return hataDon(res, 500, "PROFIL_FOTO_YUKLEME_HATASI", yukleme.error.message);

    const dbRef = storageRefOlustur(bucket, dosyaYolu);
    const { error: dbHata } = await supabaseAdmin
      .from("hayvan_sahibi_profilleri")
      .upsert({ id: kullaniciId, profil_foto_yolu: dbRef }, { onConflict: "id" });
    if (dbHata) return hataDon(res, 500, "PROFIL_FOTO_KAYIT_HATASI", dbHata.message);

    await erisimLoguYaz(req, "sahip_profil_foto_yukleme");

    const profilFotoErisimUrl = await storageSignedUrlUret(bucket, dbRef, 3600);
    return res.status(201).json({
      mesaj: "Profil fotografi guncellendi.",
      profilFotoErisimUrl: profilFotoErisimUrl || null,
    });
  }
);

router.post(
  "/veteriner/profil/foto",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerProfilFotoYukle),
  async (req, res) => {
    const { content_type, data_url } = req.body || {};
    const cozulmus = dataUrlCoz(data_url);
    if (!cozulmus) return hataDon(res, 400, "GECERSIZ_DATA_URL", "Gecersiz dosya icerigi.");
    if (String(content_type || "").toLowerCase() !== String(cozulmus.mime || "").toLowerCase()) {
      return hataDon(res, 400, "MIME_ESLESMEDI", "Dosya tipi ile icerik tipi eslesmiyor.");
    }
    const izinliMime = ["image/jpeg", "image/png", "image/webp"];
    if (!izinliMime.includes(String(cozulmus.mime || "").toLowerCase())) {
      return hataDon(res, 400, "MIME_IZINLI_DEGIL", "Sadece JPEG, PNG veya WebP yuklenebilir.");
    }
    const boyut = Number(cozulmus.buffer.length || 0);
    if (boyut <= 0 || boyut > 1.5 * 1024 * 1024) {
      return hataDon(res, 400, "DOSYA_BOYUT", "Dosya boyutu 1,5MB sinirini asiyor.");
    }
    const kullaniciId = req.kullanici.id;
    const extMap = {
      "image/webp": "webp",
      "image/png": "png",
      "image/jpeg": "jpg",
    };
    const ext = extMap[String(content_type).toLowerCase()] || "jpg";
    const bucket = "veteriner-profil-fotolari";
    const dosyaYolu = `${kullaniciId}/avatar.${ext}`;
    const yukleme = await supabaseAdmin.storage.from(bucket).upload(dosyaYolu, cozulmus.buffer, {
      contentType: content_type,
      upsert: true,
      cacheControl: "3600",
    });
    if (yukleme.error) return hataDon(res, 500, "PROFIL_FOTO_YUKLEME_HATASI", yukleme.error.message);

    const dbRef = storageRefOlustur(bucket, dosyaYolu);
    const { data: mevcutVp, error: vpOkumaErr } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id")
      .eq("id", kullaniciId)
      .maybeSingle();
    if (vpOkumaErr) return hataDon(res, 500, "PROFIL_OKUMA_HATASI", vpOkumaErr.message);
    if (!mevcutVp) {
      return hataDon(
        res,
        400,
        "VETERINER_PROFIL_EKSIK",
        "Veteriner profil kaydin bulunamadi (diploma/klinik satiri yok). Yonetici hesabi tamamlamali."
      );
    }
    const { error: dbHata } = await supabaseAdmin
      .from("veteriner_profilleri")
      .update({ profil_foto_yolu: dbRef })
      .eq("id", kullaniciId);
    if (dbHata) return hataDon(res, 500, "PROFIL_FOTO_KAYIT_HATASI", dbHata.message);

    await erisimLoguYaz(req, "veteriner_profil_foto_yukleme");

    const profilFotoErisimUrl = await storageSignedUrlUret(bucket, dbRef, 3600);
    return res.status(201).json({
      mesaj: "Profil fotografi guncellendi.",
      profilFotoErisimUrl: profilFotoErisimUrl || null,
    });
  }
);

router.get(
  "/veteriner/profil",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  async (req, res) => {
    const id = req.kullanici.id;
    const { data: ku, error: kErr } = await supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad, eposta, telefon")
      .eq("id", id)
      .maybeSingle();
    if (kErr) return hataDon(res, 500, "KULLANICI_OKUMA_HATASI", kErr.message);
    if (!ku) return hataDon(res, 404, "KULLANICI_YOK", "Kullanici bulunamadi.");

    const { data: vp, error: pErr } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("diploma_no, klinik_adi, uzmanlik_alani, il, ilce, calisma_saatleri_metin, profil_foto_yolu")
      .eq("id", id)
      .maybeSingle();
    if (pErr) return hataDon(res, 500, "PROFIL_OKUMA_HATASI", pErr.message);

    let profil = null;
    if (vp) {
      const { profil_foto_yolu, ...rest } = vp;
      let profilFotoErisimUrl = null;
      if (profil_foto_yolu) {
        profilFotoErisimUrl = await storageSignedUrlUret("veteriner-profil-fotolari", profil_foto_yolu, 3600);
      }
      profil = { ...rest, profil_foto_erisim_url: profilFotoErisimUrl };
    }

    await erisimLoguYaz(req, "veteriner_profil_goruntuleme");
    return res.json({ kullanici: ku, profil });
  }
);

router.patch(
  "/veteriner/profil",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerProfilGuncelle),
  async (req, res) => {
    const id = req.kullanici.id;
    const b = req.body || {};
    const guncelle = {};
    if (b.klinik_adi !== undefined) guncelle.klinik_adi = String(b.klinik_adi ?? "").trim() || null;
    if (b.uzmanlik_alani !== undefined) guncelle.uzmanlik_alani = String(b.uzmanlik_alani ?? "").trim() || null;
    if (b.il !== undefined) guncelle.il = String(b.il ?? "").trim() || null;
    if (b.ilce !== undefined) guncelle.ilce = String(b.ilce ?? "").trim() || null;
    if (b.calisma_saatleri_metin !== undefined) {
      guncelle.calisma_saatleri_metin = String(b.calisma_saatleri_metin ?? "").trim() || null;
    }

    const { data: vp, error } = await supabaseAdmin
      .from("veteriner_profilleri")
      .update(guncelle)
      .eq("id", id)
      .select("diploma_no, klinik_adi, uzmanlik_alani, il, ilce, calisma_saatleri_metin, profil_foto_yolu")
      .maybeSingle();
    if (error) return hataDon(res, 500, "PROFIL_GUNCELLEME_HATASI", error.message);
    if (!vp) return hataDon(res, 404, "PROFIL_YOK", "Veteriner profil kaydi bulunamadi.");

    let profilFotoErisimUrl = null;
    if (vp.profil_foto_yolu) {
      profilFotoErisimUrl = await storageSignedUrlUret("veteriner-profil-fotolari", vp.profil_foto_yolu, 3600);
    }
    const { profil_foto_yolu, ...rest } = vp;
    const profil = { ...rest, profil_foto_erisim_url: profilFotoErisimUrl };

    await erisimLoguYaz(req, "veteriner_profil_guncelleme");
    return res.json({ mesaj: "Klinik bilgilerin guncellendi.", profil });
  }
);

router.get(
  "/mesaj/odalar",
  authZorunlu,
  async (req, res) => {
    if (![ROLLER.ADMIN, ROLLER.VETERINER, ROLLER.HAYVAN_SAHIBI].includes(req.kullanici.rolId)) {
      return res.status(403).json({ hata: "Mesaj odalari icin bu role yetki tanimli degil." });
    }
    const sonuc = await mesajOdaOzetleriGetir(req.kullanici);
    if (sonuc.hata) return res.status(500).json({ hata: sonuc.hata });
    await erisimLoguYaz(req, "mesaj_odasi_listesi_goruntuleme");
    return res.json({ kayit_sayisi: sonuc.odalar.length, odalar: sonuc.odalar });
  }
);

router.get(
  "/sahip/randevular",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 100, 300);
    const offset = offsetAl(req);
    const durum = String(req.query.durum || "").trim();
    let sorgu = supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, iptal_nedeni", { count: "exact" })
      .eq("sahibi_id", req.kullanici.id)
      .order("randevu_tarihi", { ascending: true });

    if (durum && durum !== "tum") sorgu = sorgu.eq("durum", durum);

    const { data, error, count } = await sorgu.range(offset, offset + limit - 1);
    if (error) return hataDon(res, 500, "RANDEVU_LISTE_HATASI", error.message);

    const hayvanIdler = benzersizIdler((data || []).map((x) => x.hayvan_id));
    const veterinerIdler = benzersizIdler((data || []).map((x) => x.veteriner_id));
    const [hayvanSonuc, veterinerSonuc] = await Promise.all([
      hayvanIdler.length
        ? supabaseAdmin.from("hayvanlar").select("id, ad").in("id", hayvanIdler)
        : Promise.resolve({ data: [], error: null }),
      veterinerIdler.length
        ? supabaseAdmin.from("kullanicilar").select("id, ad, soyad").in("id", veterinerIdler)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (hayvanSonuc.error) return hataDon(res, 500, "HAYVAN_LISTE_HATASI", hayvanSonuc.error.message);
    if (veterinerSonuc.error) return hataDon(res, 500, "VETERINER_LISTE_HATASI", veterinerSonuc.error.message);

    const hayvanMap = (hayvanSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const veterinerMap = (veterinerSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});

    const randevular = (data || []).map((x) => ({
      ...x,
      hayvan: hayvanMap[x.hayvan_id] || null,
      veteriner: veterinerMap[x.veteriner_id] || null,
    }));

    return res.json({
      kayit_sayisi: randevular.length,
      toplam_kayit: count ?? randevular.length,
      limit,
      offset,
      randevular,
    });
  }
);

router.patch(
  "/sahip/randevular/:id/iptal",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipRandevuIptal),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    const { iptal_nedeni } = req.body || {};
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update({ durum: "iptal", iptal_nedeni: iptal_nedeni || "Sahip tarafindan iptal edildi." })
      .eq("id", randevuId)
      .eq("sahibi_id", req.kullanici.id)
      .in("durum", ["beklemede", "onaylandi"])
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, iptal_nedeni")
      .maybeSingle();

    if (error) return hataDon(res, 500, "RANDEVU_IPTAL_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Iptal edilebilecek randevu bulunamadi.");

    const iptal = await randevuHatirlatmalariniIptalEt(randevuId);
    if (iptal.hata) {
      console.error("Randevu hatirlatmalari kapatilamadi:", iptal.hata);
    }

    const vetBildirim = await bildirimOlustur({
      kullanici_id: data.veteriner_id,
      tur: "randevu_sahip_iptal",
      baslik: "Randevu iptal edildi",
      icerik: `Hayvan sahibi ${data.randevu_tarihi} ${saatNormalizasyonu(data.randevu_saati)} randevusunu iptal etti.`,
      referans_hayvan_id: data.hayvan_id,
      referans_randevu_id: data.id,
      kaynak_veteriner_id: data.veteriner_id,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: false,
    });
    if (vetBildirim.hata) {
      console.error("Veteriner iptal bildirimi:", vetBildirim.hata);
    }

    await erisimLoguYaz(req, "sahip_randevu_iptal", data.hayvan_id);
    return res.json({ mesaj: "Randevu iptal edildi.", randevu: data });
  }
);

router.post(
  "/mesaj/odalar",
  authZorunlu,
  dogrula(shemalar.mesajOdaOlustur),
  async (req, res) => {
    const { hayvan_id, sahibi_id, veteriner_id } = req.body || {};
    const { data: hayvan, error: hayvanHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, sahibi_id")
      .eq("id", hayvan_id)
      .maybeSingle();
    if (hayvanHata) return res.status(500).json({ hata: hayvanHata.message });
    if (!hayvan) return res.status(404).json({ hata: "Hayvan bulunamadi." });

    let hedefSahipId = null;
    let hedefVeterinerId = null;
    if (req.kullanici.rolId === ROLLER.VETERINER) {
      if (!sahibi_id) return res.status(400).json({ hata: "Veteriner tarafinda sahibi_id zorunludur." });
      if (hayvan.sahibi_id !== sahibi_id) return res.status(400).json({ hata: "sahibi_id ile hayvan sahibi eslesmiyor." });
      hedefSahipId = sahibi_id;
      hedefVeterinerId = req.kullanici.id;
    } else if (req.kullanici.rolId === ROLLER.HAYVAN_SAHIBI) {
      if (hayvan.sahibi_id !== req.kullanici.id) return res.status(403).json({ hata: "Bu hayvan icin oda acamazsin." });
      if (!veteriner_id) return res.status(400).json({ hata: "Hayvan sahibi tarafinda veteriner_id zorunludur." });
      hedefSahipId = req.kullanici.id;
      hedefVeterinerId = veteriner_id;
    } else if (req.kullanici.rolId === ROLLER.ADMIN) {
      if (!sahibi_id || !veteriner_id) return res.status(400).json({ hata: "Admin odasi icin sahibi_id ve veteriner_id zorunludur." });
      hedefSahipId = sahibi_id;
      hedefVeterinerId = veteriner_id;
    } else {
      return res.status(403).json({ hata: "Bu role mesaj odasi olusturma yetkisi tanimli degil." });
    }

    const { data: oda, error: odaHata } = await supabaseAdmin
      .from("mesaj_odalar")
      .upsert(
        {
          hayvan_id,
          sahibi_id: hedefSahipId,
          veteriner_id: hedefVeterinerId,
        },
        { onConflict: "veteriner_id,sahibi_id,hayvan_id" }
      )
      .select("id, hayvan_id, veteriner_id, sahibi_id, olusturma_tarihi")
      .single();
    if (odaHata) return res.status(500).json({ hata: odaHata.message });

    await erisimLoguYaz(req, "mesaj_odasi_olusturma", Number(hayvan_id));
    return res.status(201).json({ mesaj: "Mesaj odasi hazir.", oda });
  }
);

router.get(
  "/mesaj/odalar/:odaId/mesajlar",
  authZorunlu,
  dogrula(shemalar.mesajOdaIdParam),
  async (req, res) => {
    const odaId = Number(req.params.odaId);
    const limit = limitAl(req, 100, 300);
    const offset = offsetAl(req);
    const erisim = await mesajOdasiYetkiKontrol(odaId, req.kullanici);
    if (erisim.hata && erisim.bulunamadi) return res.status(404).json({ hata: erisim.hata });
    if (erisim.hata && erisim.yetkiYok) return res.status(403).json({ hata: erisim.hata });
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });

    const { data: mesajlar, error: mesajHata } = await supabaseAdmin
      .from("mesajlar")
      .select("id, oda_id, gonderen_id, icerik, medya_url, yanit_mesaj_id, yanit_ozet, okundu, olusturma_tarihi")
      .eq("oda_id", odaId)
      .order("olusturma_tarihi", { ascending: false })
      .range(offset, offset + limit - 1);
    if (mesajHata) return res.status(500).json({ hata: mesajHata.message });

    const gonderenIdler = benzersizIdler((mesajlar || []).map((x) => x.gonderen_id));
    const { data: gonderenler, error: gonderenHata } = gonderenIdler.length
      ? await supabaseAdmin.from("kullanicilar").select("id, ad, soyad").in("id", gonderenIdler)
      : { data: [], error: null };
    if (gonderenHata) return res.status(500).json({ hata: gonderenHata.message });
    const gonderenMap = (gonderenler || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});

    await supabaseAdmin
      .from("mesajlar")
      .update({ okundu: true })
      .eq("oda_id", odaId)
      .neq("gonderen_id", req.kullanici.id)
      .eq("okundu", false);

    const zenginMesajlar = await Promise.all(
      (mesajlar || []).map(async (x) => ({
        ...x,
        medya_erisim_url: x.medya_url ? await storageSignedUrlUret("mesaj-medya", x.medya_url, 180) : null,
        gonderen: gonderenMap[x.gonderen_id] || null,
      }))
    );

    await erisimLoguYaz(req, "mesaj_listesi_goruntuleme");
    return res.json({
      kayit_sayisi: zenginMesajlar.length,
      limit,
      offset,
      mesajlar: zenginMesajlar.reverse(),
    });
  }
);

router.post(
  "/mesaj/odalar/:odaId/mesajlar",
  authZorunlu,
  dogrula(shemalar.mesajGonder),
  async (req, res) => {
    const odaId = Number(req.params.odaId);
    const { icerik, medya_url, yanit_mesaj_id, yanit_ozet } = req.body || {};
    const erisim = await mesajOdasiYetkiKontrol(odaId, req.kullanici);
    if (erisim.hata && erisim.bulunamadi) return res.status(404).json({ hata: erisim.hata });
    if (erisim.hata && erisim.yetkiYok) return res.status(403).json({ hata: erisim.hata });
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });

    const { data: mesaj, error: mesajHata } = await supabaseAdmin
      .from("mesajlar")
      .insert({
        oda_id: odaId,
        gonderen_id: req.kullanici.id,
        icerik: icerik || null,
        medya_url: medya_url || null,
        yanit_mesaj_id: yanit_mesaj_id || null,
        yanit_ozet: yanit_ozet || null,
      })
      .select("id, oda_id, gonderen_id, icerik, medya_url, yanit_mesaj_id, yanit_ozet, okundu, olusturma_tarihi")
      .single();
    if (mesajHata) return res.status(500).json({ hata: mesajHata.message });

    const hedefKullaniciId = erisim.oda.veteriner_id === req.kullanici.id ? erisim.oda.sahibi_id : erisim.oda.veteriner_id;
    const bildirimIcerik = (icerik && String(icerik).trim()) || (medya_url ? "Medya dosyasi gonderildi." : "Yeni mesaj");
    const bildirimSonuc = await bildirimOlustur({
      kullanici_id: hedefKullaniciId,
      tur: "yeni_mesaj",
      baslik: "Yeni mesaj",
      icerik: bildirimIcerik,
      referans_oda_id: odaId,
      kaynak_veteriner_id: erisim.oda.veteriner_id || null,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: false,
    });
    if (bildirimSonuc.hata) {
      console.error("Mesaj bildirimi olusturulamadi:", bildirimSonuc.hata);
    }

    await erisimLoguYaz(req, "mesaj_gonderme", erisim.oda.hayvan_id || null);
    return res.status(201).json({ mesaj: "Mesaj gonderildi.", ileti: mesaj });
  }
);

router.patch(
  "/mesajlar/:id",
  authZorunlu,
  dogrula(shemalar.mesajDuzenle),
  async (req, res) => {
    const mesajId = Number(req.params.id);
    const { icerik } = req.body || {};
    const { data: mevcutMesaj, error: mevcutHata } = await supabaseAdmin
      .from("mesajlar")
      .select("id, oda_id, gonderen_id")
      .eq("id", mesajId)
      .maybeSingle();
    if (mevcutHata) return res.status(500).json({ hata: mevcutHata.message });
    if (!mevcutMesaj) return res.status(404).json({ hata: "Mesaj bulunamadi." });

    const erisim = await mesajOdasiYetkiKontrol(mevcutMesaj.oda_id, req.kullanici);
    if (erisim.hata && erisim.bulunamadi) return res.status(404).json({ hata: erisim.hata });
    if (erisim.hata && erisim.yetkiYok) return res.status(403).json({ hata: erisim.hata });
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });

    const duzenlemeYetkisi = req.kullanici.rolId === ROLLER.ADMIN || mevcutMesaj.gonderen_id === req.kullanici.id;
    if (!duzenlemeYetkisi) return res.status(403).json({ hata: "Sadece kendi mesajini duzenleyebilirsin." });

    const { data: guncelMesaj, error: guncelHata } = await supabaseAdmin
      .from("mesajlar")
      .update({ icerik })
      .eq("id", mesajId)
      .select("id, oda_id, gonderen_id, icerik, medya_url, yanit_mesaj_id, yanit_ozet, okundu, olusturma_tarihi")
      .single();
    if (guncelHata) return res.status(500).json({ hata: guncelHata.message });

    await erisimLoguYaz(req, "mesaj_duzenleme", erisim.oda.hayvan_id || null);
    return res.json({ mesaj: "Mesaj guncellendi.", ileti: guncelMesaj });
  }
);

router.patch(
  "/mesajlar/:id/sil",
  authZorunlu,
  dogrula(shemalar.mesajSil),
  async (req, res) => {
    const mesajId = Number(req.params.id);
    const { data: mevcutMesaj, error: mevcutHata } = await supabaseAdmin
      .from("mesajlar")
      .select("id, oda_id, gonderen_id")
      .eq("id", mesajId)
      .maybeSingle();
    if (mevcutHata) return res.status(500).json({ hata: mevcutHata.message });
    if (!mevcutMesaj) return res.status(404).json({ hata: "Mesaj bulunamadi." });

    const erisim = await mesajOdasiYetkiKontrol(mevcutMesaj.oda_id, req.kullanici);
    if (erisim.hata && erisim.bulunamadi) return res.status(404).json({ hata: erisim.hata });
    if (erisim.hata && erisim.yetkiYok) return res.status(403).json({ hata: erisim.hata });
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });

    const silmeYetkisi = req.kullanici.rolId === ROLLER.ADMIN || mevcutMesaj.gonderen_id === req.kullanici.id;
    if (!silmeYetkisi) return res.status(403).json({ hata: "Sadece kendi mesajini silebilirsin." });

    const { data: silinenMesaj, error: silmeHata } = await supabaseAdmin
      .from("mesajlar")
      .update({
        icerik: "Bu mesaj silindi.",
        medya_url: null,
        yanit_mesaj_id: null,
        yanit_ozet: null,
      })
      .eq("id", mesajId)
      .select("id, oda_id, gonderen_id, icerik, medya_url, yanit_mesaj_id, yanit_ozet, okundu, olusturma_tarihi")
      .single();
    if (silmeHata) return res.status(500).json({ hata: silmeHata.message });

    await erisimLoguYaz(req, "mesaj_silme", erisim.oda.hayvan_id || null);
    return res.json({ mesaj: "Mesaj silindi.", ileti: silinenMesaj });
  }
);

router.get(
  "/bildirimler",
  authZorunlu,
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 30, 100);
    const offset = offsetAl(req);
    const { data, error } = await supabaseAdmin
      .from("bildirimler")
      .select(
        "id, tur, baslik, icerik, durum, referans_oda_id, referans_hayvan_id, referans_enlem, referans_boylam, olusturma_tarihi"
      )
      .eq("kullanici_id", req.kullanici.id)
      .order("olusturma_tarihi", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      const mesaj = String(error.message || "");
      if (mesaj.includes("qr_dogrulama_token") && mesaj.toLowerCase().includes("not-null")) {
        return hataDon(
          res,
          500,
          "KIMLIK_TETIKLEYICI_EKSIK",
          "Kimlik token altyapisi eksik. DB migrationi (20260316_016_kimlik_qr_token_otomatik_uret.sql) calistirilmali.",
          mesaj
        );
      }
      return res.status(500).json({ hata: error.message });
    }
    const okunmamis_sayi = (data || []).filter((x) => x.durum !== "okundu").length;
    return res.json({ kayit_sayisi: data?.length || 0, okunmamis_sayi, bildirimler: data || [] });
  }
);

router.patch(
  "/bildirimler/:id/okundu",
  authZorunlu,
  dogrula(shemalar.sayisalIdParam),
  async (req, res) => {
    const id = Number(req.params.id);
    const { data, error } = await supabaseAdmin
      .from("bildirimler")
      .update({ durum: "okundu" })
      .eq("id", id)
      .eq("kullanici_id", req.kullanici.id)
      .select("id, durum")
      .maybeSingle();
    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Bildirim bulunamadi." });
    return res.json({ mesaj: "Bildirim okundu isaretlendi.", bildirim: data });
  }
);

router.patch(
  "/bildirimler/okundu/tumu",
  authZorunlu,
  dogrula(shemalar.bildirimTopluOkundu),
  async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("bildirimler")
      .update({ durum: "okundu" })
      .eq("kullanici_id", req.kullanici.id)
      .neq("durum", "okundu")
      .select("id");
    if (error) return res.status(500).json({ hata: error.message });
    return res.json({ mesaj: "Tum bildirimler okundu.", etkilenen_kayit: data?.length || 0 });
  }
);

router.get(
  "/sahip/kayip-bulunan-konumlar",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 50, 100);
    const { data: rows, error } = await supabaseAdmin
      .from("kayip_hayvan_bulunan_konumlar")
      .select("id, hayvan_id, enlem, boylam, dogruluk_metre, olusturma_tarihi")
      .eq("sahibi_id", req.kullanici.id)
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ hata: error.message });
    const hayvanIdler = [...new Set((rows || []).map((r) => r.hayvan_id))];
    const adHaritasi = {};
    if (hayvanIdler.length > 0) {
      const { data: hv, error: hErr } = await supabaseAdmin.from("hayvanlar").select("id, ad").in("id", hayvanIdler);
      if (hErr) return res.status(500).json({ hata: hErr.message });
      (hv || []).forEach((h) => {
        adHaritasi[h.id] = h.ad;
      });
    }
    const konumlar = (rows || []).map((r) => ({
      ...r,
      hayvan_ad: adHaritasi[r.hayvan_id] || "Hayvan",
    }));
    return res.json({ kayit_sayisi: konumlar.length, konumlar });
  }
);

router.post(
  "/cihaz/fcm-token",
  authZorunlu,
  dogrula(shemalar.cihazFcmKayit),
  async (req, res) => {
    const { fcm_token, platform } = req.body || {};
    const { error } = await supabaseAdmin
      .from("kullanicilar")
      .update({
        fcm_token,
        fcm_platform: platform || null,
        fcm_guncelleme: new Date().toISOString(),
      })
      .eq("id", req.kullanici.id);
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("fcm_token")) {
        return hataDon(
          res,
          500,
          "FCM_KOLON_EKSIK",
          "Veritabaninda fcm_token kolonu yok; 20260327_032_fcm_token.sql migration calistirin.",
          msg
        );
      }
      return res.status(500).json({ hata: error.message });
    }
    await erisimLoguYaz(req, "cihaz_fcm_token_kayit");
    return res.json({ mesaj: "FCM jetonu kaydedildi." });
  }
);

router.delete(
  "/cihaz/fcm-token",
  authZorunlu,
  async (req, res) => {
    const { error } = await supabaseAdmin
      .from("kullanicilar")
      .update({
        fcm_token: null,
        fcm_platform: null,
        fcm_guncelleme: new Date().toISOString(),
      })
      .eq("id", req.kullanici.id);
    if (error) return res.status(500).json({ hata: error.message });
    await erisimLoguYaz(req, "cihaz_fcm_token_silme");
    return res.json({ mesaj: "FCM jetonu silindi." });
  }
);

router.patch(
  "/admin/yasal-metinler",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.adminYasalMetinGuncelle),
  async (req, res) => {
    const { guncellemeler } = req.body || {};
    for (const g of guncellemeler) {
      const patch = {};
      if (g.baslik !== undefined) patch.baslik = g.baslik;
      if (g.icerik !== undefined) patch.icerik = g.icerik;
      const { error } = await supabaseAdmin.from("yasal_metinler").update(patch).eq("anahtar", g.anahtar);
      if (error) return hataDon(res, 500, "YASAL_METIN_GUNCELLEME", error.message);
    }
    await erisimLoguYaz(req, "admin_yasal_metin_guncelleme");
    const { data, error: okuErr } = await supabaseAdmin
      .from("yasal_metinler")
      .select("anahtar, baslik, icerik, guncelleme_tarihi")
      .order("anahtar", { ascending: true });
    if (okuErr) return hataDon(res, 500, "YASAL_METIN_OKUMA_HATASI", okuErr.message);
    return res.json({ mesaj: "Yasal metinler guncellendi.", metinler: data || [] });
  }
);

router.get(
  "/admin/kullanicilar",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 100, 1000);
    const offset = offsetAl(req);
    const arama = String(req.query.arama || "").trim();
    const sirala = String(req.query.sirala || "olusturma_desc").trim();
    const rolId = Number(req.query.rol_id || 0);
    const aktifDurum = String(req.query.aktif_durum || "tum").trim().toLowerCase();
    const siralama = {
      kolon: sirala.startsWith("ad_") ? "ad" : sirala === "rol" ? "rol_id" : "olusturma_tarihi",
      artan: sirala === "ad_asc" || sirala === "rol",
    };
    let sorgu = supabaseAdmin
      .from("kullanicilar")
      .select("id, rol_id, ad, soyad, telefon, eposta, aktif, olusturma_tarihi", { count: "exact" })
      .order(siralama.kolon, { ascending: siralama.artan });

    if (arama) {
      sorgu = sorgu.or(`ad.ilike.%${arama}%,soyad.ilike.%${arama}%,eposta.ilike.%${arama}%`);
    }
    if (Number.isInteger(rolId) && rolId >= 1 && rolId <= 3) {
      sorgu = sorgu.eq("rol_id", rolId);
    }
    if (aktifDurum === "aktif") {
      sorgu = sorgu.eq("aktif", true);
    } else if (aktifDurum === "pasif") {
      sorgu = sorgu.eq("aktif", false);
    }

    const { data, error, count } = await sorgu.range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ hata: error.message });
    }

    await erisimLoguYaz(req, "admin_kullanici_listesi_goruntuleme");
    return res.json({
      kayit_sayisi: data.length,
      toplam_kayit: count ?? data.length,
      limit,
      offset,
      kullanicilar: data,
    });
  }
);

router.patch(
  "/admin/kullanicilar/:id/durum",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.adminKullaniciDurumGuncelle),
  async (req, res) => {
    const kullaniciId = String(req.params.id || "").trim();
    const { aktif } = req.body || {};
    if (!kullaniciId) return res.status(400).json({ hata: "Kullanici id zorunludur." });
    if (kullaniciId === req.kullanici.id && aktif === false) {
      return res.status(400).json({ hata: "Kendi admin hesabinizi pasife alamazsiniz." });
    }

    const { data, error } = await supabaseAdmin
      .from("kullanicilar")
      .update({ aktif: Boolean(aktif) })
      .eq("id", kullaniciId)
      .select("id, ad, soyad, aktif, rol_id")
      .maybeSingle();
    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Kullanici bulunamadi." });

    await erisimLoguYaz(req, "admin_kullanici_durum_guncelleme", null);
    return res.json({
      mesaj: data.aktif ? "Kullanici aktif edildi." : "Kullanici pasife alindi.",
      kullanici: data,
    });
  }
);

router.post(
  "/admin/kullanicilar/:id/sifre",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  serviceRoleGerekli,
  dogrula(shemalar.adminKullaniciSifreDegistir),
  async (req, res) => {
    const kullaniciId = String(req.params.id || "").trim();
    const { yeni_sifre } = req.body || {};
    if (!kullaniciId) return res.status(400).json({ hata: "Kullanici id zorunludur." });

    const { error } = await supabaseAdmin.auth.admin.updateUserById(kullaniciId, {
      password: yeni_sifre,
    });
    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "admin_kullanici_sifre_degistirme", null);
    return res.json({ mesaj: "Kullanici sifresi guncellendi." });
  }
);

router.post(
  "/admin/kullanicilar/:id/sil",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  serviceRoleGerekli,
  dogrula(shemalar.adminKullaniciSil),
  async (req, res) => {
    const kullaniciId = String(req.params.id || "").trim();
    const { kalici = false, onay_metni } = req.body || {};
    if (!kullaniciId) return res.status(400).json({ hata: "Kullanici id zorunludur." });
    if (kullaniciId === req.kullanici.id) {
      return res.status(400).json({ hata: "Kendi admin hesabinizi silemezsiniz." });
    }

    const { data: mevcut, error: mevcutErr } = await supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad, rol_id, aktif")
      .eq("id", kullaniciId)
      .maybeSingle();
    if (mevcutErr) return res.status(500).json({ hata: mevcutErr.message });
    if (!mevcut) return res.status(404).json({ hata: "Kullanici bulunamadi." });
    if (mevcut.rol_id === ROLLER.ADMIN) {
      return res.status(400).json({ hata: "Admin kullanicilar kalici silinemez. Pasife aliniz." });
    }

    if (!kalici) {
      const { error: pasifErr } = await supabaseAdmin.from("kullanicilar").update({ aktif: false }).eq("id", kullaniciId);
      if (pasifErr) return res.status(500).json({ hata: pasifErr.message });
      await erisimLoguYaz(req, "admin_kullanici_pasifleme_sil_akisi", null);
      return res.json({ mesaj: "Kullanici pasife alindi.", kullanici_id: kullaniciId, kalici: false });
    }

    if (String(onay_metni || "").trim().toUpperCase() !== "SIL") {
      return res.status(400).json({ hata: "Kalici silme icin onay_metni olarak SIL gondermelisiniz." });
    }
    const { error: authSilErr } = await supabaseAdmin.auth.admin.deleteUser(kullaniciId);
    if (authSilErr) return res.status(500).json({ hata: authSilErr.message });

    await erisimLoguYaz(req, "admin_kullanici_kalici_silme", null);
    return res.json({ mesaj: "Kullanici kalici olarak silindi.", kullanici_id: kullaniciId, kalici: true });
  }
);

router.post(
  "/admin/iletisim/sirlar-yeniden-sifrele",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  serviceRoleGerekli,
  dogrula(shemalar.bildirimTopluOkundu),
  async (req, res) => {
    const secim = await supabaseAdmin
      .from("klinik_bildirim_ayarlari")
      .select("klinik_kodu, twilio_auth_token, webhook_token, infobip_api_key");
    if (secim.error) return res.status(500).json({ hata: secim.error.message });

    let guncellenen = 0;
    let atlanan = 0;
    for (const ayar of secim.data || []) {
      const payload = {
        twilio_auth_token: ayar.twilio_auth_token ? secretSifrele(ayar.twilio_auth_token) : null,
        webhook_token: ayar.webhook_token ? secretSifrele(ayar.webhook_token) : null,
        infobip_api_key: ayar.infobip_api_key ? secretSifrele(ayar.infobip_api_key) : null,
      };
      const degisti =
        payload.twilio_auth_token !== (ayar.twilio_auth_token || null) ||
        payload.webhook_token !== (ayar.webhook_token || null) ||
        payload.infobip_api_key !== (ayar.infobip_api_key || null);
      if (!degisti) {
        atlanan += 1;
        continue;
      }
      const { error } = await supabaseAdmin
        .from("klinik_bildirim_ayarlari")
        .update(payload)
        .eq("klinik_kodu", ayar.klinik_kodu);
      if (error) return res.status(500).json({ hata: error.message });
      guncellenen += 1;
    }

    await erisimLoguYaz(req, "admin_iletisim_sir_yeniden_sifreleme", null);
    return res.json({
      mesaj: "Klinik kanal sirri alanlari yeniden sifreleme islemi tamamlandi.",
      toplam: (secim.data || []).length,
      guncellenen,
      atlanan,
    });
  }
);

router.get(
  "/admin/guvenlik-loglari",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 1000);
    const { data, error } = await supabaseAdmin
      .from("guvenlik_loglari")
      .select("id, seviye, olay_turu, aciklama, iliskili_kullanici_id, olusturma_tarihi")
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "admin_guvenlik_loglari_goruntuleme");
    return res.json({ kayit_sayisi: data.length, loglar: data });
  }
);

router.get(
  "/admin/erisim-loglari",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 1000);
    const { data, error } = await supabaseAdmin
      .from("erisim_loglari")
      .select("id, kullanici_id, hayvan_id, eylem, kaynak, ip_adresi, kullanici_araci, olusturma_tarihi")
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "admin_erisim_loglari_goruntuleme");
    return res.json({ kayit_sayisi: data.length, loglar: data });
  }
);

router.patch(
  "/admin/bildirimler/:id/fallback-dene",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.sayisalIdParam),
  async (req, res) => {
    const bildirimId = Number(req.params.id);
    const { data: bildirim, error: bildirimHata } = await supabaseAdmin
      .from("bildirimler")
      .select("id, kanal, fallback_kanal, icerik")
      .eq("id", bildirimId)
      .maybeSingle();
    if (bildirimHata) return hataDon(res, 500, "BILDIRIM_SORGU_HATASI", bildirimHata.message);
    if (!bildirim) return hataDon(res, 404, "BILDIRIM_YOK", "Bildirim bulunamadi.");

    const fallback = await fallbackDenemeYap(bildirimId, {
      kanal: bildirim.fallback_kanal || "whatsapp",
      mesaj: bildirim.icerik || "",
    });
    if (fallback.hata) return hataDon(res, 500, "BILDIRIM_FALLBACK_HATASI", fallback.hata);

    await erisimLoguYaz(req, "admin_bildirim_fallback_dene");
    return res.json({
      mesaj: "Bildirim yedek kanal denemesi tamamlandi.",
      bildirim_id: bildirimId,
      fallback_durum: fallback.fallback_durum,
      dis_kanal_mesaj_id: fallback.dis_kanal_mesaj_id,
    });
  }
);

router.get(
  "/admin/bildirimler/fallback-rapor",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 2000);
    const kanalFiltre = String(req.query.kanal || "").trim().toLowerCase();
    const durumFiltre = String(req.query.durum || "").trim().toLowerCase();
    const klinikFiltre = String(req.query.klinik || "").trim().toLowerCase();
    const gun = Math.max(1, Math.min(60, Number(req.query.gun || 7)));
    const baslangic = new Date(Date.now() - gun * 24 * 60 * 60 * 1000).toISOString();

    let sorgu = supabaseAdmin
      .from("bildirimler")
      .select("id, kullanici_id, kanal, fallback_kanal, fallback_durum, retry_sayisi, son_hata, olusturma_tarihi")
      .not("fallback_kanal", "is", null)
      .gte("olusturma_tarihi", baslangic)
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);
    if (kanalFiltre && kanalFiltre !== "tum") {
      sorgu = sorgu.eq("fallback_kanal", kanalFiltre);
    }
    if (durumFiltre && durumFiltre !== "tum") {
      sorgu = sorgu.eq("fallback_durum", durumFiltre);
    }

    const { data, error } = await sorgu;
    if (error) return hataDon(res, 500, "BILDIRIM_FALLBACK_RAPOR_HATASI", error.message);

    const klinikHaritasiSonuc = await kullaniciKlinikHaritasiGetir((data || []).map((x) => x.kullanici_id));
    if (klinikHaritasiSonuc.hata) {
      return hataDon(res, 500, "BILDIRIM_FALLBACK_KLINIK_HARITA_HATASI", klinikHaritasiSonuc.hata);
    }

    const kayitlar = (data || []).map((satir) => ({
      ...satir,
      klinik_adi: klinikHaritasiSonuc.harita[satir.kullanici_id] || "Atanmamis Klinik",
    }));
    const filtreliKayitlar =
      klinikFiltre && klinikFiltre !== "tum"
        ? kayitlar.filter((x) => String(x.klinik_adi || "").toLowerCase() === klinikFiltre)
        : kayitlar;

    const ozet = {
      toplam: filtreliKayitlar.length,
      gonderildi: 0,
      hata: 0,
      sirada: 0,
      beklemede: 0,
      kanal_bazli: {},
      klinik_bazli: {},
      ortalama_retry: 0,
    };
    let retryToplam = 0;
    const trendMap = {};
    for (const satir of filtreliKayitlar) {
      const durum = String(satir.fallback_durum || "beklemede");
      if (durum === "gonderildi") ozet.gonderildi += 1;
      else if (durum === "hata") ozet.hata += 1;
      else if (durum === "sirada") ozet.sirada += 1;
      else ozet.beklemede += 1;

      const kanal = String(satir.fallback_kanal || "belirsiz");
      ozet.kanal_bazli[kanal] = (ozet.kanal_bazli[kanal] || 0) + 1;
      const klinik = String(satir.klinik_adi || "Atanmamis Klinik");
      ozet.klinik_bazli[klinik] = (ozet.klinik_bazli[klinik] || 0) + 1;
      retryToplam += Number(satir.retry_sayisi || 0);

      const tarihKey = String(satir.olusturma_tarihi || "").slice(0, 10);
      if (!trendMap[tarihKey]) {
        trendMap[tarihKey] = {
          tarih: tarihKey,
          toplam: 0,
          gonderildi: 0,
          hata: 0,
          sirada: 0,
          beklemede: 0,
        };
      }
      trendMap[tarihKey].toplam += 1;
      if (durum === "gonderildi") trendMap[tarihKey].gonderildi += 1;
      else if (durum === "hata") trendMap[tarihKey].hata += 1;
      else if (durum === "sirada") trendMap[tarihKey].sirada += 1;
      else trendMap[tarihKey].beklemede += 1;
    }
    ozet.ortalama_retry = ozet.toplam ? Number((retryToplam / ozet.toplam).toFixed(2)) : 0;
    const trendler = Object.values(trendMap).sort((a, b) => a.tarih.localeCompare(b.tarih));

    return res.json({
      filtre: {
        kanal: kanalFiltre || "tum",
        durum: durumFiltre || "tum",
        klinik: klinikFiltre || "tum",
        gun,
      },
      rapor: ozet,
      trendler,
      kayitlar: filtreliKayitlar,
    });
  }
);

router.get(
  "/admin/bildirimler/fallback-kuyruk",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 20, 200);
    const maxRetry = Number(process.env.NOTIFY_MAX_RETRY || 3);
    const kanalFiltre = String(req.query.kanal || "").trim().toLowerCase();
    const durumFiltre = String(req.query.durum || "").trim().toLowerCase();
    const klinikFiltre = String(req.query.klinik || "").trim().toLowerCase();
    let sorgu = supabaseAdmin
      .from("bildirimler")
      .select("id, kullanici_id, tur, baslik, fallback_kanal, fallback_durum, retry_sayisi, son_hata, son_denemede, olusturma_tarihi")
      .lt("retry_sayisi", maxRetry)
      .order("olusturma_tarihi", { ascending: true })
      .limit(limit);
    if (!durumFiltre || durumFiltre === "tum") {
      sorgu = sorgu.in("fallback_durum", ["sirada", "hata"]);
    } else {
      sorgu = sorgu.eq("fallback_durum", durumFiltre);
    }
    if (kanalFiltre && kanalFiltre !== "tum") {
      sorgu = sorgu.eq("fallback_kanal", kanalFiltre);
    }
    const { data, error } = await sorgu;
    if (error) return hataDon(res, 500, "BILDIRIM_FALLBACK_KUYRUK_HATASI", error.message);
    const klinikHaritasiSonuc = await kullaniciKlinikHaritasiGetir((data || []).map((x) => x.kullanici_id));
    if (klinikHaritasiSonuc.hata) {
      return hataDon(res, 500, "BILDIRIM_FALLBACK_KLINIK_HARITA_HATASI", klinikHaritasiSonuc.hata);
    }

    const nowMs = Date.now();
    const kayitlar = (data || []).map((x) => {
      const beklemeMs = yenidenDenemeBeklemeMs(Number(x.retry_sayisi || 0));
      const sonDenemeMs = x.son_denemede ? new Date(x.son_denemede).getTime() : 0;
      const kalanMs = sonDenemeMs ? Math.max(0, beklemeMs - (nowMs - sonDenemeMs)) : 0;
      return {
        ...x,
        klinik_adi: klinikHaritasiSonuc.harita[x.kullanici_id] || "Atanmamis Klinik",
        sonraki_deneme_kalan_sn: Math.ceil(kalanMs / 1000),
      };
    });
    const filtreliKayitlar =
      klinikFiltre && klinikFiltre !== "tum"
        ? kayitlar.filter((x) => String(x.klinik_adi || "").toLowerCase() === klinikFiltre)
        : kayitlar;
    return res.json({ kuyruk_sayisi: filtreliKayitlar.length, kayitlar: filtreliKayitlar });
  }
);

router.post(
  "/admin/bildirimler/fallback/kuyruk-isle",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  dogrula(shemalar.bildirimTopluOkundu),
  async (req, res) => {
    const limit = limitAl(req, 20, 100);
    const sonuc = await fallbackKuyruguIsle(limit);
    if (sonuc.hata) return hataDon(res, 500, "BILDIRIM_FALLBACK_KUYRUK_HATASI", sonuc.hata);

    await erisimLoguYaz(req, "admin_bildirim_fallback_kuyruk_isleme");
    return res.json({
      mesaj: "Yedek kanal kuyrugu isleme tamamlandi.",
      islenen_kayit: sonuc.sonuc.length,
      kayitlar: sonuc.sonuc,
    });
  }
);

router.post(
  "/admin/veterinerler",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  serviceRoleGerekli,
  dogrula(shemalar.adminVeterinerOlustur),
  async (req, res) => {
    const {
      eposta,
      sifre,
      ad,
      soyad,
      telefon,
      diploma_no,
      klinik_adi,
      klinik_kodu,
      uzmanlik_alani,
      il,
      ilce,
    } = req.body || {};

    if (!eposta || !sifre || !ad || !soyad || !diploma_no) {
      return res.status(400).json({
        hata: "Eksik alan: eposta, sifre, ad, soyad, diploma_no",
      });
    }
    const telefonNormalized = telefon ? telefonNormalizeEt(telefon) : "";
    if (telefon && !telefonNormalized) {
      return res.status(400).json({ hata: "Telefon formati gecersiz." });
    }
    if (telefonNormalized) {
      const telCakisma = await telefonCakisiyorMu(telefonNormalized);
      if (telCakisma.hata) return res.status(500).json({ hata: telCakisma.hata });
      if (telCakisma.cakisma) {
        return res.status(409).json({ hata: "Bu telefon numarasi baska bir kullanicida kayitli." });
      }
    }

    const { data: authKullanici, error: authHata } = await supabaseAdmin.auth.admin.createUser({
      email: eposta,
      password: sifre,
      email_confirm: true,
      user_metadata: { ad, soyad },
    });

    if (authHata || !authKullanici?.user?.id) {
      return res.status(500).json({ hata: authHata?.message || "Auth kullanicisi olusturulamadi." });
    }

    const yeniKullaniciId = authKullanici.user.id;

    const { error: kullaniciHata } = await supabaseAdmin.from("kullanicilar").insert({
      id: yeniKullaniciId,
      rol_id: ROLLER.VETERINER,
      ad,
      soyad,
      telefon: telefonNormalized || null,
      eposta,
      aktif: true,
    });

    if (kullaniciHata) {
      await supabaseAdmin.auth.admin.deleteUser(yeniKullaniciId);
      return res.status(500).json({ hata: kullaniciHata.message });
    }

    const { data: veterinerData, error: veterinerHata } = await supabaseAdmin
      .from("veteriner_profilleri")
      .insert({
        id: yeniKullaniciId,
        diploma_no,
        klinik_adi: klinik_adi || null,
        klinik_kodu: klinik_kodu || null,
        uzmanlik_alani: uzmanlik_alani || null,
        il: il || null,
        ilce: ilce || null,
      })
      .select("id, diploma_no, klinik_adi, klinik_kodu, uzmanlik_alani, il, ilce")
      .single();

    if (veterinerHata) {
      await supabaseAdmin.from("kullanicilar").delete().eq("id", yeniKullaniciId);
      await supabaseAdmin.auth.admin.deleteUser(yeniKullaniciId);
      return res.status(500).json({ hata: veterinerHata.message });
    }

    await erisimLoguYaz(req, "admin_veteriner_olusturma");
    return res.status(201).json({
      mesaj: "Veteriner hesabi olusturuldu.",
      veteriner: {
        id: yeniKullaniciId,
        ad,
        soyad,
        eposta,
        telefon: telefonNormalized || null,
        profil: veterinerData,
      },
    });
  }
);

router.patch(
  "/admin/veterinerler/:id",
  authZorunlu,
  rolGerekli(ROLLER.ADMIN),
  serviceRoleGerekli,
  dogrula(shemalar.adminVeterinerGuncelle),
  async (req, res) => {
    const veterinerId = req.params.id;
    const {
      ad,
      soyad,
      telefon,
      eposta,
      aktif,
      diploma_no,
      klinik_adi,
      klinik_kodu,
      uzmanlik_alani,
      il,
      ilce,
    } = req.body || {};

    const kullaniciGuncelle = {};
    if (ad !== undefined) kullaniciGuncelle.ad = ad;
    if (soyad !== undefined) kullaniciGuncelle.soyad = soyad;
    if (telefon !== undefined) {
      const telefonNormalized = telefon ? telefonNormalizeEt(telefon) : "";
      if (telefon && !telefonNormalized) return res.status(400).json({ hata: "Telefon formati gecersiz." });
      if (telefonNormalized) {
        const telCakisma = await telefonCakisiyorMu(telefonNormalized, veterinerId);
        if (telCakisma.hata) return res.status(500).json({ hata: telCakisma.hata });
        if (telCakisma.cakisma) return res.status(409).json({ hata: "Bu telefon numarasi baska bir kullanicida kayitli." });
      }
      kullaniciGuncelle.telefon = telefonNormalized || null;
    }
    if (eposta !== undefined) kullaniciGuncelle.eposta = eposta;
    if (aktif !== undefined) kullaniciGuncelle.aktif = aktif;

    const profilGuncelle = {};
    if (diploma_no !== undefined) profilGuncelle.diploma_no = diploma_no;
    if (klinik_adi !== undefined) profilGuncelle.klinik_adi = klinik_adi;
    if (klinik_kodu !== undefined) profilGuncelle.klinik_kodu = klinik_kodu;
    if (uzmanlik_alani !== undefined) profilGuncelle.uzmanlik_alani = uzmanlik_alani;
    if (il !== undefined) profilGuncelle.il = il;
    if (ilce !== undefined) profilGuncelle.ilce = ilce;

    let kullaniciData = null;
    let profilData = null;

    if (Object.keys(kullaniciGuncelle).length > 0) {
      const { data, error } = await supabaseAdmin
        .from("kullanicilar")
        .update(kullaniciGuncelle)
        .eq("id", veterinerId)
        .eq("rol_id", ROLLER.VETERINER)
        .select("id, ad, soyad, telefon, eposta, aktif")
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      if (!data) return res.status(404).json({ hata: "Veteriner bulunamadi." });
      kullaniciData = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("kullanicilar")
        .select("id, ad, soyad, telefon, eposta, aktif")
        .eq("id", veterinerId)
        .eq("rol_id", ROLLER.VETERINER)
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      if (!data) return res.status(404).json({ hata: "Veteriner bulunamadi." });
      kullaniciData = data;
    }

    if (Object.keys(profilGuncelle).length > 0) {
      const { data, error } = await supabaseAdmin
        .from("veteriner_profilleri")
        .update(profilGuncelle)
        .eq("id", veterinerId)
        .select("id, diploma_no, klinik_adi, klinik_kodu, uzmanlik_alani, il, ilce")
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      profilData = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("veteriner_profilleri")
        .select("id, diploma_no, klinik_adi, klinik_kodu, uzmanlik_alani, il, ilce")
        .eq("id", veterinerId)
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      profilData = data;
    }

    await erisimLoguYaz(req, "admin_veteriner_guncelleme");
    return res.json({
      mesaj: "Veteriner kaydi guncellendi.",
      veteriner: {
        ...kullaniciData,
        profil: profilData,
      },
    });
  }
);

router.get(
  "/veteriner/sahipler",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 20, 200);
    const offset = offsetAl(req);
    const arama = String(req.query.arama || "").trim();
    const aramaGuvenli = arama.replace(/[(),]/g, " ");
    const [randevuSahip, saglikHayvan, odaSahip] = await Promise.all([
      supabaseAdmin.from("randevular").select("sahibi_id").eq("veteriner_id", req.kullanici.id).limit(5000),
      supabaseAdmin.from("saglik_kayitlari").select("hayvan_id").eq("veteriner_id", req.kullanici.id).limit(5000),
      supabaseAdmin.from("mesaj_odalar").select("sahibi_id").eq("veteriner_id", req.kullanici.id).limit(5000),
    ]);
    if (randevuSahip.error) return res.status(500).json({ hata: genelSunucuHatasiMesaji() });
    if (saglikHayvan.error) return res.status(500).json({ hata: genelSunucuHatasiMesaji() });
    if (odaSahip.error) return res.status(500).json({ hata: genelSunucuHatasiMesaji() });

    let saglikSahipIdleri = [];
    const saglikHayvanIdleri = benzersizIdler((saglikHayvan.data || []).map((x) => x.hayvan_id));
    if (saglikHayvanIdleri.length) {
      const { data: saglikHayvanSahip, error: saglikSahipErr } = await supabaseAdmin
        .from("hayvanlar")
        .select("id, sahibi_id")
        .in("id", saglikHayvanIdleri)
        .limit(5000);
      if (saglikSahipErr) return res.status(500).json({ hata: genelSunucuHatasiMesaji() });
      saglikSahipIdleri = (saglikHayvanSahip || []).map((x) => x.sahibi_id);
    }

    const bagliSahipIdleri = benzersizIdler([
      ...(randevuSahip.data || []).map((x) => x.sahibi_id),
      ...saglikSahipIdleri,
      ...(odaSahip.data || []).map((x) => x.sahibi_id),
    ]);
    if (bagliSahipIdleri.length === 0) {
      return res.json({ kayit_sayisi: 0, toplam_kayit: 0, limit, offset, sahipler: [] });
    }

    let adaySahipIdleri = [...bagliSahipIdleri];

    if (arama) {
      const kullaniciSorgu = supabaseAdmin
        .from("kullanicilar")
        .select("id")
        .eq("rol_id", ROLLER.HAYVAN_SAHIBI)
        .eq("aktif", true)
        .in("id", bagliSahipIdleri);
      const telefonArama = telefonNormalizeEt(aramaGuvenli);
      const parcalar = [
        `ad.ilike.%${aramaGuvenli}%`,
        `soyad.ilike.%${aramaGuvenli}%`,
        `durapet_user_id.ilike.%${aramaGuvenli}%`,
        `telefon.ilike.%${aramaGuvenli}%`,
      ];
      if (telefonArama && telefonArama !== aramaGuvenli) parcalar.push(`telefon.ilike.%${telefonArama}%`);
      const { data: sahipAramaData, error: sahipAramaErr } = await kullaniciSorgu.or(parcalar.join(",")).limit(500);
      if (sahipAramaErr) return res.status(500).json({ hata: sahipAramaErr.message });
      adaySahipIdleri = benzersizIdler((sahipAramaData || []).map((x) => x.id));

      const { data: hayvanAramaData, error: hayvanAramaErr } = await supabaseAdmin
        .from("hayvanlar")
        .select("id, sahibi_id")
        .or(`ad.ilike.%${aramaGuvenli}%,tur.ilike.%${aramaGuvenli}%,irk.ilike.%${aramaGuvenli}%`)
        .in("sahibi_id", bagliSahipIdleri)
        .eq("aktif", true)
        .limit(500);
      if (hayvanAramaErr) return res.status(500).json({ hata: hayvanAramaErr.message });
      adaySahipIdleri = benzersizIdler([...adaySahipIdleri, ...(hayvanAramaData || []).map((x) => x.sahibi_id)]);

      const kimlikArama = aramaGuvenli.toUpperCase();
      const { data: kimlikData, error: kimlikErr } = await supabaseAdmin
        .from("hayvan_kimlikleri")
        .select("hayvan_id")
        .ilike("benzersiz_kimlik_no", `%${kimlikArama}%`)
        .limit(500);
      if (kimlikErr) return res.status(500).json({ hata: kimlikErr.message });
      const kimlikHayvanIdleri = benzersizIdler((kimlikData || []).map((x) => x.hayvan_id));
      if (kimlikHayvanIdleri.length) {
        const { data: kimlikHayvanlari, error: kimlikHayvanErr } = await supabaseAdmin
          .from("hayvanlar")
          .select("id, sahibi_id")
          .in("id", kimlikHayvanIdleri)
          .limit(500);
        if (kimlikHayvanErr) return res.status(500).json({ hata: kimlikHayvanErr.message });
        adaySahipIdleri = benzersizIdler([...adaySahipIdleri, ...(kimlikHayvanlari || []).map((x) => x.sahibi_id)]);
      }
      adaySahipIdleri = adaySahipIdleri.filter((x) => bagliSahipIdleri.includes(x));
    }

    if (arama && adaySahipIdleri.length === 0) {
      await erisimLoguYaz(req, "veteriner_sahip_listesi_goruntuleme");
      return res.json({ kayit_sayisi: 0, toplam_kayit: 0, limit, offset, sahipler: [] });
    }

    let detaySorgu = supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad, telefon, durapet_user_id, olusturma_tarihi", { count: "exact" })
      .eq("rol_id", ROLLER.HAYVAN_SAHIBI)
      .in("id", bagliSahipIdleri)
      .eq("aktif", true)
      .order("olusturma_tarihi", { ascending: false });

    if (arama) detaySorgu = detaySorgu.in("id", adaySahipIdleri);

    const { data: sahipler, error, count } = await detaySorgu.range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ hata: error.message });

    const sahipIdler = benzersizIdler((sahipler || []).map((x) => x.id));
    if (sahipIdler.length === 0) {
      await erisimLoguYaz(req, "veteriner_sahip_listesi_goruntuleme");
      return res.json({ kayit_sayisi: 0, toplam_kayit: count ?? 0, limit, offset, sahipler: [] });
    }

    const { data: hayvanlar, error: hayvanErr } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, sahibi_id, ad, tur")
      .in("sahibi_id", sahipIdler)
      .eq("aktif", true)
      .order("olusturma_tarihi", { ascending: false })
      .limit(2000);
    if (hayvanErr) return res.status(500).json({ hata: hayvanErr.message });

    const { data: sonZiyaretler, error: ziyaretErr } = await supabaseAdmin
      .from("randevular")
      .select("sahibi_id, randevu_tarihi, durum")
      .eq("veteriner_id", req.kullanici.id)
      .in("sahibi_id", sahipIdler)
      .order("randevu_tarihi", { ascending: false })
      .limit(2000);
    if (ziyaretErr) return res.status(500).json({ hata: ziyaretErr.message });

    const hayvanMap = {};
    for (const h of hayvanlar || []) {
      if (!hayvanMap[h.sahibi_id]) hayvanMap[h.sahibi_id] = [];
      hayvanMap[h.sahibi_id].push({ id: h.id, ad: h.ad, tur: h.tur });
    }

    const sonZiyaretMap = {};
    for (const z of sonZiyaretler || []) {
      if (!sonZiyaretMap[z.sahibi_id]) sonZiyaretMap[z.sahibi_id] = z.randevu_tarihi;
    }

    const zenginSahipler = (sahipler || []).map((x) => ({
      ...x,
      telefon: telefonMaskele(x.telefon),
      hayvanlar: hayvanMap[x.id] || [],
      son_ziyaret_tarihi: sonZiyaretMap[x.id] || null,
    }));

    await erisimLoguYaz(req, "veteriner_sahip_listesi_goruntuleme");
    return res.json({
      kayit_sayisi: zenginSahipler.length,
      toplam_kayit: count ?? zenginSahipler.length,
      limit,
      offset,
      sahipler: zenginSahipler,
    });
  }
);

router.post(
  "/veteriner/sahipler/hizli-kayit",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  serviceRoleGerekli,
  dogrula(shemalar.veterinerSahipHizliOlustur),
  async (req, res) => {
    const { ad, soyad, telefon, eposta } = req.body || {};
    const telefonNormalized = telefonNormalizeEt(telefon);
    if (!telefonNormalized) return res.status(400).json({ hata: "Telefon zorunludur." });

    const telCakisma = await telefonCakisiyorMu(telefonNormalized);
    if (telCakisma.hata) return res.status(500).json({ hata: telCakisma.hata });
    if (telCakisma.cakisma) {
      return res.status(409).json({
        hata: "Bu telefon numarasi ile zaten bir hesap var. Ayni numaradan ikinci hesap acilamaz.",
      });
    }

    const email = eposta || `dp-sahip-${Date.now()}-${randomUUID().slice(0, 6)}@durapet.local`;
    const sifre = `${randomUUID().replace(/-/g, "").slice(0, 10)}Aa!`;

    const { data: authKullanici, error: authHata } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: sifre,
      email_confirm: true,
      user_metadata: { ad, soyad },
    });
    if (authHata || !authKullanici?.user?.id) {
      return res.status(500).json({ hata: authHata?.message || "Sahip auth hesabi olusturulamadi." });
    }

    const kullaniciId = authKullanici.user.id;
    const { error: kullaniciHata } = await supabaseAdmin.from("kullanicilar").insert({
      id: kullaniciId,
      rol_id: ROLLER.HAYVAN_SAHIBI,
      ad,
      soyad,
      telefon: telefonNormalized,
      eposta: eposta || null,
      aktif: true,
    });
    if (kullaniciHata) {
      await supabaseAdmin.auth.admin.deleteUser(kullaniciId);
      const msg = String(kullaniciHata.message || "");
      if (
        msg.toLowerCase().includes("telefon") ||
        msg.includes("23505") ||
        msg.toLowerCase().includes("kullanicida kayitli")
      ) {
        return res.status(409).json({
          hata: "Bu telefon numarasi ile zaten bir hesap var. Ayni numaradan ikinci hesap acilamaz.",
        });
      }
      return res.status(500).json({ hata: kullaniciHata.message });
    }

    const { error: profilHata } = await supabaseAdmin.from("hayvan_sahibi_profilleri").insert({ id: kullaniciId });
    if (profilHata) {
      await supabaseAdmin.from("kullanicilar").delete().eq("id", kullaniciId);
      await supabaseAdmin.auth.admin.deleteUser(kullaniciId);
      return res.status(500).json({ hata: profilHata.message });
    }

    await erisimLoguYaz(req, "veteriner_hizli_sahip_olusturma", null);
    return res.status(201).json({
      mesaj: "Yeni sahip kaydi olusturuldu.",
      sahip: {
        id: kullaniciId,
        ad,
        soyad,
        telefon: telefonNormalized,
        eposta: eposta || null,
      },
    });
  }
);

router.get(
  "/veteriner/sahipler/:sahipId/hayvanlar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  async (req, res) => {
    const sahipId = String(req.params.sahipId || "").trim();
    if (!sahipId) return res.status(400).json({ hata: "sahipId zorunludur." });

    const limit = limitAl(req, 50, 200);
    const offset = offsetAl(req);

    const { data: sahipKontrol, error: sahipHata } = await supabaseAdmin
      .from("kullanicilar")
      .select("id")
      .eq("id", sahipId)
      .eq("rol_id", ROLLER.HAYVAN_SAHIBI)
      .eq("aktif", true)
      .maybeSingle();
    if (sahipHata) return res.status(500).json({ hata: sahipHata.message });
    if (!sahipKontrol) return res.status(404).json({ hata: "Hayvan sahibi bulunamadi." });

    const [randevuIliski, odaIliski, saglikIliski] = await Promise.all([
      supabaseAdmin
        .from("randevular")
        .select("id")
        .eq("veteriner_id", req.kullanici.id)
        .eq("sahibi_id", sahipId)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("mesaj_odalar")
        .select("id")
        .eq("veteriner_id", req.kullanici.id)
        .eq("sahibi_id", sahipId)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("saglik_kayitlari")
        .select("id, hayvan_id")
        .eq("veteriner_id", req.kullanici.id)
        .limit(1),
    ]);
    if (randevuIliski.error || odaIliski.error || saglikIliski.error) {
      return res.status(500).json({ hata: genelSunucuHatasiMesaji() });
    }
    let saglikTemelliIliski = false;
    if ((saglikIliski.data || []).length > 0) {
      const hayvanIdler = benzersizIdler((saglikIliski.data || []).map((x) => x.hayvan_id));
      if (hayvanIdler.length > 0) {
        const { data: iliskiHayvan, error: iliskiHayvanErr } = await supabaseAdmin
          .from("hayvanlar")
          .select("id")
          .in("id", hayvanIdler)
          .eq("sahibi_id", sahipId)
          .limit(1)
          .maybeSingle();
        if (iliskiHayvanErr) return res.status(500).json({ hata: genelSunucuHatasiMesaji() });
        saglikTemelliIliski = Boolean(iliskiHayvan?.id);
      }
    }
    if (!randevuIliski.data && !odaIliski.data && !saglikTemelliIliski) {
      return res.status(403).json({ hata: "Bu hayvan sahibine erisim yetkin yok." });
    }

    const { data, error, count } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, sahibi_id, ad, tur, irk, cinsiyet, dogum_tarihi, kilo, aktif, olusturma_tarihi", { count: "exact" })
      .eq("sahibi_id", sahipId)
      .eq("aktif", true)
      .order("olusturma_tarihi", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ hata: error.message });
    const hayvanIdler = (data || []).map((x) => x.id);
    if (hayvanIdler.length === 0) {
      await erisimLoguYaz(req, "veteriner_sahip_hayvan_listesi_goruntuleme");
      return res.json({ kayit_sayisi: 0, toplam_kayit: count ?? 0, limit, offset, hayvanlar: [] });
    }

    const [saglikSonuc, kimlikSonuc, randevuSonuc] = await Promise.all([
      supabaseAdmin
        .from("saglik_kayitlari")
        .select("id, hayvan_id, islem_turu, islem_tarihi")
        .in("hayvan_id", hayvanIdler)
        .order("islem_tarihi", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("hayvan_kimlikleri")
        .select("id, hayvan_id, benzersiz_kimlik_no, guncelleme_tarihi")
        .in("hayvan_id", hayvanIdler),
      supabaseAdmin
        .from("randevular")
        .select("id, hayvan_id, randevu_tarihi, randevu_saati, durum")
        .eq("veteriner_id", req.kullanici.id)
        .in("hayvan_id", hayvanIdler)
        .order("randevu_tarihi", { ascending: false })
        .limit(1000),
    ]);
    if (saglikSonuc.error) return res.status(500).json({ hata: saglikSonuc.error.message });
    if (kimlikSonuc.error) return res.status(500).json({ hata: kimlikSonuc.error.message });
    if (randevuSonuc.error) return res.status(500).json({ hata: randevuSonuc.error.message });

    const sonSaglikMap = {};
    for (const kayit of saglikSonuc.data || []) {
      if (!sonSaglikMap[kayit.hayvan_id]) sonSaglikMap[kayit.hayvan_id] = kayit;
    }
    const kimlikMap = {};
    for (const kimlik of kimlikSonuc.data || []) {
      kimlikMap[kimlik.hayvan_id] = kimlik;
    }
    const sonRandevuMap = {};
    for (const randevu of randevuSonuc.data || []) {
      if (!sonRandevuMap[randevu.hayvan_id]) sonRandevuMap[randevu.hayvan_id] = randevu;
    }
    const zenginHayvanlar = (data || []).map((h) => ({
      ...h,
      son_saglik_islem_turu: sonSaglikMap[h.id]?.islem_turu || null,
      son_saglik_tarihi: sonSaglikMap[h.id]?.islem_tarihi || null,
      kimlik_no: kimlikMap[h.id]?.benzersiz_kimlik_no || null,
      kimlik_guncelleme_tarihi: kimlikMap[h.id]?.guncelleme_tarihi || null,
      son_randevu_durumu: sonRandevuMap[h.id]?.durum || null,
      son_randevu_tarihi: sonRandevuMap[h.id]?.randevu_tarihi || null,
      son_randevu_saati: sonRandevuMap[h.id]?.randevu_saati || null,
    }));

    await erisimLoguYaz(req, "veteriner_sahip_hayvan_listesi_goruntuleme");
    return res.json({ kayit_sayisi: zenginHayvanlar.length, toplam_kayit: count ?? zenginHayvanlar.length, limit, offset, hayvanlar: zenginHayvanlar });
  }
);

router.get(
  "/veteriner/hastalar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 500);
    const [randevuSonuc, saglikSonuc] = await Promise.all([
      supabaseAdmin
        .from("randevular")
        .select("hayvan_id")
        .eq("veteriner_id", req.kullanici.id)
        .limit(limit),
      supabaseAdmin
        .from("saglik_kayitlari")
        .select("hayvan_id")
        .eq("veteriner_id", req.kullanici.id)
        .limit(limit),
    ]);

    if (randevuSonuc.error) return res.status(500).json({ hata: randevuSonuc.error.message });
    if (saglikSonuc.error) return res.status(500).json({ hata: saglikSonuc.error.message });

    const { data: odalar, error: odaHata } = await supabaseAdmin
      .from("mesaj_odalar")
      .select("hayvan_id")
      .eq("veteriner_id", req.kullanici.id)
      .limit(limit);

    if (odaHata) return res.status(500).json({ hata: odaHata.message });

    const hayvanIdler = benzersizIdler([
      ...(randevuSonuc.data || []).map((x) => x.hayvan_id),
      ...(saglikSonuc.data || []).map((x) => x.hayvan_id),
      ...(odalar || []).map((x) => x.hayvan_id),
    ]);

    if (hayvanIdler.length === 0) {
      await erisimLoguYaz(req, "veteriner_hasta_listesi_goruntuleme");
      return res.json({ kayit_sayisi: 0, hastalar: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, sahibi_id, ad, tur, irk, cinsiyet, dogum_tarihi, kilo, aktif, olusturma_tarihi")
      .in("id", hayvanIdler)
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "veteriner_hasta_listesi_goruntuleme");
    return res.json({ kayit_sayisi: data.length, hastalar: data });
  }
);

router.post(
  "/veteriner/hastalar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerHastaOlustur),
  async (req, res) => {
    const { sahibi_id, hayvan_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, kisirlastirma_durumu } = req.body || {};

    if (!sahibi_id || (!hayvan_id && (!ad || !tur))) {
      return res.status(400).json({ hata: "Eksik alan: sahibi_id ve (hayvan_id veya ad+tur)" });
    }

    const { data: sahipKontrol, error: sahipHata } = await supabaseAdmin
      .from("hayvan_sahibi_profilleri")
      .select("id")
      .eq("id", sahibi_id)
      .maybeSingle();

    if (sahipHata) return res.status(500).json({ hata: sahipHata.message });
    if (!sahipKontrol) return res.status(404).json({ hata: "Hayvan sahibi bulunamadi." });

    let hayvanKaydi = null;
    if (hayvan_id) {
      const { data, error } = await supabaseAdmin
        .from("hayvanlar")
        .select("id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, aktif, olusturma_tarihi")
        .eq("id", hayvan_id)
        .eq("sahibi_id", sahibi_id)
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      if (!data) return res.status(404).json({ hata: "Secilen hayvan bu sahibe ait degil veya bulunamadi." });
      hayvanKaydi = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("hayvanlar")
        .insert({
          sahibi_id,
          ad,
          tur,
          irk: irk || null,
          cinsiyet: cinsiyet || null,
          kan_grubu: kan_grubu || null,
          dogum_tarihi: dogum_tarihi || null,
          kilo: kilo ?? null,
          kisirlastirma_durumu: kisirlastirma_durumu ?? null,
          aktif: true,
        })
        .select("id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, aktif, olusturma_tarihi")
        .single();

      if (error) return res.status(500).json({ hata: error.message });
      hayvanKaydi = data;
    }

    const { error: odaHata } = await supabaseAdmin.from("mesaj_odalar").upsert(
      {
        veteriner_id: req.kullanici.id,
        sahibi_id,
        hayvan_id: hayvanKaydi.id,
      },
      { onConflict: "veteriner_id,sahibi_id,hayvan_id" }
    );
    if (odaHata) {
      console.error("Mesaj odasi otomatik olusturulamadi:", odaHata.message);
    }

    await erisimLoguYaz(req, hayvan_id ? "veteriner_mevcut_hasta_eslestirme" : "veteriner_hasta_kaydi_olusturma", hayvanKaydi.id);
    return res.status(201).json({
      mesaj: hayvan_id ? "Mevcut hayvan veteriner havuzuna eklendi." : "Hasta hayvan kaydi olusturuldu.",
      hayvan: hayvanKaydi,
    });
  }
);

router.patch(
  "/veteriner/hastalar/:hayvanId/sil",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanSil),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const kalici = Boolean(req.body?.kalici);
    const onayMetni = String(req.body?.onay_metni || "").trim();

    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) return res.status(403).json({ hata: "Bu hayvanda silme yetkin yok." });

    if (kalici && !kaliciSilmeOnayiGecerliMi(onayMetni)) {
      return hataDon(res, 400, "ONAY_METNI_GEREKLI", "Kalici silme icin onay_metni alanina SIL (SİL) yazilmalidir.");
    }

    const aktifRandevu = await hayvanAktifRandevuSayisi(hayvanId);
    if (aktifRandevu.hata) return res.status(500).json({ hata: aktifRandevu.hata });
    if (aktifRandevu.sayi > 0) {
      return hataDon(res, 409, "AKTIF_RANDEVU_VAR", "Hayvanin aktif randevusu oldugu icin silme islemi yapilamaz.");
    }

    if (kalici) {
      const baglilik = await hayvanSilmeOncesiBaglantilariTemizle(hayvanId);
      if (baglilik.hata) return res.status(500).json({ hata: baglilik.hata });

      const { data, error } = await supabaseAdmin
        .from("hayvanlar")
        .delete()
        .eq("id", hayvanId)
        .select("id, ad, tur")
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });
      await erisimLoguYaz(req, "veteriner_hasta_kalici_silme", hayvanId);
      return res.json({ mesaj: "Hayvan kalici olarak silindi.", hayvan: data });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .update({ aktif: false })
      .eq("id", hayvanId)
      .select("id, ad, tur, aktif")
      .maybeSingle();
    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });

    await erisimLoguYaz(req, "veteriner_hasta_pasife_alma", hayvanId);
    return res.json({ mesaj: "Hayvan pasife alindi.", hayvan: data });
  }
);

router.get(
  "/veteriner/hastalar/:hayvanId/kimlik",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) return res.status(403).json({ hata: "Bu hayvanin kimligine erisim yetkin yok." });

    const kimlikSonuc = await hayvanKimlikDetayiGetir(hayvanId);
    if (kimlikSonuc.hata && !kimlikSonuc.bulunamadi) return res.status(500).json({ hata: kimlikSonuc.hata });
    if (!kimlikSonuc.veri) return res.status(404).json({ hata: kimlikSonuc.hata || "Hayvan kimligi bulunamadi." });

    await erisimLoguYaz(req, "veteriner_hayvan_kimligi_goruntuleme", hayvanId);
    return res.json({ kimlik: kimlikSonuc.veri });
  }
);

router.get(
  "/veteriner/hastalar/:hayvanId/kimlik-gecmisi",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) return res.status(403).json({ hata: "Bu hayvanin kimlik gecmisine erisim yetkin yok." });

    const limit = limitAl(req, 20, 100);
    const sonuc = await kimlikGuncellemeGecmisiGetir(hayvanId, limit);
    if (sonuc.hata) return res.status(500).json({ hata: sonuc.hata });
    return res.json({ kayit_sayisi: sonuc.kayitlar.length, kayitlar: sonuc.kayitlar });
  }
);

router.get(
  "/veteriner/hastalar/:hayvanId/saglik-gecmisi",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }

    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) {
      return res.status(403).json({ hata: "Bu hayvanin gecmisine erisim yetkin yok." });
    }

    const limit = limitAl(req, 200, 500);
    const { data, error } = await supabaseAdmin
      .from("saglik_kayitlari")
      .select("id, randevu_id, hayvan_id, veteriner_id, islem_turu, tani_notu, subjective, objective, assessment, plan, takip_kontrol_tarihi, taburculuk_notu, triage_seviyesi, ates_c, nabiz, solunum_sayisi, kilo_kg, hassas_mi, islem_tarihi, olusturma_tarihi")
      .eq("hayvan_id", hayvanId)
      .order("islem_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "veteriner_saglik_gecmisi_goruntuleme", hayvanId);
    return res.json({ kayit_sayisi: data.length, kayitlar: data });
  }
);

router.post(
  "/veteriner/hastalar/:hayvanId/saglik-kayitlari",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.saglikKaydiEkle),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const { islem_turu, tani_notu, hassas_mi, islem_tarihi } = req.body || {};

    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }
    if (!islem_turu || !islem_tarihi) {
      return res.status(400).json({ hata: "Eksik alan: islem_turu, islem_tarihi" });
    }

    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) {
      return res.status(403).json({ hata: "Bu hayvana kayit ekleme yetkin yok." });
    }

    const { data, error } = await supabaseAdmin
      .from("saglik_kayitlari")
      .insert({
        hayvan_id: hayvanId,
        veteriner_id: req.kullanici.id,
        islem_turu,
        tani_notu: tani_notu || null,
        hassas_mi: Boolean(hassas_mi),
        islem_tarihi,
      })
      .select("id, hayvan_id, veteriner_id, islem_turu, tani_notu, hassas_mi, islem_tarihi, olusturma_tarihi")
      .single();

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "veteriner_saglik_kaydi_olusturma", hayvanId);
    return res.status(201).json({ mesaj: "Saglik kaydi eklendi.", kayit: data });
  }
);

router.get(
  "/veteriner/hastalar/:hayvanId/asilar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }

    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) {
      return res.status(403).json({ hata: "Bu hayvanin asi gecmisine erisim yetkin yok." });
    }

    const limit = limitAl(req, 100, 300);
    const { data, error } = await supabaseAdmin
      .from("asilar")
      .select("id, hayvan_id, saglik_kaydi_id, veteriner_id, asi_adi, uygulama_tarihi, tekrar_gun_sayisi, notlar, olusturma_tarihi")
      .eq("hayvan_id", hayvanId)
      .order("uygulama_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "veteriner_asi_gecmisi_goruntuleme", hayvanId);
    return res.json({ kayit_sayisi: data.length, kayitlar: data });
  }
);

router.post(
  "/veteriner/hastalar/:hayvanId/asilar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.asiKaydiEkle),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const { asi_adi, uygulama_tarihi, tekrar_gun_sayisi, notlar, saglik_kaydi_id } = req.body || {};

    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }
    if (!asi_adi || !uygulama_tarihi || !tekrar_gun_sayisi) {
      return res.status(400).json({ hata: "Eksik alan: asi_adi, uygulama_tarihi, tekrar_gun_sayisi" });
    }

    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) {
      return res.status(403).json({ hata: "Bu hayvana asi kaydi ekleme yetkin yok." });
    }

    const { data, error } = await supabaseAdmin
      .from("asilar")
      .insert({
        hayvan_id: hayvanId,
        saglik_kaydi_id: saglik_kaydi_id || null,
        veteriner_id: req.kullanici.id,
        asi_adi,
        uygulama_tarihi,
        tekrar_gun_sayisi,
        notlar: notlar || null,
      })
      .select("id, hayvan_id, saglik_kaydi_id, veteriner_id, asi_adi, uygulama_tarihi, tekrar_gun_sayisi, notlar")
      .single();

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "veteriner_asi_kaydi_olusturma", hayvanId);
    return res.status(201).json({ mesaj: "Asi kaydi eklendi.", asi: data });
  }
);

router.get(
  "/veteriner/hastalar/:hayvanId/receteler",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) return res.status(403).json({ hata: "Bu hayvanin recetelerine erisim yetkin yok." });

    const limit = limitAl(req, 100, 300);
    const { data, error } = await supabaseAdmin
      .from("receteler")
      .select("id, hayvan_id, veteriner_id, recete_metni, recete_tarihi, tani, durum, olusturma_tarihi")
      .eq("hayvan_id", hayvanId)
      .eq("veteriner_id", req.kullanici.id)
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ hata: error.message });

    const receteIdler = (data || []).map((x) => x.id);
    let kalemMap = {};
    if (receteIdler.length > 0) {
      const { data: kalemler, error: kalemHata } = await supabaseAdmin
        .from("recete_ilac_kalemleri")
        .select("id, recete_id, ilac_adi, doz, kullanim_sikligi, sure_gun, notlar")
        .in("recete_id", receteIdler)
        .order("id", { ascending: true });
      if (kalemHata) return res.status(500).json({ hata: kalemHata.message });
      kalemMap = (kalemler || []).reduce((acc, x) => {
        if (!acc[x.recete_id]) acc[x.recete_id] = [];
        acc[x.recete_id].push(x);
        return acc;
      }, {});
    }

    await erisimLoguYaz(req, "veteriner_recete_gecmisi_goruntuleme", hayvanId);
    return res.json({
      kayit_sayisi: (data || []).length,
      kayitlar: (data || []).map((x) => ({ ...x, ilaclar: kalemMap[x.id] || [] })),
    });
  }
);

router.post(
  "/veteriner/hastalar/:hayvanId/receteler",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerReceteOlustur),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const { recete_metni, tani, recete_tarihi, ilaclar } = req.body || {};
    const erisim = await veterinerHayvanaErisimVarMi(req.kullanici.id, hayvanId);
    if (erisim.hata) return res.status(500).json({ hata: erisim.hata });
    if (!erisim.izinli) return res.status(403).json({ hata: "Bu hayvana recete ekleme yetkin yok." });

    const { data: recete, error: receteHata } = await supabaseAdmin
      .from("receteler")
      .insert({
        hayvan_id: hayvanId,
        veteriner_id: req.kullanici.id,
        recete_metni,
        tani: tani || null,
        recete_tarihi: recete_tarihi || bugunTarih(),
        durum: "aktif",
      })
      .select("id, hayvan_id, veteriner_id, recete_metni, recete_tarihi, tani, durum, olusturma_tarihi")
      .single();
    if (receteHata) return res.status(500).json({ hata: receteHata.message });

    let kalemler = [];
    if (Array.isArray(ilaclar) && ilaclar.length > 0) {
      const satirlar = ilaclar.map((x) => ({
        recete_id: recete.id,
        ilac_adi: x.ilac_adi,
        doz: x.doz || null,
        kullanim_sikligi: x.kullanim_sikligi || null,
        sure_gun: x.sure_gun ?? null,
        notlar: x.notlar || null,
      }));
      const { data: kalemData, error: kalemHata } = await supabaseAdmin
        .from("recete_ilac_kalemleri")
        .insert(satirlar)
        .select("id, recete_id, ilac_adi, doz, kullanim_sikligi, sure_gun, notlar");
      if (kalemHata) return res.status(500).json({ hata: kalemHata.message });
      kalemler = kalemData || [];
    }

    await erisimLoguYaz(req, "veteriner_recete_olusturma", hayvanId);
    return res.status(201).json({ mesaj: "Recete kaydi olusturuldu.", recete: { ...recete, ilaclar: kalemler } });
  }
);

router.get(
  "/veteriner/asi-zamani-yaklasanlar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 500);
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const yediGunSonra = new Date(bugun.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data, error } = await supabaseAdmin
      .from("hatirlatmalar")
      .select("id, hayvan_id, sahibi_id, islem_turu, hedef_tarih, durum")
      .eq("veteriner_id", req.kullanici.id)
      .eq("durum", "planlandi")
      .lte("hedef_tarih", yediGunSonra)
      .order("hedef_tarih", { ascending: true })
      .limit(limit);

    if (error) {
      return res.status(500).json({ hata: error.message });
    }

    const hayvanIdler = [...new Set((data || []).map((satir) => satir.hayvan_id))];
    let hayvanAdHaritasi = {};

    if (hayvanIdler.length > 0) {
      const { data: hayvanlar } = await supabaseAdmin
        .from("hayvanlar")
        .select("id, ad")
        .in("id", hayvanIdler);

      hayvanAdHaritasi = (hayvanlar || []).reduce((acc, item) => {
        acc[item.id] = item.ad;
        return acc;
      }, {});
    }

    const sonuc = (data || []).map((satir) => {
      const kalanGun = Math.ceil(
        (new Date(satir.hedef_tarih).getTime() - bugun.getTime()) / 86400000
      );
      return {
        id: satir.id,
        hayvan_id: satir.hayvan_id,
        hayvan_adi: hayvanAdHaritasi[satir.hayvan_id] || null,
        sahibi_id: satir.sahibi_id,
        islem_turu: satir.islem_turu,
        hedef_tarih: satir.hedef_tarih,
        kalan_gun: kalanGun,
      };
    });

    await erisimLoguYaz(req, "asi_zamani_yaklasanlar_goruntuleme");
    return res.json({ kayit_sayisi: sonuc.length, veriler: sonuc });
  }
);

router.get(
  "/veteriner/randevular",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 500);
    const offset = offsetAl(req);
    const durum = String(req.query.durum || "").trim();
    const sirala = String(req.query.sirala || "tarih_asc").trim();
    const artan = sirala !== "tarih_desc";
    let sorgu = supabaseAdmin
      .from("randevular")
      .select(
        "id, hayvan_id, sahibi_id, randevu_tarihi, randevu_saati, durum, sikayet_ozet, ai_oncelik, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni",
        { count: "exact" }
      )
      .eq("veteriner_id", req.kullanici.id)
      .order("randevu_tarihi", { ascending: artan });

    if (durum && durum !== "tum") {
      sorgu = sorgu.eq("durum", durum);
    }

    const { data, error, count } = await sorgu.range(offset, offset + limit - 1);
    if (error) return hataDon(res, 500, "VETERINER_RANDEVU_LISTE_HATASI", error.message);

    const hayvanIdler = benzersizIdler((data || []).map((x) => x.hayvan_id));
    const sahipIdler = benzersizIdler((data || []).map((x) => x.sahibi_id));

    const randevuIdler = benzersizIdler((data || []).map((x) => x.id));
    const [hayvanSonuc, sahipSonuc, muayeneSonuc] = await Promise.all([
      hayvanIdler.length
        ? supabaseAdmin.from("hayvanlar").select("id, ad, tur, irk").in("id", hayvanIdler)
        : Promise.resolve({ data: [], error: null }),
      sahipIdler.length
        ? supabaseAdmin.from("kullanicilar").select("id, ad, soyad, telefon").in("id", sahipIdler)
        : Promise.resolve({ data: [], error: null }),
      randevuIdler.length
        ? supabaseAdmin
            .from("saglik_kayitlari")
            .select("id, randevu_id, islem_turu, tani_notu, islem_tarihi, subjective, objective, assessment, plan, takip_kontrol_tarihi, taburculuk_notu, triage_seviyesi, ates_c, nabiz, solunum_sayisi, kilo_kg")
            .in("randevu_id", randevuIdler)
            .order("islem_tarihi", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (hayvanSonuc.error) return hataDon(res, 500, "VETERINER_RANDEVU_HAYVAN_HATASI", hayvanSonuc.error.message);
    if (sahipSonuc.error) return hataDon(res, 500, "VETERINER_RANDEVU_SAHIP_HATASI", sahipSonuc.error.message);
    if (muayeneSonuc.error) return hataDon(res, 500, "VETERINER_RANDEVU_MUAYENE_HATASI", muayeneSonuc.error.message);

    const hayvanMap = (hayvanSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const sahipMap = (sahipSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const saglikKaydiMap = (muayeneSonuc.data || []).reduce((acc, x) => {
      if (!x.randevu_id) return acc;
      if (!acc[x.randevu_id]) acc[x.randevu_id] = x;
      return acc;
    }, {});
    const saglikKaydiIdler = benzersizIdler((Object.values(saglikKaydiMap) || []).map((x) => x.id));
    let asiMap = {};
    if (saglikKaydiIdler.length > 0) {
      const { data: asiData, error: asiHata } = await supabaseAdmin
        .from("asilar")
        .select("id, saglik_kaydi_id, asi_adi, tekrar_gun_sayisi, notlar, uygulama_tarihi")
        .in("saglik_kaydi_id", saglikKaydiIdler)
        .order("uygulama_tarihi", { ascending: false });
      if (asiHata) return hataDon(res, 500, "VETERINER_RANDEVU_ASI_HATASI", asiHata.message);
      asiMap = (asiData || []).reduce((acc, x) => {
        if (!x.saglik_kaydi_id) return acc;
        if (!acc[x.saglik_kaydi_id]) acc[x.saglik_kaydi_id] = x;
        return acc;
      }, {});
    }
    const zenginRandevular = (data || []).map((x) => ({
      ...x,
      hayvan: hayvanMap[x.hayvan_id] || null,
      sahip: sahipMap[x.sahibi_id] || null,
      muayene_ozeti: saglikKaydiMap[x.id]
        ? {
            saglik_kaydi_id: saglikKaydiMap[x.id].id,
            islem_turu: saglikKaydiMap[x.id].islem_turu,
            tani_notu: saglikKaydiMap[x.id].tani_notu,
            islem_tarihi: saglikKaydiMap[x.id].islem_tarihi,
            subjective: saglikKaydiMap[x.id].subjective || null,
            objective: saglikKaydiMap[x.id].objective || null,
            assessment: saglikKaydiMap[x.id].assessment || null,
            plan: saglikKaydiMap[x.id].plan || null,
            takip_kontrol_tarihi: saglikKaydiMap[x.id].takip_kontrol_tarihi || null,
            taburculuk_notu: saglikKaydiMap[x.id].taburculuk_notu || null,
            triage_seviyesi: saglikKaydiMap[x.id].triage_seviyesi || null,
            ates_c: saglikKaydiMap[x.id].ates_c ?? null,
            nabiz: saglikKaydiMap[x.id].nabiz ?? null,
            solunum_sayisi: saglikKaydiMap[x.id].solunum_sayisi ?? null,
            kilo_kg: saglikKaydiMap[x.id].kilo_kg ?? null,
            asi_uygulandi: Boolean(asiMap[saglikKaydiMap[x.id].id]),
            asi_adi: asiMap[saglikKaydiMap[x.id].id]?.asi_adi || null,
            asi_tekrar_gun_sayisi: asiMap[saglikKaydiMap[x.id].id]?.tekrar_gun_sayisi || null,
            asi_notu: asiMap[saglikKaydiMap[x.id].id]?.notlar || null,
            asi_tarihi: asiMap[saglikKaydiMap[x.id].id]?.uygulama_tarihi || null,
          }
        : null,
    }));

    await erisimLoguYaz(req, "veteriner_randevu_listesi_goruntuleme");
    return res.json({
      kayit_sayisi: zenginRandevular.length,
      toplam_kayit: count ?? zenginRandevular.length,
      limit,
      offset,
      randevular: zenginRandevular,
    });
  }
);

router.get(
  "/veteriner/ozet-kpi",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  async (req, res) => {
    const bugun = bugunTarih();
    const baslangic = String(req.query.baslangic || "").trim() || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const bitis = String(req.query.bitis || "").trim() || bugun;

    const { data: randevular, error: randevuHata } = await supabaseAdmin
      .from("randevular")
      .select("id, durum, randevu_tarihi, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani")
      .eq("veteriner_id", req.kullanici.id)
      .gte("randevu_tarihi", baslangic)
      .lte("randevu_tarihi", bitis);
    if (randevuHata) return hataDon(res, 500, "VETERINER_KPI_RANDEVU_HATASI", randevuHata.message);

    const toplam = (randevular || []).length;
    const tamamlanan = (randevular || []).filter((x) => x.durum === "tamamlandi").length;
    const noShow = (randevular || []).filter((x) => x.durum === "no_show").length;
    const checkoutlu = (randevular || []).filter((x) => x.durum === "tamamlandi" && Boolean(x.checkout_zamani)).length;

    const beklemeSureleri = (randevular || [])
      .filter((x) => x.hasta_kabul_zamani && x.muayene_baslama_zamani)
      .map((x) => {
        const bas = new Date(x.hasta_kabul_zamani).getTime();
        const muayene = new Date(x.muayene_baslama_zamani).getTime();
        return Math.max(0, Math.round((muayene - bas) / 60000));
      });
    const ortBekleme = beklemeSureleri.length
      ? Math.round(beklemeSureleri.reduce((acc, x) => acc + x, 0) / beklemeSureleri.length)
      : 0;

    const { data: triageKayitlari, error: triageHata } = await supabaseAdmin
      .from("saglik_kayitlari")
      .select("triage_seviyesi, islem_tarihi")
      .eq("veteriner_id", req.kullanici.id)
      .gte("islem_tarihi", `${baslangic}T00:00:00.000Z`)
      .lte("islem_tarihi", `${bitis}T23:59:59.999Z`);
    if (triageHata) return hataDon(res, 500, "VETERINER_KPI_TRIAGE_HATASI", triageHata.message);

    const triageDagilimi = (triageKayitlari || []).reduce(
      (acc, x) => {
        const key = x.triage_seviyesi || "belirsiz";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { dusuk: 0, orta: 0, yuksek: 0, kritik: 0, belirsiz: 0 }
    );

    await erisimLoguYaz(req, "veteriner_kpi_ozeti_goruntuleme");
    return res.json({
      donem: { baslangic, bitis },
      toplam_randevu: toplam,
      tamamlanan_randevu: tamamlanan,
      no_show_randevu: noShow,
      no_show_orani: toplam > 0 ? Number(((noShow / toplam) * 100).toFixed(2)) : 0,
      checkout_tamamlama_orani: tamamlanan > 0 ? Number(((checkoutlu / tamamlanan) * 100).toFixed(2)) : 0,
      ortalama_bekleme_dk: ortBekleme,
      triage_dagilimi: triageDagilimi,
    });
  }
);

router.patch(
  "/veteriner/randevular/:id/ilerlet",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuIlerlet),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();

    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    if (RANDEVU_BITMIS_DURUMLAR.includes(mevcut.durum)) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Bitmis randevu ilerletilemez.");
    }

    const hedefDurum = randevuSonrakiDurum(mevcut.durum);
    if (!hedefDurum) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Bu randevu durumu icin otomatik ilerleme tanimli degil.");
    }
    if (!randevuDurumGecisiGecerliMi(mevcut.durum, hedefDurum)) {
      return hataDon(res, 400, "RANDEVU_GECIS_GECERSIZ", "Randevu bir sonraki asamaya gecirilemedi.");
    }

    if (hedefDurum === "onaylandi") {
      const cakisma = await randevuCakismaVarMi(req.kullanici.id, mevcut.randevu_tarihi, mevcut.randevu_saati, randevuId);
      if (cakisma.hata) return res.status(500).json({ hata: cakisma.hata });
      if (cakisma.cakisma) {
        return hataDon(res, 409, "RANDEVU_CAKISMA", "Ayni tarih/saatte baska randevu var. Lutfen takvimi duzenleyin.");
      }
    }

    const durumGuncelleme = {
      durum: hedefDurum,
      iptal_nedeni: null,
      no_show_zamani: null,
      no_show_nedeni: null,
    };
    if (hedefDurum === "geldi" && !mevcut.hasta_kabul_zamani) {
      durumGuncelleme.hasta_kabul_zamani = new Date().toISOString();
    }
    if (hedefDurum === "muayenede") {
      if (!mevcut.hasta_kabul_zamani) durumGuncelleme.hasta_kabul_zamani = new Date().toISOString();
      if (!mevcut.muayene_baslama_zamani) durumGuncelleme.muayene_baslama_zamani = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update(durumGuncelleme)
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();
    if (error) return hataDon(res, 500, "RANDEVU_DURUM_GUNCELLEME_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");

    if (hedefDurum === "onaylandi") {
      const plan = await randevuHatirlatmalariniPlanla(data);
      if (plan.hata) console.error("Randevu hatirlatmalari planlanamadi:", plan.hata);
      const onayBildirim = await bildirimOlustur({
        kullanici_id: data.sahibi_id,
        tur: "randevu_onaylandi",
        baslik: "Randevunuz onaylandı",
        icerik: `${data.randevu_tarihi} ${saatNormalizasyonu(data.randevu_saati)} tarihli randevunuz onaylandı.`,
        referans_hayvan_id: data.hayvan_id,
        referans_randevu_id: data.id,
        kaynak_veteriner_id: data.veteriner_id,
        kanal: "push",
        fallback_kanal: "whatsapp",
        fallback_tetikle: false,
      });
      if (onayBildirim.hata) console.error("Randevu onay bildirimi:", onayBildirim.hata);
    }

    await erisimLoguYaz(req, `veteriner_randevu_ilerlet_${hedefDurum}`, data.hayvan_id);
    return res.json({
      mesaj: `Randevu '${mevcut.durum}' durumundan '${hedefDurum}' durumuna ilerletildi.`,
      onceki_durum: mevcut.durum,
      yeni_durum: hedefDurum,
      randevu: data,
    });
  }
);

router.patch(
  "/veteriner/randevular/:id/onayla",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.sayisalIdParam),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return res.status(400).json({ hata: "Gecersiz randevu id." });
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();

    if (mevcutHata) {
      return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    }
    if (!mevcut) {
      return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    }
    if (!randevuDurumGecisiGecerliMi(mevcut.durum, "onaylandi")) {
      return hataDon(
        res,
        400,
        "RANDEVU_DURUM_GECERSIZ",
        `Randevu '${mevcut.durum}' durumundayken onaylanamaz.`
      );
    }

    const cakisma = await randevuCakismaVarMi(req.kullanici.id, mevcut.randevu_tarihi, mevcut.randevu_saati, randevuId);
    if (cakisma.hata) return res.status(500).json({ hata: cakisma.hata });
    if (cakisma.cakisma) {
      return hataDon(res, 409, "RANDEVU_CAKISMA", "Ayni tarih/saatte baska randevu var. Lutfen takvimi duzenleyin.");
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update({
        durum: "onaylandi",
        iptal_nedeni: null,
        no_show_zamani: null,
        no_show_nedeni: null,
      })
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();

    if (error) {
      const cevap = supabaseHataYorumla(error, "Randevu onaylanamadi.");
      return hataDon(
        res,
        cevap.durum,
        cevap.durum === 409 ? "RANDEVU_CAKISMA" : cevap.durum === 400 ? "RANDEVU_GECERSIZ" : "RANDEVU_ONAY_HATASI",
        cevap.mesaj
      );
    }

    if (!data) {
      return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    }

    const plan = await randevuHatirlatmalariniPlanla(data);
    if (plan.hata) {
      console.error("Randevu hatirlatmalari planlanamadi:", plan.hata);
    }

    const onayPush = await bildirimOlustur({
      kullanici_id: data.sahibi_id,
      tur: "randevu_onaylandi",
      baslik: "Randevunuz onaylandı",
      icerik: `${data.randevu_tarihi} ${saatNormalizasyonu(data.randevu_saati)} tarihli randevunuz onaylandı.`,
      referans_hayvan_id: data.hayvan_id,
      referans_randevu_id: data.id,
      kaynak_veteriner_id: data.veteriner_id,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: false,
    });
    if (onayPush.hata) {
      console.error("Randevu onay bildirimi:", onayPush.hata);
    }

    await erisimLoguYaz(req, "veteriner_randevu_onaylama", data.hayvan_id);
    return res.json({ mesaj: "Randevu onaylandi.", randevu: data });
  }
);

router.patch(
  "/veteriner/randevular/:id/durum",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuDurumGuncelle),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    const hedefDurum = String(req.body?.durum || "");
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, veteriner_id, durum, hasta_kabul_zamani, muayene_baslama_zamani")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();
    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    if (RANDEVU_BITMIS_DURUMLAR.includes(mevcut.durum)) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Bitmis randevuda durum guncellenemez.");
    }

    if (!randevuDurumGecisiGecerliMi(mevcut.durum, hedefDurum)) {
      return hataDon(res, 400, "RANDEVU_GECIS_GECERSIZ", "Mevcut randevu durumundan hedef duruma gecis izni yok.");
    }

    const durumGuncelleme = { durum: hedefDurum };
    if (hedefDurum === "geldi" && !mevcut.hasta_kabul_zamani) {
      durumGuncelleme.hasta_kabul_zamani = new Date().toISOString();
    }
    if (hedefDurum === "muayenede") {
      if (!mevcut.hasta_kabul_zamani) durumGuncelleme.hasta_kabul_zamani = new Date().toISOString();
      if (!mevcut.muayene_baslama_zamani) durumGuncelleme.muayene_baslama_zamani = new Date().toISOString();
    }
    durumGuncelleme.no_show_zamani = null;
    durumGuncelleme.no_show_nedeni = null;
    durumGuncelleme.iptal_nedeni = null;

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update(durumGuncelleme)
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();
    if (error) return hataDon(res, 500, "RANDEVU_DURUM_GUNCELLEME_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");

    if (hedefDurum === "onaylandi") {
      const plan = await randevuHatirlatmalariniPlanla(data);
      if (plan.hata) console.error("Randevu hatirlatmalari planlanamadi:", plan.hata);
      const onayB = await bildirimOlustur({
        kullanici_id: data.sahibi_id,
        tur: "randevu_onaylandi",
        baslik: "Randevunuz onaylandı",
        icerik: `${data.randevu_tarihi} ${saatNormalizasyonu(data.randevu_saati)} tarihli randevunuz onaylandı.`,
        referans_hayvan_id: data.hayvan_id,
        referans_randevu_id: data.id,
        kaynak_veteriner_id: data.veteriner_id,
        kanal: "push",
        fallback_kanal: "whatsapp",
        fallback_tetikle: false,
      });
      if (onayB.hata) console.error("Randevu onay bildirimi:", onayB.hata);
    }

    await erisimLoguYaz(req, `veteriner_randevu_durum_${hedefDurum}`, data.hayvan_id);
    return res.json({ mesaj: `Randevu durumu '${hedefDurum}' olarak guncellendi.`, randevu: data });
  }
);

router.patch(
  "/veteriner/randevular/:id/no-show",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuNoShow),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    const noShowNedeni = req.body?.no_show_nedeni || null;
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, veteriner_id, durum, muayene_baslama_zamani")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();
    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    if (!randevuDurumGecisiGecerliMi(mevcut.durum, "no_show")) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "No-show bu randevu durumu icin uygulanamaz.");
    }
    if (mevcut.muayene_baslama_zamani) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Muayene baslamis randevu no-show olarak isaretlenemez.");
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update({
        durum: "no_show",
        no_show_zamani: new Date().toISOString(),
        no_show_nedeni: noShowNedeni,
      })
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();
    if (error) return hataDon(res, 500, "RANDEVU_NO_SHOW_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");

    const iptal = await randevuHatirlatmalariniIptalEt(randevuId);
    if (iptal.hata) console.error("Randevu hatirlatmalari kapatilamadi:", iptal.hata);

    await erisimLoguYaz(req, "veteriner_randevu_no_show", data.hayvan_id);
    return res.json({ mesaj: "Randevu no-show olarak isaretlendi.", randevu: data });
  }
);

router.patch(
  "/veteriner/randevular/:id/tamamla",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuTamamla),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    const { islem_turu, tani_notu, subjective, objective, assessment, plan, takip_kontrol_tarihi, taburculuk_notu, triage_seviyesi, ates_c, nabiz, solunum_sayisi, kilo_kg, asi_uygulandi, asi_adi, tekrar_gun_sayisi, asi_notu, checkout_ile_kapat } = req.body || {};
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }
    if (!islem_turu) {
      return hataDon(res, 400, "ISLEM_TURU_ZORUNLU", "Randevu tamamlarken islem turu zorunludur.");
    }
    if (asi_uygulandi && (!asi_adi || !tekrar_gun_sayisi)) {
      return hataDon(res, 400, "ASI_BILGISI_EKSIK", "Asi uygulandi secildiyse asi adi ve tekrar gunu zorunludur.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();
    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Tamamlanabilecek randevu bulunamadi.");
    if (["tamamlandi", "iptal", "no_show"].includes(mevcut.durum)) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Bu randevu mevcut durumundan tamamlanamaz.");
    }

    const simdi = new Date().toISOString();
    const tamamlaGuncelleme = {
      durum: "tamamlandi",
      iptal_nedeni: null,
      no_show_zamani: null,
      no_show_nedeni: null,
      hasta_kabul_zamani: mevcut.hasta_kabul_zamani || simdi,
      muayene_baslama_zamani: mevcut.muayene_baslama_zamani || simdi,
      checkout_zamani: checkout_ile_kapat ? simdi : mevcut.checkout_zamani || null,
    };

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update(tamamlaGuncelleme)
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();

    if (error) return hataDon(res, 500, "RANDEVU_TAMAMLAMA_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Tamamlanabilecek randevu bulunamadi.");

    const iptal = await randevuHatirlatmalariniIptalEt(randevuId);
    if (iptal.hata) {
      console.error("Randevu hatirlatmalari kapatilamadi:", iptal.hata);
    }

    const islemTarihi = new Date(`${data.randevu_tarihi}T${saatNormalizasyonu(data.randevu_saati) || "10:00:00"}Z`).toISOString();
    const { data: saglikKaydi, error: saglikHata } = await supabaseAdmin
      .from("saglik_kayitlari")
      .insert({
        randevu_id: randevuId,
        hayvan_id: data.hayvan_id,
        veteriner_id: req.kullanici.id,
        islem_turu,
        tani_notu: tani_notu || null,
        subjective: subjective || null,
        objective: objective || null,
        assessment: assessment || null,
        plan: plan || null,
        takip_kontrol_tarihi: takip_kontrol_tarihi || null,
        taburculuk_notu: taburculuk_notu || null,
        triage_seviyesi: triage_seviyesi || null,
        ates_c: ates_c ?? null,
        nabiz: nabiz ?? null,
        solunum_sayisi: solunum_sayisi ?? null,
        kilo_kg: kilo_kg ?? null,
        hassas_mi: false,
        islem_tarihi: islemTarihi,
      })
      .select("id, hayvan_id, veteriner_id, islem_turu, tani_notu, subjective, objective, assessment, plan, takip_kontrol_tarihi, taburculuk_notu, triage_seviyesi, ates_c, nabiz, solunum_sayisi, kilo_kg, islem_tarihi")
      .single();
    if (saglikHata) {
      return hataDon(res, 500, "SAGLIK_KAYDI_OLUSTURMA_HATASI", saglikHata.message);
    }

    let asiKaydi = null;
    if (asi_uygulandi) {
      const { data: asiData, error: asiHata } = await supabaseAdmin
        .from("asilar")
        .insert({
          hayvan_id: data.hayvan_id,
          saglik_kaydi_id: saglikKaydi.id,
          veteriner_id: req.kullanici.id,
          asi_adi,
          uygulama_tarihi: data.randevu_tarihi,
          tekrar_gun_sayisi: Number(tekrar_gun_sayisi),
          notlar: asi_notu || null,
        })
        .select("id, hayvan_id, asi_adi, uygulama_tarihi, tekrar_gun_sayisi, notlar")
        .single();
      if (asiHata) return hataDon(res, 500, "ASI_KAYDI_OLUSTURMA_HATASI", asiHata.message);
      asiKaydi = asiData;
    }

    const { data: hayvanBilgi, error: hayvanBilgiHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, ad")
      .eq("id", data.hayvan_id)
      .maybeSingle();
    if (hayvanBilgiHata) {
      console.error("Tamamlama sonrasi hayvan bilgisi alinamadi:", hayvanBilgiHata.message);
    }
    const hayvanAdi = String(hayvanBilgi?.ad || `Hayvan #${data.hayvan_id}`);
    const takipMetni = takip_kontrol_tarihi ? ` Takip kontrol: ${takip_kontrol_tarihi}.` : "";
    const asiMetni = asiKaydi ? ` Uygulanan asi: ${asiKaydi.asi_adi}.` : "";
    const taniMetni = tani_notu ? ` Not: ${metinKisalt(tani_notu, 140)}.` : "";
    const taburculukMetni = taburculuk_notu ? ` Taburculuk: ${metinKisalt(taburculuk_notu, 140)}.` : "";
    const ozetIcerik = `${hayvanAdi} icin muayene tamamlandi. Islem: ${islem_turu}.${asiMetni}${takipMetni}${taniMetni}${taburculukMetni}`.replace(
      /\s+/g,
      " "
    );
    const ozetBildirim = await bildirimOlustur({
      kullanici_id: data.sahibi_id,
      tur: "muayene_ozeti",
      baslik: `${hayvanAdi} muayene ozeti`,
      icerik: ozetIcerik,
      referans_hayvan_id: data.hayvan_id,
      referans_randevu_id: data.id,
      kaynak_veteriner_id: req.kullanici.id,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: true,
    });
    if (ozetBildirim.hata) {
      console.error("Muayene ozet bildirimi gonderilemedi:", ozetBildirim.hata);
    }

    await erisimLoguYaz(req, checkout_ile_kapat ? "veteriner_randevu_tamamlama_checkout" : "veteriner_randevu_tamamlama", data.hayvan_id);
    return res.json({
      mesaj: checkout_ile_kapat
        ? "Randevu tamamlandi, checkout yapildi ve kayitlara islendi."
        : "Randevu tamamlandi ve kayitlara islendi.",
      randevu: data,
      saglik_kaydi: saglikKaydi,
      asi_kaydi: asiKaydi,
    });
  }
);

router.patch(
  "/veteriner/randevular/:id/checkout",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuCheckout),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, hayvan_id, veteriner_id, durum, checkout_zamani")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();
    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    if (mevcut.durum !== "tamamlandi") {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Checkout sadece tamamlanmis randevular icin uygulanabilir.");
    }
    if (mevcut.checkout_zamani) {
      return hataDon(res, 400, "RANDEVU_CHECKOUT_ZATEN_VAR", "Bu randevu icin checkout zaten yapilmis.");
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update({ checkout_zamani: new Date().toISOString() })
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();
    if (error) return hataDon(res, 500, "RANDEVU_CHECKOUT_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");

    await erisimLoguYaz(req, "veteriner_randevu_checkout", data.hayvan_id);
    return res.json({ mesaj: "Checkout zamani kaydedildi.", randevu: data });
  }
);

router.patch(
  "/veteriner/randevular/:id/iptal",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerRandevuIptal),
  async (req, res) => {
    const randevuId = Number(req.params.id);
    const { iptal_nedeni } = req.body || {};

    if (!Number.isFinite(randevuId) || randevuId <= 0) {
      return hataDon(res, 400, "GECERSIZ_RANDEVU_ID", "Gecersiz randevu id.");
    }

    const { data: mevcut, error: mevcutHata } = await supabaseAdmin
      .from("randevular")
      .select("id, durum")
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .maybeSingle();
    if (mevcutHata) return hataDon(res, 500, "RANDEVU_SORGU_HATASI", mevcutHata.message);
    if (!mevcut) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");
    if (!randevuDurumGecisiGecerliMi(mevcut.durum, "iptal")) {
      return hataDon(res, 400, "RANDEVU_DURUM_GECERSIZ", "Bu randevu iptal edilemez.");
    }

    const { data, error } = await supabaseAdmin
      .from("randevular")
      .update({ durum: "iptal", iptal_nedeni: iptal_nedeni || null })
      .eq("id", randevuId)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum, iptal_nedeni, hasta_kabul_zamani, muayene_baslama_zamani, checkout_zamani, no_show_zamani, no_show_nedeni")
      .maybeSingle();

    if (error) return hataDon(res, 500, "RANDEVU_IPTAL_HATASI", error.message);
    if (!data) return hataDon(res, 404, "RANDEVU_YOK", "Randevu bulunamadi.");

    const iptal = await randevuHatirlatmalariniIptalEt(randevuId);
    if (iptal.hata) {
      console.error("Randevu hatirlatmalari kapatilamadi:", iptal.hata);
    }

    const sahipBildirim = await bildirimOlustur({
      kullanici_id: data.sahibi_id,
      tur: "randevu_iptal_veteriner",
      baslik: "Randevu iptal edildi",
      icerik: `Veteriner randevunuzu iptal etti.${iptal_nedeni ? ` ${String(iptal_nedeni).slice(0, 200)}` : ""}`,
      referans_hayvan_id: data.hayvan_id,
      referans_randevu_id: data.id,
      kaynak_veteriner_id: req.kullanici.id,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: false,
    });
    if (sahipBildirim.hata) {
      console.error("Sahip iptal bildirimi:", sahipBildirim.hata);
    }

    await erisimLoguYaz(req, "veteriner_randevu_iptal", data.hayvan_id);
    return res.json({ mesaj: "Randevu iptal edildi.", randevu: data });
  }
);

router.post(
  "/veteriner/hizli-mesaj",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerHizliMesaj),
  async (req, res) => {
    const { sahibi_id, hayvan_id, mesaj, kanal = "push", sablon_adi = null } = req.body || {};

    if (!sahibi_id || !hayvan_id || !mesaj) {
      return res.status(400).json({ hata: "Eksik alan: sahibi_id, hayvan_id, mesaj" });
    }

    const { data: hayvan, error: hayvanHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, sahibi_id")
      .eq("id", hayvan_id)
      .maybeSingle();

    if (hayvanHata) return res.status(500).json({ hata: hayvanHata.message });
    if (!hayvan) return res.status(404).json({ hata: "Hayvan bulunamadi." });
    if (hayvan.sahibi_id !== sahibi_id) {
      return res.status(400).json({ hata: "sahibi_id ile hayvan eslesmiyor." });
    }

    const { data: odaData, error: odaHata } = await supabaseAdmin
      .from("mesaj_odalar")
      .upsert(
        {
          veteriner_id: req.kullanici.id,
          sahibi_id,
          hayvan_id,
        },
        { onConflict: "veteriner_id,sahibi_id,hayvan_id" }
      )
      .select("id, veteriner_id, sahibi_id, hayvan_id")
      .single();

    if (odaHata || !odaData) {
      return res.status(500).json({ hata: odaHata?.message || "Mesaj odasi olusturulamadi." });
    }

    const { data: mesajData, error: mesajHata } = await supabaseAdmin
      .from("mesajlar")
      .insert({
        oda_id: odaData.id,
        gonderen_id: req.kullanici.id,
        icerik: mesaj,
      })
      .select("id, oda_id, gonderen_id, icerik, olusturma_tarihi")
      .single();

    if (mesajHata) {
      return res.status(500).json({ hata: mesajHata.message });
    }

    const bildirimSonuc = await bildirimOlustur({
      kullanici_id: sahibi_id,
      tur: "yeni_mesaj",
      baslik: "Veterinerden yeni mesaj",
      icerik: mesaj,
      referans_oda_id: odaData.id,
      referans_hayvan_id: hayvan_id,
      mesaj_sablon_adi: sablon_adi || null,
      kaynak_veteriner_id: req.kullanici.id,
      kanal,
      fallback_kanal: kanal === "push" ? "whatsapp" : kanal,
      fallback_tetikle: kanal !== "push",
    });
    if (bildirimSonuc.hata) {
      console.error("Bildirim olusturulamadi:", bildirimSonuc.hata);
    }

    await erisimLoguYaz(req, "veteriner_hizli_mesaj_gonderme", Number(hayvan_id));
    return res.status(201).json({
      mesaj:
        kanal !== "push" && bildirimSonuc.bildirim?.fallback_durum === "hata"
          ? "Hizli mesaj kaydedildi ancak dis kanal gonderimi basarisiz."
          : "Hizli mesaj gonderildi.",
      oda: odaData,
      ileti: mesajData,
      gonderim: {
        kanal,
        fallback_durum: bildirimSonuc.bildirim?.fallback_durum || null,
        fallback_kanal: bildirimSonuc.bildirim?.fallback_kanal || null,
        retry_sayisi: Number(bildirimSonuc.bildirim?.retry_sayisi || 0),
        dis_kanal_mesaj_id: bildirimSonuc.bildirim?.dis_kanal_mesaj_id || null,
        son_hata: bildirimSonuc.bildirim?.son_hata || null,
      },
    });
  }
);

router.get(
  "/veteriner/iletisim/kanal-ayarlari",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  async (req, res) => {
    let klinikKoduKolonuVar = true;
    const profilSonuc = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id, klinik_adi, klinik_kodu")
      .eq("id", req.kullanici.id)
      .maybeSingle();
    if (profilSonuc.error) {
      const kolonYok = String(profilSonuc.error.message || "").includes("klinik_kodu");
      klinikKoduKolonuVar = !kolonYok;
      if (!kolonYok) return hataDon(res, 500, "VETERINER_KLINIK_BILGI_HATASI", profilSonuc.error.message);
    }

    const mevcutKlinikKodu = profilSonuc.data?.klinik_kodu || `klinik-${String(req.kullanici.id).slice(0, 8)}`;
    if (klinikKoduKolonuVar && !profilSonuc.data?.klinik_kodu) {
      await supabaseAdmin.from("veteriner_profilleri").update({ klinik_kodu: mevcutKlinikKodu }).eq("id", req.kullanici.id);
    }

    const ayarSonuc = await klinikBildirimAyariGetir(mevcutKlinikKodu);
    if (ayarSonuc.hata) return hataDon(res, 500, "KLINIK_BILDIRIM_AYAR_HATASI", ayarSonuc.hata);

    const ayar = ayarSonuc.ayar || {
      provider: String(process.env.NOTIFY_PROVIDER || "mock").toLowerCase(),
      aktif: true,
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_whatsapp_from: null,
      webhook_url: null,
      webhook_token: null,
      infobip_base_url: null,
      infobip_api_key: null,
      infobip_sender: null,
    };

    return res.json({
      klinik: {
        klinik_adi: profilSonuc.data?.klinik_adi || null,
        klinik_kodu: mevcutKlinikKodu,
      },
      ayar: {
        provider: ayar.provider || "mock",
        aktif: ayar.aktif !== false,
        twilio_account_sid_maskeli: metinMaskele(ayar.twilio_account_sid, 4),
        twilio_auth_token_tanimli: Boolean(ayar.twilio_auth_token),
        twilio_whatsapp_from: ayar.twilio_whatsapp_from || null,
        webhook_url: ayar.webhook_url || null,
        webhook_token_tanimli: Boolean(ayar.webhook_token),
        infobip_base_url: ayar.infobip_base_url || null,
        infobip_api_key_tanimli: Boolean(ayar.infobip_api_key),
        infobip_sender: ayar.infobip_sender || null,
      },
    });
  }
);

router.patch(
  "/veteriner/iletisim/kanal-ayarlari",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerIletisimAyarGuncelle),
  async (req, res) => {
    const {
      klinik_kodu,
      provider,
      twilio_account_sid,
      twilio_auth_token,
      twilio_whatsapp_from,
      webhook_url,
      webhook_token,
      infobip_base_url,
      infobip_api_key,
      infobip_sender,
      aktif,
    } = req.body || {};

    const profilSonuc = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id, klinik_kodu")
      .eq("id", req.kullanici.id)
      .maybeSingle();
    if (profilSonuc.error) return hataDon(res, 500, "VETERINER_PROFIL_HATASI", profilSonuc.error.message);
    if (!profilSonuc.data) return hataDon(res, 404, "VETERINER_YOK", "Veteriner profili bulunamadi.");

    const yeniKlinikKodu = (String(klinik_kodu || "").trim() || profilSonuc.data.klinik_kodu || `klinik-${String(req.kullanici.id).slice(0, 8)}`).toLowerCase();
    const kodGuncel = await supabaseAdmin.from("veteriner_profilleri").update({ klinik_kodu: yeniKlinikKodu }).eq("id", req.kullanici.id);
    if (kodGuncel.error) return hataDon(res, 500, "KLINIK_KODU_GUNCELLEME_HATASI", kodGuncel.error.message);

    const upsertPayload = {
      klinik_kodu: yeniKlinikKodu,
      provider: provider || "mock",
      twilio_account_sid: twilio_account_sid || null,
      twilio_auth_token: twilio_auth_token ? secretSifrele(twilio_auth_token) : null,
      twilio_whatsapp_from: twilio_whatsapp_from || null,
      webhook_url: webhook_url || null,
      webhook_token: webhook_token ? secretSifrele(webhook_token) : null,
      infobip_base_url: infobip_base_url || null,
      infobip_api_key: infobip_api_key ? secretSifrele(infobip_api_key) : null,
      infobip_sender: infobip_sender || null,
      aktif: aktif !== false,
      guncelleyen_veteriner_id: req.kullanici.id,
    };

    let { data, error } = await supabaseAdmin
      .from("klinik_bildirim_ayarlari")
      .upsert(upsertPayload, { onConflict: "klinik_kodu" })
      .select("klinik_kodu, provider, aktif, twilio_account_sid, twilio_whatsapp_from, webhook_url, infobip_base_url, infobip_sender")
      .single();
    if (
      error &&
      (String(error.message || "").includes("infobip_base_url") || String(error.message || "").includes("infobip_sender"))
    ) {
      const eskiPayload = { ...upsertPayload };
      delete eskiPayload.infobip_base_url;
      delete eskiPayload.infobip_api_key;
      delete eskiPayload.infobip_sender;
      const tekrar = await supabaseAdmin
        .from("klinik_bildirim_ayarlari")
        .upsert(eskiPayload, { onConflict: "klinik_kodu" })
        .select("klinik_kodu, provider, aktif, twilio_account_sid, twilio_whatsapp_from, webhook_url")
        .single();
      data = tekrar.data ? { ...tekrar.data, infobip_base_url: null, infobip_sender: null } : tekrar.data;
      error = tekrar.error;
    }
    if (error) return hataDon(res, 500, "KLINIK_BILDIRIM_AYAR_KAYIT_HATASI", error.message);

    await erisimLoguYaz(req, "veteriner_iletisim_kanal_ayari_guncelleme");
    return res.json({
      mesaj: "Klinik kanal ayarlari kaydedildi.",
      ayar: {
        klinik_kodu: data.klinik_kodu,
        provider: data.provider,
        aktif: data.aktif,
        twilio_account_sid_maskeli: metinMaskele(data.twilio_account_sid, 4),
        twilio_whatsapp_from: data.twilio_whatsapp_from || null,
        webhook_url: data.webhook_url || null,
        infobip_base_url: data.infobip_base_url || null,
        infobip_sender: data.infobip_sender || null,
      },
    });
  }
);

router.post(
  "/veteriner/iletisim/kanal-ayarlari/test",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerIletisimAyarTest),
  async (req, res) => {
    const { telefon, mesaj, kanal = "whatsapp" } = req.body || {};
    const tel = telefonNormalizeEt(telefon);
    if (!tel) return hataDon(res, 400, "GECERSIZ_TELEFON", "Telefon formati gecersiz.");

    const klinikKodSonuc = await veterinerKlinikKoduGetir(req.kullanici.id);
    if (klinikKodSonuc.hata) return hataDon(res, 500, "KLINIK_KODU_HATASI", klinikKodSonuc.hata);
    if (!klinikKodSonuc.klinikKodu) return hataDon(res, 400, "KLINIK_KODU_YOK", "Klinik kodu bulunamadi. Once ayarlari kaydedin.");

    const ayarSonuc = await klinikBildirimAyariGetir(klinikKodSonuc.klinikKodu);
    if (ayarSonuc.hata) return hataDon(res, 500, "KLINIK_BILDIRIM_AYAR_HATASI", ayarSonuc.hata);
    if (!ayarSonuc.ayar) {
      return hataDon(res, 400, "AYAR_YOK", "Klinik bildirim ayari bulunamadi. Once provider bilgilerini kaydedin.");
    }

    const testMesaji =
      String(mesaj || "").trim() ||
      `DuraVet test mesaji (${new Date().toLocaleString("tr-TR")}) - Klinik: ${klinikKodSonuc.klinikKodu}`;
    const gonderim = await disKanalaGonder({
      kanal,
      mesaj: testMesaji,
      telefon: tel,
      ayar: ayarSonuc.ayar,
    });
    if (gonderim.hata) return hataDon(res, 500, "TEST_MESAJ_GONDERIM_HATASI", gonderim.hata);

    await erisimLoguYaz(req, "veteriner_iletisim_kanal_test_mesaji");
    return res.status(201).json({
      mesaj: "Test mesaji gonderildi.",
      gonderim: {
        kanal,
        klinik_kodu: klinikKodSonuc.klinikKodu,
        dis_kanal_mesaj_id: gonderim.disMesajId || null,
        test_modu: String(gonderim.disMesajId || "").startsWith("mock-"),
      },
    });
  }
);

router.get(
  "/veteriner/iletisim/whatsapp-gecmis",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 40, 300);
    const kanalFiltre = String(req.query.kanal || "whatsapp").trim().toLowerCase();

    const [odaSonuc, randevuSonuc] = await Promise.all([
      supabaseAdmin.from("mesaj_odalar").select("id").eq("veteriner_id", req.kullanici.id).limit(5000),
      supabaseAdmin
        .from("randevular")
        .select("id, hayvan_id, sahibi_id, randevu_tarihi, randevu_saati")
        .eq("veteriner_id", req.kullanici.id)
        .order("olusturma_tarihi", { ascending: false })
        .limit(5000),
    ]);
    if (odaSonuc.error) return hataDon(res, 500, "ILETISIM_ODA_HATASI", odaSonuc.error.message);
    if (randevuSonuc.error) return hataDon(res, 500, "ILETISIM_RANDEVU_HATASI", randevuSonuc.error.message);

    const odaIdler = (odaSonuc.data || []).map((x) => x.id);
    const randevuMap = (randevuSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const randevuIdler = Object.keys(randevuMap).map((x) => Number(x));

    const kayitlar = [];
    if (odaIdler.length > 0) {
      const odaBildirimleri = await supabaseAdmin
        .from("bildirimler")
        .select(
          "id, kullanici_id, tur, baslik, icerik, kanal, fallback_kanal, fallback_durum, retry_sayisi, son_hata, dis_kanal_mesaj_id, gonderim_zamani, son_denemede, olusturma_tarihi, referans_oda_id, referans_hayvan_id, referans_randevu_id, mesaj_sablon_adi"
        )
        .in("referans_oda_id", odaIdler)
        .order("olusturma_tarihi", { ascending: false })
        .limit(2000);
      if (odaBildirimleri.error) return hataDon(res, 500, "ILETISIM_BILDIRIM_HATASI", odaBildirimleri.error.message);
      kayitlar.push(...(odaBildirimleri.data || []));
    }
    if (randevuIdler.length > 0) {
      const randevuBildirimleri = await supabaseAdmin
        .from("bildirimler")
        .select(
          "id, kullanici_id, tur, baslik, icerik, kanal, fallback_kanal, fallback_durum, retry_sayisi, son_hata, dis_kanal_mesaj_id, gonderim_zamani, son_denemede, olusturma_tarihi, referans_oda_id, referans_hayvan_id, referans_randevu_id, mesaj_sablon_adi"
        )
        .in("referans_randevu_id", randevuIdler)
        .order("olusturma_tarihi", { ascending: false })
        .limit(2000);
      if (randevuBildirimleri.error) {
        return hataDon(res, 500, "ILETISIM_BILDIRIM_HATASI", randevuBildirimleri.error.message);
      }
      kayitlar.push(...(randevuBildirimleri.data || []));
    }
    const kendiUyarilar = await supabaseAdmin
      .from("bildirimler")
      .select(
        "id, kullanici_id, tur, baslik, icerik, kanal, fallback_kanal, fallback_durum, retry_sayisi, son_hata, dis_kanal_mesaj_id, gonderim_zamani, son_denemede, olusturma_tarihi, referans_oda_id, referans_hayvan_id, referans_randevu_id, mesaj_sablon_adi"
      )
      .eq("kullanici_id", req.kullanici.id)
      .eq("tur", "acil_randevu_uyarisi")
      .order("olusturma_tarihi", { ascending: false })
      .limit(500);
    if (kendiUyarilar.error) return hataDon(res, 500, "ILETISIM_BILDIRIM_HATASI", kendiUyarilar.error.message);
    kayitlar.push(...(kendiUyarilar.data || []));

    const uniqMap = {};
    for (const x of kayitlar) {
      uniqMap[x.id] = x;
    }
    let liste = Object.values(uniqMap);
    if (kanalFiltre && kanalFiltre !== "tum") {
      liste = liste.filter((x) => x.kanal === kanalFiltre || x.fallback_kanal === kanalFiltre);
    }
    liste.sort((a, b) =>
      String(b.son_denemede || b.gonderim_zamani || b.olusturma_tarihi).localeCompare(
        String(a.son_denemede || a.gonderim_zamani || a.olusturma_tarihi)
      )
    );
    liste = liste.slice(0, limit);

    const hayvanIdler = benzersizIdler(
      liste
        .map((x) => x.referans_hayvan_id || randevuMap[x.referans_randevu_id]?.hayvan_id || null)
        .filter(Boolean)
    );
    const kullaniciIdler = benzersizIdler(
      liste
        .map((x) => randevuMap[x.referans_randevu_id]?.sahibi_id || x.kullanici_id)
        .filter(Boolean)
    );
    const [hayvanlarSonuc, kullaniciSonuc] = await Promise.all([
      hayvanIdler.length
        ? supabaseAdmin.from("hayvanlar").select("id, ad, tur, irk").in("id", hayvanIdler)
        : Promise.resolve({ data: [], error: null }),
      kullaniciIdler.length
        ? supabaseAdmin.from("kullanicilar").select("id, ad, soyad, telefon").in("id", kullaniciIdler)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (hayvanlarSonuc.error) return hataDon(res, 500, "ILETISIM_HAYVAN_HATASI", hayvanlarSonuc.error.message);
    if (kullaniciSonuc.error) return hataDon(res, 500, "ILETISIM_SAHIP_HATASI", kullaniciSonuc.error.message);

    const hayvanMap = (hayvanlarSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const kullaniciMap = (kullaniciSonuc.data || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});

    const kayitlarZengin = liste.map((x) => {
      const randevu = x.referans_randevu_id ? randevuMap[x.referans_randevu_id] || null : null;
      const hayvanId = x.referans_hayvan_id || randevu?.hayvan_id || null;
      const sahipId = randevu?.sahibi_id || x.kullanici_id;
      return {
        id: x.id,
        tur: x.tur,
        baslik: x.baslik,
        mesaj_ozet: String(x.icerik || "").slice(0, 240),
        kanal: x.kanal,
        fallback_kanal: x.fallback_kanal,
        fallback_durum: x.fallback_durum,
        retry_sayisi: Number(x.retry_sayisi || 0),
        son_hata: x.son_hata || null,
        dis_kanal_mesaj_id: x.dis_kanal_mesaj_id || null,
        gonderim_zamani: x.gonderim_zamani || null,
        son_denemede: x.son_denemede || null,
        olusturma_tarihi: x.olusturma_tarihi,
        mesaj_sablon_adi: x.mesaj_sablon_adi || null,
        hayvan: hayvanId ? hayvanMap[hayvanId] || null : null,
        sahip: sahipId ? kullaniciMap[sahipId] || null : null,
        randevu: randevu
          ? {
              id: randevu.id,
              randevu_tarihi: randevu.randevu_tarihi,
              randevu_saati: randevu.randevu_saati,
            }
          : null,
      };
    });

    await erisimLoguYaz(req, "veteriner_whatsapp_gecmis_goruntuleme");
    return res.json({
      kayit_sayisi: kayitlarZengin.length,
      kayitlar: kayitlarZengin,
    });
  }
);

router.get(
  "/veteriner/iletisim/sablonlar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 100, 300);
    const { data, error } = await supabaseAdmin
      .from("veteriner_mesaj_sablonlari")
      .select("id, ad, kanal, icerik, aktif, olusturma_tarihi, guncelleme_tarihi")
      .eq("veteriner_id", req.kullanici.id)
      .order("guncelleme_tarihi", { ascending: false })
      .limit(limit);
    if (error) return hataDon(res, 500, "SABLON_LISTE_HATASI", error.message);
    return res.json({ kayit_sayisi: (data || []).length, sablonlar: data || [] });
  }
);

router.post(
  "/veteriner/iletisim/sablonlar",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerMesajSablonOlustur),
  async (req, res) => {
    const { ad, kanal, icerik, aktif } = req.body || {};
    const { data, error } = await supabaseAdmin
      .from("veteriner_mesaj_sablonlari")
      .insert({
        veteriner_id: req.kullanici.id,
        ad,
        kanal: kanal || "whatsapp",
        icerik,
        aktif: aktif !== false,
      })
      .select("id, ad, kanal, icerik, aktif, olusturma_tarihi, guncelleme_tarihi")
      .single();
    if (error) return hataDon(res, 500, "SABLON_OLUSTURMA_HATASI", error.message);
    await erisimLoguYaz(req, "veteriner_mesaj_sablonu_olusturma");
    return res.status(201).json({ mesaj: "Mesaj sablonu olusturuldu.", sablon: data });
  }
);

router.patch(
  "/veteriner/iletisim/sablonlar/:id",
  authZorunlu,
  rolGerekli(ROLLER.VETERINER),
  dogrula(shemalar.veterinerMesajSablonGuncelle),
  async (req, res) => {
    const id = Number(req.params.id);
    const { data, error } = await supabaseAdmin
      .from("veteriner_mesaj_sablonlari")
      .update(req.body || {})
      .eq("id", id)
      .eq("veteriner_id", req.kullanici.id)
      .select("id, ad, kanal, icerik, aktif, olusturma_tarihi, guncelleme_tarihi")
      .maybeSingle();
    if (error) return hataDon(res, 500, "SABLON_GUNCELLEME_HATASI", error.message);
    if (!data) return hataDon(res, 404, "SABLON_YOK", "Mesaj sablonu bulunamadi.");
    await erisimLoguYaz(req, "veteriner_mesaj_sablonu_guncelleme");
    return res.json({ mesaj: "Mesaj sablonu guncellendi.", sablon: data });
  }
);

router.post(
  "/sahip/hayvanlar",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipHayvanOlustur),
  async (req, res) => {
    const { ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, kisirlastirma_durumu } = req.body || {};

    if (!ad || !tur) {
      return res.status(400).json({ hata: "Eksik alan: ad, tur" });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .insert({
        sahibi_id: req.kullanici.id,
        ad,
        tur,
        irk: irk || null,
        cinsiyet: cinsiyet || null,
        kan_grubu: kan_grubu || null,
        dogum_tarihi: dogum_tarihi || null,
        kilo: kilo ?? null,
        kisirlastirma_durumu: kisirlastirma_durumu ?? null,
        aktif: true,
      })
      .select("id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, aktif, olusturma_tarihi")
      .single();

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "sahip_hayvan_olusturma", data.id);
    return res.status(201).json({ mesaj: "Hayvan kaydi olusturuldu.", hayvan: data });
  }
);

router.get(
  "/sahip/veterinerler",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 100, 500);
    const offset = offsetAl(req);
    const arama = String(req.query.arama || "").trim();
    let kullaniciSorgu = supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad", { count: "exact" })
      .eq("rol_id", ROLLER.VETERINER)
      .eq("aktif", true);

    if (arama) {
      kullaniciSorgu = kullaniciSorgu.or(`ad.ilike.%${arama}%,soyad.ilike.%${arama}%,eposta.ilike.%${arama}%`);
    }

    const { data: kullanicilar, error: kullaniciErr, count: toplamKullanici } = await kullaniciSorgu.range(offset, offset + limit - 1);

    if (kullaniciErr) return res.status(500).json({ hata: kullaniciErr.message });

    const veterinerIdler = (kullanicilar || []).map((x) => x.id);
    let profilHaritasi = {};
    if (veterinerIdler.length > 0) {
      const { data: profiller, error: profilErr } = await supabaseAdmin
        .from("veteriner_profilleri")
        .select("id, diploma_no, klinik_adi, uzmanlik_alani, il, ilce, calisma_saatleri_metin, profil_foto_yolu")
        .in("id", veterinerIdler);
      if (profilErr) return res.status(500).json({ hata: profilErr.message });
      profilHaritasi = (profiller || []).reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});
    }

    let takipSet = new Set();
    if (veterinerIdler.length > 0) {
      const { data: takipSatirlari } = await supabaseAdmin
        .from("sahip_veteriner_takipleri")
        .select("veteriner_id")
        .eq("sahibi_id", req.kullanici.id)
        .in("veteriner_id", veterinerIdler);
      takipSet = new Set((takipSatirlari || []).map((row) => row.veteriner_id));
    }

    const veterinerler = await Promise.all(
      (kullanicilar || []).map(async (x) => {
        const rawProf = profilHaritasi[x.id] || null;
        let profil = null;
        if (rawProf) {
          const { profil_foto_yolu, ...rest } = rawProf;
          let profilFotoErisimUrl = null;
          if (profil_foto_yolu) {
            profilFotoErisimUrl = await storageSignedUrlUret("veteriner-profil-fotolari", profil_foto_yolu, 3600);
          }
          profil = { ...rest, profil_foto_erisim_url: profilFotoErisimUrl };
        }
        return {
          ...x,
          profil,
          takipte_mi: takipSet.has(x.id),
        };
      })
    );

    await erisimLoguYaz(req, "sahip_veteriner_listesi_goruntuleme");
    return res.json({
      kayit_sayisi: veterinerler.length,
      toplam_kayit: toplamKullanici ?? veterinerler.length,
      limit,
      offset,
      veterinerler,
    });
  }
);

router.get(
  "/sahip/takip/veterinerler",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 50, 200);
    const offset = offsetAl(req);
    const sahipId = req.kullanici.id;
    const { data: takipler, error } = await supabaseAdmin
      .from("sahip_veteriner_takipleri")
      .select("veteriner_id, olusturma_tarihi")
      .eq("sahibi_id", sahipId)
      .order("olusturma_tarihi", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return hataDon(res, 500, "TAKIP_LISTE_HATASI", error.message);
    const vetIds = (takipler || []).map((x) => x.veteriner_id).filter(Boolean);
    if (vetIds.length === 0) {
      return res.json({ kayit_sayisi: 0, toplam_kayit: 0, limit, offset, veterinerler: [] });
    }
    const { data: kullanicilar, error: kErr } = await supabaseAdmin
      .from("kullanicilar")
      .select("id, ad, soyad")
      .in("id", vetIds);
    if (kErr) return hataDon(res, 500, "TAKIP_KULLANICI_HATASI", kErr.message);
    const { data: profiller, error: pErr } = await supabaseAdmin
      .from("veteriner_profilleri")
      .select("id, klinik_adi, uzmanlik_alani, il, ilce, calisma_saatleri_metin, profil_foto_yolu")
      .in("id", vetIds);
    if (pErr) return hataDon(res, 500, "TAKIP_PROFIL_HATASI", pErr.message);
    const kMap = (kullanicilar || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const pMap = (profiller || []).reduce((acc, x) => {
      acc[x.id] = x;
      return acc;
    }, {});
    const veterinerler = await Promise.all(
      (takipler || []).map(async (t) => {
        const ku = kMap[t.veteriner_id] || {};
        const rawP = pMap[t.veteriner_id] || null;
        let profil = null;
        if (rawP) {
          const { profil_foto_yolu, ...rest } = rawP;
          let profilFotoErisimUrl = null;
          if (profil_foto_yolu) {
            profilFotoErisimUrl = await storageSignedUrlUret("veteriner-profil-fotolari", profil_foto_yolu, 3600);
          }
          profil = { ...rest, profil_foto_erisim_url: profilFotoErisimUrl };
        }
        return {
          id: t.veteriner_id,
          ad: ku.ad || "",
          soyad: ku.soyad || "",
          profil,
          takip_olusturma_tarihi: t.olusturma_tarihi,
        };
      })
    );
    await erisimLoguYaz(req, "sahip_takip_veteriner_listesi");
    return res.json({
      kayit_sayisi: veterinerler.length,
      toplam_kayit: veterinerler.length,
      limit,
      offset,
      veterinerler,
    });
  }
);

router.post(
  "/sahip/takip/veterinerler/:veterinerId",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipTakipVeterinerUuidParam),
  async (req, res) => {
    const vetId = String(req.params.veterinerId || "").trim();
    const sahipId = req.kullanici.id;
    const { data: vetVar, error: vetErr } = await supabaseAdmin
      .from("kullanicilar")
      .select("id")
      .eq("id", vetId)
      .eq("rol_id", ROLLER.VETERINER)
      .eq("aktif", true)
      .maybeSingle();
    if (vetErr) return hataDon(res, 500, "TAKIP_VET_KONTROL_HATASI", vetErr.message);
    if (!vetVar) return hataDon(res, 404, "VETERINER_YOK", "Veteriner bulunamadi veya aktif degil.");
    const { error: insErr } = await supabaseAdmin.from("sahip_veteriner_takipleri").insert({
      sahibi_id: sahipId,
      veteriner_id: vetId,
    });
    if (insErr) {
      if (String(insErr.message || "").toLowerCase().includes("duplicate") || insErr.code === "23505") {
        return res.status(200).json({ mesaj: "Zaten takiptesin.", zaten_takipte: true });
      }
      return hataDon(res, 500, "TAKIP_EKLEME_HATASI", insErr.message);
    }
    await erisimLoguYaz(req, "sahip_takip_veteriner_ekleme");
    return res.status(201).json({ mesaj: "Takip eklendi.", veteriner_id: vetId });
  }
);

router.delete(
  "/sahip/takip/veterinerler/:veterinerId",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipTakipVeterinerUuidParam),
  async (req, res) => {
    const vetId = String(req.params.veterinerId || "").trim();
    const sahipId = req.kullanici.id;
    const { error } = await supabaseAdmin
      .from("sahip_veteriner_takipleri")
      .delete()
      .eq("sahibi_id", sahipId)
      .eq("veteriner_id", vetId);
    if (error) return hataDon(res, 500, "TAKIP_SILME_HATASI", error.message);
    await erisimLoguYaz(req, "sahip_takip_veteriner_silme");
    return res.json({ mesaj: "Takipten cikarildi.", veteriner_id: vetId });
  }
);

router.get(
  "/sahip/hayvanlar",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.limitOnly),
  async (req, res) => {
    const limit = limitAl(req, 200, 500);
    const offset = offsetAl(req);
    const arama = String(req.query.arama || "").trim();
    const sirala = String(req.query.sirala || "olusturma_desc").trim();
    const siralama = {
      kolon: sirala.startsWith("ad_") ? "ad" : sirala === "tur" ? "tur" : "olusturma_tarihi",
      artan: sirala === "ad_asc" || sirala === "tur",
    };
    let sorgu = supabaseAdmin
      .from("hayvanlar")
      .select(
        "id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, kisirlastirma_durumu, aktif, topluluk_patisi_goster, olusturma_tarihi",
        { count: "exact" }
      )
      .eq("sahibi_id", req.kullanici.id)
      .order(siralama.kolon, { ascending: siralama.artan });

    if (arama) {
      sorgu = sorgu.or(`ad.ilike.%${arama}%,tur.ilike.%${arama}%,irk.ilike.%${arama}%`);
    }

    const { data, error, count } = await sorgu.range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ hata: error.message });

    let hayvanlar = data || [];
    const hayvanIdler = hayvanlar.map((h) => h.id);
    const fotoMap = {};
    if (hayvanIdler.length > 0) {
      const { data: kimlikFoto, error: kfErr } = await supabaseAdmin
        .from("hayvan_kimlikleri")
        .select("hayvan_id, foto_url")
        .in("hayvan_id", hayvanIdler);
      if (!kfErr && kimlikFoto?.length) {
        await Promise.all(
          kimlikFoto.map(async (row) => {
            if (!row.foto_url || fotoMap[row.hayvan_id]) return;
            const signed = await storageSignedUrlUret("hayvan-kimlik-fotolari", row.foto_url, 3600);
            if (signed) fotoMap[row.hayvan_id] = signed;
          })
        );
      }
    }
    hayvanlar = hayvanlar.map((h) => ({ ...h, foto_erisim_url: fotoMap[h.id] ?? null }));

    await erisimLoguYaz(req, "sahip_hayvanlar_goruntuleme");
    return res.json({
      kayit_sayisi: hayvanlar.length,
      toplam_kayit: count ?? hayvanlar.length,
      limit,
      offset,
      hayvanlar,
    });
  }
);

router.get(
  "/sahip/hayvanlar/:hayvanId",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .select(
        "id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, kisirlastirma_durumu, aktif, topluluk_patisi_goster, olusturma_tarihi"
      )
      .eq("id", hayvanId)
      .eq("sahibi_id", req.kullanici.id)
      .maybeSingle();

    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });

    await erisimLoguYaz(req, "sahip_hayvan_detay_goruntuleme", hayvanId);
    return res.json({ hayvan: data });
  }
);

router.patch(
  "/sahip/hayvanlar/:hayvanId",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipHayvanGuncelle),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvani guncelleyemezsin." });

    const b = req.body || {};
    const patch = {};
    if (b.ad !== undefined) patch.ad = b.ad;
    if (b.tur !== undefined) patch.tur = b.tur;
    if (b.irk !== undefined) patch.irk = b.irk;
    if (b.cinsiyet !== undefined) patch.cinsiyet = b.cinsiyet;
    if (b.kan_grubu !== undefined) patch.kan_grubu = b.kan_grubu;
    if (b.dogum_tarihi !== undefined) patch.dogum_tarihi = b.dogum_tarihi;
    if (b.kilo !== undefined) patch.kilo = b.kilo;
    if (b.kisirlastirma_durumu !== undefined) patch.kisirlastirma_durumu = b.kisirlastirma_durumu;
    if (b.topluluk_patisi_goster !== undefined) patch.topluluk_patisi_goster = Boolean(b.topluluk_patisi_goster);

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ hata: "Guncellenecek alan yok." });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .update(patch)
      .eq("id", hayvanId)
      .eq("sahibi_id", req.kullanici.id)
      .select(
        "id, sahibi_id, ad, tur, irk, cinsiyet, kan_grubu, dogum_tarihi, kilo, kisirlastirma_durumu, aktif, topluluk_patisi_goster, olusturma_tarihi"
      )
      .maybeSingle();

    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });

    await erisimLoguYaz(req, "sahip_hayvan_guncelleme", hayvanId);
    return res.json({ mesaj: "Hayvan guncellendi.", hayvan: data });
  }
);

router.patch(
  "/sahip/hayvanlar/:hayvanId/sil",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanSil),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const kalici = Boolean(req.body?.kalici);
    const onayMetni = String(req.body?.onay_metni || "").trim();

    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvani silemezsin." });

    if (kalici && !kaliciSilmeOnayiGecerliMi(onayMetni)) {
      return hataDon(res, 400, "ONAY_METNI_GEREKLI", "Kalici silme icin onay_metni alanina SIL (SİL) yazilmalidir.");
    }

    const aktifRandevu = await hayvanAktifRandevuSayisi(hayvanId);
    if (aktifRandevu.hata) return res.status(500).json({ hata: aktifRandevu.hata });
    if (aktifRandevu.sayi > 0) {
      return hataDon(res, 409, "AKTIF_RANDEVU_VAR", "Hayvanin aktif randevusu oldugu icin silme islemi yapilamaz.");
    }

    if (kalici) {
      const baglilik = await hayvanSilmeOncesiBaglantilariTemizle(hayvanId);
      if (baglilik.hata) return res.status(500).json({ hata: baglilik.hata });

      const { data, error } = await supabaseAdmin
        .from("hayvanlar")
        .delete()
        .eq("id", hayvanId)
        .eq("sahibi_id", req.kullanici.id)
        .select("id, ad, tur")
        .maybeSingle();
      if (error) return res.status(500).json({ hata: error.message });
      if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });
      await erisimLoguYaz(req, "sahip_hayvan_kalici_silme", hayvanId);
      return res.json({ mesaj: "Hayvan kalici olarak silindi.", hayvan: data });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvanlar")
      .update({ aktif: false })
      .eq("id", hayvanId)
      .eq("sahibi_id", req.kullanici.id)
      .select("id, ad, tur, aktif")
      .maybeSingle();
    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan bulunamadi." });
    await erisimLoguYaz(req, "sahip_hayvan_pasife_alma", hayvanId);
    return res.json({ mesaj: "Hayvan pasife alindi.", hayvan: data });
  }
);

router.get(
  "/sahip/hayvanlar/:hayvanId/kimlik",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvanin kimligine erisemezsin." });

    const kimlikSonuc = await hayvanKimlikDetayiGetir(hayvanId);
    if (kimlikSonuc.hata && !kimlikSonuc.bulunamadi) return res.status(500).json({ hata: kimlikSonuc.hata });
    if (!kimlikSonuc.veri) return res.status(404).json({ hata: kimlikSonuc.hata || "Hayvan kimligi bulunamadi." });

    await erisimLoguYaz(req, "sahip_hayvan_kimligi_goruntuleme", hayvanId);
    return res.json({ kimlik: kimlikSonuc.veri });
  }
);

router.get(
  "/sahip/hayvanlar/:hayvanId/kimlik-gecmisi",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvanin kimlik gecmisine erisemezsin." });

    const limit = limitAl(req, 20, 100);
    const sonuc = await kimlikGuncellemeGecmisiGetir(hayvanId, limit);
    if (sonuc.hata) return res.status(500).json({ hata: sonuc.hata });
    return res.json({ kayit_sayisi: sonuc.kayitlar.length, kayitlar: sonuc.kayitlar });
  }
);

router.post(
  "/sahip/hayvanlar/:hayvanId/kimlik-dosya",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanKimlikDosyaYukle),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const { tur, content_type, data_url, dosya_adi } = req.body || {};
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvan icin dosya yukleyemezsin." });

    const cozulmus = dataUrlCoz(data_url);
    if (!cozulmus) return hataDon(res, 400, "GECERSIZ_DATA_URL", "Gecersiz dosya icerigi.");
    if (String(content_type || "").toLowerCase() !== String(cozulmus.mime || "").toLowerCase()) {
      return hataDon(res, 400, "MIME_ESLESMEDI", "Dosya tipi ile icerik tipi eslesmiyor.");
    }

    const boyut = Number(cozulmus.buffer.length || 0);
    if (boyut <= 0 || boyut > 2 * 1024 * 1024) {
      return hataDon(res, 400, "DOSYA_BOYUT", "Dosya boyutu 2MB sinirini asiyor.");
    }

    const kullaniciId = req.kullanici.id;
    const extMap = {
      "image/webp": "webp",
      "image/png": "png",
      "image/jpeg": "jpg",
      "application/pdf": "pdf",
    };
    const ext = extMap[String(content_type || "").toLowerCase()] || "bin";
    let bucket = "hayvan-kimlik-fotolari";
    let dosyaYolu = `${kullaniciId}/${hayvanId}/${tur}.${ext}`;
    if (tur === "pdf") {
      bucket = "hayvan-kimlik-pdf";
      const temizAd = String(dosya_adi || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || `kimlik-${Date.now()}.${ext}`;
      dosyaYolu = `${kullaniciId}/${hayvanId}/${temizAd}`;
    }

    const yukleme = await supabaseAdmin.storage.from(bucket).upload(dosyaYolu, cozulmus.buffer, {
      contentType: content_type,
      upsert: tur !== "pdf",
      cacheControl: "3600",
    });
    if (yukleme.error) return hataDon(res, 500, "KIMLIK_DOSYA_YUKLEME_HATASI", yukleme.error.message);

    await erisimLoguYaz(req, "sahip_kimlik_dosya_yukleme", hayvanId);
    return res.status(201).json({
      mesaj: "Dosya yuklendi.",
      dosya: {
        tur,
        bucket,
        ref: `${bucket}:${dosyaYolu}`,
      },
    });
  }
);

router.patch(
  "/sahip/hayvanlar/:hayvanId/kimlik",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanKimlikGuncelle),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const {
      foto_url,
      imza_url,
      pdf_url,
      qr_icerik,
      qr_dogrulama_token,
      kimlik_notu,
      mikrocip_no,
      kayip_hayvan_iletisim_izni,
      kayip_hayvan_notu,
      sahibi_telefon,
      sahibi_adres,
      sahibi_il,
      sahibi_ilce,
      sahibi_acil_durum_iletisim,
      hayvan_tur,
      hayvan_irk,
      hayvan_cinsiyet,
      hayvan_kan_grubu,
      hayvan_dogum_tarihi,
      hayvan_kilo,
    } = req.body || {};
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvanin kimligini guncelleyemezsin." });

    const { data: mevcutKimlik, error: mevcutKimlikHata } = await supabaseAdmin
      .from("hayvan_kimlikleri")
      .select("id, pdf_url, qr_icerik, qr_dogrulama_token")
      .eq("hayvan_id", hayvanId)
      .maybeSingle();
    if (mevcutKimlikHata) return res.status(500).json({ hata: mevcutKimlikHata.message });
    if (!mevcutKimlik) return res.status(404).json({ hata: "Hayvan kimligi bulunamadi." });

    const guncel = {};
    if (foto_url !== undefined) guncel.foto_url = foto_url;
    if (imza_url !== undefined) guncel.imza_url = imza_url;
    if (pdf_url !== undefined) guncel.pdf_url = pdf_url;
    if (qr_icerik !== undefined) guncel.qr_icerik = qr_icerik;
    if (qr_dogrulama_token !== undefined) guncel.qr_dogrulama_token = qr_dogrulama_token;
    if (!mevcutKimlik.qr_dogrulama_token && qr_dogrulama_token === undefined) {
      guncel.qr_dogrulama_token = randomUUID();
    }
    if (kimlik_notu !== undefined) guncel.kimlik_notu = kimlik_notu;
    if (mikrocip_no !== undefined) guncel.mikrocip_no = mikrocip_no || null;
    if (kayip_hayvan_iletisim_izni !== undefined) guncel.kayip_hayvan_iletisim_izni = Boolean(kayip_hayvan_iletisim_izni);
    if (kayip_hayvan_notu !== undefined) guncel.kayip_hayvan_notu = kayip_hayvan_notu;

    if (sahibi_telefon !== undefined) {
      const telefonNormalized = sahibi_telefon ? telefonNormalizeEt(sahibi_telefon) : "";
      if (sahibi_telefon && !telefonNormalized) {
        return res.status(400).json({ hata: "Telefon formati gecersiz." });
      }
      const { data: mevcutKullanici, error: mevcutKulHata } = await supabaseAdmin
        .from("kullanicilar")
        .select("telefon")
        .eq("id", req.kullanici.id)
        .maybeSingle();
      if (mevcutKulHata) return res.status(500).json({ hata: mevcutKulHata.message });
      if (telefonNormalized) {
        const mevcutNorm = mevcutKullanici?.telefon ? telefonNormalizeEt(mevcutKullanici.telefon) : "";
        const ayniNumara = mevcutNorm === telefonNormalized;
        if (!ayniNumara) {
          const telCakisma = await telefonCakisiyorMu(telefonNormalized, req.kullanici.id);
          if (telCakisma.hata) return res.status(500).json({ hata: telCakisma.hata });
          if (telCakisma.cakisma) {
            return res.status(409).json({ hata: "Bu telefon numarasi baska bir kullanicida kayitli." });
          }
        }
      }
      const { error: telHata } = await supabaseAdmin
        .from("kullanicilar")
        .update({ telefon: telefonNormalized || null })
        .eq("id", req.kullanici.id);
      if (telHata) return res.status(500).json({ hata: telHata.message });
    }

    if (
      sahibi_adres !== undefined ||
      sahibi_il !== undefined ||
      sahibi_ilce !== undefined ||
      sahibi_acil_durum_iletisim !== undefined
    ) {
      const profilGuncel = { id: req.kullanici.id };
      if (sahibi_adres !== undefined) profilGuncel.adres = sahibi_adres;
      if (sahibi_il !== undefined) profilGuncel.il = sahibi_il;
      if (sahibi_ilce !== undefined) profilGuncel.ilce = sahibi_ilce;
      if (sahibi_acil_durum_iletisim !== undefined) profilGuncel.acil_durum_iletisim = sahibi_acil_durum_iletisim;
      const { error: profilHata } = await supabaseAdmin.from("hayvan_sahibi_profilleri").upsert(profilGuncel, { onConflict: "id" });
      if (profilHata) return res.status(500).json({ hata: profilHata.message });
    }

    if (
      hayvan_tur !== undefined ||
      hayvan_irk !== undefined ||
      hayvan_cinsiyet !== undefined ||
      hayvan_kan_grubu !== undefined ||
      hayvan_dogum_tarihi !== undefined ||
      hayvan_kilo !== undefined
    ) {
      const hayvanGuncel = {};
      if (hayvan_tur !== undefined) hayvanGuncel.tur = hayvan_tur;
      if (hayvan_irk !== undefined) hayvanGuncel.irk = hayvan_irk;
      if (hayvan_cinsiyet !== undefined) hayvanGuncel.cinsiyet = hayvan_cinsiyet;
      if (hayvan_kan_grubu !== undefined) hayvanGuncel.kan_grubu = hayvan_kan_grubu;
      if (hayvan_dogum_tarihi !== undefined) hayvanGuncel.dogum_tarihi = hayvan_dogum_tarihi;
      if (hayvan_kilo !== undefined) hayvanGuncel.kilo = hayvan_kilo;
      const { error: hayvanGuncelHata } = await supabaseAdmin
        .from("hayvanlar")
        .update(hayvanGuncel)
        .eq("id", hayvanId)
        .eq("sahibi_id", req.kullanici.id);
      if (hayvanGuncelHata) return res.status(500).json({ hata: hayvanGuncelHata.message });
    }

    const { data, error } = await supabaseAdmin
      .from("hayvan_kimlikleri")
      .update(guncel)
      .eq("hayvan_id", hayvanId)
      .select("id, pdf_url, qr_icerik")
      .maybeSingle();

    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan kimligi bulunamadi." });

    const oncekiPdf = mevcutKimlik.pdf_url || null;
    const yeniPdf = data.pdf_url || null;
    if (oncekiPdf && yeniPdf && oncekiPdf !== yeniPdf) {
      const silinecekYol = storageRefYolCoz(oncekiPdf, "hayvan-kimlik-pdf");
      if (silinecekYol) {
        const { error: storageSilHata } = await supabaseAdmin.storage.from("hayvan-kimlik-pdf").remove([silinecekYol]);
        if (storageSilHata) {
          console.error("Eski kimlik PDF silinemedi:", storageSilHata.message);
        }
      }
    }

    const notOzeti =
      typeof kimlik_notu === "string" && kimlik_notu.trim()
        ? kimlik_notu.trim().slice(0, 250)
        : null;
    const { error: auditHata } = await supabaseAdmin.from("hayvan_kimlik_guncelleme_gecmisi").insert({
      kimlik_id: mevcutKimlik.id,
      hayvan_id: hayvanId,
      guncelleyen_kullanici_id: req.kullanici.id,
      onceki_pdf_url: oncekiPdf,
      yeni_pdf_url: yeniPdf,
      onceki_qr_icerik: mevcutKimlik.qr_icerik || null,
      yeni_qr_icerik: data.qr_icerik || null,
      not_ozeti: notOzeti,
    });
    if (auditHata) {
      console.error("Kimlik guncelleme gecmisi yazilamadi:", auditHata.message);
    }

    const kimlikSonuc = await hayvanKimlikDetayiGetir(hayvanId);
    if (kimlikSonuc.hata && !kimlikSonuc.bulunamadi) return res.status(500).json({ hata: kimlikSonuc.hata });
    if (!kimlikSonuc.veri) return res.status(404).json({ hata: kimlikSonuc.hata || "Hayvan kimligi bulunamadi." });

    await erisimLoguYaz(req, "sahip_hayvan_kimligi_guncelleme", hayvanId);
    return res.json({ mesaj: "Dijital hayvan kimligi guncellendi.", kimlik: kimlikSonuc.veri });
  }
);

/** Mobil / otomasyon: .env QR_PUBLIC_BASE_URL veya NEXT_PUBLIC_QR_PUBLIC_BASE_URL ile qr_icerik uretir. */
router.post(
  "/sahip/hayvanlar/:hayvanId/kimlik/qr-web-linki",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvanin kimligini guncelleyemezsin." });

    const kokRaw = String(process.env.QR_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_QR_PUBLIC_BASE_URL || "")
      .trim()
      .replace(/\/$/, "");
    if (!kokRaw || kokRaw.includes("localhost") || kokRaw.includes("127.0.0.1")) {
      return res.status(400).json({
        hata:
          "Sunucuda QR_PUBLIC_BASE_URL veya NEXT_PUBLIC_QR_PUBLIC_BASE_URL tanimli olmali (ornek http://192.168.x.x:3000). localhost telefonda acilmaz.",
      });
    }

    const { data: mevcutKimlik, error: kimlikHata } = await supabaseAdmin
      .from("hayvan_kimlikleri")
      .select("id, hayvan_id, pdf_url, qr_icerik, qr_dogrulama_token, benzersiz_kimlik_no")
      .eq("hayvan_id", hayvanId)
      .maybeSingle();
    if (kimlikHata) return res.status(500).json({ hata: kimlikHata.message });
    if (!mevcutKimlik?.benzersiz_kimlik_no) {
      return res.status(404).json({ hata: "Hayvan kimligi bulunamadi." });
    }

    let token = mevcutKimlik.qr_dogrulama_token;
    if (!token) token = randomUUID();
    const yeniUrl = `${kokRaw}/kimlik/${encodeURIComponent(mevcutKimlik.benzersiz_kimlik_no)}?t=${encodeURIComponent(token)}`;

    const guncel = { qr_icerik: yeniUrl };
    if (!mevcutKimlik.qr_dogrulama_token) guncel.qr_dogrulama_token = token;

    const { data, error } = await supabaseAdmin
      .from("hayvan_kimlikleri")
      .update(guncel)
      .eq("hayvan_id", hayvanId)
      .select("id, pdf_url, qr_icerik")
      .maybeSingle();
    if (error) return res.status(500).json({ hata: error.message });
    if (!data) return res.status(404).json({ hata: "Hayvan kimligi bulunamadi." });

    const oncekiPdf = mevcutKimlik.pdf_url || null;
    const yeniPdf = data.pdf_url || null;
    if (oncekiPdf && yeniPdf && oncekiPdf !== yeniPdf) {
      const silinecekYol = storageRefYolCoz(oncekiPdf, "hayvan-kimlik-pdf");
      if (silinecekYol) {
        const { error: storageSilHata } = await supabaseAdmin.storage.from("hayvan-kimlik-pdf").remove([silinecekYol]);
        if (storageSilHata) console.error("Eski kimlik PDF silinemedi:", storageSilHata.message);
      }
    }

    const { error: auditHata } = await supabaseAdmin.from("hayvan_kimlik_guncelleme_gecmisi").insert({
      kimlik_id: mevcutKimlik.id,
      hayvan_id: hayvanId,
      guncelleyen_kullanici_id: req.kullanici.id,
      onceki_pdf_url: oncekiPdf,
      yeni_pdf_url: yeniPdf,
      onceki_qr_icerik: mevcutKimlik.qr_icerik || null,
      yeni_qr_icerik: data.qr_icerik || null,
      not_ozeti: "QR web linki sunucu ayarina gore senkronlandi.",
    });
    if (auditHata) console.error("Kimlik guncelleme gecmisi yazilamadi:", auditHata.message);

    const kimlikSonuc = await hayvanKimlikDetayiGetir(hayvanId);
    if (kimlikSonuc.hata && !kimlikSonuc.bulunamadi) return res.status(500).json({ hata: kimlikSonuc.hata });
    if (!kimlikSonuc.veri) return res.status(404).json({ hata: kimlikSonuc.hata || "Hayvan kimligi bulunamadi." });

    await erisimLoguYaz(req, "sahip_hayvan_kimligi_qr_web_senkron", hayvanId);
    return res.json({ mesaj: "QR web adresi guncellendi.", kimlik: kimlikSonuc.veri });
  }
);

router.get(
  "/sahip/hayvanlar/:hayvanId/receteler",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, hayvanId);
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return res.status(403).json({ hata: "Bu hayvanin recetelerine erisemezsin." });

    const limit = limitAl(req, 100, 300);
    const { data, error } = await supabaseAdmin
      .from("receteler")
      .select("id, hayvan_id, veteriner_id, recete_metni, recete_tarihi, tani, durum, olusturma_tarihi")
      .eq("hayvan_id", hayvanId)
      .order("olusturma_tarihi", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ hata: error.message });

    const receteIdler = (data || []).map((x) => x.id);
    let kalemMap = {};
    if (receteIdler.length > 0) {
      const { data: kalemler, error: kalemHata } = await supabaseAdmin
        .from("recete_ilac_kalemleri")
        .select("id, recete_id, ilac_adi, doz, kullanim_sikligi, sure_gun, notlar")
        .in("recete_id", receteIdler)
        .order("id", { ascending: true });
      if (kalemHata) return res.status(500).json({ hata: kalemHata.message });
      kalemMap = (kalemler || []).reduce((acc, x) => {
        if (!acc[x.recete_id]) acc[x.recete_id] = [];
        acc[x.recete_id].push(x);
        return acc;
      }, {});
    }

    await erisimLoguYaz(req, "sahip_recete_gecmisi_goruntuleme", hayvanId);
    return res.json({
      kayit_sayisi: (data || []).length,
      kayitlar: (data || []).map((x) => ({ ...x, ilaclar: kalemMap[x.id] || [] })),
    });
  }
);

router.get(
  "/sahip/hayvanlar/:hayvanId/saglik-gecmisi",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.hayvanIdParam),
  async (req, res) => {
    const hayvanId = Number(req.params.hayvanId);
    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      return res.status(400).json({ hata: "Gecersiz hayvan id." });
    }

    const { data: hayvan, error: hayvanHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id")
      .eq("id", hayvanId)
      .eq("sahibi_id", req.kullanici.id)
      .maybeSingle();

    if (hayvanHata) return res.status(500).json({ hata: hayvanHata.message });
    if (!hayvan) return res.status(404).json({ hata: "Hayvan bulunamadi." });

    const limit = limitAl(req, 200, 500);
    const { data, error } = await supabaseAdmin
      .from("saglik_kayitlari")
      .select("id, randevu_id, hayvan_id, veteriner_id, islem_turu, tani_notu, subjective, objective, assessment, plan, takip_kontrol_tarihi, taburculuk_notu, triage_seviyesi, ates_c, nabiz, solunum_sayisi, kilo_kg, hassas_mi, islem_tarihi, olusturma_tarihi")
      .eq("hayvan_id", hayvanId)
      .eq("hassas_mi", false)
      .order("islem_tarihi", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ hata: error.message });

    await erisimLoguYaz(req, "sahip_saglik_gecmisi_goruntuleme", hayvanId);
    return res.json({ kayit_sayisi: data.length, kayitlar: data });
  }
);

router.post(
  "/sahip/randevular/oneri",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipRandevuOneri),
  async (req, res) => {
    const { hayvan_id, veteriner_id, tarih } = req.body || {};
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, Number(hayvan_id));
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return hataDon(res, 403, "YETKI_YOK", "Bu hayvan icin onerilen randevu alinamaz.");

    let hedefVeterinerId = veteriner_id || null;
    if (!hedefVeterinerId) {
      const { data: sonRandevu, error: sonRandevuHata } = await supabaseAdmin
        .from("randevular")
        .select("veteriner_id")
        .eq("sahibi_id", req.kullanici.id)
        .order("olusturma_tarihi", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sonRandevuHata) return hataDon(res, 500, "RANDEVU_ONERI_HATASI", sonRandevuHata.message);
      hedefVeterinerId = sonRandevu?.veteriner_id || null;
    }
    if (!hedefVeterinerId) {
      const { data: varsayilanVet, error: varsayilanVetHata } = await supabaseAdmin
        .from("kullanicilar")
        .select("id")
        .eq("rol_id", ROLLER.VETERINER)
        .eq("aktif", true)
        .order("olusturma_tarihi", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (varsayilanVetHata) return hataDon(res, 500, "RANDEVU_ONERI_HATASI", varsayilanVetHata.message);
      hedefVeterinerId = varsayilanVet?.id || null;
    }
    if (!hedefVeterinerId) {
      return hataDon(res, 404, "VETERINER_YOK", "Oneri icin uygun veteriner bulunamadi.");
    }

    const baslangicTarih = (tarih && String(tarih).trim()) || bugunTarih();
    const saatAdaylari = ["09:30:00", "10:30:00", "11:30:00", "13:30:00", "14:30:00", "15:30:00", "16:30:00"];

    async function gunIcinUygunSaat(tarihDegeri) {
      const { data: dolu, error: doluHata } = await supabaseAdmin
        .from("randevular")
        .select("randevu_saati")
        .eq("veteriner_id", hedefVeterinerId)
        .eq("randevu_tarihi", tarihDegeri)
        .in("durum", RANDEVU_AKTIF_DURUMLAR);
      if (doluHata) return { hata: doluHata.message, saat: null };
      const doluSaatSet = new Set((dolu || []).map((x) => saatNormalizasyonu(x.randevu_saati)));
      const bosSaat = saatAdaylari.find((s) => !doluSaatSet.has(s));
      return { hata: null, saat: bosSaat || null };
    }

    const bugunAday = await gunIcinUygunSaat(baslangicTarih);
    if (bugunAday.hata) return hataDon(res, 500, "RANDEVU_ONERI_HATASI", bugunAday.hata);

    let onerilenTarih = baslangicTarih;
    let onerilenSaat = bugunAday.saat;
    let gerekce = "Secilen gunde ilk bos saat onerildi.";

    if (!onerilenSaat) {
      const sonraki = new Date(`${baslangicTarih}T00:00:00Z`);
      sonraki.setUTCDate(sonraki.getUTCDate() + 1);
      onerilenTarih = sonraki.toISOString().slice(0, 10);
      const sonrakiAday = await gunIcinUygunSaat(onerilenTarih);
      if (sonrakiAday.hata) return hataDon(res, 500, "RANDEVU_ONERI_HATASI", sonrakiAday.hata);
      onerilenSaat = sonrakiAday.saat || "10:30:00";
      gerekce = "Secilen gunde bos saat yoktu, en yakin gune otomatik kaydirildi.";
    }

    return res.json({
      onerilen_veteriner_id: hedefVeterinerId,
      onerilen_tarih: onerilenTarih,
      onerilen_saat: onerilenSaat,
      gerekce,
    });
  }
);

router.post(
  "/sahip/ai/on-yonlendirme",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipAiOnYonlendirme),
  async (req, res) => {
    const {
      hayvan_id,
      sikayet_ozet,
      semptom_suresi_saat,
      kusma_sayisi,
      ishal_var,
      istah_durumu,
      aktivite_durumu,
      su_tuketimi,
      ates_var,
      travma_oykusu,
      nobet_var,
      solunum_sikintisi,
      kanama_var,
      zehirlenme_suphesi,
    } = req.body || {};
    const sahiplik = await hayvanSahibininMi(req.kullanici.id, Number(hayvan_id));
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) return hataDon(res, 403, "YETKI_YOK", "Bu hayvan icin AI on yonlendirme kullanilamaz.");

    const { data: hayvanProfil, error: hayvanProfilHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, tur, irk, dogum_tarihi")
      .eq("id", Number(hayvan_id))
      .eq("sahibi_id", req.kullanici.id)
      .maybeSingle();
    if (hayvanProfilHata) return hataDon(res, 500, "AI_HAYVAN_PROFIL_HATASI", hayvanProfilHata.message);

    const analiz = aiOnYonlendirmeAnalizEt(sikayet_ozet, {
      semptom_suresi_saat,
      kusma_sayisi,
      ishal_var,
      istah_durumu,
      aktivite_durumu,
      su_tuketimi,
      ates_var,
      travma_oykusu,
      nobet_var,
      solunum_sikintisi,
      kanama_var,
      zehirlenme_suphesi,
      hayvan_tur: hayvanProfil?.tur || null,
      hayvan_irk: hayvanProfil?.irk || null,
      hayvan_dogum_tarihi: hayvanProfil?.dogum_tarihi || null,
    });
    const yonlendirme = analiz.ai_oncelik === "acil"
      ? "Acil risk sinyali algilandi. Klinik ile hemen iletisime gec ve ilk uygun acil slotu sec."
      : analiz.ai_oncelik === "oncelikli"
        ? "Oncelikli semptom sinifi. Bugun icinde veteriner randevusu planla."
        : analiz.ai_oncelik === "rutin"
          ? "Rutin izlem sinifi. Uygun ilk slot icin randevu olusturabilirsin."
          : "Metin klinik analiz icin yetersiz gorunuyor. Semptom suresi, siddeti ve davranis degisimini daha detayli yaz.";

    await erisimLoguYaz(req, "sahip_ai_on_yonlendirme", Number(hayvan_id));
    return res.json({
      ai_oncelik: analiz.ai_oncelik,
      guven_puani: analiz.guven_puani,
      yonlendirme,
      tani_uyarisi: "Bu yanit tani koymaz; sadece on bilgilendirme amaclidir.",
      analiz: {
        metin_kalitesi: analiz.metin_kalitesi,
        gerekceler: analiz.gerekceler,
        risk_faktorleri: analiz.risk_faktorleri,
        skorlar: analiz.skorlar,
      },
      hayvan_profili: hayvanProfil
        ? {
            tur: hayvanProfil.tur || null,
            irk: hayvanProfil.irk || null,
            dogum_tarihi: hayvanProfil.dogum_tarihi || null,
          }
        : null,
    });
  }
);

router.post(
  "/sahip/randevular",
  authZorunlu,
  rolGerekli(ROLLER.HAYVAN_SAHIBI),
  dogrula(shemalar.sahipRandevuOlustur),
  async (req, res) => {
    const { hayvan_id, veteriner_id, randevu_tarihi, randevu_saati, sikayet_ozet } = req.body || {};

    if (!hayvan_id || !veteriner_id || !randevu_tarihi || !randevu_saati) {
      return hataDon(
        res,
        400,
        "EKSIK_ALAN",
        "Eksik alan: hayvan_id, veteriner_id, randevu_tarihi, randevu_saati"
      );
    }

    const sahiplik = await hayvanSahibininMi(req.kullanici.id, Number(hayvan_id));
    if (sahiplik.hata) return res.status(500).json({ hata: sahiplik.hata });
    if (!sahiplik.izinli) {
      return hataDon(res, 403, "YETKI_YOK", "Bu hayvan icin randevu olusturamazsin.");
    }

    if (randevu_tarihi < bugunTarih()) {
      return hataDon(res, 400, "GECMIS_TARIH", "Gecmis tarih icin randevu olusturulamaz.");
    }

    const cakisma = await randevuCakismaVarMi(veteriner_id, randevu_tarihi, randevu_saati);
    if (cakisma.hata) return res.status(500).json({ hata: cakisma.hata });
    if (cakisma.cakisma) {
      return hataDon(res, 409, "RANDEVU_CAKISMA", "Secilen tarih/saat dolu. Lutfen farkli bir saat secin.");
    }

    const { data: hayvanProfil, error: hayvanProfilHata } = await supabaseAdmin
      .from("hayvanlar")
      .select("id, tur, irk, dogum_tarihi")
      .eq("id", Number(hayvan_id))
      .eq("sahibi_id", req.kullanici.id)
      .maybeSingle();
    if (hayvanProfilHata) return hataDon(res, 500, "RANDEVU_HAYVAN_PROFIL_HATASI", hayvanProfilHata.message);

    const analiz = aiOnYonlendirmeAnalizEt(sikayet_ozet, {
      hayvan_tur: hayvanProfil?.tur || null,
      hayvan_irk: hayvanProfil?.irk || null,
      hayvan_dogum_tarihi: hayvanProfil?.dogum_tarihi || null,
    });
    const ai_oncelik = analiz.ai_oncelik;

    const temelPayload = {
      hayvan_id,
      sahibi_id: req.kullanici.id,
      veteriner_id,
      randevu_tarihi,
      randevu_saati,
      durum: "beklemede",
    };
    let { data, error } = await supabaseAdmin
      .from("randevular")
      .insert({
        ...temelPayload,
        sikayet_ozet: sikayet_ozet || null,
        ai_oncelik,
      })
      .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum")
      .single();

    const aiAlanHatasi = String(error?.message || "").includes("sikayet_ozet") || String(error?.message || "").includes("ai_oncelik");
    if (error && aiAlanHatasi) {
      const tekrar = await supabaseAdmin
        .from("randevular")
        .insert(temelPayload)
        .select("id, hayvan_id, sahibi_id, veteriner_id, randevu_tarihi, randevu_saati, durum")
        .single();
      data = tekrar.data;
      error = tekrar.error;
    }

    if (error) {
      const cevap = supabaseHataYorumla(error, "Randevu olusturulamadi.");
      return hataDon(
        res,
        cevap.durum,
        cevap.durum === 409 ? "RANDEVU_CAKISMA" : cevap.durum === 400 ? "RANDEVU_GECERSIZ" : "RANDEVU_OLUSTURMA_HATASI",
        cevap.mesaj
      );
    }

    const bildirimSonuc = await bildirimOlustur({
      kullanici_id: veteriner_id,
      tur: "yeni_randevu",
      baslik: "Yeni randevu talebi",
      icerik: `${randevu_tarihi} ${saatNormalizasyonu(randevu_saati)} icin yeni talep.`,
      referans_hayvan_id: hayvan_id,
      referans_randevu_id: data?.id || null,
      kaynak_veteriner_id: veteriner_id,
      kanal: "push",
      fallback_kanal: "whatsapp",
      fallback_tetikle: false,
    });
    if (bildirimSonuc.hata) {
      console.error("Randevu bildirimi olusturulamadi:", bildirimSonuc.hata);
    }

    if (ai_oncelik === "acil") {
      const acilIcerik = `ACIL oncelikli randevu: ${randevu_tarihi} ${saatNormalizasyonu(randevu_saati)}. Hayvan #${hayvan_id}.`;
      const acilBildirim = await bildirimOlustur({
        kullanici_id: veteriner_id,
        tur: "acil_randevu_uyarisi",
        baslik: "Acil randevu uyarisi",
        icerik: acilIcerik,
        referans_hayvan_id: hayvan_id,
        referans_randevu_id: data?.id || null,
        kaynak_veteriner_id: veteriner_id,
        kanal: "whatsapp",
        fallback_kanal: "whatsapp",
        fallback_tetikle: true,
      });
      if (acilBildirim.hata) {
        console.error("Acil randevu WhatsApp uyarisi gonderilemedi:", acilBildirim.hata);
      }
    }

    await erisimLoguYaz(req, "sahip_randevu_olusturma", Number(hayvan_id));
    return res.status(201).json({ mesaj: "Randevu olusturuldu.", randevu: data });
  }
);

module.exports = router;

