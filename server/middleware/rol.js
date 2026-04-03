const { hata } = require("../utils/http");

function rolGerekli(...izinliRoller) {
  const izinli = new Set(izinliRoller);

  return (req, res, next) => {
    if (!req.kullanici?.rolId) {
      return hata(res, 401, "OTURUM_YOK", "Oturum bilgisi bulunamadi.");
    }

    if (!izinli.has(req.kullanici.rolId)) {
      return hata(res, 403, "YETKI_YOK", "Bu islem icin yetkin yok.");
    }

    return next();
  };
}

module.exports = {
  rolGerekli,
};

