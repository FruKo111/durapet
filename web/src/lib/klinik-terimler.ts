export const RANDEVU_DURUM_ETIKETLERI: Record<string, string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  geldi: "Geldi",
  muayenede: "Muayenede",
  tamamlandi: "Tamamlandı",
  iptal: "İptal",
  no_show: "No-show",
};

export const TRIAGE_ETIKETLERI: Record<string, string> = {
  dusuk: "Düşük",
  orta: "Orta",
  yuksek: "Yüksek",
  kritik: "Kritik",
};

export function durumEtiketi(durum?: string | null) {
  if (!durum) return "-";
  return RANDEVU_DURUM_ETIKETLERI[durum] || durum;
}

export function triageEtiketi(deger?: string | null) {
  if (!deger) return "-";
  return TRIAGE_ETIKETLERI[deger] || deger;
}
