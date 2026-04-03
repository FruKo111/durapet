"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelShell } from "@/components/panel-shell";
import { SectionCard } from "@/components/section-card";
import { CommandCenter } from "@/components/command-center";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { publicApiBaseUrlVeyaDevOtomatik, publicWebOriginForQr } from "@/lib/public-env";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { triageEtiketi } from "@/lib/klinik-terimler";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  ActivitySquare,
  AlertCircle,
  Bell,
  AlarmClock,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  CircleAlert,
  Clock3,
  IdCard,
  LayoutDashboard,
  MessageSquare,
  PawPrint,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { useRouter } from "next/navigation";

const SECILI_HAYVAN_KEY = "durapet_secili_hayvan_id";
const AKTIF_MENU_KEY = "durapet_sahip_aktif_menu";
const DURAPET_LOGO_URL = process.env.NEXT_PUBLIC_DURAPET_LOGO_URL ?? "/durapet-logo.png";

function apiKokUrlAl() {
  return publicApiBaseUrlVeyaDevOtomatik();
}

/** QR ve PDF’teki link kökü; üretimde NEXT_PUBLIC_QR_PUBLIC_BASE_URL veya NEXT_PUBLIC_SITE_URL. */
function qrPublicWebKokuAl() {
  return publicWebOriginForQr();
}

export default function SahipSayfasi() {
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.HAYVAN_SAHIBI);
  const router = useRouter();
  const [aktifMenu, setAktifMenu] = useState("dashboard");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const [veriHatasi, setVeriHatasi] = useState("");
  const [islemMesaji, setIslemMesaji] = useState("");
  const [hayvanlar, setHayvanlar] = useState<Hayvan[]>([]);
  const [tumHayvanlar, setTumHayvanlar] = useState<Hayvan[]>([]);
  const [toplamHayvan, setToplamHayvan] = useState(0);
  const [saglikKayitlari, setSaglikKayitlari] = useState<SaglikKaydi[]>([]);
  const [gecmisYukleniyor, setGecmisYukleniyor] = useState(false);
  const [randevular, setRandevular] = useState<Randevu[]>([]);
  const [kimlikGecmisi, setKimlikGecmisi] = useState<KimlikGecmis[]>([]);
  const [kimlik, setKimlik] = useState<Kimlik | null>(null);
  const [kimlikQrDataUrl, setKimlikQrDataUrl] = useState("");
  const [veterinerler, setVeterinerler] = useState<Veteriner[]>([]);
  const [seciliHayvanId, setSeciliHayvanId] = useState<number | null>(null);
  const [hayvanForm, setHayvanForm] = useState({
    ad: "",
    tur: "kedi",
    irk: "",
    cinsiyet: "belirsiz",
    kan_grubu: "",
    dogum_tarihi: "",
    kilo: "",
  });
  const [randevuForm, setRandevuForm] = useState({
    hayvan_id: "",
    veteriner_id: "",
    randevu_tarihi: "",
    randevu_saati: "10:30:00",
    sikayet_ozet: "",
  });
  const [aiDetayForm, setAiDetayForm] = useState({
    semptom_suresi_saat: "",
    kusma_sayisi: "",
    ishal_var: false,
    istah_durumu: "normal",
    aktivite_durumu: "normal",
    su_tuketimi: "normal",
    ates_var: false,
    travma_oykusu: false,
    nobet_var: false,
    solunum_sikintisi: false,
    kanama_var: false,
    zehirlenme_suphesi: false,
  });
  const [globalArama, setGlobalArama] = useState("");
  const debouncedArama = useDebouncedValue(globalArama, 400);
  const [hayvanArama, setHayvanArama] = useState("");
  const [hayvanSirala, setHayvanSirala] = useState("ad_asc");
  const [hayvanSayfa, setHayvanSayfa] = useState(1);
  const [sonAksiyon, setSonAksiyon] = useState("");
  const [aktifAksiyonAnahtari, setAktifAksiyonAnahtari] = useState("");
  const [hayvanSilinenId, setHayvanSilinenId] = useState<number | null>(null);
  const [randevuListeFiltresi, setRandevuListeFiltresi] = useState<"tum" | "beklemede" | "onaylandi" | "tamamlandi" | "iptal">("tum");
  const [randevuKaydediliyor, setRandevuKaydediliyor] = useState(false);
  const [randevuOneriYukleniyor, setRandevuOneriYukleniyor] = useState(false);
  const [randevuOneriGerekce, setRandevuOneriGerekce] = useState("");
  const [aiOnYonlendirme, setAiOnYonlendirme] = useState<{
    oncelik: string | null;
    metin: string;
    tani_uyarisi?: string;
    guven_puani?: number;
    metin_kalitesi?: string;
    gerekceler?: string[];
    risk_faktorleri?: string[];
    hayvan_profili_metin?: string;
  } | null>(null);
  const [randevuIptalEdilenId, setRandevuIptalEdilenId] = useState<number | null>(null);
  const [detayModal, setDetayModal] = useState<{ baslik: string; veri: unknown } | null>(null);
  const [saglikDetayModal, setSaglikDetayModal] = useState<SaglikKaydi | null>(null);
  const [kimlikForm, setKimlikForm] = useState({
    hayvan_id: "",
    kimlik_notu: "",
    kayip_hayvan_iletisim_izni: false,
    kayip_hayvan_notu: "",
    sahibi_telefon: "",
    sahibi_adres: "",
    sahibi_il: "",
    sahibi_ilce: "",
    sahibi_acil_durum_iletisim: "",
    hayvan_tur: "kedi",
    hayvan_irk: "",
    hayvan_cinsiyet: "belirsiz",
    hayvan_kan_grubu: "",
    hayvan_dogum_tarihi: "",
    hayvan_kilo: "",
    mikrocip_no: "",
  });
  const [surukleAktif, setSurukleAktif] = useState(false);
  const [kimlikDosya, setKimlikDosya] = useState<File | null>(null);
  const [kimlikDosyaOnizleme, setKimlikDosyaOnizleme] = useState("");
  const [dosyaIsleniyor, setDosyaIsleniyor] = useState(false);
  const [kimlikKaydediliyor, setKimlikKaydediliyor] = useState(false);
  const [qrTelefonGuncelleniyor, setQrTelefonGuncelleniyor] = useState(false);
  const dosyaInputRef = useRef<HTMLInputElement | null>(null);
  const imzaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imzaCiziliyorRef = useRef(false);
  const [imzaDegisti, setImzaDegisti] = useState(false);
  const [imzaOnizleme, setImzaOnizleme] = useState("");
  const [kopekIrklari, setKopekIrklari] = useState<string[]>([]);
  const [kediIrklari, setKediIrklari] = useState<string[]>([]);
  const [irkYukleniyor, setIrkYukleniyor] = useState(false);
  const [ilIlceHaritasi, setIlIlceHaritasi] = useState<Record<string, string[]>>(IL_ILCE_FALLBACK);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const kayitliMenu = window.localStorage.getItem(AKTIF_MENU_KEY);
    if (kayitliMenu) {
      setAktifMenu(kayitliMenu);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AKTIF_MENU_KEY, aktifMenu);
  }, [aktifMenu]);

  useEffect(() => {
    if (aktifMenu !== "dashboard") {
      setAktifAksiyonAnahtari("");
    }
  }, [aktifMenu]);

  const seciliHayvan = useMemo(
    () => hayvanlar.find((x) => String(x.id) === kimlikForm.hayvan_id) || null,
    [hayvanlar, kimlikForm.hayvan_id]
  );
  const seciliRandevuHayvani = useMemo(
    () => tumHayvanlar.find((x) => String(x.id) === randevuForm.hayvan_id) || null,
    [tumHayvanlar, randevuForm.hayvan_id]
  );
  const seciliRandevuVeterineri = useMemo(
    () => veterinerler.find((x) => x.id === randevuForm.veteriner_id) || null,
    [veterinerler, randevuForm.veteriner_id]
  );
  const randevuFormHazir = useMemo(
    () => Boolean(randevuForm.hayvan_id && randevuForm.veteriner_id && randevuForm.randevu_tarihi && randevuForm.randevu_saati),
    [randevuForm]
  );
  const aktifRandevuSayisi = useMemo(
    () => randevular.filter((x) => x.durum === "beklemede" || x.durum === "onaylandi").length,
    [randevular]
  );
  const bugunTarih = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const bugunRandevuSayisi = useMemo(
    () => randevular.filter((x) => x.randevu_tarihi === bugunTarih && (x.durum === "beklemede" || x.durum === "onaylandi")).length,
    [randevular, bugunTarih]
  );
  const bekleyenRandevuSayisi = useMemo(() => randevular.filter((x) => x.durum === "beklemede").length, [randevular]);
  const acilAksiyonSayisi = useMemo(
    () => randevular.filter((x) => x.randevu_tarihi === bugunTarih && x.durum === "beklemede").length,
    [randevular, bugunTarih]
  );
  const gosterilenRandevular = useMemo(() => {
    const sirali = [...randevular].sort((a, b) => `${b.randevu_tarihi} ${b.randevu_saati}`.localeCompare(`${a.randevu_tarihi} ${a.randevu_saati}`));
    return (randevuListeFiltresi === "tum" ? sirali : sirali.filter((x) => x.durum === randevuListeFiltresi)).slice(0, 12);
  }, [randevular, randevuListeFiltresi]);
  const seciliGecmisHayvani = useMemo(
    () => tumHayvanlar.find((x) => x.id === seciliHayvanId) || null,
    [tumHayvanlar, seciliHayvanId]
  );
  const saglikDetayIndeksi = useMemo(
    () => (saglikDetayModal ? saglikKayitlari.findIndex((x) => x.id === saglikDetayModal.id) : -1),
    [saglikDetayModal, saglikKayitlari]
  );
  const tercihQrIcerik = useMemo(() => {
    const surum = kimlik?.guncelleme_tarihi ? encodeURIComponent(kimlik.guncelleme_tarihi) : String(Date.now());
    if (kimlik?.qr_icerik) {
      return `${kimlik.qr_icerik}${kimlik.qr_icerik.includes("?") ? "&" : "?"}v=${surum}`;
    }
    if (kimlik?.pdf_url) {
      return `${kimlik.pdf_url}${kimlik.pdf_url.includes("?") ? "&" : "?"}v=${surum}`;
    }
    return "";
  }, [kimlik?.pdf_url, kimlik?.qr_icerik, kimlik?.guncelleme_tarihi]);
  const kimlikTema = useMemo(() => {
    const c = (kimlik?.hayvan?.cinsiyet || "").toLowerCase();
    if (c.includes("erk")) return "erkek";
    if (c.includes("di") || c.includes("fem")) return "disi";
    return "ntr";
  }, [kimlik?.hayvan?.cinsiyet]);
  const mevcutIrklar = useMemo(() => {
    if (hayvanForm.tur === "kopek") return kopekIrklari.length ? kopekIrklari : KOPEK_IRK_FALLBACK;
    if (hayvanForm.tur === "kedi") return kediIrklari.length ? kediIrklari : KEDI_IRK_FALLBACK;
    return DIGER_IRK_FALLBACK;
  }, [hayvanForm.tur, kopekIrklari, kediIrklari]);
  const kimlikIrkSecenekleri = useMemo(() => {
    if (kimlikForm.hayvan_tur === "kopek") return kopekIrklari.length ? kopekIrklari : KOPEK_IRK_FALLBACK;
    if (kimlikForm.hayvan_tur === "kedi") return kediIrklari.length ? kediIrklari : KEDI_IRK_FALLBACK;
    return DIGER_IRK_FALLBACK;
  }, [kimlikForm.hayvan_tur, kopekIrklari, kediIrklari]);
  const kimlikIrkSecenekleriGuvenli = useMemo(
    () => benzersizBirlestir(kimlikIrkSecenekleri, kimlikForm.hayvan_irk),
    [kimlikIrkSecenekleri, kimlikForm.hayvan_irk]
  );
  const ilSecenekleri = useMemo(
    () => benzersizBirlestir(Object.keys(ilIlceHaritasi), kimlikForm.sahibi_il),
    [ilIlceHaritasi, kimlikForm.sahibi_il]
  );
  const mevcutIlceler = useMemo(() => {
    return ilIlceHaritasi[kimlikForm.sahibi_il] || [];
  }, [kimlikForm.sahibi_il, ilIlceHaritasi]);
  const mevcutIlcelerGuvenli = useMemo(
    () => benzersizBirlestir(mevcutIlceler, kimlikForm.sahibi_ilce),
    [mevcutIlceler, kimlikForm.sahibi_ilce]
  );

  const saglikGecmisiYukle = useCallback(
    async (hayvanId: number, yukleniyorGoster = true) => {
      if (!token || !Number.isFinite(hayvanId) || hayvanId <= 0) return;
      if (yukleniyorGoster) setGecmisYukleniyor(true);
      try {
        const kayitCevap = await apiGet<{ kayitlar: SaglikKaydi[] }>(
          `/api/v1/sahip/hayvanlar/${hayvanId}/saglik-gecmisi?limit=50`,
          token
        );
        setSaglikKayitlari(kayitCevap.kayitlar || []);
      } finally {
        if (yukleniyorGoster) setGecmisYukleniyor(false);
      }
    },
    [token]
  );

  const yukleVeriler = useCallback(async () => {
    if (!token) return;
    const limit = 8;
    const offset = (hayvanSayfa - 1) * limit;
    const [hayvanCevap, tumHayvanCevap, veterinerCevap, randevuCevap] = await Promise.all([
      apiGet<{ hayvanlar: Hayvan[]; toplam_kayit?: number }>(
        `/api/v1/sahip/hayvanlar?limit=${limit}&offset=${offset}&arama=${encodeURIComponent(debouncedArama)}&sirala=${hayvanSirala}`,
        token
      ),
      apiGet<{ hayvanlar: Hayvan[] }>(
        `/api/v1/sahip/hayvanlar?limit=500&offset=0&sirala=ad_asc&arama=`,
        token
      ),
      apiGet<{ veterinerler: Veteriner[] }>(
        `/api/v1/sahip/veterinerler?limit=50&arama=${encodeURIComponent(debouncedArama)}`,
        token
      ),
      apiGet<{ randevular: Randevu[] }>("/api/v1/sahip/randevular?limit=50&offset=0&durum=tum", token),
    ]);

    const hayvanListesi = hayvanCevap.hayvanlar || [];
    const tumHayvanListesi = tumHayvanCevap.hayvanlar || hayvanListesi;
    const kayitliSecim =
      typeof window !== "undefined" ? Number(window.localStorage.getItem(SECILI_HAYVAN_KEY) || "") : NaN;
    const formSecimi = Number(kimlikForm.hayvan_id || "");
    const tercihEdilenId = [formSecimi, kayitliSecim].find((x) => Number.isFinite(x) && x > 0);
    const seciliKayit = tercihEdilenId
      ? tumHayvanListesi.find((h) => h.id === tercihEdilenId) || tumHayvanListesi[0]
      : tumHayvanListesi[0];
    setHayvanlar(hayvanListesi);
    setTumHayvanlar(tumHayvanListesi);
    setToplamHayvan(hayvanCevap.toplam_kayit ?? hayvanListesi.length);
    setVeterinerler(veterinerCevap.veterinerler || []);
    setRandevular(randevuCevap.randevular || []);
    setSeciliHayvanId(seciliKayit?.id ?? null);
    setRandevuForm((x) => ({
      ...x,
      hayvan_id: String(seciliKayit?.id ?? ""),
      veteriner_id: veterinerCevap.veterinerler?.[0]?.id ?? "",
    }));

    if (tumHayvanListesi.length > 0) {
      const secili = seciliKayit.id;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SECILI_HAYVAN_KEY, String(secili));
      }
      await saglikGecmisiYukle(secili, false);
      const [kimlikCevap, kimlikGecmisCevap] = await Promise.all([
        apiGet<{ kimlik: Kimlik }>(`/api/v1/sahip/hayvanlar/${secili}/kimlik`, token),
        apiGet<{ kayitlar: KimlikGecmis[] }>(`/api/v1/sahip/hayvanlar/${secili}/kimlik-gecmisi?limit=20`, token),
      ]);
      setKimlik(kimlikCevap.kimlik || null);
      setKimlikGecmisi(kimlikGecmisCevap.kayitlar || []);
      setKimlikForm({
        hayvan_id: String(secili),
        kimlik_notu: kimlikCevap.kimlik?.kimlik_notu || "",
        kayip_hayvan_iletisim_izni: Boolean(kimlikCevap.kimlik?.kayip_hayvan_iletisim_izni),
        kayip_hayvan_notu: kimlikCevap.kimlik?.kayip_hayvan_notu || "",
        sahibi_telefon: kimlikCevap.kimlik?.sahip?.telefon || "",
        sahibi_adres: kimlikCevap.kimlik?.sahip?.adres || "",
        sahibi_il: kimlikCevap.kimlik?.sahip?.il || "",
        sahibi_ilce: kimlikCevap.kimlik?.sahip?.ilce || "",
        sahibi_acil_durum_iletisim: kimlikCevap.kimlik?.sahip?.acil_durum_iletisim || "",
        hayvan_tur: kimlikCevap.kimlik?.hayvan?.tur || "kedi",
        hayvan_irk: kimlikCevap.kimlik?.hayvan?.irk || "",
        hayvan_cinsiyet: kimlikCevap.kimlik?.hayvan?.cinsiyet || "belirsiz",
        hayvan_kan_grubu: kimlikCevap.kimlik?.hayvan?.kan_grubu || "",
        hayvan_dogum_tarihi: kimlikCevap.kimlik?.hayvan?.dogum_tarihi || "",
        hayvan_kilo: kimlikCevap.kimlik?.hayvan?.kilo != null ? String(kimlikCevap.kimlik?.hayvan?.kilo) : "",
        mikrocip_no: kimlikCevap.kimlik?.mikrocip_no || "",
      });
      setKimlikDosya(null);
      setKimlikDosyaOnizleme("");
      setImzaOnizleme(kimlikCevap.kimlik?.imza_url || "");
      setImzaDegisti(false);
    } else {
      setSaglikKayitlari([]);
      setKimlik(null);
      setKimlikForm({
        hayvan_id: "",
        kimlik_notu: "",
        kayip_hayvan_iletisim_izni: false,
        kayip_hayvan_notu: "",
        sahibi_telefon: "",
        sahibi_adres: "",
        sahibi_il: "",
        sahibi_ilce: "",
        sahibi_acil_durum_iletisim: "",
        hayvan_tur: "kedi",
        hayvan_irk: "",
        hayvan_cinsiyet: "belirsiz",
        hayvan_kan_grubu: "",
        hayvan_dogum_tarihi: "",
        hayvan_kilo: "",
        mikrocip_no: "",
      });
      setKimlikDosya(null);
      setKimlikDosyaOnizleme("");
      setImzaOnizleme("");
      setImzaDegisti(false);
      setKimlikGecmisi([]);
    }
  }, [token, debouncedArama, hayvanSirala, hayvanSayfa, kimlikForm.hayvan_id, saglikGecmisiYukle]);

  useEffect(() => {
    async function qrUret() {
      if (!tercihQrIcerik) {
        setKimlikQrDataUrl("");
        return;
      }
      try {
        const data = await QRCode.toDataURL(tercihQrIcerik, {
          margin: 1,
          width: 180,
          color: { dark: "#0d3552", light: "#ffffff" },
        });
        setKimlikQrDataUrl(data);
      } catch {
        setKimlikQrDataUrl("");
      }
    }
    qrUret();
  }, [tercihQrIcerik]);

  useEffect(() => {
    async function referansVerileriYukle() {
      setIrkYukleniyor(true);
      try {
        const [kopekYanit, kediYanit, ilIlceYanit] = await Promise.all([
          fetch("https://api.thedogapi.com/v1/breeds"),
          fetch("https://api.thecatapi.com/v1/breeds"),
          fetch("https://turkiyeapi.dev/api/v1/provinces?fields=name,districts&limit=100"),
        ]);
        if (kopekYanit.ok) {
          const data = (await kopekYanit.json()) as Array<{ name?: string }>;
          const liste = data.map((x) => (x.name || "").trim()).filter(Boolean).slice(0, 120);
          if (liste.length) setKopekIrklari(liste);
        }
        if (kediYanit.ok) {
          const data = (await kediYanit.json()) as Array<{ name?: string }>;
          const liste = data.map((x) => (x.name || "").trim()).filter(Boolean).slice(0, 120);
          if (liste.length) setKediIrklari(liste);
        }

        if (ilIlceYanit.ok) {
          const json = (await ilIlceYanit.json()) as {
            data?: Array<{ name?: string; districts?: Array<{ name?: string }> }>;
          };
          const map: Record<string, string[]> = {};
          for (const il of json.data || []) {
            const ilAdi = (il.name || "").trim();
            if (!ilAdi) continue;
            const ilceler = (il.districts || []).map((d) => (d.name || "").trim()).filter(Boolean);
            map[ilAdi] = ilceler;
          }
          if (Object.keys(map).length > 0) {
            setIlIlceHaritasi(map);
          }
        }
      } catch {
        // Harici API yoksa fallback listeler kullanılır.
      } finally {
        setIrkYukleniyor(false);
      }
    }
    referansVerileriYukle();
  }, []);

  useEffect(() => {
    setHayvanSayfa(1);
  }, [debouncedArama, hayvanSirala]);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      setVeriHatasi("");
      try {
        await yukleVeriler();
      } catch (err) {
        setVeriHatasi(err instanceof Error ? err.message : "Veriler alinamadi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token, yukleVeriler]);

  useEffect(() => {
    if (aktifMenu === "mesaj") {
      router.push("/sahip/mesajlar");
    }
    if (aktifMenu === "bildirim") {
      router.push("/sahip/bildirimler");
    }
  }, [aktifMenu, router]);

  async function hayvanEkle(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await apiPost("/api/v1/sahip/hayvanlar", token, {
        ...hayvanForm,
        kan_grubu: hayvanForm.kan_grubu || null,
        dogum_tarihi: hayvanForm.dogum_tarihi || null,
        kilo: hayvanForm.kilo ? Number(hayvanForm.kilo) : undefined,
      });
      setIslemMesaji("Hayvan kaydı oluşturuldu.");
      setAktifMenu("dashboard");
      setHayvanForm({ ad: "", tur: "kedi", irk: "", cinsiyet: "belirsiz", kan_grubu: "", dogum_tarihi: "", kilo: "" });
      await yukleVeriler();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Hayvan kaydı oluşturulamadı.");
    }
  }

  async function hayvanSil(hayvanId: number, kalici: boolean) {
    if (!token) return;
    if (!kalici) {
      const onay = window.confirm("Bu hayvan kaydini pasife almak istiyor musun?");
      if (!onay) return;
    } else {
      const metin = (window.prompt("Kalici silme icin SİL yaz:") || "").trim();
      const normalize = metin.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/İ/g, "I");
      if (normalize !== "SIL") {
        setIslemMesaji("Kalıcı silme iptal edildi. Onay metni geçersiz.");
        return;
      }
    }
    setHayvanSilinenId(hayvanId);
    try {
      await apiPatch(`/api/v1/sahip/hayvanlar/${hayvanId}/sil`, token, {
        kalici,
        onay_metni: kalici ? "SİL" : null,
      });
      setIslemMesaji(kalici ? "Hayvan kalıcı olarak silindi." : "Hayvan pasife alındı.");
      await yukleVeriler();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Hayvan silme işlemi başarısız.");
    } finally {
      setHayvanSilinenId(null);
    }
  }

  async function randevuOlustur(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setRandevuKaydediliyor(true);
    setSonAksiyon("Randevu talebi gonderiliyor");
    try {
      await apiPost("/api/v1/sahip/randevular", token, {
        hayvan_id: Number(randevuForm.hayvan_id),
        veteriner_id: randevuForm.veteriner_id,
        randevu_tarihi: randevuForm.randevu_tarihi,
        randevu_saati: randevuForm.randevu_saati,
        sikayet_ozet: randevuForm.sikayet_ozet || null,
      });
      setIslemMesaji("Randevu talebi oluşturuldu.");
      setSonAksiyon("Randevu talebi oluşturuldu");
      await yukleVeriler();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Randevu oluşturulamadı.");
      setSonAksiyon("Randevu oluşturma başarısız");
    } finally {
      setRandevuKaydediliyor(false);
    }
  }

  async function randevuIptalEt(randevuId: number) {
    if (!token) return;
    setRandevuIptalEdilenId(randevuId);
    setSonAksiyon(`Randevu #${randevuId} iptal ediliyor`);
    try {
      await apiPatch(`/api/v1/sahip/randevular/${randevuId}/iptal`, token, {
        iptal_nedeni: "Sahip panelinden iptal edildi.",
      });
      setIslemMesaji("Randevu iptal edildi.");
      setSonAksiyon(`Randevu #${randevuId} iptal edildi`);
      await yukleVeriler();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Randevu iptal edilemedi.");
      setSonAksiyon(`Randevu #${randevuId} iptal edilemedi`);
    } finally {
      setRandevuIptalEdilenId(null);
    }
  }

  async function gecmisAc(hayvanId: number) {
    if (!token) return;
    try {
      setSeciliHayvanId(hayvanId);
      await saglikGecmisiYukle(hayvanId, true);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Sağlık geçmişi alınamadı.");
    }
  }

  function saglikDetayGecis(yon: -1 | 1) {
    if (saglikDetayIndeksi < 0) return;
    const yeniIndeks = saglikDetayIndeksi + yon;
    if (yeniIndeks < 0 || yeniIndeks >= saglikKayitlari.length) return;
    setSaglikDetayModal(saglikKayitlari[yeniIndeks]);
  }

  useEffect(() => {
    if (aktifMenu !== "gecmis" || !seciliHayvanId) return;
    saglikGecmisiYukle(seciliHayvanId, true).catch((err) => {
      setIslemMesaji(err instanceof Error ? err.message : "Sağlık geçmişi alınamadı.");
    });
  }, [aktifMenu, seciliHayvanId, saglikGecmisiYukle]);

  const randevuOnerisiAlVeUygula = useCallback(
    async (opsiyon?: { tarih?: string; zorlaVeteriner?: boolean }) => {
      if (!token || !randevuForm.hayvan_id) return;
      setRandevuOneriYukleniyor(true);
      try {
        const yanit = await apiPost<{
          onerilen_veteriner_id: string;
          onerilen_tarih: string;
          onerilen_saat: string;
          gerekce: string;
        }>("/api/v1/sahip/randevular/oneri", token, {
          hayvan_id: Number(randevuForm.hayvan_id),
          veteriner_id: randevuForm.veteriner_id || null,
          tarih: opsiyon?.tarih || randevuForm.randevu_tarihi || null,
        });
        setRandevuForm((onceki) => ({
          ...onceki,
          veteriner_id:
            (opsiyon?.zorlaVeteriner ? yanit.onerilen_veteriner_id : onceki.veteriner_id) ||
            onceki.veteriner_id ||
            yanit.onerilen_veteriner_id ||
            "",
          randevu_tarihi: opsiyon?.tarih || onceki.randevu_tarihi || yanit.onerilen_tarih || "",
          randevu_saati: yanit.onerilen_saat || onceki.randevu_saati,
        }));
        setRandevuOneriGerekce(yanit.gerekce || "Akilli slot onerisi uygulandi.");
      } catch {
        setRandevuOneriGerekce("");
      } finally {
        setRandevuOneriYukleniyor(false);
      }
    },
    [token, randevuForm.hayvan_id, randevuForm.veteriner_id, randevuForm.randevu_tarihi]
  );

  useEffect(() => {
    randevuOnerisiAlVeUygula().catch(() => {});
  }, [randevuOnerisiAlVeUygula]);

  async function aiAksiyonUygula(aksiyon: "acil_slot" | "bugun_slot" | "yarin_slot") {
    if (!randevuForm.hayvan_id) {
      setIslemMesaji("AI aksiyonu icin once hayvan secimi yap.");
      return;
    }
    const bugun = new Date().toISOString().slice(0, 10);
    const yarinDate = new Date();
    yarinDate.setDate(yarinDate.getDate() + 1);
    const yarin = yarinDate.toISOString().slice(0, 10);
    const hedefTarih = aksiyon === "yarin_slot" ? yarin : bugun;
    await randevuOnerisiAlVeUygula({ tarih: hedefTarih, zorlaVeteriner: aksiyon === "acil_slot" });
    setIslemMesaji(
      aksiyon === "acil_slot"
        ? "Acil aksiyon: en yakin uygun slot otomatik secildi."
        : aksiyon === "bugun_slot"
          ? "Bugun icin uygun slot uygulandi."
          : "Yarin icin uygun slot uygulandi."
    );
  }

  async function aiOnYonlendirmeCalistir() {
    if (!token || !randevuForm.hayvan_id || !randevuForm.sikayet_ozet.trim()) {
      setIslemMesaji("AI on yonlendirme icin hayvan secimi ve sikayet ozeti zorunludur.");
      return;
    }
    try {
      const yanit = await apiPost<{
        ai_oncelik: string | null;
        guven_puani?: number;
        yonlendirme: string;
        tani_uyarisi?: string;
        analiz?: { metin_kalitesi?: string; gerekceler?: string[]; risk_faktorleri?: string[] };
        hayvan_profili?: { tur?: string | null; irk?: string | null; dogum_tarihi?: string | null } | null;
      }>(
        "/api/v1/sahip/ai/on-yonlendirme",
        token,
        {
          hayvan_id: Number(randevuForm.hayvan_id),
          sikayet_ozet: randevuForm.sikayet_ozet.trim(),
          semptom_suresi_saat: aiDetayForm.semptom_suresi_saat ? Number(aiDetayForm.semptom_suresi_saat) : null,
          kusma_sayisi: aiDetayForm.kusma_sayisi ? Number(aiDetayForm.kusma_sayisi) : null,
          ishal_var: aiDetayForm.ishal_var,
          istah_durumu: aiDetayForm.istah_durumu,
          aktivite_durumu: aiDetayForm.aktivite_durumu,
          su_tuketimi: aiDetayForm.su_tuketimi,
          ates_var: aiDetayForm.ates_var,
          travma_oykusu: aiDetayForm.travma_oykusu,
          nobet_var: aiDetayForm.nobet_var,
          solunum_sikintisi: aiDetayForm.solunum_sikintisi,
          kanama_var: aiDetayForm.kanama_var,
          zehirlenme_suphesi: aiDetayForm.zehirlenme_suphesi,
        }
      );
      setAiOnYonlendirme({
        oncelik: yanit.ai_oncelik,
        metin: yanit.yonlendirme,
        tani_uyarisi: yanit.tani_uyarisi,
        guven_puani: yanit.guven_puani,
        metin_kalitesi: yanit.analiz?.metin_kalitesi,
        gerekceler: yanit.analiz?.gerekceler || [],
        risk_faktorleri: yanit.analiz?.risk_faktorleri || [],
        hayvan_profili_metin: yanit.hayvan_profili
          ? [yanit.hayvan_profili.tur || "-", yanit.hayvan_profili.irk || "-", yanit.hayvan_profili.dogum_tarihi || "-"].join(" | ")
          : "-",
      });
      setIslemMesaji("AI on yonlendirme sonucu hazirlandi.");
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "AI on yonlendirme sonucu alinamadi.");
    }
  }

  async function kimlikGetir(hayvanId: number) {
    if (!token) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SECILI_HAYVAN_KEY, String(hayvanId));
      }
      const [kimlikCevap, kimlikGecmisCevap] = await Promise.all([
        apiGet<{ kimlik: Kimlik }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik`, token),
        apiGet<{ kayitlar: KimlikGecmis[] }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik-gecmisi?limit=20`, token),
      ]);
      setKimlik(kimlikCevap.kimlik || null);
      setKimlikGecmisi(kimlikGecmisCevap.kayitlar || []);
      setKimlikForm({
        hayvan_id: String(hayvanId),
        kimlik_notu: kimlikCevap.kimlik?.kimlik_notu || "",
        kayip_hayvan_iletisim_izni: Boolean(kimlikCevap.kimlik?.kayip_hayvan_iletisim_izni),
        kayip_hayvan_notu: kimlikCevap.kimlik?.kayip_hayvan_notu || "",
        sahibi_telefon: kimlikCevap.kimlik?.sahip?.telefon || "",
        sahibi_adres: kimlikCevap.kimlik?.sahip?.adres || "",
        sahibi_il: kimlikCevap.kimlik?.sahip?.il || "",
        sahibi_ilce: kimlikCevap.kimlik?.sahip?.ilce || "",
        sahibi_acil_durum_iletisim: kimlikCevap.kimlik?.sahip?.acil_durum_iletisim || "",
        hayvan_tur: kimlikCevap.kimlik?.hayvan?.tur || "kedi",
        hayvan_irk: kimlikCevap.kimlik?.hayvan?.irk || "",
        hayvan_cinsiyet: kimlikCevap.kimlik?.hayvan?.cinsiyet || "belirsiz",
        hayvan_kan_grubu: kimlikCevap.kimlik?.hayvan?.kan_grubu || "",
        hayvan_dogum_tarihi: kimlikCevap.kimlik?.hayvan?.dogum_tarihi || "",
        hayvan_kilo: kimlikCevap.kimlik?.hayvan?.kilo != null ? String(kimlikCevap.kimlik?.hayvan?.kilo) : "",
        mikrocip_no: kimlikCevap.kimlik?.mikrocip_no || "",
      });
      setKimlikDosya(null);
      setKimlikDosyaOnizleme("");
      setImzaOnizleme(kimlikCevap.kimlik?.imza_url || "");
      setImzaDegisti(false);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Kimlik bilgisi alınamadı.");
    }
  }

  async function gorselSikistir(dosya: File): Promise<File> {
    const kaynakUrl = URL.createObjectURL(dosya);
    try {
      const gorsel = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Gorsel okunamadi."));
        img.src = kaynakUrl;
      });

      const maksGenislik = 1200;
      const maksYukseklik = 1200;
      const oran = Math.min(maksGenislik / gorsel.width, maksYukseklik / gorsel.height, 1);
      const hedefGenislik = Math.round(gorsel.width * oran);
      const hedefYukseklik = Math.round(gorsel.height * oran);

      const canvas = document.createElement("canvas");
      canvas.width = hedefGenislik;
      canvas.height = hedefYukseklik;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Gorsel isleyici acilamadi.");
      ctx.drawImage(gorsel, 0, 0, hedefGenislik, hedefYukseklik);

      let kalite = 0.86;
      let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", kalite));
      if (!blob) throw new Error("Gorsel sikistirilamadi.");

      const hedefByte = 450 * 1024;
      while (blob.size > hedefByte && kalite > 0.5) {
        kalite -= 0.08;
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", kalite));
        if (!blob) break;
      }

      if (!blob) throw new Error("Görsel sıkıştırma başarısız.");
      const temizAd = dosya.name.replace(/\.[a-zA-Z0-9]+$/, "");
      return new File([blob], `${temizAd || "kimlik"}-opt.webp`, { type: "image/webp" });
    } finally {
      URL.revokeObjectURL(kaynakUrl);
    }
  }

  async function dosyaSecildi(dosya: File | null) {
    if (!dosya) return;
    if (!dosya.type.startsWith("image/")) {
      setIslemMesaji("Sadece görsel dosyası seçilebilir.");
      return;
    }
    setDosyaIsleniyor(true);
    try {
      const sikismis = await gorselSikistir(dosya);
      setKimlikDosya(sikismis);
      const onizleme = URL.createObjectURL(sikismis);
      setKimlikDosyaOnizleme(onizleme);
      setIslemMesaji(`Foto optimize edildi (${(sikismis.size / 1024).toFixed(0)} KB).`);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Foto işlenemedi.");
    } finally {
      setDosyaIsleniyor(false);
    }
  }

  function dosyaInputDegisti(e: ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0] || null;
    dosyaSecildi(dosya);
  }

  function surukleUzerinde(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSurukleAktif(true);
  }

  function surukleAyrildi(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSurukleAktif(false);
  }

  function dosyaBirakildi(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSurukleAktif(false);
    const dosya = e.dataTransfer.files?.[0] || null;
    dosyaSecildi(dosya);
  }

  function imzaTemizle() {
    const canvas = imzaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setImzaDegisti(false);
  }

  function imzaBaslat(x: number, y: number) {
    const canvas = imzaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#18374a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    imzaCiziliyorRef.current = true;
  }

  function imzaCiz(x: number, y: number) {
    if (!imzaCiziliyorRef.current) return;
    const canvas = imzaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    setImzaDegisti(true);
  }

  function imzaBitir() {
    imzaCiziliyorRef.current = false;
  }

  function eventKonumla(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  useEffect(() => {
    const canvas = imzaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  async function kimlikFotoYukle(hayvanId: string): Promise<string | null> {
    if (!kimlikDosya) return kimlik?.foto_url || null;
    if (!token) throw new Error("Oturum token bulunamadi.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Foto okunamadi."));
      reader.readAsDataURL(kimlikDosya);
    });
    const sonuc = await apiPost<{ dosya?: { ref?: string } }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik-dosya`, token, {
      tur: "foto",
      content_type: "image/webp",
      data_url: dataUrl,
      dosya_adi: "kimlik.webp",
    });
    return sonuc?.dosya?.ref || null;
  }

  async function imzaDataUrlAl(): Promise<string | null> {
    const canvas = imzaCanvasRef.current;
    if (!canvas || !imzaDegisti) return null;
    return canvas.toDataURL("image/png");
  }

  async function kimlikImzaYukle(hayvanId: string): Promise<string | null> {
    const imzaData = await imzaDataUrlAl();
    if (!imzaData) return kimlik?.imza_url || null;
    if (!token) throw new Error("Oturum token bulunamadi.");
    const sonuc = await apiPost<{ dosya?: { ref?: string } }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik-dosya`, token, {
      tur: "imza",
      content_type: "image/png",
      data_url: imzaData,
      dosya_adi: "imza.png",
    });
    return sonuc?.dosya?.ref || null;
  }

  async function kimlikPdfYukle(
    hayvanId: string,
    fotoUrl: string | null,
    imzaUrl: string | null,
    notMetni: string
  ): Promise<{ pdfUrl: string; qrIcerik: string; qrDogrulamaToken: string }> {
    if (!token) throw new Error("Oturum token bulunamadi.");
    const kimlikNo = String(kimlik?.benzersiz_kimlik_no || "").trim();
    if (!kimlikNo) {
      throw new Error("Kimlik numarası bulunamadı.");
    }

    const surum = Date.now();
    const dosyaAdi = `kimlik-${surum}.pdf`;

    const qrDogrulamaToken =
      kimlik?.qr_dogrulama_token ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`);
    const publicAppBase = qrPublicWebKokuAl();
    const qrHedefUrl = `${publicAppBase}/kimlik/${encodeURIComponent(kimlikNo)}?t=${encodeURIComponent(qrDogrulamaToken)}`;
    const qrData = await QRCode.toDataURL(qrHedefUrl, {
      margin: 1,
      width: 180,
      color: { dark: "#0d3552", light: "#ffffff" },
    });

    const taslakHayvan = {
      ...(kimlik?.hayvan || {}),
      tur: kimlikForm.hayvan_tur || kimlik?.hayvan?.tur || null,
      irk: kimlikForm.hayvan_irk || null,
      cinsiyet: kimlikForm.hayvan_cinsiyet || null,
      kan_grubu: kimlikForm.hayvan_kan_grubu || null,
      dogum_tarihi: kimlikForm.hayvan_dogum_tarihi || null,
      kilo: kimlikForm.hayvan_kilo ? Number(kimlikForm.hayvan_kilo) : null,
    };
    const taslakSahip = {
      ...(kimlik?.sahip || {}),
      telefon: kimlikForm.sahibi_telefon || null,
      adres: kimlikForm.sahibi_adres || null,
      il: kimlikForm.sahibi_il || null,
      ilce: kimlikForm.sahibi_ilce || null,
      acil_durum_iletisim: kimlikForm.sahibi_acil_durum_iletisim || null,
    };

    const pdfBlob = await kimlikPdfBlobUret({
      kimlikNo: kimlik?.benzersiz_kimlik_no || "-",
      hayvan: taslakHayvan as Kimlik["hayvan"],
      sahip: taslakSahip as Kimlik["sahip"],
      logoKaynak: DURAPET_LOGO_URL || null,
      fotoKaynak: kimlikDosyaOnizleme || fotoUrl,
      imzaKaynak: imzaOnizleme || imzaUrl,
      kimlikNotu: notMetni,
      qrDataUrl: qrData,
      tema: kimlikTema,
    });

    const pdfDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("PDF okunamadi."));
      reader.readAsDataURL(pdfBlob);
    });
    const sonuc = await apiPost<{ dosya?: { ref?: string } }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik-dosya`, token, {
      tur: "pdf",
      content_type: "application/pdf",
      data_url: pdfDataUrl,
      dosya_adi: dosyaAdi,
    });
    if (!sonuc?.dosya?.ref) throw new Error("PDF yuklenemedi.");
    return { pdfUrl: sonuc.dosya.ref, qrIcerik: qrHedefUrl, qrDogrulamaToken };
  }

  async function kimlikGuncelle(e: FormEvent) {
    e.preventDefault();
    if (!token || !kimlikForm.hayvan_id || !kimlik) return;
    setKimlikKaydediliyor(true);
    try {
      const fotoUrl = await kimlikFotoYukle(kimlikForm.hayvan_id);
      const imzaUrl = await kimlikImzaYukle(kimlikForm.hayvan_id);
      const pdfSonuc = await kimlikPdfYukle(
        kimlikForm.hayvan_id,
        fotoUrl,
        imzaUrl,
        kimlikForm.kimlik_notu || ""
      );
      const cevap = await apiPatch<{ kimlik: Kimlik }>(
        `/api/v1/sahip/hayvanlar/${kimlikForm.hayvan_id}/kimlik`,
        token,
        {
          foto_url: fotoUrl,
          imza_url: imzaUrl,
          pdf_url: pdfSonuc.pdfUrl,
          qr_icerik: pdfSonuc.qrIcerik,
          qr_dogrulama_token: pdfSonuc.qrDogrulamaToken,
          kimlik_notu: kimlikForm.kimlik_notu || null,
          mikrocip_no: kimlikForm.mikrocip_no || null,
          kayip_hayvan_iletisim_izni: Boolean(kimlikForm.kayip_hayvan_iletisim_izni),
          kayip_hayvan_notu: kimlikForm.kayip_hayvan_notu || null,
          sahibi_telefon: kimlikForm.sahibi_telefon || null,
          sahibi_adres: kimlikForm.sahibi_adres || null,
          sahibi_il: kimlikForm.sahibi_il || null,
          sahibi_ilce: kimlikForm.sahibi_ilce || null,
          sahibi_acil_durum_iletisim: kimlikForm.sahibi_acil_durum_iletisim || null,
          hayvan_tur: kimlikForm.hayvan_tur || null,
          hayvan_irk: kimlikForm.hayvan_irk || null,
          hayvan_cinsiyet: kimlikForm.hayvan_cinsiyet || null,
          hayvan_kan_grubu: kimlikForm.hayvan_kan_grubu || null,
          hayvan_dogum_tarihi: kimlikForm.hayvan_dogum_tarihi || null,
          hayvan_kilo: kimlikForm.hayvan_kilo ? Number(kimlikForm.hayvan_kilo) : null,
        }
      );
      setKimlik(cevap.kimlik || null);
      setKimlikDosya(null);
      setKimlikDosyaOnizleme("");
      setImzaOnizleme(imzaUrl || "");
      setImzaDegisti(false);
      setIslemMesaji("Dijital hayvan kimliği güncellendi.");
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Kimlik güncellenemedi.");
    } finally {
      setKimlikKaydediliyor(false);
    }
  }

  async function kimlikPdfIndir() {
    if (!kimlik) return;
    try {
      const pdfBlob = await kimlikPdfBlobUret({
        kimlikNo: kimlik.benzersiz_kimlik_no,
        hayvan: kimlik.hayvan,
        sahip: kimlik.sahip,
        logoKaynak: DURAPET_LOGO_URL || null,
        fotoKaynak: kimlikDosyaOnizleme || kimlik.foto_erisim_url || kimlik.foto_url,
        imzaKaynak: imzaOnizleme || kimlik.imza_erisim_url || kimlik.imza_url,
        kimlikNotu: kimlik.kimlik_notu || "",
        qrDataUrl: kimlikQrDataUrl,
        tema: kimlikTema,
      });
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `durapet-kimlik-${(kimlik.hayvan.ad || "hayvan").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "PDF oluşturulamadı.");
    }
  }

  /** DB’deki qr_icerik hâlâ localhost ise telefon açamaz; LAN / .env adresine yazar. */
  async function kimlikQrLinkiniTelefonaYaz() {
    if (!token || !kimlik?.benzersiz_kimlik_no || !kimlik?.qr_dogrulama_token) {
      setIslemMesaji("Kimlik veya doğrulama anahtarı eksik.");
      return;
    }
    const hayvanId = Number(kimlikForm.hayvan_id);
    if (!Number.isFinite(hayvanId) || hayvanId <= 0) {
      setIslemMesaji("Önce hayvan seçin.");
      return;
    }
    const kok = qrPublicWebKokuAl();
    if (kok.includes("localhost") || kok.includes("127.0.0.1")) {
      setIslemMesaji(
        process.env.NODE_ENV === "production"
          ? "QR için canlı web adresi gerekli: ortamda NEXT_PUBLIC_QR_PUBLIC_BASE_URL=https://panel.alanadin.com (kendi domaininiz) tanımlayın veya bu sayfayı yayındaki URL üzerinden açın."
          : "QR adresi localhost. web/.env.local içine NEXT_PUBLIC_QR_PUBLIC_BASE_URL=http://MAC_IP:3000 ekleyip sunucuyu yeniden başlatın veya panele LAN IP ile girin."
      );
      return;
    }
    const yeniUrl = `${kok}/kimlik/${encodeURIComponent(kimlik.benzersiz_kimlik_no)}?t=${encodeURIComponent(kimlik.qr_dogrulama_token)}`;
    setQrTelefonGuncelleniyor(true);
    setIslemMesaji("");
    try {
      const cevap = await apiPatch<{ kimlik: Kimlik }>(`/api/v1/sahip/hayvanlar/${hayvanId}/kimlik`, token, {
        qr_icerik: yeniUrl,
      });
      setKimlik(cevap.kimlik || null);
      setIslemMesaji(
        `QR güncellendi: telefon bu Wi‑Fi’dayken tarayın veya DuraPet uygulamasında hayvan detayını yenileyin. Link: ${yeniUrl}`
      );
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "QR linki güncellenemedi.");
    } finally {
      setQrTelefonGuncelleniyor(false);
    }
  }

  if (yukleniyor) return <Durum mesaj="Hayvan sahibi paneli yükleniyor..." />;
  if (hata) return <Durum mesaj={hata} hata />;
  if (!profil) return <Durum mesaj="Profil bulunamadı." hata />;
  const hayvanToplamSayfa = Math.max(1, Math.ceil(toplamHayvan / 8));
  const hayvanAktifSayfa = Math.min(hayvanSayfa, hayvanToplamSayfa);

  return (
    <PanelShell
      rol="Hayvan Sahibi"
      adSoyad={`${profil.ad} ${profil.soyad}`}
      menu={[
        { id: "dashboard", etiket: "Gösterge", aciklama: "Genel görünüm", ikon: <LayoutDashboard size={15} /> },
        { id: "kayit", etiket: "Hayvan Kayıt", aciklama: "Yeni kayıt aç", ikon: <PawPrint size={15} /> },
        { id: "kimlik", etiket: "Dijital Kimlik", aciklama: "Kimlik kartı ve görsel", ikon: <IdCard size={15} /> },
        { id: "randevu", etiket: "Randevu", aciklama: "Veteriner seç ve talep aç", ikon: <CalendarPlus size={15} /> },
        { id: "mesaj", etiket: "Mesajlar", aciklama: "Veterinerle canlı sohbet", ikon: <MessageSquare size={15} /> },
        { id: "bildirim", etiket: "Bildirimler", aciklama: "Kayıp, konum, güvenli iletişim", ikon: <Bell size={15} /> },
        { id: "gecmis", etiket: "Sağlık Geçmişi", aciklama: "Detay geçmiş kayıtlar", ikon: <ActivitySquare size={15} /> },
      ]}
      aktifMenu={aktifMenu}
      menuDegistir={setAktifMenu}
      aramaDegeri={globalArama}
      aramaDegistir={setGlobalArama}
      aramaPlaceholder="Hayvan, veteriner veya klinik ara"
      token={token}
      kullaniciId={profil.id}
      kartlar={[
        { baslik: "Kayıtlı Hayvan", deger: String(hayvanlar.length), aciklama: "Dijital kimlik kaydı aktif" },
        { baslik: "Veteriner Havuzu", deger: String(veterinerler.length), aciklama: "Randevu alabileceğin klinikler" },
        { baslik: "Randevu", deger: String(randevular.length), aciklama: "Açık ve geçmiş randevu kayıtları" },
      ]}
    >
      {veriYukleniyor ? <Durum mesaj="Panel verileri yükleniyor..." /> : null}
      {veriHatasi ? <Durum mesaj={veriHatasi} hata /> : null}
      {islemMesaji ? <Durum mesaj={islemMesaji} /> : null}
      {sonAksiyon ? <div className="aksiyon-durum-bandi">Son aksiyon: {sonAksiyon}</div> : null}
      <CommandCenter
        title="Sahip Komut Merkezi"
        subtitle="Günün kritik adımlarını buradan tek tıkla yönet: kayıt, kimlik güncelleme ve randevu."
        badge={`${aktifRandevuSayisi} aktif randevu`}
        actions={[
          {
            id: "owner-quick-register",
            label: "Yeni Hayvan Kaydı",
            description: "Yeni kayıt açıp dijital kimlik akışına geç.",
            icon: <PawPrint size={14} />,
            onClick: () => setAktifMenu("kayit"),
          },
          {
            id: "owner-quick-id",
            label: "Kimlik Güncelle",
            description: "QR ve kayıp hayvan ayarlarını hızla yönet.",
            icon: <IdCard size={14} />,
            onClick: () => setAktifMenu("kimlik"),
          },
          {
            id: "owner-quick-appointment",
            label: "Randevu Planla",
            description: "Veteriner seçip yeni talep oluştur.",
            icon: <CalendarPlus size={14} />,
            onClick: () => setAktifMenu("randevu"),
          },
        ]}
      />

      {aktifMenu === "dashboard" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <article className="kart bolum-ust">
            <div>
              <h3 className="bolum-ust-baslik">Hayvan Sahibi Kontrol Alanı</h3>
              <p className="bolum-ust-metin">
                Hayvan kaydı, randevu ve dijital kimlik adımlarını tek ekrandan hızlı şekilde yönet.
              </p>
            </div>
            <div className="aksiyon-satir">
              <button
                className="pro-aksiyon-dugme"
                data-active={aktifAksiyonAnahtari === "yeni-kayit"}
                onClick={() => { setAktifAksiyonAnahtari("yeni-kayit"); setAktifMenu("kayit"); setSonAksiyon("Yeni kayıt akışına geçildi"); }}
              >
                <PawPrint size={14} />
                Yeni Kayıt
              </button>
              <button
                className="pro-aksiyon-dugme"
                data-active={aktifAksiyonAnahtari === "kimlik-ekrani"}
                onClick={() => { setAktifAksiyonAnahtari("kimlik-ekrani"); setAktifMenu("kimlik"); setSonAksiyon("Kimlik ekranına geçildi"); }}
              >
                <IdCard size={14} />
                Kimlik Ekranı
              </button>
              <button
                className="pro-aksiyon-dugme"
                data-active={aktifAksiyonAnahtari === "randevu-ac"}
                onClick={() => { setAktifAksiyonAnahtari("randevu-ac"); setAktifMenu("randevu"); setSonAksiyon("Randevu akışına geçildi"); }}
              >
                <CalendarPlus size={14} />
                Randevu Aç
              </button>
            </div>
          </article>
          <div className="hizli-aksiyon-grid">
            <article className="kart hizli-aksiyon">
              <h4>Yeni hayvan kaydı</h4>
              <p>Profiline yeni hayvan ekleyip dijital kimlik oluştur.</p>
              <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-kayit"); setAktifMenu("kayit"); setSonAksiyon("Hızlı kayıt aksiyonu çalıştırıldı"); }}>
                <PawPrint size={14} />
                Kayıt Alanına Git
              </button>
            </article>
            <article className="kart hizli-aksiyon">
              <h4>Randevu talebi oluştur</h4>
              <p>Veteriner seçerek hızlı talep oluştur.</p>
              <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-randevu"); setAktifMenu("randevu"); setSonAksiyon("Hızlı randevu aksiyonu çalıştırıldı"); }}>
                <CalendarPlus size={14} />
                Randevuya Git
              </button>
            </article>
            <article className="kart hizli-aksiyon">
              <h4>Sağlık geçmişini incele</h4>
              <p>Geçmiş kayıtları açıp son işlemleri kontrol et.</p>
              <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-gecmis"); setAktifMenu("gecmis"); setSonAksiyon("Sağlık geçmişi aksiyonu çalıştırıldı"); }}>
                <ActivitySquare size={14} />
                Geçmişe Git
              </button>
            </article>
          </div>
          <section className="oncelik-grid">
            <article className="kart oncelik-kart" data-tip="acil">
              <div className="oncelik-kart-baslik"><CircleAlert size={16} /> Acil Aksiyon</div>
              <div className="oncelik-kart-deger">{acilAksiyonSayisi}</div>
              <p>Bugün bekleyen randevular. Öncelikli takip önerilir.</p>
            </article>
            <article className="kart oncelik-kart" data-tip="bugun">
              <div className="oncelik-kart-baslik"><Clock3 size={16} /> Bugün</div>
              <div className="oncelik-kart-deger">{bugunRandevuSayisi}</div>
              <p>Bugün aktif durumda olan randevu talepleri.</p>
            </article>
            <article className="kart oncelik-kart" data-tip="bekleyen">
              <div className="oncelik-kart-baslik"><AlarmClock size={16} /> Bekleyen</div>
              <div className="oncelik-kart-deger">{bekleyenRandevuSayisi}</div>
              <p>Onay bekleyen talepler. İstendiği an iptal edilebilir.</p>
            </article>
          </section>
          <div className="panel-grid-2">
            <SectionCard title="Hayvanlarım" subtitle="Kritik bilgiler tek satırda, işlemler tek tıkla.">
              <div className="sayfalama">
                <div className="sayfalama-bilgi">Toplam kayit: {toplamHayvan}</div>
                <select className="girdi" style={{ maxWidth: 220 }} value={hayvanSirala} onChange={(e) => setHayvanSirala(e.target.value)}>
                  <option value="ad_asc">Ada gore (A-Z)</option>
                  <option value="ad_desc">Ada gore (Z-A)</option>
                  <option value="tur">Ture gore</option>
                </select>
              </div>
              <table className="tablo">
                <thead><tr><th>Ad</th><th>Tür</th><th>Irk</th><th>Detay</th><th>İşlem</th></tr></thead>
                <tbody>{hayvanlar.map((x) => <tr key={x.id}><td>{x.ad}</td><td>{x.tur}</td><td>{x.irk || "-"}</td><td><button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Hayvan Detayı", veri: x })}>İncele</button></td><td style={{ display: "flex", gap: 8 }}><button className="satir-dugme" disabled={hayvanSilinenId === x.id} onClick={() => void hayvanSil(x.id, false)}>{hayvanSilinenId === x.id ? "İşleniyor..." : "Pasife Al"}</button><button className="satir-dugme" disabled={hayvanSilinenId === x.id} onClick={() => void hayvanSil(x.id, true)}>{hayvanSilinenId === x.id ? "İşleniyor..." : "Kalıcı Sil"}</button></td></tr>)}
                {hayvanlar.length === 0 ? <tr><td colSpan={5}>Aramaya uygun hayvan bulunamadi.</td></tr> : null}
                </tbody>
              </table>
              <div className="sayfalama">
                <div className="sayfalama-bilgi">Sayfa {hayvanAktifSayfa} / {hayvanToplamSayfa}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="satir-dugme" disabled={hayvanAktifSayfa <= 1} onClick={() => setHayvanSayfa((x) => Math.max(1, x - 1))}>Onceki</button>
                  <button className="satir-dugme" disabled={hayvanAktifSayfa >= hayvanToplamSayfa} onClick={() => setHayvanSayfa((x) => Math.min(hayvanToplamSayfa, x + 1))}>Sonraki</button>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Veteriner Havuzu" subtitle="Randevu alinabilir klinikler ve hizli profil inceleme.">
              <table className="tablo">
                <thead><tr><th>Ad</th><th>Klinik</th><th>Detay</th></tr></thead>
                <tbody>{veterinerler.slice(0, 8).map((x) => <tr key={x.id}><td>{x.ad} {x.soyad}</td><td>{x.profil?.klinik_adi || "-"}</td><td><button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Veteriner Detayı", veri: x })}>İncele</button></td></tr>)}
                {veterinerler.length === 0 ? <tr><td colSpan={3}>Aramaya uygun veteriner bulunamadi.</td></tr> : null}
                </tbody>
              </table>
            </SectionCard>
          </div>

          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Son İşlemler</h3>
            {saglikKayitlari.length === 0 ? (
              <div className="onboarding-kart">
                <h4>Henuz saglik gecmisi yok</h4>
                <p>Ilk adim olarak hayvan kaydi ac ve randevu talebi gonder.</p>
                <button className="satir-dugme" onClick={() => setAktifMenu("kayit")}>Hayvan Kaydına Git</button>
              </div>
            ) : (
              <div className="zaman-cizelgesi">
                {saglikKayitlari.slice(0, 5).map((x) => (
                  <div className="zaman-cizelgesi-item" key={x.id}>
                    <div className="zaman-cizelgesi-ust">
                      <strong>{x.islem_turu}</strong>
                      <span className="zaman-cizelgesi-zaman">{new Date(x.islem_tarihi).toLocaleString("tr-TR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : null}

      {aktifMenu === "kayit" ? (
        <article className="kart bolum-kart">
          <h3 className="bolum-baslik">Yeni Hayvan Kaydı Aç</h3>
          <form className="form-grid" onSubmit={hayvanEkle}>
            <label className="etiket">Hayvan adi</label>
            <input className="girdi" placeholder="Hayvan adi" value={hayvanForm.ad} onChange={(e) => setHayvanForm((x) => ({ ...x, ad: e.target.value }))} required />
            <div className="alan-yardim" data-valid={String(hayvanForm.ad.trim().length >= 2)}>
              {hayvanForm.ad.trim().length >= 2 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              Hayvan adi minimum 2 karakter olmali.
            </div>
            <label className="etiket">Tur</label>
            <select
              className="girdi"
              value={hayvanForm.tur}
              onChange={(e) =>
                setHayvanForm((x) => ({
                  ...x,
                  tur: e.target.value,
                  irk: "",
                }))
              }
              required
            >
              <option value="kedi">Kedi</option>
              <option value="kopek">Kopek</option>
              <option value="kus">Kus</option>
              <option value="tavsan">Tavsan</option>
              <option value="diger">Diger</option>
            </select>
            <div className="alan-yardim" data-valid={String(hayvanForm.tur.trim().length >= 2)}>
              {hayvanForm.tur.trim().length >= 2 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              Tur bilgisi takip ve filtreleme icin kullanilir.
            </div>
            <label className="etiket">Irk {irkYukleniyor ? "(yükleniyor...)" : ""}</label>
            <select className="girdi" value={hayvanForm.irk} onChange={(e) => setHayvanForm((x) => ({ ...x, irk: e.target.value }))}>
              <option value="">Irk sec</option>
              {mevcutIrklar.map((irk) => (
                <option key={irk} value={irk}>
                  {irk}
                </option>
              ))}
            </select>
            <label className="etiket">Cinsiyet</label>
            <select className="girdi" value={hayvanForm.cinsiyet} onChange={(e) => setHayvanForm((x) => ({ ...x, cinsiyet: e.target.value }))}>
              <option value="belirsiz">Belirsiz</option>
              <option value="erkek">Erkek</option>
              <option value="disi">Disi</option>
            </select>
            <label className="etiket">Dogum tarihi</label>
            <input className="girdi" type="date" value={hayvanForm.dogum_tarihi} onChange={(e) => setHayvanForm((x) => ({ ...x, dogum_tarihi: e.target.value }))} />
            <label className="etiket">Kan grubu (varsa)</label>
            <select className="girdi" value={hayvanForm.kan_grubu} onChange={(e) => setHayvanForm((x) => ({ ...x, kan_grubu: e.target.value }))}>
              <option value="">Bilinmiyor</option>
              <option value="DEA 1+">DEA 1+</option>
              <option value="DEA 1-">DEA 1-</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
            </select>
            <label className="etiket">Kilo (kg)</label>
            <input className="girdi" type="number" step="0.1" placeholder="Kilo" value={hayvanForm.kilo} onChange={(e) => setHayvanForm((x) => ({ ...x, kilo: e.target.value }))} />
            <button className="dugme dugme-ana" type="submit">Kaydi Ac</button>
          </form>
        </article>
      ) : null}

      {aktifMenu === "randevu" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <article className="kart bolum-ust">
            <div>
              <h3 className="bolum-ust-baslik">Randevu Planlama</h3>
              <p className="bolum-ust-metin">Hayvanını ve veterineri seç, uygun tarih-saat belirleyip talebi oluştur.</p>
            </div>
          </article>
          <article className="kart bolum-kart">
            <div className="panel-grid-2">
              <form className="form-grid" onSubmit={randevuOlustur}>
                <select className="girdi" value={randevuForm.hayvan_id} onChange={(e) => setRandevuForm((x) => ({ ...x, hayvan_id: e.target.value }))} required>
                  <option value="">Hayvan sec</option>{hayvanlar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
                </select>
                <div className="alan-yardim" data-valid={String(Boolean(randevuForm.hayvan_id))}>
                  {randevuForm.hayvan_id ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  Randevu icin once hayvan secimi yap.
                </div>
                <select className="girdi" value={randevuForm.veteriner_id} onChange={(e) => setRandevuForm((x) => ({ ...x, veteriner_id: e.target.value }))} required>
                  <option value="">Veteriner sec</option>{veterinerler.map((x) => <option key={x.id} value={x.id}>{x.ad} {x.soyad}</option>)}
                </select>
                <input className="girdi" type="date" value={randevuForm.randevu_tarihi} onChange={(e) => setRandevuForm((x) => ({ ...x, randevu_tarihi: e.target.value }))} required />
                <input className="girdi" type="time" value={randevuForm.randevu_saati} onChange={(e) => setRandevuForm((x) => ({ ...x, randevu_saati: e.target.value }))} required />
                <textarea
                  className="girdi"
                  rows={3}
                  placeholder="Sikayet ozeti (AI on yonlendirme icin)"
                  value={randevuForm.sikayet_ozet}
                  onChange={(e) => setRandevuForm((x) => ({ ...x, sikayet_ozet: e.target.value }))}
                />
                <div className="panel-grid-2">
                  <input
                    className="girdi"
                    type="number"
                    min={0}
                    max={720}
                    placeholder="Semptom suresi (saat)"
                    value={aiDetayForm.semptom_suresi_saat}
                    onChange={(e) => setAiDetayForm((x) => ({ ...x, semptom_suresi_saat: e.target.value }))}
                  />
                  <input
                    className="girdi"
                    type="number"
                    min={0}
                    max={30}
                    placeholder="Kusma sayisi (24 saat)"
                    value={aiDetayForm.kusma_sayisi}
                    onChange={(e) => setAiDetayForm((x) => ({ ...x, kusma_sayisi: e.target.value }))}
                  />
                  <select
                    className="girdi"
                    value={aiDetayForm.istah_durumu}
                    onChange={(e) => setAiDetayForm((x) => ({ ...x, istah_durumu: e.target.value }))}
                  >
                    <option value="normal">Istah: Normal</option>
                    <option value="azaldi">Istah: Azaldi</option>
                    <option value="hic_yemiyor">Istah: Hic yemiyor</option>
                  </select>
                  <select
                    className="girdi"
                    value={aiDetayForm.aktivite_durumu}
                    onChange={(e) => setAiDetayForm((x) => ({ ...x, aktivite_durumu: e.target.value }))}
                  >
                    <option value="normal">Aktivite: Normal</option>
                    <option value="azaldi">Aktivite: Azaldi</option>
                    <option value="cok_dusuk">Aktivite: Cok dusuk</option>
                  </select>
                  <select
                    className="girdi"
                    value={aiDetayForm.su_tuketimi}
                    onChange={(e) => setAiDetayForm((x) => ({ ...x, su_tuketimi: e.target.value }))}
                  >
                    <option value="normal">Su tuketimi: Normal</option>
                    <option value="azaldi">Su tuketimi: Azaldi</option>
                    <option value="hic_icmiyor">Su tuketimi: Hic icmiyor</option>
                  </select>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.ates_var}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, ates_var: e.target.checked }))}
                    />
                    Ates var
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.ishal_var}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, ishal_var: e.target.checked }))}
                    />
                    Ishal var
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.travma_oykusu}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, travma_oykusu: e.target.checked }))}
                    />
                    Travma oykusu
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.nobet_var}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, nobet_var: e.target.checked }))}
                    />
                    Nobet gozlemi
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.solunum_sikintisi}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, solunum_sikintisi: e.target.checked }))}
                    />
                    Solunum sikintisi
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.kanama_var}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, kanama_var: e.target.checked }))}
                    />
                    Kanama var
                  </label>
                  <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={aiDetayForm.zehirlenme_suphesi}
                      onChange={(e) => setAiDetayForm((x) => ({ ...x, zehirlenme_suphesi: e.target.checked }))}
                    />
                    Zehirlenme suphe
                  </label>
                </div>
                <button type="button" className="satir-dugme" onClick={aiOnYonlendirmeCalistir}>
                  AI On Yonlendirme
                </button>
                <button className="dugme dugme-ana" type="submit" disabled={!randevuFormHazir || randevuKaydediliyor}>
                  {randevuKaydediliyor ? "Randevu Açılıyor..." : "Randevu Aç"}
                </button>
              </form>
              <aside className="onboarding-kart randevu-ozet-kart">
                <h4 style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarCheck2 size={16} /> Randevu Ozet ve Durum</h4>
                <p>Secimler tamamlandiginda tek tikla talep olusturabilirsin.</p>
                {randevuOneriYukleniyor ? <p>Akilli slot onerisi hazirlaniyor...</p> : null}
                {randevuOneriGerekce ? <p>{randevuOneriGerekce}</p> : null}
                <div className="randevu-ozet-liste">
                  <div><strong>Hayvan:</strong> {seciliRandevuHayvani?.ad || "-"}</div>
                  <div><strong>Veteriner:</strong> {seciliRandevuVeterineri ? `${seciliRandevuVeterineri.ad} ${seciliRandevuVeterineri.soyad}` : "-"}</div>
                  <div><strong>Tarih:</strong> {randevuForm.randevu_tarihi || "-"}</div>
                  <div><strong>Saat:</strong> {randevuForm.randevu_saati || "-"}</div>
                  <div><strong>Aktif Randevu:</strong> {aktifRandevuSayisi}</div>
                </div>
                {aiOnYonlendirme ? (
                  <div
                    className="onboarding-kart"
                    style={{
                      border:
                        aiOnYonlendirme.oncelik === "acil"
                          ? "1px solid #ef4444"
                          : aiOnYonlendirme.oncelik === "oncelikli"
                            ? "1px solid #f59e0b"
                            : aiOnYonlendirme.oncelik === "rutin"
                              ? "1px solid #22c55e"
                              : "1px solid #64748b",
                    }}
                  >
                    <h4 style={{ marginBottom: 6 }}>
                      AI On Yonlendirme: {(aiOnYonlendirme.oncelik || "degerlendirilemedi").toUpperCase()}
                    </h4>
                    <p style={{ margin: 0 }}>{aiOnYonlendirme.metin}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <small>Guven puani: %{aiOnYonlendirme.guven_puani ?? 0}</small>
                      <small>Metin kalitesi: {aiOnYonlendirme.metin_kalitesi || "-"}</small>
                      <small>Profil: {aiOnYonlendirme.hayvan_profili_metin || "-"}</small>
                    </div>
                    {(aiOnYonlendirme.gerekceler || []).length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        {(aiOnYonlendirme.gerekceler || []).slice(0, 4).map((x, i) => (
                          <small key={`${x}-${i}`} style={{ display: "block" }}>- {x}</small>
                        ))}
                      </div>
                    ) : null}
                    {(aiOnYonlendirme.risk_faktorleri || []).length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <small style={{ display: "block", fontWeight: 600 }}>Risk faktorleri:</small>
                        {(aiOnYonlendirme.risk_faktorleri || []).map((x, i) => (
                          <small key={`${x}-${i}`} style={{ display: "block" }}>- {x}</small>
                        ))}
                      </div>
                    ) : null}
                    {aiOnYonlendirme.tani_uyarisi ? (
                      <small style={{ display: "block", marginTop: 8 }}>{aiOnYonlendirme.tani_uyarisi}</small>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {aiOnYonlendirme.oncelik === "acil" ? (
                        <button type="button" className="satir-dugme" onClick={() => void aiAksiyonUygula("acil_slot")}>
                          Acil Slotu Uygula
                        </button>
                      ) : null}
                      <button type="button" className="satir-dugme" onClick={() => void aiAksiyonUygula("bugun_slot")}>
                        Bugun Icin Slot Oner
                      </button>
                      <button type="button" className="satir-dugme" onClick={() => void aiAksiyonUygula("yarin_slot")}>
                        Yarin Icin Slot Oner
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="alan-yardim" data-valid={String(randevuFormHazir)}>
                  {randevuFormHazir ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {randevuFormHazir ? "Form hazir, talep gonderilebilir." : "Devam etmek icin tum alanlari doldur."}
                </div>
              </aside>
            </div>
            <div className="randevu-baslik-satiri">
              <h4 style={{ marginTop: 16 }}>Mevcut Randevular</h4>
              <div className="randevu-filtre-grup">
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "tum"} onClick={() => setRandevuListeFiltresi("tum")}>
                  Tum
                </button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "beklemede"} onClick={() => setRandevuListeFiltresi("beklemede")}>
                  Beklemede
                </button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "onaylandi"} onClick={() => setRandevuListeFiltresi("onaylandi")}>
                  Onaylandi
                </button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "tamamlandi"} onClick={() => setRandevuListeFiltresi("tamamlandi")}>
                  Tamamlandi
                </button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "iptal"} onClick={() => setRandevuListeFiltresi("iptal")}>
                  Iptal
                </button>
              </div>
            </div>
            <table className="tablo">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Saat</th>
                  <th>Hayvan</th>
                  <th>Veteriner</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {gosterilenRandevular.map((x) => (
                  <tr key={x.id} className="randevu-satir" data-durum={x.durum}>
                    <td>{x.randevu_tarihi}</td>
                    <td>{x.randevu_saati}</td>
                    <td>{x.hayvan?.ad || "-"}</td>
                    <td>{x.veteriner ? `${x.veteriner.ad} ${x.veteriner.soyad}` : "-"}</td>
                    <td><RandevuDurumRozeti durum={x.durum} /></td>
                    <td>
                      {x.durum === "beklemede" || x.durum === "onaylandi" ? (
                        <button className="satir-dugme" disabled={randevuIptalEdilenId === x.id} onClick={() => randevuIptalEt(x.id)}>
                          {randevuIptalEdilenId === x.id ? "İptal Ediliyor..." : "İptal Et"}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {gosterilenRandevular.length === 0 ? (
                  <tr><td colSpan={6}>Randevu kaydi bulunamadi.</td></tr>
                ) : null}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}

      {aktifMenu === "kimlik" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <section className="kart kimlik-workflow">
            <div className="kimlik-workflow-head">
              <h3 className="bolum-baslik" style={{ margin: 0 }}>Kimlik İş Akışı</h3>
              <small>Hastane duzeni: secim, kontrol, guncelleme, kaydetme</small>
            </div>
            <div className="kimlik-step-grid">
              <div className="kimlik-step-item" data-active={String(Boolean(kimlikForm.hayvan_id))}>
                <strong>1. Hayvan secimi</strong>
                <p>Dogru kayit secilmeden kimlik guncelleme baslamaz.</p>
              </div>
              <div className="kimlik-step-item" data-active={String(Boolean(kimlik))}>
                <strong>2. Kimlik kontrolu</strong>
                <p>Canlı kimlik kartını ve QR bilgisini önizle.</p>
              </div>
              <div className="kimlik-step-item" data-active={String(Boolean(kimlikForm.kimlik_notu || kimlikDosya || imzaDegisti))}>
                <strong>3. Veri girisi</strong>
                <p>Foto, imza, iletisim tercihi ve notlari duzenle.</p>
              </div>
              <div className="kimlik-step-item" data-active={String(kimlikKaydediliyor)}>
                <strong>4. Kaydet ve dagit</strong>
                <p>Kayıtla birlikte QR doğrulama akışı güncellenir.</p>
              </div>
            </div>
          </section>
          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Dijital Hayvan Kimliği</h3>
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <select
                className="girdi"
                value={kimlikForm.hayvan_id}
                onChange={(e) => {
                  const id = e.target.value;
                  setKimlikForm((x) => ({ ...x, hayvan_id: id }));
                  if (typeof window !== "undefined" && id) {
                    window.localStorage.setItem(SECILI_HAYVAN_KEY, id);
                  }
                  if (id) kimlikGetir(Number(id));
                }}
              >
                <option value="">Hayvan sec</option>
                {tumHayvanlar.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ad}
                  </option>
                ))}
              </select>
            </div>
            {kimlik ? (
              <div className="kimlik-kart" data-tema={kimlikTema}>
                <div className="kimlik-kart-baslik">
                  <div className="kimlik-kart-baslik-sol">
                    {DURAPET_LOGO_URL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={DURAPET_LOGO_URL} alt="DuraPet logosu" className="kimlik-logo" />
                    ) : (
                      <strong>DuraPet</strong>
                    )}
                    <p className="kimlik-kart-kimlik-no">{kimlik.benzersiz_kimlik_no}</p>
                  </div>
                  <div className="kimlik-kart-sag">
                    <span className="kimlik-durum-etiket">Canlı Kimlik</span>
                    <button className="satir-dugme" onClick={kimlikPdfIndir}>PDF İndir</button>
                  </div>
                </div>
                <div className="kimlik-kart-icerik">
                  <div className="kimlik-foto-alan">
                    {kimlikDosyaOnizleme || kimlik.foto_erisim_url || kimlik.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={kimlikDosyaOnizleme || kimlik.foto_erisim_url || kimlik.foto_url || ""}
                        alt="Hayvan kimlik fotoğrafı"
                        className="kimlik-foto"
                      />
                    ) : (
                      <div className="kimlik-foto-bos">FOTO</div>
                    )}
                  </div>
                  <div className="kimlik-bilgi-alan">
                    <div className="kimlik-bilgi-grid kimlik-bilgi-grid-iki">
                      <p className="kimlik-bilgi-satir"><strong>Hayvan Adı:</strong> {kimlik.hayvan.ad}</p>
                      <p className="kimlik-bilgi-satir"><strong>Sahip:</strong> {kimlik.sahip.ad || "-"} {kimlik.sahip.soyad || ""}</p>
                      <p className="kimlik-bilgi-satir"><strong>Tür / Irk:</strong> {kimlik.hayvan.tur} / {kimlik.hayvan.irk || "-"}</p>
                      <p className="kimlik-bilgi-satir"><strong>Telefon:</strong> {kimlik.sahip.telefon || "-"}</p>
                      <p className="kimlik-bilgi-satir"><strong>Doğum Tarihi:</strong> {kimlik.hayvan.dogum_tarihi || "-"}</p>
                      <p className="kimlik-bilgi-satir"><strong>Kan Grubu:</strong> {kimlik.hayvan.kan_grubu || "-"}</p>
                      <p className="kimlik-bilgi-satir"><strong>Kilo:</strong> {kimlik.hayvan.kilo ?? "-"}</p>
                      <p className="kimlik-bilgi-satir"><strong>İl / İlçe:</strong> {[kimlik.sahip.il, kimlik.sahip.ilce].filter(Boolean).join(" / ") || "-"}</p>
                      <p className="kimlik-bilgi-satir kimlik-bilgi-satir-tam"><strong>Adres:</strong> {kimlik.sahip.adres || "-"}</p>
                    </div>
                  </div>
                  <div className="kimlik-qr-alan">
                    {kimlikQrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={kimlikQrDataUrl} alt="Kimlik QR kodu" className="kimlik-qr" />
                    ) : (
                      <div className="kimlik-qr-bos">QR</div>
                    )}
                    <small>QR okutunca güvenli kimlik doğrulama ekranı açılır</small>
                    <button
                      type="button"
                      className="satir-dugme"
                      style={{ marginTop: 10 }}
                      disabled={qrTelefonGuncelleniyor}
                      onClick={() => void kimlikQrLinkiniTelefonaYaz()}
                    >
                      {qrTelefonGuncelleniyor ? "Güncelleniyor…" : "Telefonda açılsın — QR linkini güncelle"}
                    </button>
                    <small className="kimlik-qr-yardim">
                      Bu buton yalnızca <strong>tarayıcıdaki</strong> sahip panelinde (Dijital Kimlik) görünür. Mobil
                      uygulamada aynı işlem: hayvan detayı → QR bölümündeki &quot;Telefonda açılsın (QR linki)&quot;.
                      Eski QR’da <code>localhost</code> varsa telefon açamaz; güncelledikten sonra uygulamada sayfayı
                      yenileyin veya yeni QR okutun. Mac ve telefon aynı Wi‑Fi’da olmalı.
                    </small>
                  </div>
                </div>
              </div>
            ) : (
              <div className="onboarding-kart">
                <h4>Kimlik bilgisi bulunamadı</h4>
                <p>Hayvan seçerek dijital kimlik bilgisini getir.</p>
              </div>
            )}
          </article>

          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Kimlik Güncelleme Geçmişi</h3>
            <table className="tablo">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Not Ozet</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {kimlikGecmisi.slice(0, 10).map((x) => (
                  <tr key={x.id}>
                    <td>{new Date(x.olusturma_tarihi).toLocaleString("tr-TR")}</td>
                    <td>{x.not_ozeti || "-"}</td>
                    <td>
                      {x.yeni_pdf_erisim_url || x.yeni_pdf_url ? (
                        <a href={x.yeni_pdf_erisim_url || x.yeni_pdf_url || "#"} target="_blank" rel="noreferrer">
                          Ac
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {kimlikGecmisi.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Guncelleme gecmisi bulunamadi.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </article>

          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Kimlik Güncelleme</h3>
            <form className="form-grid" onSubmit={kimlikGuncelle}>
              <div className="onboarding-kart">
                <h4>Medya ve Imza Hazirlama</h4>
                <p>
                  Bu bölümde foto ve imzayı yükle. Kimlik kaydedildiğinde yeni QR akışı ve PDF birlikte güncellenir.
                </p>
              </div>
              <div
                className="kimlik-dropzone"
                data-active={String(surukleAktif)}
                onDragOver={surukleUzerinde}
                onDragLeave={surukleAyrildi}
                onDrop={dosyaBirakildi}
                onClick={() => dosyaInputRef.current?.click()}
              >
                <input ref={dosyaInputRef} type="file" accept="image/*" onChange={dosyaInputDegisti} style={{ display: "none" }} />
                <strong>Foto seç veya buraya sürükle-bırak</strong>
                <p>JPG/PNG seçilebilir. Sistem otomatik optimize edip WEBP formatına çevirir.</p>
                {dosyaIsleniyor ? <small>Foto optimize ediliyor...</small> : null}
                {kimlikDosya ? <small>Hazır dosya: {kimlikDosya.name} ({(kimlikDosya.size / 1024).toFixed(0)} KB)</small> : null}
              </div>
              {kimlikDosyaOnizleme ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kimlikDosyaOnizleme} alt="Seçilen foto önizleme" className="kimlik-onizleme" />
              ) : null}
              <div className="imza-alani">
                <div className="imza-ust">
                  <strong>Dijital İmza</strong>
                  <button type="button" className="satir-dugme" onClick={imzaTemizle}>Temizle</button>
                </div>
                <canvas
                  ref={imzaCanvasRef}
                  width={420}
                  height={140}
                  className="imza-canvas"
                  onPointerDown={(e) => {
                    const canvas = imzaCanvasRef.current;
                    if (!canvas) return;
                    canvas.setPointerCapture(e.pointerId);
                    const p = eventKonumla(canvas, e.clientX, e.clientY);
                    imzaBaslat(p.x, p.y);
                  }}
                  onPointerMove={(e) => {
                    const canvas = imzaCanvasRef.current;
                    if (!canvas) return;
                    const p = eventKonumla(canvas, e.clientX, e.clientY);
                    imzaCiz(p.x, p.y);
                  }}
                  onPointerUp={imzaBitir}
                  onPointerLeave={imzaBitir}
                />
                {imzaOnizleme ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imzaOnizleme} alt="Kayıtlı dijital imza" className="imza-onizleme" />
                ) : null}
              </div>
              <div className="onboarding-kart">
                <h4>Kimlik Bilgileri ve Kayıp Hayvan Ayarı</h4>
                <p>Verileri eksiksiz gir; kayip hayvan bulunursa bu bilgi kamu ekraninda kontrollu gorunur.</p>
              </div>
              <label className="etiket">Hayvan Türü</label>
              <select
                className="girdi"
                value={kimlikForm.hayvan_tur}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_tur: e.target.value, hayvan_irk: "" }))}
              >
                <option value="kedi">Kedi</option>
                <option value="kopek">Köpek</option>
                <option value="kus">Kuş</option>
                <option value="tavsan">Tavşan</option>
                <option value="diger">Diğer</option>
              </select>
              <label className="etiket">Hayvan Irkı</label>
              <select
                className="girdi"
                value={kimlikForm.hayvan_irk}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_irk: e.target.value }))}
              >
                <option value="">Irk seç</option>
                {kimlikIrkSecenekleriGuvenli.map((irk) => (
                  <option key={irk} value={irk}>
                    {irk}
                  </option>
                ))}
              </select>
              <label className="etiket">Hayvan Cinsiyeti</label>
              <select
                className="girdi"
                value={kimlikForm.hayvan_cinsiyet}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_cinsiyet: e.target.value }))}
              >
                <option value="belirsiz">Belirsiz</option>
                <option value="erkek">Erkek</option>
                <option value="disi">Dişi</option>
              </select>
              <label className="etiket">Doğum Tarihi</label>
              <input
                className="girdi"
                type="date"
                value={kimlikForm.hayvan_dogum_tarihi}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_dogum_tarihi: e.target.value }))}
              />
              <label className="etiket">Kan Grubu</label>
              <select
                className="girdi"
                value={kimlikForm.hayvan_kan_grubu}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_kan_grubu: e.target.value }))}
              >
                <option value="">Bilinmiyor</option>
                <option value="DEA 1+">DEA 1+</option>
                <option value="DEA 1-">DEA 1-</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AB">AB</option>
              </select>
              <label className="etiket">Kilo (kg)</label>
              <input
                className="girdi"
                type="number"
                step="0.1"
                value={kimlikForm.hayvan_kilo}
                onChange={(e) => setKimlikForm((x) => ({ ...x, hayvan_kilo: e.target.value }))}
              />
              <label className="etiket">Mikrocip Numarasi</label>
              <input
                className="girdi"
                placeholder="Opsiyonel mikrocip numarasi"
                value={kimlikForm.mikrocip_no}
                onChange={(e) => setKimlikForm((x) => ({ ...x, mikrocip_no: e.target.value }))}
              />
              <label className="etiket">Telefon</label>
              <input
                className="girdi"
                placeholder="05xx xxx xx xx"
                value={kimlikForm.sahibi_telefon}
                onChange={(e) => setKimlikForm((x) => ({ ...x, sahibi_telefon: e.target.value }))}
              />
              <label className="etiket">Acil Durum İletişim</label>
              <input
                className="girdi"
                placeholder="05xx xxx xx xx"
                value={kimlikForm.sahibi_acil_durum_iletisim}
                onChange={(e) => setKimlikForm((x) => ({ ...x, sahibi_acil_durum_iletisim: e.target.value }))}
              />
              <label className="etiket">İl</label>
              <select
                className="girdi"
                value={kimlikForm.sahibi_il}
                onChange={(e) =>
                  setKimlikForm((x) => ({
                    ...x,
                    sahibi_il: e.target.value,
                    sahibi_ilce: "",
                  }))
                }
              >
                <option value="">İl seç</option>
                {ilSecenekleri.map((il) => (
                  <option key={il} value={il}>
                    {il}
                  </option>
                ))}
              </select>
              <label className="etiket">İlçe</label>
              <select
                className="girdi"
                value={kimlikForm.sahibi_ilce}
                onChange={(e) => setKimlikForm((x) => ({ ...x, sahibi_ilce: e.target.value }))}
              >
                <option value="">İlçe seç</option>
                {mevcutIlcelerGuvenli.map((ilce) => (
                  <option key={ilce} value={ilce}>
                    {ilce}
                  </option>
                ))}
              </select>
              <label className="etiket">Adres</label>
              <textarea
                className="girdi"
                rows={2}
                placeholder="Açık adres"
                value={kimlikForm.sahibi_adres}
                onChange={(e) => setKimlikForm((x) => ({ ...x, sahibi_adres: e.target.value }))}
              />
              <label className="etiket" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={kimlikForm.kayip_hayvan_iletisim_izni}
                  onChange={(e) =>
                    setKimlikForm((x) => ({
                      ...x,
                      kayip_hayvan_iletisim_izni: e.target.checked,
                    }))
                  }
                />
                QR bulan kisi guvenli iletisim talebi birakabilsin
              </label>
              <textarea
                className="girdi"
                rows={2}
                placeholder="Kayıp hayvan notu (bulan kişi bu notu görür)"
                value={kimlikForm.kayip_hayvan_notu}
                onChange={(e) => setKimlikForm((x) => ({ ...x, kayip_hayvan_notu: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={3}
                placeholder="Kimlik notu"
                value={kimlikForm.kimlik_notu}
                onChange={(e) => setKimlikForm((x) => ({ ...x, kimlik_notu: e.target.value }))}
              />
              <button className="dugme dugme-ana" type="submit" disabled={!kimlikForm.hayvan_id || kimlikKaydediliyor}>
                {kimlikKaydediliyor ? "Kaydediliyor..." : `${seciliHayvan?.ad || "Hayvan"} Kimliğini Güncelle`}
              </button>
            </form>
          </article>
        </div>
      ) : null}

      {aktifMenu === "gecmis" ? (
        <div className="panel-grid-2">
          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Hayvan Listesi</h3>
            <input className="girdi" style={{ marginBottom: 10 }} placeholder="Hayvan ara (ad/tur/irk)" value={hayvanArama} onChange={(e) => setHayvanArama(e.target.value)} />
            <table className="tablo">
              <thead><tr><th>Ad</th><th>Tür</th><th>Irk</th><th>İşlem</th></tr></thead>
              <tbody>{tumHayvanlar
                .filter((x) => `${x.ad} ${x.tur} ${x.irk ?? ""}`.toLowerCase().includes(hayvanArama.toLowerCase()))
                .map((x) => (
                <tr key={x.id}>
                  <td>{x.ad}</td><td>{x.tur}</td><td>{x.irk || "-"}</td>
                  <td><button className="satir-dugme" onClick={() => gecmisAc(x.id)}>Geçmişi Aç</button></td>
                </tr>
              ))}</tbody>
            </table>
          </article>
          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Sağlık Kayıtları</h3>
            <div style={{ fontSize: 13, color: "var(--ikincil)", marginBottom: 8 }}>Seçili hayvan id: {seciliHayvanId ?? "-"}</div>
            {gecmisYukleniyor ? <div className="toast">Sağlık geçmişi yükleniyor...</div> : null}
            <table className="tablo">
              <thead><tr><th>İşlem</th><th>Tarih</th><th>Tanı/Not</th><th>Triage</th><th>Vital Özet</th><th>Takip</th><th>Detay</th></tr></thead>
              <tbody>
                {saglikKayitlari.map((x) => (
                  <tr key={x.id}>
                    <td>{x.islem_turu}</td>
                    <td>{new Date(x.islem_tarihi).toLocaleString("tr-TR")}</td>
                    <td>{kisaMetin(x.tani_notu || x.assessment || "-", 64)}</td>
                    <td>{triageEtiketi(x.triage_seviyesi)}</td>
                    <td>{vitalOzet(x)}</td>
                    <td>{x.takip_kontrol_tarihi || "-"}</td>
                    <td>
                      <button className="satir-dugme" onClick={() => setSaglikDetayModal(x)}>
                        Detay
                      </button>
                    </td>
                  </tr>
                ))}
                {saglikKayitlari.length === 0 ? <tr><td colSpan={7}>Sağlık kaydı bulunamadı.</td></tr> : null}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}
      {saglikDetayModal ? (
        <SaglikDetayModal
          kayit={saglikDetayModal}
          kapat={() => setSaglikDetayModal(null)}
          hayvanAdi={seciliGecmisHayvani?.ad || "-"}
          indeks={saglikDetayIndeksi}
          toplam={saglikKayitlari.length}
          oncekiPasif={saglikDetayIndeksi <= 0}
          sonrakiPasif={saglikDetayIndeksi < 0 || saglikDetayIndeksi >= saglikKayitlari.length - 1}
          onceki={() => saglikDetayGecis(-1)}
          sonraki={() => saglikDetayGecis(1)}
        />
      ) : null}
      {detayModal ? (
        <DetayModal baslik={detayModal.baslik} veri={detayModal.veri} kapat={() => setDetayModal(null)} />
      ) : null}
    </PanelShell>
  );
}

function Durum({ mesaj, hata }: { mesaj: string; hata?: boolean }) {
  return <div className={hata ? "hata" : "toast"}>{mesaj}</div>;
}

type Hayvan = { id: number; ad: string; tur: string; irk: string | null };
type SaglikKaydi = {
  id: number;
  islem_turu: string;
  islem_tarihi: string;
  tani_notu?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  takip_kontrol_tarihi?: string | null;
  taburculuk_notu?: string | null;
  triage_seviyesi?: string | null;
  ates_c?: number | null;
  nabiz?: number | null;
  solunum_sayisi?: number | null;
  kilo_kg?: number | null;
};
type Veteriner = { id: string; ad: string; soyad: string; profil: { klinik_adi?: string | null } | null };
type Randevu = {
  id: number;
  randevu_tarihi: string;
  randevu_saati: string;
  durum: string;
  iptal_nedeni?: string | null;
  sikayet_ozet?: string | null;
  ai_oncelik?: string | null;
  hayvan?: { id: number; ad: string } | null;
  veteriner?: { id: string; ad: string; soyad: string } | null;
};
type Kimlik = {
  id: number;
  hayvan_id: number;
  benzersiz_kimlik_no: string;
  qr_icerik: string;
  qr_dogrulama_token?: string | null;
  foto_url: string | null;
  foto_erisim_url?: string | null;
  imza_url: string | null;
  imza_erisim_url?: string | null;
  pdf_url: string | null;
  pdf_erisim_url?: string | null;
  kimlik_notu: string | null;
  mikrocip_no?: string | null;
  kayip_hayvan_iletisim_izni?: boolean;
  kayip_hayvan_notu?: string | null;
  guncelleme_tarihi?: string | null;
  hayvan: {
    id: number;
    ad: string;
    tur: string;
    irk: string | null;
    cinsiyet: string | null;
    kan_grubu: string | null;
    dogum_tarihi: string | null;
    kilo: number | null;
  };
  sahip: {
    id: string;
    ad: string | null;
    soyad: string | null;
    telefon: string | null;
    adres: string | null;
    il: string | null;
    ilce: string | null;
    acil_durum_iletisim: string | null;
  };
};

type KimlikGecmis = {
  id: number;
  olusturma_tarihi: string;
  not_ozeti: string | null;
  yeni_pdf_url: string | null;
  yeni_pdf_erisim_url?: string | null;
};

const KOPEK_IRK_FALLBACK = ["Golden Retriever", "Labrador Retriever", "Poodle", "Terrier", "Bulldog"];
const KEDI_IRK_FALLBACK = ["British Shorthair", "Scottish Fold", "Siyam", "Van Kedisi", "Tekir"];
const DIGER_IRK_FALLBACK = ["Belirtilmedi"];
const IL_ILCE_FALLBACK: Record<string, string[]> = {
  Istanbul: ["Kadikoy", "Besiktas", "Uskudar", "Bakirkoy", "Sisli"],
  Ankara: ["Cankaya", "Kecioren", "Yenimahalle", "Mamak", "Etimesgut"],
  Izmir: ["Konak", "Karsiyaka", "Bornova", "Buca", "Bayrakli"],
  Bursa: ["Osmangazi", "Nilufer", "Yildirim", "Mudanya", "Gemlik"],
  Antalya: ["Muratpasa", "Konyaalti", "Kepez", "Alanya", "Manavgat"],
};

function benzersizBirlestir(liste: string[], secili?: string) {
  const d = new Set((liste || []).filter(Boolean));
  if (secili && secili.trim()) d.add(secili.trim());
  return Array.from(d);
}

async function kimlikPdfBlobUret(girdi: {
  kimlikNo: string;
  hayvan: Kimlik["hayvan"] | null;
  sahip: Kimlik["sahip"] | null;
  logoKaynak: string | null;
  fotoKaynak: string | null;
  imzaKaynak: string | null;
  kimlikNotu: string;
  qrDataUrl: string;
  tema: "erkek" | "disi" | "ntr";
}): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [360, 580], compress: true });
  const tema =
    girdi.tema === "erkek"
      ? { ana: "#16548f", vurgu: "#0f7cc8", acik: "#eaf5ff", cizgi: "#8db8da" }
      : girdi.tema === "disi"
        ? { ana: "#a04378", vurgu: "#cc5f97", acik: "#fff1f8", cizgi: "#efbfd8" }
        : { ana: "#0f4568", vurgu: "#1a8ab8", acik: "#eef8ff", cizgi: "#9bc7de" };

  const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  };

  const onYuz = document.createElement("canvas");
  onYuz.width = 1160;
  onYuz.height = 720;
  const onCtx = onYuz.getContext("2d");
  if (!onCtx) throw new Error("PDF yüzeyi oluşturulamadı.");

  const dikey = onCtx.createLinearGradient(0, 0, 0, onYuz.height);
  dikey.addColorStop(0, "#fafdff");
  dikey.addColorStop(1, tema.acik);
  onCtx.fillStyle = dikey;
  onCtx.fillRect(0, 0, onYuz.width, onYuz.height);

  rounded(onCtx, 24, 24, onYuz.width - 48, onYuz.height - 48, 26);
  onCtx.fillStyle = "#ffffff";
  onCtx.fill();
  onCtx.lineWidth = 8;
  onCtx.strokeStyle = tema.ana;
  onCtx.stroke();

  rounded(onCtx, 46, 46, onYuz.width - 92, 108, 18);
  const ustGrad = onCtx.createLinearGradient(46, 46, onYuz.width - 46, 154);
  ustGrad.addColorStop(0, tema.ana);
  ustGrad.addColorStop(1, tema.vurgu);
  onCtx.fillStyle = ustGrad;
  onCtx.fill();

  onCtx.fillStyle = "#ffffff";
  onCtx.font = "700 44px Inter, Arial, sans-serif";
  onCtx.fillText("DuraPet Dijital Hayvan Kimliği", 72, 108);
  onCtx.font = "600 23px Inter, Arial, sans-serif";
  onCtx.fillText(`Kimlik No: ${girdi.kimlikNo}`, 72, 140);

  const logoDataUrl = girdi.logoKaynak ? await gorselKaynakDataUrl(girdi.logoKaynak) : null;
  if (logoDataUrl) {
    const logo = await dataUrlResimYukle(logoDataUrl);
    const boxX = 780;
    const boxY = 58;
    const boxW = 320;
    const boxH = 84;
    const oran = logo.width > 0 ? logo.height / logo.width : 0.32;
    let hedefW = boxW;
    let hedefH = Math.round(hedefW * oran);
    if (hedefH > boxH) {
      hedefH = boxH;
      hedefW = Math.round(hedefH / Math.max(oran, 0.01));
    }
    const lx = boxX + Math.round((boxW - hedefW) / 2);
    const ly = boxY + Math.round((boxH - hedefH) / 2);
    onCtx.drawImage(logo, lx, ly, hedefW, hedefH);
  }

  rounded(onCtx, 60, 176, 230, 300, 16);
  onCtx.fillStyle = "#f1f8fd";
  onCtx.fill();
  onCtx.strokeStyle = tema.cizgi;
  onCtx.lineWidth = 2;
  onCtx.stroke();
  const fotoDataUrl = girdi.fotoKaynak ? await gorselKaynakDataUrl(girdi.fotoKaynak) : null;
  if (fotoDataUrl) {
    const img = await dataUrlResimYukle(fotoDataUrl);
    onCtx.drawImage(img, 74, 190, 202, 222);
  } else {
    rounded(onCtx, 74, 190, 202, 222, 12);
    onCtx.fillStyle = "#dbeaf4";
    onCtx.fill();
    onCtx.fillStyle = "#4e6e81";
    onCtx.font = "700 24px Inter, Arial, sans-serif";
    onCtx.fillText("FOTO", 142, 310);
  }
  onCtx.fillStyle = "#3f6279";
  onCtx.font = "600 20px Inter, Arial, sans-serif";
  onCtx.fillText("Hayvan Fotoğrafı", 94, 448);

  const bilgiKutusu = (etiket: string, deger: string, x: number, y: number, w: number) => {
    rounded(onCtx, x, y, w, 40, 10);
    onCtx.fillStyle = "#f7fbff";
    onCtx.fill();
    onCtx.strokeStyle = "#d5e6f2";
    onCtx.lineWidth = 1.3;
    onCtx.stroke();
    onCtx.fillStyle = "#4b6d83";
    onCtx.font = "600 16px Inter, Arial, sans-serif";
    onCtx.fillText(etiket, x + 12, y + 17);
    onCtx.fillStyle = "#163f5d";
    onCtx.font = "700 19px Inter, Arial, sans-serif";
    const metin = deger || "-";
    const uygun = metin.length > 36 ? `${metin.slice(0, 36)}…` : metin;
    onCtx.fillText(uygun, x + 12, y + 34);
  };

  bilgiKutusu("Hayvan Adı", girdi.hayvan?.ad || "-", 320, 180, 430);
  bilgiKutusu("Tür / Irk", `${girdi.hayvan?.tur || "-"} / ${girdi.hayvan?.irk || "-"}`, 320, 226, 430);
  bilgiKutusu("Doğum Tarihi", girdi.hayvan?.dogum_tarihi || "-", 320, 272, 210);
  bilgiKutusu("Kilo", girdi.hayvan?.kilo != null ? `${girdi.hayvan.kilo} kg` : "-", 540, 272, 210);
  bilgiKutusu("Sahip", `${girdi.sahip?.ad || "-"} ${girdi.sahip?.soyad || ""}`.trim(), 320, 318, 430);
  bilgiKutusu("Telefon", girdi.sahip?.telefon || "-", 320, 364, 210);
  bilgiKutusu("İl / İlçe", `${girdi.sahip?.il || "-"} / ${girdi.sahip?.ilce || "-"}`, 540, 364, 210);

  rounded(onCtx, 770, 176, 320, 200, 16);
  onCtx.fillStyle = "#f8fbff";
  onCtx.fill();
  onCtx.strokeStyle = "#d7e8f2";
  onCtx.lineWidth = 1.8;
  onCtx.stroke();
  if (girdi.qrDataUrl) {
    const qr = await dataUrlResimYukle(girdi.qrDataUrl);
    onCtx.drawImage(qr, 852, 202, 156, 156);
  }
  onCtx.fillStyle = "#345a72";
  onCtx.font = "600 18px Inter, Arial, sans-serif";
  onCtx.fillText("QR okutunca güvenli doğrulama ekranı açılır", 790, 390);

  rounded(onCtx, 770, 406, 320, 70, 12);
  onCtx.fillStyle = "#f3f9ff";
  onCtx.fill();
  onCtx.strokeStyle = "#d8e8f3";
  onCtx.stroke();
  const imzaDataUrl = girdi.imzaKaynak ? await gorselKaynakDataUrl(girdi.imzaKaynak) : null;
  onCtx.fillStyle = "#214d69";
  onCtx.font = "700 17px Inter, Arial, sans-serif";
  onCtx.fillText("Sahip İmzası", 790, 430);
  if (imzaDataUrl) {
    const imza = await dataUrlResimYukle(imzaDataUrl);
    onCtx.drawImage(imza, 920, 414, 150, 44);
  } else {
    onCtx.fillStyle = "#6f889a";
    onCtx.font = "500 14px Inter, Arial, sans-serif";
    onCtx.fillText("İmza eklenmedi", 930, 440);
  }

  rounded(onCtx, 60, 500, 1030, 140, 14);
  onCtx.fillStyle = "#f9fcff";
  onCtx.fill();
  onCtx.strokeStyle = "#d8e8f3";
  onCtx.stroke();
  onCtx.fillStyle = "#264d67";
  onCtx.font = "700 20px Inter, Arial, sans-serif";
  onCtx.fillText("Adres ve Not", 80, 532);
  onCtx.font = "500 18px Inter, Arial, sans-serif";
  const adres = girdi.sahip?.adres || "-";
  satirSar(onCtx, `Adres: ${adres}`, 80, 560, 680, 24);
  satirSar(onCtx, `Not: ${girdi.kimlikNotu || "-"}`, 80, 606, 980, 24);

  const onYuzData = onYuz.toDataURL("image/jpeg", 0.82);
  pdf.addImage(onYuzData, "JPEG", 0, 0, 580, 360);

  const arkaYuz = document.createElement("canvas");
  arkaYuz.width = 1160;
  arkaYuz.height = 720;
  const arkaCtx = arkaYuz.getContext("2d");
  if (!arkaCtx) throw new Error("PDF arka yüzeyi oluşturulamadı.");

  const arkaGrad = arkaCtx.createLinearGradient(0, 0, 1160, 720);
  arkaGrad.addColorStop(0, "#f6fbff");
  arkaGrad.addColorStop(1, tema.acik);
  arkaCtx.fillStyle = arkaGrad;
  arkaCtx.fillRect(0, 0, 1160, 720);

  rounded(arkaCtx, 24, 24, 1112, 672, 24);
  arkaCtx.fillStyle = "#ffffff";
  arkaCtx.fill();
  arkaCtx.lineWidth = 8;
  arkaCtx.strokeStyle = tema.ana;
  arkaCtx.stroke();

  rounded(arkaCtx, 46, 46, 1068, 90, 16);
  const arkaBaslik = arkaCtx.createLinearGradient(46, 46, 1114, 136);
  arkaBaslik.addColorStop(0, tema.ana);
  arkaBaslik.addColorStop(1, tema.vurgu);
  arkaCtx.fillStyle = arkaBaslik;
  arkaCtx.fill();
  arkaCtx.fillStyle = "#ffffff";
  arkaCtx.font = "700 44px Inter, Arial, sans-serif";
  arkaCtx.fillText("Kimlik Arka Yüzü", 72, 104);

  const blok = (baslik: string, satirlar: string[], x: number, y: number, w: number, h: number) => {
    rounded(arkaCtx, x, y, w, h, 14);
    arkaCtx.fillStyle = "#f7fbff";
    arkaCtx.fill();
    arkaCtx.strokeStyle = "#d7e8f3";
    arkaCtx.lineWidth = 1.8;
    arkaCtx.stroke();
    arkaCtx.fillStyle = "#1c4a69";
    arkaCtx.font = "700 24px Inter, Arial, sans-serif";
    arkaCtx.fillText(baslik, x + 16, y + 34);
    arkaCtx.fillStyle = "#254e69";
    arkaCtx.font = "600 20px Inter, Arial, sans-serif";
    let sy = y + 68;
    for (const satir of satirlar) {
      sy = satirSar(arkaCtx, satir, x + 16, sy, w - 32, 28);
    }
  };

  blok(
    "Kayıt Bilgileri",
    [
      `Kayıt İli: ${girdi.sahip?.il || "-"}`,
      `Kayıt İlçesi: ${girdi.sahip?.ilce || "-"}`,
      `Acil Durum İletişim: ${girdi.sahip?.acil_durum_iletisim || "-"}`,
    ],
    60,
    170,
    500,
    230
  );
  blok(
    "Medikal Bilgiler",
    [
      `Hayvan Kan Grubu: ${girdi.hayvan?.kan_grubu || "-"}`,
      `Sahip Telefon: ${girdi.sahip?.telefon || "-"}`,
      `Sistem Kimlik No: ${girdi.kimlikNo}`,
    ],
    590,
    170,
    500,
    230
  );
  blok(
    "Doğrulama Notu",
    [
      "Bu belge DuraPet dijital kimlik sistemi tarafından",
      "üretilmiştir. QR kodu üzerinden güncel sürüm açılır.",
      "Yetkisiz değişiklik durumunda kimlik geçersiz sayılır.",
    ],
    60,
    430,
    1030,
    190
  );

  const arkaYuzData = arkaYuz.toDataURL("image/jpeg", 0.82);
  pdf.addPage([360, 580], "landscape");
  pdf.addImage(arkaYuzData, "JPEG", 0, 0, 580, 360);
  return pdf.output("blob");
}

function satirSar(
  ctx: CanvasRenderingContext2D,
  metin: string,
  x: number,
  baslangicY: number,
  maxGenislik: number,
  satirYukseklik: number
) {
  const kelimeler = metin.split(" ");
  let satir = "";
  let y = baslangicY;
  for (const kelime of kelimeler) {
    const test = satir ? `${satir} ${kelime}` : kelime;
    if (ctx.measureText(test).width > maxGenislik && satir) {
      ctx.fillText(satir, x, y);
      satir = kelime;
      y += satirYukseklik;
    } else {
      satir = test;
    }
  }
  if (satir) ctx.fillText(satir, x, y);
  return y + satirYukseklik;
}

async function dataUrlResimYukle(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = dataUrl;
  });
}

async function gorselKaynakDataUrl(kaynak: string): Promise<string | null> {
  try {
    if (kaynak.startsWith("data:")) return kaynak;
    const yanit = await fetch(kaynak);
    if (!yanit.ok) return null;
    const blob = await yanit.blob();
    return await new Promise<string>((resolve, reject) => {
      const okuyucu = new FileReader();
      okuyucu.onloadend = () => resolve(String(okuyucu.result || ""));
      okuyucu.onerror = () => reject(new Error("Gorsel okunamadi."));
      okuyucu.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function DetayModal({ baslik, veri, kapat }: { baslik: string; veri: unknown; kapat: () => void }) {
  return (
    <div className="modal-arkaplan" onClick={kapat}>
      <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-baslik">{baslik}</h4>
        <div className="modal-icerik">{JSON.stringify(veri, null, 2)}</div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button className="satir-dugme" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

function SaglikDetayModal({
  kayit,
  kapat,
  hayvanAdi,
  indeks,
  toplam,
  oncekiPasif,
  sonrakiPasif,
  onceki,
  sonraki,
}: {
  kayit: SaglikKaydi;
  kapat: () => void;
  hayvanAdi: string;
  indeks: number;
  toplam: number;
  oncekiPasif: boolean;
  sonrakiPasif: boolean;
  onceki: () => void;
  sonraki: () => void;
}) {
  return (
    <div className="modal-arkaplan" onClick={kapat}>
      <aside className="modal-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-drawer-head">
          <div className="modal-drawer-head-yazi">
            <h4 className="modal-baslik" style={{ margin: 0 }}>Sağlık Kaydı Detayı</h4>
            <small>{hayvanAdi} - Kayıt {Math.max(1, indeks + 1)} / {Math.max(1, toplam)}</small>
          </div>
          <div className="modal-drawer-head-aksiyon">
            <button className="satir-dugme" onClick={onceki} disabled={oncekiPasif}>Önceki Kayıt</button>
            <button className="satir-dugme" onClick={sonraki} disabled={sonrakiPasif}>Sonraki Kayıt</button>
            <button className="satir-dugme" onClick={kapat}>Kapat</button>
          </div>
        </div>
        <div className="modal-drawer-body">
          <div className="modal-randevu-kart">
            <small>Genel</small>
            <strong>{kayit.islem_turu}</strong>
            <p><span>Tarih:</span> {new Date(kayit.islem_tarihi).toLocaleString("tr-TR")}</p>
            <p><span>Triage:</span> {triageEtiketi(kayit.triage_seviyesi)}</p>
            <p><span>Takip:</span> {kayit.takip_kontrol_tarihi || "-"}</p>
          </div>
          <div className="modal-randevu-kart">
            <small>SOAP ve Klinik Notlar</small>
            <div className="soap-liste">
              <p><strong>Tanı/Not</strong><span>{kayit.tani_notu || "-"}</span></p>
              <p><strong>Öykü (Subjective)</strong><span>{kayit.subjective || "-"}</span></p>
              <p><strong>Muayene (Objective)</strong><span>{kayit.objective || "-"}</span></p>
              <p><strong>Değerlendirme (Assessment)</strong><span>{kayit.assessment || "-"}</span></p>
              <p><strong>Plan</strong><span>{kayit.plan || "-"}</span></p>
              <p><strong>Taburculuk Notu</strong><span>{kayit.taburculuk_notu || "-"}</span></p>
            </div>
          </div>
          <div className="modal-randevu-kart">
            <small>Vital Bulgular</small>
            <p><span>Ateş:</span> {kayit.ates_c != null ? `${kayit.ates_c} C` : "-"}</p>
            <p><span>Nabız:</span> {kayit.nabiz ?? "-"}</p>
            <p><span>Solunum:</span> {kayit.solunum_sayisi ?? "-"}</p>
            <p><span>Kilo:</span> {kayit.kilo_kg != null ? `${kayit.kilo_kg} kg` : "-"}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function RandevuDurumRozeti({ durum }: { durum: string }) {
  const tip =
    durum === "onaylandi"
      ? "durum-onay"
      : durum === "beklemede"
        ? "durum-bekle"
        : durum === "tamamlandi"
          ? "durum-onay"
          : "durum-iptal";
  return <span className={`durum-rozeti ${tip}`}>{durum}</span>;
}

function kisaMetin(metin: string, limit: number) {
  if (!metin) return "-";
  return metin.length > limit ? `${metin.slice(0, limit)}...` : metin;
}

function vitalOzet(kayit: SaglikKaydi) {
  const parcali = [];
  if (kayit.ates_c != null) parcali.push(`${kayit.ates_c} C`);
  if (kayit.nabiz != null) parcali.push(`${kayit.nabiz} nbz`);
  if (kayit.solunum_sayisi != null) parcali.push(`${kayit.solunum_sayisi} sol`);
  if (kayit.kilo_kg != null) parcali.push(`${kayit.kilo_kg} kg`);
  return parcali.length > 0 ? parcali.join(" / ") : "-";
}

