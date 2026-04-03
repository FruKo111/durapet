function basarili(res, veri = {}, durumKodu = 200) {
  return res.status(durumKodu).json(veri);
}

function hata(res, durumKodu, kod, mesaj, detay = null) {
  return res.status(durumKodu).json({
    kod,
    hata: mesaj,
    detay,
  });
}

function asyncYakala(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  basarili,
  hata,
  asyncYakala,
};

