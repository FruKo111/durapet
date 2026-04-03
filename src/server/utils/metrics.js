const metrik = {
  baslangic: new Date().toISOString(),
  toplam_istek: 0,
  aktif_istek: 0,
  durum_kodlari: {},
  endpointler: {},
};

function endpointAnahtariAl(req) {
  const temel = req.baseUrl || "";
  const yol = req.path || req.originalUrl || "/";
  return `${req.method || "GET"} ${temel}${yol}`;
}

function endpointKaydiAl(endpoint) {
  if (!metrik.endpointler[endpoint]) {
    metrik.endpointler[endpoint] = {
      istek_sayisi: 0,
      toplam_ms: 0,
      min_ms: null,
      max_ms: 0,
      son_durum: 0,
      son_istek_tarihi: null,
    };
  }
  return metrik.endpointler[endpoint];
}

function istekBaslat() {
  metrik.aktif_istek += 1;
}

function istekBitir({ endpoint, durumKodu, sureMs }) {
  const guvenliSure = Math.max(0, Number(sureMs || 0));
  metrik.toplam_istek += 1;
  metrik.aktif_istek = Math.max(0, metrik.aktif_istek - 1);

  const durum = String(durumKodu || 0);
  metrik.durum_kodlari[durum] = (metrik.durum_kodlari[durum] || 0) + 1;

  const endpointKaydi = endpointKaydiAl(endpoint);
  endpointKaydi.istek_sayisi += 1;
  endpointKaydi.toplam_ms += guvenliSure;
  endpointKaydi.min_ms = endpointKaydi.min_ms === null ? guvenliSure : Math.min(endpointKaydi.min_ms, guvenliSure);
  endpointKaydi.max_ms = Math.max(endpointKaydi.max_ms, guvenliSure);
  endpointKaydi.son_durum = Number(durumKodu || 0);
  endpointKaydi.son_istek_tarihi = new Date().toISOString();
}

function ozetGetir(ilkN = 20) {
  const endpointKayitlari = Object.entries(metrik.endpointler)
    .map(([endpoint, x]) => ({
      endpoint,
      istek_sayisi: x.istek_sayisi,
      ortalama_ms: x.istek_sayisi > 0 ? Number((x.toplam_ms / x.istek_sayisi).toFixed(2)) : 0,
      min_ms: x.min_ms ?? 0,
      max_ms: x.max_ms ?? 0,
      son_durum: x.son_durum,
      son_istek_tarihi: x.son_istek_tarihi,
    }))
    .sort((a, b) => b.istek_sayisi - a.istek_sayisi)
    .slice(0, Math.max(1, Math.min(200, Number(ilkN || 20))));

  return {
    baslangic: metrik.baslangic,
    uptime_saniye: Math.floor(process.uptime()),
    toplam_istek: metrik.toplam_istek,
    aktif_istek: metrik.aktif_istek,
    durum_kodlari: metrik.durum_kodlari,
    endpointler: endpointKayitlari,
  };
}

module.exports = {
  endpointAnahtariAl,
  istekBaslat,
  istekBitir,
  ozetGetir,
};
