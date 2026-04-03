/* eslint-disable no-console */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TEST_VETERINER_EMAIL = process.env.TEST_VETERINER_EMAIL;
const TEST_VETERINER_PASSWORD = process.env.TEST_VETERINER_PASSWORD;
const TEST_SAHIP_EMAIL = process.env.TEST_SAHIP_EMAIL;
const TEST_SAHIP_PASSWORD = process.env.TEST_SAHIP_PASSWORD;

function zorunluEnvKontrol() {
  const eksikler = [];
  const zorunlu = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_VETERINER_EMAIL,
    TEST_VETERINER_PASSWORD,
    TEST_SAHIP_EMAIL,
    TEST_SAHIP_PASSWORD,
  };

  for (const [ad, deger] of Object.entries(zorunlu)) {
    if (!deger) eksikler.push(ad);
  }

  if (eksikler.length > 0) {
    throw new Error(`Eksik ortam degiskeni: ${eksikler.join(", ")}`);
  }
}

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

async function girisYap(supabase, email, password, rolAdi) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(`${rolAdi} giris basarisiz: ${error?.message || "token alinamadi"}`);
  }
  return data.session.access_token;
}

async function tokenliGet(path, token) {
  return istek(path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function tokenliPost(path, token, body) {
  return istek(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function tokenliPatch(path, token, body = {}) {
  return istek(path, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function testDurum() {
  const { response, json } = await istek("/api/v1/durum");
  const ok = response.status === 200 && json?.durum === "hazir";
  sonucYaz("Durum endpoint", ok, `status=${response.status}`);
  if (!ok) throw new Error("Durum endpoint testi basarisiz.");
}

async function testRolAkisi(token, beklenenRolId, rolAdi, endpointler) {
  const profil = await tokenliGet("/api/v1/profilim", token);
  const profilOk = profil.response.status === 200 && profil.json?.kullanici?.rolId === beklenenRolId;
  sonucYaz(`${rolAdi} /profilim`, profilOk, `status=${profil.response.status}`);
  if (!profilOk) {
    throw new Error(`${rolAdi} rol dogrulamasi basarisiz.`);
  }

  for (const endpoint of endpointler) {
    const sonuc = await tokenliGet(endpoint, token);
    const ok = sonuc.response.status === 200;
    sonucYaz(`${rolAdi} ${endpoint}`, ok, `status=${sonuc.response.status}`);
    if (!ok) {
      throw new Error(`${rolAdi} endpoint basarisiz: ${endpoint}`);
    }
  }

  return profil.json.kullanici;
}

async function writeAkisiTestEt({ adminToken, vetToken, sahipToken, vetId, sahipId }) {
  const hayvanListe = await tokenliGet("/api/v1/sahip/hayvanlar?limit=10", sahipToken);
  if (hayvanListe.response.status !== 200) {
    throw new Error("Sahip hayvan listesi alinamadi.");
  }

  let hayvanId = hayvanListe.json?.hayvanlar?.[0]?.id;

  if (!hayvanId) {
    const hayvanOlustur = await tokenliPost("/api/v1/sahip/hayvanlar", sahipToken, {
      ad: "Duman",
      tur: "kedi",
      irk: "tekir",
      cinsiyet: "disi",
      dogum_tarihi: "2024-02-01",
      kilo: 4.2,
    });
    const hayvanOlusturOk = hayvanOlustur.response.status === 201;
    sonucYaz("Sahip hayvan olusturma", hayvanOlusturOk, `status=${hayvanOlustur.response.status}`);
    if (!hayvanOlusturOk) throw new Error("Hayvan olusturma basarisiz.");
    hayvanId = hayvanOlustur.json?.hayvan?.id;
  }

  const bugun = new Date();
  const hedefGun = new Date(bugun.getTime());
  let bazSaat = bugun.getUTCHours() + 2;
  if (bazSaat >= 24) {
    bazSaat -= 24;
    hedefGun.setUTCDate(hedefGun.getUTCDate() + 1);
  }
  const tarih = hedefGun.toISOString().slice(0, 10);
  const dakika = ((bugun.getUTCMinutes() + 5) % 60).toString().padStart(2, "0");
  const saat = `${String(bazSaat).padStart(2, "0")}:${dakika}:00`;
  const ikinciSaat = `${String((bazSaat + 1) % 24).padStart(2, "0")}:${dakika}:00`;

  const randevuOlustur = await tokenliPost("/api/v1/sahip/randevular", sahipToken, {
    hayvan_id: hayvanId,
    veteriner_id: vetId,
    randevu_tarihi: tarih,
    randevu_saati: saat,
  });
  const randevuOlusturOk = randevuOlustur.response.status === 201;
  sonucYaz("Sahip randevu olusturma", randevuOlusturOk, `status=${randevuOlustur.response.status}`);
  if (!randevuOlusturOk) throw new Error("Sahip randevu olusturma basarisiz.");

  const randevuId = randevuOlustur.json?.randevu?.id;
  if (!randevuId) throw new Error("Olusan randevu id alinamadi.");

  const randevuOnay = await tokenliPatch(`/api/v1/veteriner/randevular/${randevuId}/onayla`, vetToken, {});
  const randevuOnayOk = randevuOnay.response.status === 200;
  sonucYaz("Veteriner randevu onaylama", randevuOnayOk, `status=${randevuOnay.response.status}`);
  if (!randevuOnayOk) throw new Error("Randevu onaylama basarisiz.");

  const randevuGeldi = await tokenliPatch(`/api/v1/veteriner/randevular/${randevuId}/durum`, vetToken, { durum: "geldi" });
  const randevuGeldiOk = randevuGeldi.response.status === 200;
  sonucYaz("Veteriner randevu geldi", randevuGeldiOk, `status=${randevuGeldi.response.status}`);
  if (!randevuGeldiOk) throw new Error("Randevu geldi gecisi basarisiz.");

  const randevuMuayene = await tokenliPatch(`/api/v1/veteriner/randevular/${randevuId}/durum`, vetToken, { durum: "muayenede" });
  const randevuMuayeneOk = randevuMuayene.response.status === 200;
  sonucYaz("Veteriner randevu muayenede", randevuMuayeneOk, `status=${randevuMuayene.response.status}`);
  if (!randevuMuayeneOk) throw new Error("Randevu muayenede gecisi basarisiz.");

  const randevuTamamla = await tokenliPatch(`/api/v1/veteriner/randevular/${randevuId}/tamamla`, vetToken, {
    islem_turu: "genel_kontrol",
    tani_notu: "Smoke test randevu tamamlama",
    subjective: "Sahip genel durum iyi bildirdi.",
    objective: "Muayene bulgulari stabil.",
    assessment: "Rutin kontrol normal.",
    plan: "7 gun sonra takip.",
    takip_kontrol_tarihi: tarih,
    taburculuk_notu: "Evde izlem onerildi.",
    triage_seviyesi: "dusuk",
    ates_c: 38.3,
    nabiz: 120,
    solunum_sayisi: 26,
    kilo_kg: 4.3,
    asi_uygulandi: false,
  });
  const randevuTamamlaOk = randevuTamamla.response.status === 200;
  sonucYaz("Veteriner randevu tamamlama", randevuTamamlaOk, `status=${randevuTamamla.response.status}`);
  if (!randevuTamamlaOk) throw new Error("Randevu tamamlama basarisiz.");

  const randevuCheckout = await tokenliPatch(`/api/v1/veteriner/randevular/${randevuId}/checkout`, vetToken, {});
  const randevuCheckoutOk = randevuCheckout.response.status === 200;
  sonucYaz("Veteriner randevu checkout", randevuCheckoutOk, `status=${randevuCheckout.response.status}`);
  if (!randevuCheckoutOk) throw new Error("Randevu checkout basarisiz.");

  const sahipSaglikGecmisi = await tokenliGet(`/api/v1/sahip/hayvanlar/${hayvanId}/saglik-gecmisi?limit=10`, sahipToken);
  const sahipSaglikOk =
    sahipSaglikGecmisi.response.status === 200 &&
    Array.isArray(sahipSaglikGecmisi.json?.kayitlar) &&
    sahipSaglikGecmisi.json.kayitlar.some((x) => x.randevu_id === randevuId && x.subjective && x.objective && x.assessment && x.plan);
  sonucYaz("Sahip saglik gecmisi klinik alanlar", sahipSaglikOk, `status=${sahipSaglikGecmisi.response.status}`);
  if (!sahipSaglikOk) throw new Error("Sahip saglik gecmisi klinik alan dogrulamasi basarisiz.");

  const ikinciRandevuOlustur = await tokenliPost("/api/v1/sahip/randevular", sahipToken, {
    hayvan_id: hayvanId,
    veteriner_id: vetId,
    randevu_tarihi: tarih,
    randevu_saati: ikinciSaat,
  });
  const ikinciRandevuOk = ikinciRandevuOlustur.response.status === 201;
  sonucYaz("Sahip ikinci randevu olusturma", ikinciRandevuOk, `status=${ikinciRandevuOlustur.response.status}`);
  if (!ikinciRandevuOk) throw new Error("Ikinci randevu olusturma basarisiz.");
  const ikinciRandevuId = ikinciRandevuOlustur.json?.randevu?.id;
  if (!ikinciRandevuId) throw new Error("Ikinci randevu id alinamadi.");

  const ikinciRandevuNoShow = await tokenliPatch(`/api/v1/veteriner/randevular/${ikinciRandevuId}/no-show`, vetToken, {
    no_show_nedeni: "Smoke test no-show",
  });
  const ikinciRandevuNoShowOk = ikinciRandevuNoShow.response.status === 200;
  sonucYaz("Veteriner randevu no-show", ikinciRandevuNoShowOk, `status=${ikinciRandevuNoShow.response.status}`);
  if (!ikinciRandevuNoShowOk) throw new Error("Randevu no-show basarisiz.");

  const erisimLoglari = await tokenliGet("/api/v1/admin/erisim-loglari?limit=200", adminToken);
  const loglar = erisimLoglari.json?.loglar || [];
  const auditOk =
    erisimLoglari.response.status === 200 &&
    loglar.some((x) => x.eylem === "veteriner_randevu_tamamlama") &&
    loglar.some((x) => x.eylem === "veteriner_randevu_checkout") &&
    loglar.some((x) => x.eylem === "veteriner_randevu_no_show");
  sonucYaz("Klinik audit izleri", auditOk, `status=${erisimLoglari.response.status}`);
  if (!auditOk) throw new Error("Klinik audit izleri dogrulanamadi.");

  const hizliMesaj = await tokenliPost("/api/v1/veteriner/hizli-mesaj", vetToken, {
    sahibi_id: sahipId,
    hayvan_id: hayvanId,
    mesaj: "Karabas'in kontrol zamani geldi.",
  });
  const hizliMesajOk = hizliMesaj.response.status === 201;
  sonucYaz("Veteriner hizli mesaj", hizliMesajOk, `status=${hizliMesaj.response.status}`);
  if (!hizliMesajOk) throw new Error("Veteriner hizli mesaj basarisiz.");

  const saglikKaydi = await tokenliPost(`/api/v1/veteriner/hastalar/${hayvanId}/saglik-kayitlari`, vetToken, {
    islem_turu: "genel_kontrol",
    tani_notu: "Smoke test genel kontrol kaydi",
    hassas_mi: false,
    islem_tarihi: new Date().toISOString(),
  });
  const saglikKaydiOk = saglikKaydi.response.status === 201;
  sonucYaz("Veteriner saglik kaydi ekleme", saglikKaydiOk, `status=${saglikKaydi.response.status}`);
  if (!saglikKaydiOk) throw new Error("Saglik kaydi ekleme basarisiz.");

  const asiKaydi = await tokenliPost(`/api/v1/veteriner/hastalar/${hayvanId}/asilar`, vetToken, {
    asi_adi: "kuduz_asi",
    uygulama_tarihi: tarih,
    tekrar_gun_sayisi: 365,
    notlar: "Smoke test asi kaydi",
  });
  const asiKaydiOk = asiKaydi.response.status === 201;
  sonucYaz("Veteriner asi kaydi ekleme", asiKaydiOk, `status=${asiKaydi.response.status}`);
  if (!asiKaydiOk) throw new Error("Asi kaydi ekleme basarisiz.");
}

async function calistir() {
  zorunluEnvKontrol();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Tokenli API smoke test basladi: ${BASE_URL}`);
  await testDurum();

  const adminToken = await girisYap(supabase, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, "Admin");
  await testRolAkisi(adminToken, 1, "Admin", [
    "/api/v1/admin/kullanicilar?limit=10",
    "/api/v1/admin/guvenlik-loglari?limit=10",
    "/api/v1/admin/erisim-loglari?limit=10",
    "/api/v1/admin/operasyon/ozet?limit=10",
  ]);

  const vetToken = await girisYap(supabase, TEST_VETERINER_EMAIL, TEST_VETERINER_PASSWORD, "Veteriner");
  const vetProfil = await testRolAkisi(vetToken, 2, "Veteriner", [
    "/api/v1/veteriner/hastalar?limit=10",
    "/api/v1/veteriner/randevular?limit=10",
    "/api/v1/veteriner/asi-zamani-yaklasanlar?limit=10",
  ]);

  const sahipToken = await girisYap(supabase, TEST_SAHIP_EMAIL, TEST_SAHIP_PASSWORD, "Hayvan Sahibi");
  const sahipProfil = await testRolAkisi(sahipToken, 3, "Hayvan Sahibi", [
    "/api/v1/sahip/hayvanlar?limit=10",
  ]);

  await writeAkisiTestEt({
    adminToken,
    vetToken,
    sahipToken,
    vetId: vetProfil.id,
    sahipId: sahipProfil.id,
  });

  console.log("Tum tokenli smoke testler basarili.");
}

calistir().catch((err) => {
  console.error("Tokenli smoke test hatasi:", err.message);
  process.exit(1);
});

