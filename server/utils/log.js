const { supabaseAdmin } = require("../supabase");

function istemciIpAl(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

async function erisimLoguYaz(req, eylem, hayvanId = null) {
  if (!req.kullanici?.id) return;
  const hayvanIdGuvenli =
    typeof hayvanId === "number" && Number.isFinite(hayvanId) && hayvanId > 0
      ? Math.floor(hayvanId)
      : null;

  const payload = {
    kullanici_id: req.kullanici.id,
    hayvan_id: hayvanIdGuvenli,
    eylem,
    kaynak: "api",
    ip_adresi: istemciIpAl(req),
    kullanici_araci: req.headers["user-agent"] || null,
  };

  const { error } = await supabaseAdmin.from("erisim_loglari").insert(payload);
  if (error) {
    console.error("Erisim logu yazilamadi:", error.message);
  }
}

async function guvenlikLoguYaz({ seviye = "info", olay_turu, aciklama, iliskili_kullanici_id = null }) {
  if (!olay_turu || !aciklama) return;

  const payload = {
    seviye,
    olay_turu,
    aciklama,
    iliskili_kullanici_id,
  };

  const { error } = await supabaseAdmin.from("guvenlik_loglari").insert(payload);
  if (error) {
    console.error("Guvenlik logu yazilamadi:", error.message);
  }
}

module.exports = {
  erisimLoguYaz,
  guvenlikLoguYaz,
};

