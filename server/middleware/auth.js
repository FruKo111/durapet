const { supabaseAuth, supabaseAdmin } = require("../supabase");
const { hata } = require("../utils/http");
const { guvenlikLoguYaz } = require("../utils/log");

async function authZorunlu(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    guvenlikLoguYaz({
      seviye: "uyari",
      olay_turu: "auth_token_yok",
      aciklama: "Authorization Bearer token bulunamadi.",
    }).catch(() => {});
    return hata(res, 401, "TOKEN_YOK", "Yetkisiz erisim: token bulunamadi.");
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    guvenlikLoguYaz({
      seviye: "uyari",
      olay_turu: "auth_token_gecersiz",
      aciklama: `Token gecersiz: ${error?.message || "Bilinmeyen hata"}`,
    }).catch(() => {});
    return hata(res, 401, "TOKEN_GECERSIZ", "Gecersiz token.");
  }

  const { data: profil, error: profilHata } = await supabaseAdmin
    .from("kullanicilar")
    .select("id, rol_id, ad, soyad, aktif")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profilHata || !profil) {
    guvenlikLoguYaz({
      seviye: "uyari",
      olay_turu: "auth_profil_yok",
      aciklama: `Profil bulunamadi: ${profilHata?.message || "Kayit yok"}`,
      iliskili_kullanici_id: data.user.id,
    }).catch(() => {});
    return hata(res, 403, "PROFIL_YOK", "Kullanici profili bulunamadi.");
  }

  if (!profil.aktif) {
    guvenlikLoguYaz({
      seviye: "uyari",
      olay_turu: "auth_hesap_pasif",
      aciklama: "Pasif hesap ile erisim denemesi.",
      iliskili_kullanici_id: profil.id,
    }).catch(() => {});
    return hata(res, 403, "HESAP_PASIF", "Kullanici hesabi pasif.");
  }

  req.kullanici = {
    id: profil.id,
    rolId: profil.rol_id,
    ad: profil.ad,
    soyad: profil.soyad,
    token,
  };

  return next();
}

module.exports = {
  authZorunlu,
};

