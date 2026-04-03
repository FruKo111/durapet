const { supabaseAdmin } = require("../supabase");

async function hayvanSahibininMi(kullaniciId, hayvanId) {
  const { data, error } = await supabaseAdmin
    .from("hayvanlar")
    .select("id")
    .eq("id", hayvanId)
    .eq("sahibi_id", kullaniciId)
    .maybeSingle();

  if (error) {
    return { hata: error.message, izinli: false };
  }

  return { hata: null, izinli: Boolean(data) };
}

async function veterinerHayvanaErisimVarMi(veterinerId, hayvanId) {
  const [randevu, saglik, oda] = await Promise.all([
    supabaseAdmin
      .from("randevular")
      .select("id")
      .eq("veteriner_id", veterinerId)
      .eq("hayvan_id", hayvanId)
      .limit(1),
    supabaseAdmin
      .from("saglik_kayitlari")
      .select("id")
      .eq("veteriner_id", veterinerId)
      .eq("hayvan_id", hayvanId)
      .limit(1),
    supabaseAdmin
      .from("mesaj_odalar")
      .select("id")
      .eq("veteriner_id", veterinerId)
      .eq("hayvan_id", hayvanId)
      .limit(1),
  ]);

  if (randevu.error || saglik.error || oda.error) {
    return {
      hata: randevu.error?.message || saglik.error?.message || oda.error?.message,
      izinli: false,
    };
  }

  const izinli =
    (randevu.data && randevu.data.length > 0) ||
    (saglik.data && saglik.data.length > 0) ||
    (oda.data && oda.data.length > 0);

  return { hata: null, izinli };
}

module.exports = {
  hayvanSahibininMi,
  veterinerHayvanaErisimVarMi,
};

