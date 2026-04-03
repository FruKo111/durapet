const { z } = require("zod");
const { hata } = require("../utils/http");

function zodHataOzeti(issues) {
  const alanEtiket = (path) => {
    const tail = path[path.length - 1];
    const map = {
      ad: "Ad",
      soyad: "Soyad",
      telefon: "Telefon",
      eposta: "E-posta",
      sifre: "Şifre",
      kvkk_acik_riza_onay: "KVKK açık rıza",
      pazarlama_riza: "Pazarlama izni",
    };
    if (typeof tail === "string" && map[tail]) return map[tail];
    return String(tail ?? "");
  };

  return issues
    .map((x) => {
      const etiket = alanEtiket(x.path);
      const m = String(x.message || "").trim();
      if (!etiket || etiket === "undefined") return m;
      if (m && !m.startsWith(etiket)) return `${etiket}: ${m}`;
      return m || etiket;
    })
    .filter(Boolean)
    .join(" ");
}

function dogrula(shema) {
  return (req, res, next) => {
    const sonuc = shema.safeParse({
      body: req.body ?? {},
      params: req.params ?? {},
      query: req.query ?? {},
    });

    if (!sonuc.success) {
      const ozet = zodHataOzeti(sonuc.error.issues);
      return hata(
        res,
        400,
        "GECERSIZ_ISTEK",
        ozet || "İstek doğrulanamadı. Alanları kontrol edin.",
        sonuc.error.issues.map((x) => ({
          alan: x.path.join("."),
          mesaj: x.message,
        }))
      );
    }

    req.body = sonuc.data.body;
    req.params = sonuc.data.params;
    req.query = sonuc.data.query;
    return next();
  };
}

const ortak = {
  uuid: z.string().uuid("Gecerli bir UUID bekleniyor."),
  pozitifInt: z.coerce.number().int().positive(),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih formati YYYY-AA-GG olmali."),
  saat: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Saat formati SS:DD veya SS:DD:SS olmali."),
  metin: z.string().trim().min(1),
};

module.exports = {
  dogrula,
  ortak,
};

