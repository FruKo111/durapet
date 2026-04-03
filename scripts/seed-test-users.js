/* eslint-disable no-console */
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TEST_VETERINER_EMAIL = process.env.TEST_VETERINER_EMAIL;
const TEST_VETERINER_PASSWORD = process.env.TEST_VETERINER_PASSWORD;
const TEST_SAHIP_EMAIL = process.env.TEST_SAHIP_EMAIL;
const TEST_SAHIP_PASSWORD = process.env.TEST_SAHIP_PASSWORD;

function envKontrol() {
  const eksik = [];
  const zorunlu = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_VETERINER_EMAIL,
    TEST_VETERINER_PASSWORD,
    TEST_SAHIP_EMAIL,
    TEST_SAHIP_PASSWORD,
  };

  for (const [k, v] of Object.entries(zorunlu)) {
    if (!v) eksik.push(k);
  }

  if (eksik.length) {
    throw new Error(`Eksik ortam degiskeni: ${eksik.join(", ")}`);
  }
}

async function authKullaniciBulVeyaOlustur(supabase, email, password, ad, soyad) {
  const mevcut = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (mevcut.error) {
    throw new Error(`Auth kullanici listesi alinamadi: ${mevcut.error.message}`);
  }

  const bulunan = (mevcut.data?.users || []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (bulunan) return bulunan.id;

  const olustur = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { ad, soyad },
  });

  if (olustur.error || !olustur.data?.user?.id) {
    throw new Error(`Auth kullanicisi olusturulamadi (${email}): ${olustur.error?.message || "bilinmeyen hata"}`);
  }

  return olustur.data.user.id;
}

async function calistir() {
  envKontrol();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminId = await authKullaniciBulVeyaOlustur(
    supabase,
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    "Sistem",
    "Admin"
  );
  const veterinerId = await authKullaniciBulVeyaOlustur(
    supabase,
    TEST_VETERINER_EMAIL,
    TEST_VETERINER_PASSWORD,
    "Test",
    "Veteriner"
  );
  const sahipId = await authKullaniciBulVeyaOlustur(
    supabase,
    TEST_SAHIP_EMAIL,
    TEST_SAHIP_PASSWORD,
    "Test",
    "Sahip"
  );

  const { error: adminKullaniciErr } = await supabase.from("kullanicilar").upsert(
    {
      id: adminId,
      rol_id: 1,
      ad: "Sistem",
      soyad: "Admin",
      eposta: TEST_ADMIN_EMAIL,
      aktif: true,
    },
    { onConflict: "id" }
  );
  if (adminKullaniciErr) throw new Error(adminKullaniciErr.message);

  const { error: vetKullaniciErr } = await supabase.from("kullanicilar").upsert(
    {
      id: veterinerId,
      rol_id: 2,
      ad: "Test",
      soyad: "Veteriner",
      eposta: TEST_VETERINER_EMAIL,
      aktif: true,
    },
    { onConflict: "id" }
  );
  if (vetKullaniciErr) throw new Error(vetKullaniciErr.message);

  const { error: sahipKullaniciErr } = await supabase.from("kullanicilar").upsert(
    {
      id: sahipId,
      rol_id: 3,
      ad: "Test",
      soyad: "Sahip",
      eposta: TEST_SAHIP_EMAIL,
      aktif: true,
    },
    { onConflict: "id" }
  );
  if (sahipKullaniciErr) throw new Error(sahipKullaniciErr.message);

  const { error: vetProfilErr } = await supabase.from("veteriner_profilleri").upsert(
    {
      id: veterinerId,
      diploma_no: "VET-TEST-001",
      klinik_adi: "DuraPet Klinik",
      uzmanlik_alani: "Genel",
      il: "Istanbul",
      ilce: "Kadikoy",
    },
    { onConflict: "id" }
  );
  if (vetProfilErr) throw new Error(vetProfilErr.message);

  const { error: sahipProfilErr } = await supabase.from("hayvan_sahibi_profilleri").upsert(
    {
      id: sahipId,
      acil_durum_iletisim: "05550000000",
      adres: "Test Adres",
    },
    { onConflict: "id" }
  );
  if (sahipProfilErr) throw new Error(sahipProfilErr.message);

  const hayvanKontrol = await supabase
    .from("hayvanlar")
    .select("id")
    .eq("sahibi_id", sahipId)
    .eq("ad", "Karabas")
    .limit(1);

  if (hayvanKontrol.error) throw new Error(hayvanKontrol.error.message);

  if (!hayvanKontrol.data || hayvanKontrol.data.length === 0) {
    const { error: hayvanErr } = await supabase.from("hayvanlar").insert({
      sahibi_id: sahipId,
      ad: "Karabas",
      tur: "kopek",
      irk: "golden",
      cinsiyet: "erkek",
      dogum_tarihi: "2024-01-01",
      kilo: 18.5,
      kisirlastirma_durumu: false,
      aktif: true,
    });
    if (hayvanErr) throw new Error(hayvanErr.message);
  }

  console.log("Test kullanicilari hazir:");
  console.log(`- Admin: ${TEST_ADMIN_EMAIL}`);
  console.log(`- Veteriner: ${TEST_VETERINER_EMAIL}`);
  console.log(`- Sahip: ${TEST_SAHIP_EMAIL}`);
}

calistir().catch((err) => {
  console.error("Seed hatasi:", err.message);
  process.exit(1);
});

