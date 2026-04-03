"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PanelShell } from "@/components/panel-shell";
import { SectionCard } from "@/components/section-card";
import { CommandCenter } from "@/components/command-center";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { durumEtiketi, triageEtiketi } from "@/lib/klinik-terimler";
import {
  AlertCircle,
  AlarmClock,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  IdCard,
  LayoutDashboard,
  MessageSquare,
  ShieldPlus,
  Syringe,
  Stethoscope,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function VeterinerSayfasi() {
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.VETERINER);
  const router = useRouter();
  const [aktifMenu, setAktifMenu] = useState("dashboard");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const [veriHatasi, setVeriHatasi] = useState("");
  const [islemMesaji, setIslemMesaji] = useState("");
  const [randevular, setRandevular] = useState<Randevu[]>([]);
  const [toplamRandevu, setToplamRandevu] = useState(0);
  const [yaklasanAsilar, setYaklasanAsilar] = useState<YaklasanAsi[]>([]);
  const [hastalar, setHastalar] = useState<Hasta[]>([]);
  const [kimlikDetay, setKimlikDetay] = useState<Kimlik | null>(null);
  const [seciliKimlikHayvanId, setSeciliKimlikHayvanId] = useState("");
  const [sahipler, setSahipler] = useState<Sahip[]>([]);
  const [sahipArama, setSahipArama] = useState("");
  const [sahipAramaYukleniyor, setSahipAramaYukleniyor] = useState(false);
  const [hizliSahipForm, setHizliSahipForm] = useState({ ad: "", soyad: "", telefon: "", eposta: "" });
  const [hizliSahipKaydediliyor, setHizliSahipKaydediliyor] = useState(false);
  const [sahipHayvanlari, setSahipHayvanlari] = useState<SahipHayvan[]>([]);
  const [seciliSahipHayvanId, setSeciliSahipHayvanId] = useState("");
  const [sahipHayvanYukleniyor, setSahipHayvanYukleniyor] = useState(false);
  const [seciliHayvanGecmisi, setSeciliHayvanGecmisi] = useState<SaglikKaydi[]>([]);
  const [seciliHayvanAsiGecmisi, setSeciliHayvanAsiGecmisi] = useState<AsiKaydi[]>([]);
  const [seciliHayvanKimlik, setSeciliHayvanKimlik] = useState<Kimlik | null>(null);
  const [seciliHayvanOzetYukleniyor, setSeciliHayvanOzetYukleniyor] = useState(false);
  const [tamamlaModal, setTamamlaModal] = useState<Randevu | null>(null);
  const [tamamlaKaydediliyor, setTamamlaKaydediliyor] = useState(false);
  const [hizliMesajModal, setHizliMesajModal] = useState<HizliMesajHedef | null>(null);
  const [hizliMesajGonderiliyor, setHizliMesajGonderiliyor] = useState(false);
  const [hizliMesajForm, setHizliMesajForm] = useState({
    kanal: "push" as "push" | "whatsapp" | "sms",
    mesaj: "",
  });
  const [tamamlaForm, setTamamlaForm] = useState<TamamlaForm>({
    islem_turu: "genel_kontrol",
    tani_notu: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    takip_kontrol_tarihi: "",
    taburculuk_notu: "",
    triage_seviyesi: "",
    ates_c: "",
    nabiz: "",
    solunum_sayisi: "",
    kilo_kg: "",
    asi_uygulandi: false,
    asi_adi: "kuduz_asi",
    tekrar_gun_sayisi: "365",
    asi_notu: "",
    checkout_ile_kapat: true,
  });
  const [seciliHayvanId, setSeciliHayvanId] = useState<number | null>(null);
  const [hastaForm, setHastaForm] = useState({ sahibi_id: "", ad: "", tur: "", irk: "" });
  const [saglikForm, setSaglikForm] = useState({
    islem_turu: "genel_kontrol",
    tani_notu: "",
    islem_tarihi: new Date().toISOString().slice(0, 16),
  });
  const [asiForm, setAsiForm] = useState({
    asi_adi: "kuduz_asi",
    uygulama_tarihi: new Date().toISOString().slice(0, 10),
    tekrar_gun_sayisi: "365",
    notlar: "",
  });
  const [receteForm, setReceteForm] = useState({
    tani: "",
    recete_metni: "",
    ilac_adi: "",
    doz: "",
    kullanim_sikligi: "",
    sure_gun: "7",
    notlar: "",
  });
  const [globalArama, setGlobalArama] = useState("");
  const [sonAksiyon, setSonAksiyon] = useState("");
  const [, setAktifAksiyonAnahtari] = useState("");
  const [randevuIslemdeId, setRandevuIslemdeId] = useState<number | null>(null);
  const [randevuListeFiltresi, setRandevuListeFiltresi] = useState<"tum" | "beklemede" | "onaylandi" | "geldi" | "muayenede" | "tamamlandi" | "no_show" | "iptal">("tum");
  const [randevuDurumFiltre, setRandevuDurumFiltre] = useState("tum");
  const [randevuSirala, setRandevuSirala] = useState("tarih_desc");
  const [randevuSayfa, setRandevuSayfa] = useState(1);
  const [kayitSekme, setKayitSekme] = useState<"hasta" | "saglik" | "asi" | "recete">("hasta");
  const [detayModal, setDetayModal] = useState<{ baslik: string; veri: unknown } | null>(null);
  const [islemAkisi, setIslemAkisi] = useState<IslemAkisKaydi[]>([]);
  const [hastaKaydiKaydediliyor, setHastaKaydiKaydediliyor] = useState(false);
  const [hastaSilinenId, setHastaSilinenId] = useState<number | null>(null);

  function akisEkle(kayit: Omit<IslemAkisKaydi, "id" | "zaman">) {
    const yeni: IslemAkisKaydi = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      zaman: new Date().toISOString(),
      ...kayit,
    };
    setIslemAkisi((onceki) => [yeni, ...onceki].slice(0, 12));
  }

  function hizliMesajVarsayilanMetin(hedef: Randevu) {
    const hayvanAdi = hedef.hayvan?.ad || "Hastaniz";
    return `${hayvanAdi} icin randevu akisini guncelledik. Uygun oldugunuzda bu mesaja yanit verebilirsiniz. Acil durumda dogrudan klinik ile iletisime gecin.`;
  }

  function hizliMesajModalAc(hedef: Randevu) {
    if (!hedef.sahip?.id || !hedef.hayvan?.id) {
      setIslemMesaji("Hizli mesaj icin sahip veya hayvan bilgisi bulunamadi.");
      return;
    }
    setHizliMesajForm({
      kanal: "push",
      mesaj: hizliMesajVarsayilanMetin(hedef),
    });
    setHizliMesajModal({
      randevu_id: hedef.id,
      sahibi_id: hedef.sahip.id,
      sahip_ad_soyad: `${hedef.sahip.ad} ${hedef.sahip.soyad}`,
      sahip_telefon: hedef.sahip.telefon || null,
      hayvan_id: hedef.hayvan.id,
      hayvan_adi: hedef.hayvan.ad || "Hayvan",
      randevu_tarihi: hedef.randevu_tarihi,
      randevu_saati: hedef.randevu_saati,
    });
  }

  function randevuFiltreSec(filtre: "tum" | "beklemede" | "onaylandi" | "geldi" | "muayenede" | "tamamlandi" | "no_show" | "iptal") {
    setRandevuListeFiltresi(filtre);
    setRandevuDurumFiltre(filtre === "tum" ? "tum" : filtre);
    setRandevuSayfa(1);
  }

  const yenile = useCallback(async () => {
    if (!token) return;
    const limit = 8;
    const offset = (randevuSayfa - 1) * limit;
    const [randevuCevap, asiCevap, hastaCevap] = await Promise.all([
      apiGet<{ randevular: Randevu[]; toplam_kayit?: number }>(
        `/api/v1/veteriner/randevular?limit=${limit}&offset=${offset}&durum=${randevuDurumFiltre}&sirala=${randevuSirala}`,
        token
      ),
      apiGet<{ veriler: YaklasanAsi[] }>("/api/v1/veteriner/asi-zamani-yaklasanlar?limit=20", token),
      apiGet<{ hastalar: Hasta[] }>("/api/v1/veteriner/hastalar?limit=20", token),
    ]);
    setRandevular(randevuCevap.randevular || []);
    setToplamRandevu(randevuCevap.toplam_kayit ?? (randevuCevap.randevular || []).length);
    setYaklasanAsilar(asiCevap.veriler || []);
    setHastalar(hastaCevap.hastalar || []);
    setSeciliHayvanId(hastaCevap.hastalar?.[0]?.id ?? null);
    setHastaForm((x) => ({
      ...x,
      sahibi_id: x.sahibi_id || "",
    }));
    const ilkHastaId = hastaCevap.hastalar?.[0]?.id;
    if (ilkHastaId) {
      setSeciliKimlikHayvanId(String(ilkHastaId));
      try {
        const kimlikCevap = await apiGet<{ kimlik: Kimlik }>(`/api/v1/veteriner/hastalar/${ilkHastaId}/kimlik`, token);
        setKimlikDetay(kimlikCevap.kimlik || null);
      } catch {
        setKimlikDetay(null);
      }
    } else {
      setSeciliKimlikHayvanId("");
      setKimlikDetay(null);
    }
  }, [token, randevuDurumFiltre, randevuSirala, randevuSayfa]);

  useEffect(() => {
    setRandevuSayfa(1);
  }, [randevuDurumFiltre, randevuSirala]);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      setVeriHatasi("");
      try {
        await yenile();
      } catch (err) {
        setVeriHatasi(err instanceof Error ? err.message : "Veriler alinamadi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token, yenile]);

  useEffect(() => {
    if (aktifMenu === "mesaj") {
      router.push("/veteriner/mesajlar");
    }
    if (aktifMenu === "bildirim") {
      router.push("/veteriner/bildirimler");
    }
    if (aktifMenu === "iletisim") {
      router.push("/veteriner/iletisim");
    }
  }, [aktifMenu, router]);

  useEffect(() => {
    if (aktifMenu !== "dashboard") setAktifAksiyonAnahtari("");
  }, [aktifMenu]);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(async () => {
      setSahipAramaYukleniyor(true);
      try {
        const q = encodeURIComponent(sahipArama.trim());
        const cevap = await apiGet<{ sahipler: Sahip[] }>(`/api/v1/veteriner/sahipler?limit=20&offset=0&arama=${q}`, token);
        setSahipler(cevap.sahipler || []);
      } catch {
        setSahipler([]);
      } finally {
        setSahipAramaYukleniyor(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [token, sahipArama]);

  useEffect(() => {
    async function sahipHayvanlariniYukle() {
      if (!token || !hastaForm.sahibi_id) {
        setSahipHayvanlari([]);
        setSeciliSahipHayvanId("");
        return;
      }
      setSahipHayvanYukleniyor(true);
      try {
        const cevap = await apiGet<{ hayvanlar: SahipHayvan[] }>(
          `/api/v1/veteriner/sahipler/${hastaForm.sahibi_id}/hayvanlar?limit=100&offset=0`,
          token
        );
        const liste = cevap.hayvanlar || [];
        setSahipHayvanlari(liste);
      } catch {
        setSahipHayvanlari([]);
      } finally {
        setSahipHayvanYukleniyor(false);
      }
    }
    sahipHayvanlariniYukle();
  }, [token, hastaForm.sahibi_id]);

  useEffect(() => {
    async function seciliHayvanOzetiYukle() {
      if (!token) return;
      const hedefId = Number(seciliSahipHayvanId || seciliHayvanId || 0);
      if (!hedefId) {
        setSeciliHayvanGecmisi([]);
        setSeciliHayvanAsiGecmisi([]);
        setSeciliHayvanKimlik(null);
        return;
      }
      setSeciliHayvanOzetYukleniyor(true);
      try {
        const [gecmis, asiGecmisi, kimlik] = await Promise.all([
          apiGet<{ kayitlar: SaglikKaydi[] }>(`/api/v1/veteriner/hastalar/${hedefId}/saglik-gecmisi?limit=8`, token),
          apiGet<{ kayitlar: AsiKaydi[] }>(`/api/v1/veteriner/hastalar/${hedefId}/asilar?limit=8`, token),
          apiGet<{ kimlik: Kimlik }>(`/api/v1/veteriner/hastalar/${hedefId}/kimlik`, token),
        ]);
        setSeciliHayvanGecmisi(gecmis.kayitlar || []);
        setSeciliHayvanAsiGecmisi(asiGecmisi.kayitlar || []);
        setSeciliHayvanKimlik(kimlik.kimlik || null);
      } catch {
        setSeciliHayvanGecmisi([]);
        setSeciliHayvanAsiGecmisi([]);
        setSeciliHayvanKimlik(null);
      } finally {
        setSeciliHayvanOzetYukleniyor(false);
      }
    }
    seciliHayvanOzetiYukle();
  }, [token, seciliSahipHayvanId, seciliHayvanId, islemMesaji]);

  async function randevuIslem(id: number, tip: "ilerlet" | "onayla" | "geldi" | "muayenede" | "iptal" | "no_show" | "checkout" | "tamamla" | "hizli_mesaj") {
    if (!token) return;
    if (tip === "tamamla") {
      const secili = randevular.find((x) => x.id === id) || null;
      setTamamlaModal(secili);
      setTamamlaForm({
        islem_turu: "genel_kontrol",
        tani_notu: "",
        subjective: "",
        objective: "",
        assessment: "",
        plan: "",
        takip_kontrol_tarihi: "",
        taburculuk_notu: "",
        triage_seviyesi: "",
        ates_c: "",
        nabiz: "",
        solunum_sayisi: "",
        kilo_kg: "",
        asi_uygulandi: false,
        asi_adi: "kuduz_asi",
        tekrar_gun_sayisi: "365",
        asi_notu: "",
        checkout_ile_kapat: true,
      });
      return;
    }
    if (tip === "hizli_mesaj") {
      const hedef = randevular.find((x) => x.id === id);
      if (!hedef) {
        setIslemMesaji("Hizli mesaj icin sahip veya hayvan bilgisi bulunamadi.");
        return;
      }
      hizliMesajModalAc(hedef);
      return;
    }
    setRandevuIslemdeId(id);
    setSonAksiyon(`Randevu #${id} icin ${tip} islemi baslatildi`);
    try {
      if (tip === "ilerlet") {
        await apiPatch(`/api/v1/veteriner/randevular/${id}/ilerlet`, token, {});
      } else if (tip === "geldi" || tip === "muayenede") {
        await apiPatch(`/api/v1/veteriner/randevular/${id}/durum`, token, { durum: tip });
      } else if (tip === "no_show") {
        await apiPatch(`/api/v1/veteriner/randevular/${id}/no-show`, token, { no_show_nedeni: "Hasta klinige gelmedi." });
      } else if (tip === "checkout") {
        await apiPatch(`/api/v1/veteriner/randevular/${id}/checkout`, token, {});
      } else {
        await apiPatch(
          `/api/v1/veteriner/randevular/${id}/${tip}`,
          token,
          tip === "iptal" ? { iptal_nedeni: "Takvim güncelleme" } : {}
        );
      }
      const randevuIslemMesajlari: Partial<
        Record<"ilerlet" | "onayla" | "geldi" | "muayenede" | "iptal" | "no_show" | "checkout", string>
      > = {
        ilerlet: "Randevu bir sonraki asamaya ilerletildi.",
        onayla: "Randevu onaylandi.",
        geldi: "Randevu durumu 'geldi' olarak güncellendi.",
        muayenede: "Randevu 'muayenede' asamasina alindi.",
        no_show: "Randevu no-show olarak isaretlendi.",
        checkout: "Checkout zamani kaydedildi.",
        iptal: "Randevu iptal edildi.",
      };
      setIslemMesaji(randevuIslemMesajlari[tip] || "Islem tamamlandi.");
      setSonAksiyon(`Randevu #${id} icin ${tip} islemi tamamlandi`);
      const randevuAkisBasliklari: Partial<
        Record<"ilerlet" | "onayla" | "geldi" | "muayenede" | "iptal" | "no_show" | "checkout", string>
      > = {
        ilerlet: "Randevu ilerletildi",
        onayla: "Randevu onaylandi",
        geldi: "Hasta klinige geldi",
        muayenede: "Muayene başlatıldı",
        no_show: "Randevu no-show",
        checkout: "Checkout tamamlandi",
        iptal: "Randevu iptal edildi",
      };
      akisEkle({
        baslik: randevuAkisBasliklari[tip] || "Randevu güncellendi",
        detay: `Randevu #${id} için ${tip} işlemi uygulandı.`,
        durum: tip === "iptal" || tip === "no_show" ? "warn" : "ok",
      });
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Randevu işlemi başarısız.");
      setSonAksiyon(`Randevu #${id} islemi basarisiz`);
      akisEkle({
        baslik: "Randevu işlemi başarısız",
        detay: `Randevu #${id} için işlem tamamlanamadı.`,
        durum: "err",
      });
    } finally {
      setRandevuIslemdeId(null);
    }
  }

  async function hizliMesajGonder() {
    if (!token || !hizliMesajModal) return;
    if (!hizliMesajForm.mesaj.trim()) {
      setIslemMesaji("Mesaj metni bos olamaz.");
      return;
    }
    setHizliMesajGonderiliyor(true);
    setRandevuIslemdeId(hizliMesajModal.randevu_id);
    try {
      const sonuc = await apiPost<{
        mesaj: string;
        oda: { id: number };
        gonderim?: { kanal?: string; fallback_durum?: string | null; son_hata?: string | null };
      }>("/api/v1/veteriner/hizli-mesaj", token, {
        sahibi_id: hizliMesajModal.sahibi_id,
        hayvan_id: hizliMesajModal.hayvan_id,
        mesaj: hizliMesajForm.mesaj.trim(),
        kanal: hizliMesajForm.kanal,
      });
      const durumBilgisi = sonuc?.gonderim?.fallback_durum ? ` | Dis kanal: ${sonuc.gonderim.fallback_durum}` : "";
      const hataBilgisi = sonuc?.gonderim?.son_hata ? ` | Hata: ${sonuc.gonderim.son_hata}` : "";
      setIslemMesaji(
        `Mesaj gonderildi. Kanal: ${hizliMesajForm.kanal.toUpperCase()} | Oda #${sonuc.oda?.id || "-"}${durumBilgisi}${hataBilgisi}`
      );
      setSonAksiyon(`Randevu #${hizliMesajModal.randevu_id} icin mesaj gonderildi`);
      akisEkle({
        baslik: "Hizli mesaj gonderildi",
        detay: `${hizliMesajModal.hayvan_adi} icin ${hizliMesajForm.kanal} kanalindan iletisim kuruldu.`,
        durum: "ok",
      });
      setHizliMesajModal(null);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Hizli mesaj gonderilemedi.");
      akisEkle({
        baslik: "Hizli mesaj basarisiz",
        detay: `${hizliMesajModal.hayvan_adi} icin mesaj gonderilemedi.`,
        durum: "err",
      });
    } finally {
      setHizliMesajGonderiliyor(false);
      setRandevuIslemdeId(null);
    }
  }

  async function randevuTamamlaKaydet() {
    if (!token || !tamamlaModal) return;
    const kontrolMesaji = tamamlaFormKontrolMesaji(tamamlaForm);
    if (kontrolMesaji) {
      setIslemMesaji(kontrolMesaji);
      return;
    }
    setTamamlaKaydediliyor(true);
    setRandevuIslemdeId(tamamlaModal.id);
    setSonAksiyon(`Randevu #${tamamlaModal.id} tamamlama kaydi aliniyor`);
    try {
      await apiPatch(`/api/v1/veteriner/randevular/${tamamlaModal.id}/tamamla`, token, {
        islem_turu: tamamlaForm.islem_turu,
        tani_notu: tamamlaForm.tani_notu || null,
        subjective: tamamlaForm.subjective || null,
        objective: tamamlaForm.objective || null,
        assessment: tamamlaForm.assessment || null,
        plan: tamamlaForm.plan || null,
        takip_kontrol_tarihi: tamamlaForm.takip_kontrol_tarihi || null,
        taburculuk_notu: tamamlaForm.taburculuk_notu || null,
        triage_seviyesi: tamamlaForm.triage_seviyesi || null,
        ates_c: tamamlaForm.ates_c ? Number(tamamlaForm.ates_c) : null,
        nabiz: tamamlaForm.nabiz ? Number(tamamlaForm.nabiz) : null,
        solunum_sayisi: tamamlaForm.solunum_sayisi ? Number(tamamlaForm.solunum_sayisi) : null,
        kilo_kg: tamamlaForm.kilo_kg ? Number(tamamlaForm.kilo_kg) : null,
        asi_uygulandi: tamamlaForm.asi_uygulandi,
        asi_adi: tamamlaForm.asi_uygulandi ? tamamlaForm.asi_adi : null,
        tekrar_gun_sayisi: tamamlaForm.asi_uygulandi ? Number(tamamlaForm.tekrar_gun_sayisi || 0) : null,
        asi_notu: tamamlaForm.asi_uygulandi ? tamamlaForm.asi_notu || null : null,
        checkout_ile_kapat: tamamlaForm.checkout_ile_kapat,
      });
      setIslemMesaji(
        tamamlaForm.checkout_ile_kapat
          ? "Randevu tamamlandi, checkout ile kapatildi ve gecmis kaydi olusturuldu."
          : "Randevu tamamlandi, islem ve gecmis kaydi olusturuldu."
      );
      setSonAksiyon(`Randevu #${tamamlaModal.id} kayitlara islendi`);
      akisEkle({
        baslik: "Randevu tamamlandı",
        detay: `Randevu #${tamamlaModal.id} için ${tamamlaForm.islem_turu} kaydı işlendi.`,
        durum: "ok",
      });
      setTamamlaModal(null);
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Randevu tamamlama kaydı oluşturulamadı.");
      setSonAksiyon(`Randevu #${tamamlaModal.id} tamamlama basarisiz`);
      akisEkle({
        baslik: "Randevu tamamlama başarısız",
        detay: `Randevu #${tamamlaModal.id} için kayıt oluşturulamadı.`,
        durum: "err",
      });
    } finally {
      setTamamlaKaydediliyor(false);
      setRandevuIslemdeId(null);
    }
  }

  function tamamlaSablonUygula(sablon: "genel_kontrol" | "asi_uygulama" | "acil_mudahale" | "post_op_takip") {
    if (sablon === "genel_kontrol") {
      setTamamlaForm((x) => ({
        ...x,
        islem_turu: "genel_kontrol",
        subjective: "Sahip genel durum iyi, iştah normal bildiriyor.",
        objective: "Genel muayene stabil, yaşam bulguları olağan.",
        assessment: "Rutin kontrol bulguları normal.",
        plan: "Rutin izlem ve koruyucu hekimlik önerileri verildi.",
      }));
      return;
    }
    if (sablon === "asi_uygulama") {
      setTamamlaForm((x) => ({
        ...x,
        islem_turu: "asi_uygulama",
        subjective: "Aşı için planlı kontrol başvurusu.",
        objective: "Aşı öncesi muayene uygun.",
        assessment: "Aşı uygulamasına engel bulgu yok.",
        plan: "Aşı uygulandı, yan etki izlemi anlatıldı.",
        asi_uygulandi: true,
      }));
      return;
    }
    if (sablon === "acil_mudahale") {
      setTamamlaForm((x) => ({
        ...x,
        islem_turu: "acil_mudahale",
        subjective: "Acil semptom öyküsü alındı.",
        objective: "Acil değerlendirme ve vital stabilizasyon uygulandı.",
        assessment: "Acil klinik değerlendirme sonrası stabil.",
        plan: "Yoğun takip önerildi, kontrol randevusu planlandı.",
        triage_seviyesi: x.triage_seviyesi || "yuksek",
      }));
      return;
    }
    setTamamlaForm((x) => ({
      ...x,
      islem_turu: "post_op_takip",
      subjective: "Post-op takip kontrolü.",
      objective: "Cerrahi alan kontrolü ve iyileşme değerlendirildi.",
      assessment: "İyileşme süreci beklendiği şekilde.",
      plan: "Pansuman/ilaç önerileri tekrarlandı, takip tarihi verildi.",
    }));
  }

  async function hastaKaydiAc(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setHastaKaydiKaydediliyor(true);
    try {
      const sonuc = await apiPost<{ mesaj?: string; hayvan?: { id: number; ad: string; tur: string } }>("/api/v1/veteriner/hastalar", token, {
        ...hastaForm,
        hayvan_id: seciliSahipHayvanId ? Number(seciliSahipHayvanId) : undefined,
      });
      setIslemMesaji(`${sonuc.mesaj || "Hasta kaydı açıldı."} Sonraki adım: Sağlık veya Aşı sekmesinden işlem gir.`);
      akisEkle({
        baslik: seciliSahipHayvanId ? "Mevcut hayvan havuza eklendi" : "Yeni hasta kaydı açıldı",
        detay: `${sonuc.hayvan?.ad || hastaForm.ad} (${sonuc.hayvan?.tur || hastaForm.tur}) kaydedildi.`,
        durum: "ok",
      });
      if (sonuc.hayvan?.id) {
        setSeciliHayvanId(sonuc.hayvan.id);
        setSeciliKimlikHayvanId(String(sonuc.hayvan.id));
      }
      setKayitSekme("saglik");
      setHastaForm((onceki) => ({ sahibi_id: onceki.sahibi_id, ad: "", tur: "", irk: "" }));
      setSeciliSahipHayvanId("");
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Hasta kaydı açılamadı.");
      akisEkle({
        baslik: "Hasta kaydı açılamadı",
        detay: "Kayıt sırasında bir hata oluştu.",
        durum: "err",
      });
    } finally {
      setHastaKaydiKaydediliyor(false);
    }
  }

  async function veterinerHastaSil(hayvanId: number, kalici: boolean) {
    if (!token) return;
    if (!kalici) {
      const onay = window.confirm("Bu hayvani veteriner havuzunda pasife almak istiyor musun?");
      if (!onay) return;
    } else {
      const metin = (window.prompt("Kalici silme icin SİL yaz:") || "").trim();
      const normalize = metin.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/İ/g, "I");
      if (normalize !== "SIL") {
        setIslemMesaji("Kalici silme iptal edildi. Onay metni gecersiz.");
        return;
      }
    }

    setHastaSilinenId(hayvanId);
    try {
      await apiPatch(`/api/v1/veteriner/hastalar/${hayvanId}/sil`, token, {
        kalici,
        onay_metni: kalici ? "SİL" : null,
      });
      setIslemMesaji(kalici ? "Hasta kaydi kalici olarak silindi." : "Hasta kaydi pasife alindi.");
      setSeciliSahipHayvanId("");
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Hasta silme işlemi başarısız.");
    } finally {
      setHastaSilinenId(null);
    }
  }

  async function hizliSahipOlustur() {
    if (!token) return;
    setHizliSahipKaydediliyor(true);
    try {
      const cevap = await apiPost<{ sahip: { id: string; ad: string; soyad: string; telefon: string } }>(
        "/api/v1/veteriner/sahipler/hizli-kayit",
        token,
        {
          ad: hizliSahipForm.ad,
          soyad: hizliSahipForm.soyad,
          telefon: hizliSahipForm.telefon,
          eposta: hizliSahipForm.eposta || null,
        }
      );
      setIslemMesaji("Yeni sahip kaydı açıldı. Sahip seçimi otomatik yapıldı.");
      setHastaForm((x) => ({ ...x, sahibi_id: cevap.sahip.id }));
      setHizliSahipForm({ ad: "", soyad: "", telefon: "", eposta: "" });
      setSahipArama(`${cevap.sahip.ad} ${cevap.sahip.soyad}`);
      akisEkle({
        baslik: "Yeni sahip oluşturuldu",
        detay: `${cevap.sahip.ad} ${cevap.sahip.soyad} (${cevap.sahip.telefon}) kaydedildi.`,
        durum: "ok",
      });
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Yeni sahip kaydı oluşturulamadı.");
      akisEkle({
        baslik: "Yeni sahip kaydı başarısız",
        detay: "Hızlı sahip kaydı tamamlanamadı.",
        durum: "err",
      });
    } finally {
      setHizliSahipKaydediliyor(false);
    }
  }

  async function saglikKaydiEkle(e: FormEvent) {
    e.preventDefault();
    if (!token || !seciliHayvanId) return;
    try {
      await apiPost(`/api/v1/veteriner/hastalar/${seciliHayvanId}/saglik-kayitlari`, token, {
        islem_turu: saglikForm.islem_turu,
        tani_notu: saglikForm.tani_notu,
        islem_tarihi: new Date(saglikForm.islem_tarihi).toISOString(),
      });
      const hayvanAdi = hastalar.find((x) => x.id === seciliHayvanId)?.ad || `#${seciliHayvanId}`;
      setIslemMesaji("Sağlık kaydı eklendi.");
      akisEkle({
        baslik: "Sağlık kaydı işlendi",
        detay: `${hayvanAdi} için ${saglikForm.islem_turu} kaydı eklendi.`,
        durum: "ok",
      });
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Sağlık kaydı eklenemedi.");
      akisEkle({
        baslik: "Sağlık kaydı başarısız",
        detay: "İşlem tamamlanamadı.",
        durum: "err",
      });
    }
  }

  async function asiKaydiEkle(e: FormEvent) {
    e.preventDefault();
    if (!token || !seciliHayvanId) return;
    try {
      await apiPost(`/api/v1/veteriner/hastalar/${seciliHayvanId}/asilar`, token, {
        asi_adi: asiForm.asi_adi,
        uygulama_tarihi: asiForm.uygulama_tarihi,
        tekrar_gun_sayisi: Number(asiForm.tekrar_gun_sayisi),
        notlar: asiForm.notlar,
      });
      const hayvanAdi = hastalar.find((x) => x.id === seciliHayvanId)?.ad || `#${seciliHayvanId}`;
      setIslemMesaji("Aşı kaydı eklendi.");
      akisEkle({
        baslik: "Aşı kaydı işlendi",
        detay: `${hayvanAdi} için ${asiForm.asi_adi} aşı kaydı eklendi.`,
        durum: "ok",
      });
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Aşı kaydı eklenemedi.");
      akisEkle({
        baslik: "Aşı kaydı başarısız",
        detay: "Aşı kaydı işlenemedi.",
        durum: "err",
      });
    }
  }

  async function receteKaydiEkle(e: FormEvent) {
    e.preventDefault();
    if (!token || !seciliHayvanId) return;
    try {
      await apiPost(`/api/v1/veteriner/hastalar/${seciliHayvanId}/receteler`, token, {
        tani: receteForm.tani || null,
        recete_metni: receteForm.recete_metni,
        ilaclar: receteForm.ilac_adi
          ? [
              {
                ilac_adi: receteForm.ilac_adi,
                doz: receteForm.doz || null,
                kullanim_sikligi: receteForm.kullanim_sikligi || null,
                sure_gun: Number(receteForm.sure_gun || 0) || null,
                notlar: receteForm.notlar || null,
              },
            ]
          : [],
      });
      const hayvanAdi = hastalar.find((x) => x.id === seciliHayvanId)?.ad || `#${seciliHayvanId}`;
      setIslemMesaji("Recete kaydi eklendi.");
      akisEkle({
        baslik: "Recete kaydi islendi",
        detay: `${hayvanAdi} icin recete olusturuldu.`,
        durum: "ok",
      });
      setReceteForm({
        tani: "",
        recete_metni: "",
        ilac_adi: "",
        doz: "",
        kullanim_sikligi: "",
        sure_gun: "7",
        notlar: "",
      });
      await yenile();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Recete kaydi eklenemedi.");
      akisEkle({
        baslik: "Recete kaydi basarisiz",
        detay: "Recete kaydi islenemedi.",
        durum: "err",
      });
    }
  }

  async function kimlikDetayGetir(hayvanId: string) {
    if (!token || !hayvanId) return;
    try {
      const kimlikCevap = await apiGet<{ kimlik: Kimlik }>(`/api/v1/veteriner/hastalar/${hayvanId}/kimlik`, token);
      setKimlikDetay(kimlikCevap.kimlik || null);
    } catch (err) {
      setKimlikDetay(null);
      setIslemMesaji(err instanceof Error ? err.message : "Kimlik bilgisi alinamadi.");
    }
  }

  if (yukleniyor) return <Durum mesaj="Veteriner paneli yükleniyor..." />;
  if (hata) return <Durum mesaj={hata} hata />;
  if (!profil) return <Durum mesaj="Profil bulunamadı." hata />;

  const onayliRandevu = randevular.filter((x) => x.durum === "onaylandi").length;
  const geldiRandevu = randevular.filter((x) => x.durum === "geldi").length;
  const muayenedeRandevu = randevular.filter((x) => x.durum === "muayenede").length;
  const noShowRandevu = randevular.filter((x) => x.durum === "no_show").length;
  const bekleyenRandevu = randevular.filter((x) => x.durum === "beklemede").length;
  const tamamlananRandevu = randevular.filter((x) => x.durum === "tamamlandi").length;
  const takvimOzeti = Object.entries(
    randevular.reduce<Record<string, number>>((acc, x) => {
      acc[x.randevu_tarihi] = (acc[x.randevu_tarihi] || 0) + 1;
      return acc;
    }, {})
  ).sort(([a], [b]) => (a < b ? -1 : 1));
  const filtreliRandevular = randevular.filter((x) =>
    `${x.randevu_tarihi} ${x.randevu_saati}`.toLowerCase().includes(globalArama.toLowerCase())
  );
  const bugunTarih = new Date().toISOString().slice(0, 10);
  const bugunRandevuSayisi = randevular.filter((x) => x.randevu_tarihi === bugunTarih && (x.durum === "beklemede" || x.durum === "onaylandi" || x.durum === "geldi" || x.durum === "muayenede")).length;
  const acilAksiyonSayisi = randevular.filter((x) => x.randevu_tarihi === bugunTarih && x.durum === "beklemede").length;
  const siradakiRandevu = [...randevular]
    .filter((x) => x.durum === "beklemede" || x.durum === "onaylandi" || x.durum === "geldi" || x.durum === "muayenede")
    .sort((a, b) => `${a.randevu_tarihi} ${a.randevu_saati}`.localeCompare(`${b.randevu_tarihi} ${b.randevu_saati}`))[0];
  const gosterilenRandevular = (randevuListeFiltresi === "tum"
    ? filtreliRandevular
    : filtreliRandevular.filter((x) => x.durum === randevuListeFiltresi)
  )
    .sort((a, b) => {
      const oncelikFarki = aiOncelikSirasi(a.ai_oncelik) - aiOncelikSirasi(b.ai_oncelik);
      if (oncelikFarki !== 0) return oncelikFarki;
      return `${a.randevu_tarihi} ${a.randevu_saati}`.localeCompare(`${b.randevu_tarihi} ${b.randevu_saati}`);
    })
    .slice(0, 12);
  const yaklasanTakipler = (() => {
    const bugun = new Date();
    const bugunBaslangic = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate()));
    return randevular
      .filter((x) => x.muayene_ozeti?.takip_kontrol_tarihi)
      .map((x) => {
        const takipTarih = String(x.muayene_ozeti?.takip_kontrol_tarihi || "");
        const takipNesne = new Date(`${takipTarih}T00:00:00Z`);
        const farkGun = Math.floor((takipNesne.getTime() - bugunBaslangic.getTime()) / 86400000);
        return { randevu: x, farkGun };
      })
      .filter((x) => x.farkGun >= 0 && x.farkGun <= 7)
      .sort((a, b) => a.farkGun - b.farkGun)
      .slice(0, 8);
  })();
  const randevuToplamSayfa = Math.max(1, Math.ceil(toplamRandevu / 8));
  const randevuAktifSayfa = Math.min(randevuSayfa, randevuToplamSayfa);

  return (
    <PanelShell
      rol="Veteriner"
      adSoyad={`${profil.ad} ${profil.soyad}`}
      menu={[
        { id: "dashboard", etiket: "Gösterge", aciklama: "Genel görünüm", ikon: <LayoutDashboard size={15} /> },
        { id: "kayit", etiket: "Kayıt İşlemleri", aciklama: "Hasta/sağlık/aşı", ikon: <Stethoscope size={15} /> },
        { id: "randevu", etiket: "Randevular", aciklama: "Onay/iptal/tamamla", ikon: <CalendarClock size={15} /> },
        { id: "kimlik", etiket: "Dijital Kimlik", aciklama: "Hasta kimlik kartı", ikon: <IdCard size={15} /> },
        { id: "mesaj", etiket: "Mesajlar", aciklama: "Canlı sohbet", ikon: <MessageSquare size={15} /> },
        { id: "bildirim", etiket: "Bildirimler", aciklama: "Tüm uyarılar", ikon: <Bell size={15} /> },
        { id: "iletisim", etiket: "İletişim Merkezi", aciklama: "WhatsApp geçmişi ve şablonlar", ikon: <MessageSquare size={15} /> },
      ]}
      aktifMenu={aktifMenu}
      menuDegistir={setAktifMenu}
      aramaDegeri={globalArama}
      aramaDegistir={setGlobalArama}
      aramaPlaceholder="Tarih, saat veya kayıt ara"
      token={token}
      kullaniciId={profil.id}
      kartlar={[
        { baslik: "Randevu", deger: String(randevular.length), aciklama: `Onaylı ${onayliRandevu} / Geldi ${geldiRandevu} / Muayenede ${muayenedeRandevu}` },
        { baslik: "Yaklaşan Aşılar", deger: String(yaklasanAsilar.length), aciklama: "7 gün içinde planlı işlem" },
        { baslik: "Hasta Havuzu", deger: String(hastalar.length), aciklama: "Takip edilen toplam hasta" },
      ]}
    >
      {veriYukleniyor ? <Durum mesaj="Panel verileri yükleniyor..." /> : null}
      {veriHatasi ? <Durum mesaj={veriHatasi} hata /> : null}
      {islemMesaji ? <Durum mesaj={islemMesaji} /> : null}
      {sonAksiyon ? <div className="aksiyon-durum-bandi">Son aksiyon: {sonAksiyon}</div> : null}
      <CommandCenter
        title="Klinik Operasyon Komut Merkezi"
        subtitle="Günün hasta akışında en çok kullanılan aksiyonlar: kayıt, randevu işleme ve kimlik kontrol."
        badge={`${bekleyenRandevu} bekleyen / ${noShowRandevu} no-show`}
        actions={[
          {
            id: "vet-quick-patient",
            label: "Hasta Kaydı Aç",
            description: "Sahip seçip yeni veya mevcut hayvanı havuza ekle.",
            icon: <Stethoscope size={14} />,
            onClick: () => {
              setKayitSekme("hasta");
              setAktifMenu("kayit");
            },
          },
          {
            id: "vet-quick-appointments",
            label: "Bekleyen Randevular",
            description: "Onayla, iptal et veya tamamla.",
            icon: <CalendarClock size={14} />,
            onClick: () => {
              setRandevuListeFiltresi("beklemede");
              setAktifMenu("randevu");
            },
          },
          {
            id: "vet-quick-id",
            label: "Kimlik Kontrol",
            description: "Seçili hasta kimliğini ve QR doğrulama bilgilerini aç.",
            icon: <IdCard size={14} />,
            onClick: () => setAktifMenu("kimlik"),
          },
        ]}
      />
      {islemAkisi.length > 0 ? (
        <article className="kart bolum-kart">
          <h3 className="bolum-baslik">İşlem Akışı</h3>
          <div className="zaman-cizelgesi">
            {islemAkisi.slice(0, 6).map((x) => (
              <div className="zaman-cizelgesi-item" key={x.id}>
                <div className="zaman-cizelgesi-ust">
                  <strong>{x.baslik}</strong>
                  <span className={`durum-rozeti ${x.durum === "ok" ? "durum-onay" : x.durum === "warn" ? "durum-bekle" : "durum-iptal"}`}>
                    {x.durum === "ok" ? "başarılı" : x.durum === "warn" ? "uyarı" : "hata"}
                  </span>
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{x.detay}</div>
                <div className="zaman-cizelgesi-zaman">{new Date(x.zaman).toLocaleString("tr-TR")}</div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {aktifMenu === "dashboard" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <section className="vet-vurgu-grid">
            <article className="kart vet-vurgu-kart" data-tip="bilgi">
              <h4>Siradaki Randevu</h4>
              {siradakiRandevu ? (
                <>
                  <p>
                    <strong>{siradakiRandevu.hayvan?.ad || "Hayvan"}</strong>{" "}
                    / {siradakiRandevu.sahip ? `${siradakiRandevu.sahip.ad} ${siradakiRandevu.sahip.soyad}` : "Sahip bilinmiyor"}
                  </p>
                  <small>{siradakiRandevu.randevu_tarihi} {siradakiRandevu.randevu_saati} - {siradakiRandevu.durum}</small>
                </>
              ) : (
                <p>Aktif randevu yok.</p>
              )}
            </article>
            <article className="kart vet-vurgu-kart" data-tip="warn">
              <h4>Bugun Gelecekler</h4>
              <p className="vet-vurgu-sayi">{bugunRandevuSayisi}</p>
              <small>Bugune planli aktif randevu</small>
            </article>
            <article className="kart vet-vurgu-kart" data-tip="ok">
              <h4>Takipteki Hasta</h4>
              <p className="vet-vurgu-sayi">{hastalar.length}</p>
              <small>Aktif klinik takibindeki hayvanlar</small>
            </article>
          </section>
          <div className="hizli-aksiyon-grid klinik-hizli-aksiyon">
            <article className="kart hizli-aksiyon">
              <h4>Yeni hasta ac</h4>
              <p>Hasta kartini baslatip islemleri tek akista devam ettir.</p>
              <button className="satir-dugme" onClick={() => { setKayitSekme("hasta"); setAktifMenu("kayit"); }}>Hasta Kaydına Git</button>
            </article>
            <article className="kart hizli-aksiyon">
              <h4>Bekleyenleri yonet</h4>
              <p>Onay bekleyen randevulari acip hizli isleme al.</p>
              <button className="satir-dugme" onClick={() => { setRandevuSayfa(1); setRandevuDurumFiltre("beklemede"); setAktifMenu("randevu"); }}>
                Bekleyenleri Aç
              </button>
            </article>
            <article className="kart hizli-aksiyon">
              <h4>Mesaj kutusunu ac</h4>
              <p>Hasta sahibine bilgilendirme ve takip mesaji gonder.</p>
              <button className="satir-dugme" onClick={() => setAktifMenu("mesaj")}>Mesaj Alanına Git</button>
            </article>
          </div>
          <article className="kart bolum-kart">
            <div className="randevu-baslik-satiri">
              <h3 className="bolum-baslik" style={{ marginBottom: 0 }}>Bugün Operasyon Listesi</h3>
              <button className="satir-dugme" onClick={() => { setGlobalArama(new Date().toISOString().slice(0, 10)); setAktifMenu("randevu"); }}>
                Bugunu Filtrele
              </button>
            </div>
            <table className="tablo">
              <thead><tr><th>Hayvan</th><th>Sahip</th><th>Tarih</th><th>Saat</th><th>Durum</th><th>Detay</th></tr></thead>
              <tbody>{randevular.slice(0, 8).map((x) => <tr key={x.id}><td>{x.hayvan?.ad || "-"}</td><td>{x.sahip ? `${x.sahip.ad} ${x.sahip.soyad}` : "-"}</td><td>{x.randevu_tarihi}</td><td>{x.randevu_saati}</td><td><DurumRozeti durum={x.durum} /></td><td><button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Randevu Detayı", veri: x })}>İncele</button></td></tr>)}</tbody>
            </table>
          </article>
          <div className="panel-grid-2">
          <SectionCard title="Sağlık İş Yükü" subtitle="Yaklaşan aşı işlemleri ve takip listesi.">
            <table className="tablo">
              <thead><tr><th>Hayvan</th><th>İşlem</th><th>Kalan Gün</th></tr></thead>
              <tbody>{yaklasanAsilar.slice(0, 8).map((x) => <tr key={x.id}><td>{x.hayvan_adi || "-"}</td><td>{x.islem_turu}</td><td>{x.kalan_gun}</td></tr>)}</tbody>
            </table>
          </SectionCard>
          <article className="kart randevu-ozet-kart bolum-kart">
            <h3 className="bolum-baslik">Acil Kasa</h3>
            <div className="randevu-ozet-liste">
              <div><strong>Acil aksiyon:</strong> {acilAksiyonSayisi}</div>
              <div><strong>Bugun planli:</strong> {bugunRandevuSayisi}</div>
              <div><strong>Bekleyen:</strong> {bekleyenRandevu}</div>
            </div>
            <button className="satir-dugme" onClick={() => { setRandevuListeFiltresi("beklemede"); setAktifMenu("randevu"); }}>
              Bekleyen Akisina Git
            </button>
          </article>
          </div>
          <article className="kart bolum-kart">
            <h3 className="bolum-baslik">Klinik İşlem Akışı</h3>
            <div className="zaman-cizelgesi">
              {(islemAkisi.length > 0 ? islemAkisi : randevular.slice(0, 5).map((x) => ({
                id: `r-${x.id}`,
                baslik: `${x.randevu_tarihi} ${x.randevu_saati}`,
                detay: `Randevu #${x.id} - ${x.hayvan?.ad || "Hayvan"}`,
                durum: x.durum === "onaylandi" || x.durum === "tamamlandi" ? "ok" : x.durum === "beklemede" ? "warn" : "err",
                zaman: new Date().toISOString(),
              }))).slice(0, 6).map((x) => (
                <div className="zaman-cizelgesi-item" key={x.id}>
                  <div className="zaman-cizelgesi-ust">
                    <strong>{x.baslik}</strong>
                    <span className={`durum-rozeti ${x.durum === "ok" ? "durum-onay" : x.durum === "warn" ? "durum-bekle" : "durum-iptal"}`}>
                      {x.durum === "ok" ? "basarili" : x.durum === "warn" ? "uyari" : "hata"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{x.detay}</div>
                  <div className="zaman-cizelgesi-zaman">{new Date(x.zaman).toLocaleString("tr-TR")}</div>
                </div>
              ))}
            </div>
          </article>
          <div className="hizli-aksiyon-grid">
            <article className="kart hizli-aksiyon">
              <h4>Sağlık kaydı işle</h4>
              <p>Muayene veya kontrol notunu sisteme işle.</p>
              <button className="satir-dugme" onClick={() => { setKayitSekme("saglik"); setAktifMenu("kayit"); }}>Sağlık Kaydı Aç</button>
            </article>
            <article className="kart hizli-aksiyon">
              <h4>Aşı işlemi yap</h4>
              <p>Aşı takvimi ve tekrar gün planını oluştur.</p>
              <button className="satir-dugme" onClick={() => { setKayitSekme("asi"); setAktifMenu("kayit"); }}>Aşı Kaydına Git</button>
            </article>
          </div>
        </div>
      ) : null}

      {aktifMenu === "kayit" ? (
        <article className="kart bolum-kart">
          <h3 className="bolum-baslik">Kayıt İşlemleri</h3>
          <div className="sekme-grup">
            <button className="sekme-dugme" data-active={kayitSekme === "hasta"} onClick={() => setKayitSekme("hasta")}>
              <Stethoscope size={15} /> Hasta
            </button>
            <button className="sekme-dugme" data-active={kayitSekme === "saglik"} onClick={() => setKayitSekme("saglik")}>
              <ShieldPlus size={15} /> Sağlık
            </button>
            <button className="sekme-dugme" data-active={kayitSekme === "asi"} onClick={() => setKayitSekme("asi")}>
              <Syringe size={15} /> Aşı
            </button>
            <button className="sekme-dugme" data-active={kayitSekme === "recete"} onClick={() => setKayitSekme("recete")}>
              <ShieldPlus size={15} /> Recete
            </button>
          </div>

          {kayitSekme === "hasta" ? (
            <form className="form-grid" onSubmit={hastaKaydiAc}>
              <input
                className="girdi"
                placeholder="Sahip ara: ad, soyad, telefon, hayvan adı, kimlik no, DP-USER"
                value={sahipArama}
                onChange={(e) => setSahipArama(e.target.value)}
              />
              <div className="alan-yardim" data-valid={String(Boolean(hastaForm.sahibi_id))}>
                {sahipAramaYukleniyor ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                {sahipAramaYukleniyor
                  ? "Sahip arama sonuçları yükleniyor..."
                  : hastaForm.sahibi_id
                    ? "Sahip seçildi. Alt listede hayvanları otomatik açıldı."
                    : "Önce doğru hayvan sahibini kartlardan seç."}
              </div>
              <div className="sahip-kart-grid">
                {sahipler.map((x) => (
                  <button
                    type="button"
                    key={x.id}
                    className="sahip-kart"
                    data-active={hastaForm.sahibi_id === x.id}
                    onClick={() => {
                      setHastaForm((f) => ({ ...f, sahibi_id: x.id, ad: "", tur: "", irk: "" }));
                      setSeciliSahipHayvanId("");
                    }}
                  >
                    <div className="sahip-kart-ust">
                      <strong>{x.ad} {x.soyad}</strong>
                      <span className="durum-rozeti durum-bekle">{x.durapet_user_id || "DP-USER-YOK"}</span>
                    </div>
                    <div className="sahip-kart-alt">
                      <span>Telefon: {telefonMaskele(x.telefon)}</span>
                      <span>Hayvanlar: {(x.hayvanlar || []).slice(0, 3).map((h) => `${h.ad} (${h.tur})`).join(", ") || "-"}</span>
                      <span>Son ziyaret: {x.son_ziyaret_tarihi || "-"}</span>
                    </div>
                  </button>
                ))}
                {!sahipAramaYukleniyor && sahipler.length === 0 ? (
                  <div className="onboarding-kart">
                    <h4>Kullanıcı bulunamadı</h4>
                    <p>Arama kriterine uygun sahip yok. Hızlı sahip kaydı açabilirsin.</p>
                  </div>
                ) : null}
              </div>
              {!sahipAramaYukleniyor && sahipler.length === 0 ? (
                <article className="onboarding-kart">
                  <h4>Hızlı Yeni Sahip Oluştur</h4>
                  <div className="form-grid">
                    <input className="girdi" placeholder="Ad" value={hizliSahipForm.ad} onChange={(e) => setHizliSahipForm((x) => ({ ...x, ad: e.target.value }))} required />
                    <input className="girdi" placeholder="Soyad" value={hizliSahipForm.soyad} onChange={(e) => setHizliSahipForm((x) => ({ ...x, soyad: e.target.value }))} required />
                    <input className="girdi" placeholder="Telefon (benzersiz)" value={hizliSahipForm.telefon} onChange={(e) => setHizliSahipForm((x) => ({ ...x, telefon: e.target.value }))} required />
                    <input className="girdi" placeholder="E-posta (opsiyonel)" value={hizliSahipForm.eposta} onChange={(e) => setHizliSahipForm((x) => ({ ...x, eposta: e.target.value }))} />
                    <button className="satir-dugme" type="button" onClick={() => void hizliSahipOlustur()} disabled={hizliSahipKaydediliyor}>
                      {hizliSahipKaydediliyor ? "Kaydediliyor..." : "Yeni Sahip Oluştur"}
                    </button>
                  </div>
                </article>
              ) : null}
              <select
                className="girdi"
                value={seciliSahipHayvanId}
                onChange={(e) => {
                  const yeniId = e.target.value;
                  setSeciliSahipHayvanId(yeniId);
                  if (!yeniId) return;
                  const secili = sahipHayvanlari.find((h) => String(h.id) === yeniId);
                  if (!secili) return;
                  setHastaForm((x) => ({
                    ...x,
                    ad: secili.ad || "",
                    tur: secili.tur || "",
                    irk: secili.irk || "",
                  }));
                }}
              >
                <option value="">Yeni hayvan oluştur (manuel doldur)</option>
                {sahipHayvanlari.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ad} - {x.tur}{x.irk ? ` / ${x.irk}` : ""}{x.son_randevu_durumu ? ` | Randevu: ${x.son_randevu_durumu}` : ""}
                  </option>
                ))}
              </select>
              {!sahipHayvanYukleniyor && sahipHayvanlari.length > 0 ? (
                <div className="onboarding-kart">
                  <h4>Sahibe Ait Hayvanlar</h4>
                  <table className="tablo">
                    <thead><tr><th>Ad</th><th>Tur/Irk</th><th>Randevu</th><th>Sec</th></tr></thead>
                    <tbody>
                      {sahipHayvanlari.map((x) => (
                        <tr key={`sahip-hayvan-${x.id}`}>
                          <td>{x.ad}</td>
                          <td>{x.tur} / {x.irk || "-"}</td>
                          <td>{x.son_randevu_durumu || "-"}</td>
                          <td>
                            <button
                              type="button"
                              className="satir-dugme"
                              onClick={() => {
                                setSeciliSahipHayvanId(String(x.id));
                                setHastaForm((f) => ({ ...f, ad: x.ad || "", tur: x.tur || "", irk: x.irk || "" }));
                              }}
                            >
                              Seç
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="alan-yardim" data-valid={String(Boolean(seciliSahipHayvanId) || sahipHayvanlari.length > 0)}>
                {sahipHayvanYukleniyor ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                {sahipHayvanYukleniyor
                  ? "Sahibin hayvanları yükleniyor..."
                  : seciliSahipHayvanId
                    ? "Mevcut hayvan seçildi. Kayıt oluşturmadan havuza eklenecek."
                    : "Sahibin hayvanı varsa seçerek otomatik doldurabilir veya manuel giriş yapabilirsin."}
              </div>
              {seciliSahipHayvanId ? (
                <article className="onboarding-kart vet-detay-kart">
                  {(() => {
                    const secili = sahipHayvanlari.find((h) => String(h.id) === seciliSahipHayvanId);
                    if (!secili) return <p>Hayvan detayi bulunamadi.</p>;
                    return (
                      <>
                        <h4>{secili.ad} - Klinik Özet</h4>
                        <p><strong>Tür/Irk:</strong> {secili.tur} / {secili.irk || "-"}</p>
                        <p><strong>Kimlik No:</strong> {secili.kimlik_no || "-"}</p>
                        <p><strong>Son Randevu:</strong> {secili.son_randevu_durumu ? `${secili.son_randevu_durumu} (${secili.son_randevu_tarihi || "-"} ${secili.son_randevu_saati || ""})` : "Kayıt yok"}</p>
                        <p><strong>Son Sağlık İşlemi:</strong> {secili.son_saglik_islem_turu || "-"} {secili.son_saglik_tarihi ? `(${new Date(secili.son_saglik_tarihi).toLocaleString("tr-TR")})` : ""}</p>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button className="satir-dugme" disabled={hastaSilinenId === secili.id} onClick={() => void veterinerHastaSil(secili.id, false)}>
                            {hastaSilinenId === secili.id ? "Isleniyor..." : "Pasife Al"}
                          </button>
                          <button className="satir-dugme" disabled={hastaSilinenId === secili.id} onClick={() => void veterinerHastaSil(secili.id, true)}>
                            {hastaSilinenId === secili.id ? "Isleniyor..." : "Kalici Sil"}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </article>
              ) : null}
              <article className="onboarding-kart vet-detay-kart">
                <h4>Seçili Hayvanın Dijital Dosyası</h4>
                {seciliHayvanOzetYukleniyor ? (
                  <p>Kayıtlar yükleniyor...</p>
                ) : (
                  <>
                    <p><strong>Kimlik No:</strong> {seciliHayvanKimlik?.benzersiz_kimlik_no || "-"}</p>
                    <p>
                      <strong>Kimlik PDF:</strong>{" "}
                      {seciliHayvanKimlik?.pdf_erisim_url || seciliHayvanKimlik?.pdf_url ? (
                        <a href={seciliHayvanKimlik?.pdf_erisim_url || seciliHayvanKimlik?.pdf_url || "#"} target="_blank" rel="noreferrer">
                          Ac
                        </a>
                      ) : (
                        "-"
                      )}
                    </p>
                    <p><strong>Son İşlem:</strong> {seciliHayvanGecmisi[0]?.islem_turu || "-"}</p>
                    <div className="zaman-cizelgesi">
                      {seciliHayvanGecmisi.slice(0, 4).map((k) => (
                        <div className="zaman-cizelgesi-item" key={`kayit-${k.id}`}>
                          <div className="zaman-cizelgesi-ust">
                            <strong>{k.islem_turu}</strong>
                            <span className="zaman-cizelgesi-zaman">{new Date(k.islem_tarihi).toLocaleString("tr-TR")}</span>
                          </div>
                        </div>
                      ))}
                      {seciliHayvanGecmisi.length === 0 ? <div className="zaman-cizelgesi-zaman">Kayıt bulunamadı.</div> : null}
                    </div>
                    <h4 style={{ marginTop: 10 }}>Aşı Geçmişi</h4>
                    <table className="tablo vet-asi-tablosu">
                      <thead><tr><th>Aşı</th><th>Tarih</th><th>Tekrar</th></tr></thead>
                      <tbody>
                        {seciliHayvanAsiGecmisi.slice(0, 5).map((a) => (
                          <tr key={`asi-${a.id}`}>
                            <td>{a.asi_adi}</td>
                            <td>{a.uygulama_tarihi}</td>
                            <td>{a.tekrar_gun_sayisi} gun</td>
                          </tr>
                        ))}
                        {seciliHayvanAsiGecmisi.length === 0 ? <tr><td colSpan={3}>Aşı kaydı bulunamadı.</td></tr> : null}
                      </tbody>
                    </table>
                  </>
                )}
              </article>
              <input className="girdi" placeholder="Hayvan adi" value={hastaForm.ad} onChange={(e) => setHastaForm((x) => ({ ...x, ad: e.target.value }))} required disabled={Boolean(seciliSahipHayvanId)} />
              <div className="alan-yardim" data-valid={String(hastaForm.ad.trim().length >= 2)}>
                {hastaForm.ad.trim().length >= 2 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                Ad alani en az 2 karakter olmali.
              </div>
              <input className="girdi" placeholder="Tur" value={hastaForm.tur} onChange={(e) => setHastaForm((x) => ({ ...x, tur: e.target.value }))} required disabled={Boolean(seciliSahipHayvanId)} />
              <div className="alan-yardim" data-valid={String(hastaForm.tur.trim().length >= 2)}>
                {hastaForm.tur.trim().length >= 2 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                Ornek: kedi, kopek, kus.
              </div>
              <input className="girdi" placeholder="Irk" value={hastaForm.irk} onChange={(e) => setHastaForm((x) => ({ ...x, irk: e.target.value }))} disabled={Boolean(seciliSahipHayvanId)} />
              <div className="alan-yardim" data-valid="true">
                <AlertCircle size={14} />
                Bu adım randevuyu tamamlamaz. Sadece hasta havuzuna ekler; işlem girişi bir sonraki sekmededir.
              </div>
              <button className="dugme dugme-ana" type="submit" disabled={hastaKaydiKaydediliyor || !hastaForm.sahibi_id}>
                {hastaKaydiKaydediliyor
                  ? "Kaydediliyor..."
                  : seciliSahipHayvanId
                    ? "Seçili Hayvanı Havuza Ekle"
                    : "Hasta Kaydı Oluştur"}
              </button>
            </form>
          ) : null}

          {kayitSekme === "saglik" ? (
            <form className="form-grid" onSubmit={saglikKaydiEkle}>
              <select className="girdi" value={seciliHayvanId ?? ""} onChange={(e) => setSeciliHayvanId(Number(e.target.value))}>
                <option value="">Hayvan seç</option>{hastalar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
              </select>
              <input className="girdi" placeholder="İşlem türü" value={saglikForm.islem_turu} onChange={(e) => setSaglikForm((x) => ({ ...x, islem_turu: e.target.value }))} />
              <input className="girdi" type="datetime-local" value={saglikForm.islem_tarihi} onChange={(e) => setSaglikForm((x) => ({ ...x, islem_tarihi: e.target.value }))} />
              <button className="dugme dugme-ana" type="submit">Sağlık Kaydını İşle</button>
            </form>
          ) : null}

          {kayitSekme === "asi" ? (
            <form className="form-grid" onSubmit={asiKaydiEkle}>
              <input className="girdi" placeholder="Aşı adı" value={asiForm.asi_adi} onChange={(e) => setAsiForm((x) => ({ ...x, asi_adi: e.target.value }))} />
              <input className="girdi" type="date" value={asiForm.uygulama_tarihi} onChange={(e) => setAsiForm((x) => ({ ...x, uygulama_tarihi: e.target.value }))} />
              <input className="girdi" type="number" value={asiForm.tekrar_gun_sayisi} onChange={(e) => setAsiForm((x) => ({ ...x, tekrar_gun_sayisi: e.target.value }))} />
              <button className="dugme dugme-ana" type="submit">Aşı Kaydını İşle</button>
            </form>
          ) : null}
          {kayitSekme === "recete" ? (
            <form className="form-grid" onSubmit={receteKaydiEkle}>
              <select className="girdi" value={seciliHayvanId ?? ""} onChange={(e) => setSeciliHayvanId(Number(e.target.value))}>
                <option value="">Hayvan sec</option>{hastalar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
              </select>
              <input className="girdi" placeholder="Tani (opsiyonel)" value={receteForm.tani} onChange={(e) => setReceteForm((x) => ({ ...x, tani: e.target.value }))} />
              <textarea className="girdi" rows={3} placeholder="Recete metni" value={receteForm.recete_metni} onChange={(e) => setReceteForm((x) => ({ ...x, recete_metni: e.target.value }))} required />
              <input className="girdi" placeholder="Ilac adi (opsiyonel kalem)" value={receteForm.ilac_adi} onChange={(e) => setReceteForm((x) => ({ ...x, ilac_adi: e.target.value }))} />
              <input className="girdi" placeholder="Doz" value={receteForm.doz} onChange={(e) => setReceteForm((x) => ({ ...x, doz: e.target.value }))} />
              <input className="girdi" placeholder="Kullanim sikligi" value={receteForm.kullanim_sikligi} onChange={(e) => setReceteForm((x) => ({ ...x, kullanim_sikligi: e.target.value }))} />
              <input className="girdi" type="number" placeholder="Sure (gun)" value={receteForm.sure_gun} onChange={(e) => setReceteForm((x) => ({ ...x, sure_gun: e.target.value }))} />
              <input className="girdi" placeholder="Ilac notu" value={receteForm.notlar} onChange={(e) => setReceteForm((x) => ({ ...x, notlar: e.target.value }))} />
              <button className="dugme dugme-ana" type="submit">Recete Kaydini Isle</button>
            </form>
          ) : null}
        </article>
      ) : null}

      {aktifMenu === "randevu" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <article className="kart bolum-ust">
            <div>
              <h3 className="bolum-ust-baslik">Randevu Yönetimi</h3>
              <p className="bolum-ust-metin">Bekleyenden muayeneye, muayeneden tamamlanmaya kadar tüm klinik adımları tek akıştan yönet.</p>
            </div>
          </article>
          <div className="oncelik-grid">
            <article className="kart oncelik-kart" data-tip="acil">
              <div className="oncelik-kart-baslik"><CircleAlert size={16} /> Oncelikli Islem</div>
              <div className="oncelik-kart-deger">{bekleyenRandevu}</div>
              <p>Onay bekleyen randevular. Klinik akisina etki eden ana kuyruk.</p>
            </article>
            <article className="kart oncelik-kart" data-tip="bugun">
              <div className="oncelik-kart-baslik"><CalendarCheck2 size={16} /> Bugun</div>
              <div className="oncelik-kart-deger">{bugunRandevuSayisi}</div>
              <p>Bugune planli aktif randevu adedi.</p>
            </article>
            <article className="kart oncelik-kart" data-tip="bekleyen">
              <div className="oncelik-kart-baslik"><AlarmClock size={16} /> Muayenede</div>
              <div className="oncelik-kart-deger">{muayenedeRandevu}</div>
              <p>Aktif muayenesi devam eden randevu sayisi.</p>
            </article>
          </div>
          {yaklasanTakipler.length > 0 ? (
            <article className="kart bolum-kart">
              <h3 className="bolum-baslik">Yaklaşan Takip Kontrolleri (7 gün)</h3>
              <div className="randevu-timeline-grid">
                {yaklasanTakipler.map(({ randevu, farkGun }) => (
                  <div key={`takip-${randevu.id}`} className="randevu-timeline-item">
                    <div className="randevu-timeline-dot" />
                    <div>
                      <strong>{randevu.hayvan?.ad || "-"}</strong>
                      <p>
                        Takip: {randevu.muayene_ozeti?.takip_kontrol_tarihi || "-"} - {farkGun === 0 ? "Bugün" : `${farkGun} gün kaldı`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
          <article className="kart bolum-kart">
            <div className="randevu-baslik-satiri">
              <h3 className="bolum-baslik" style={{ marginBottom: 0 }}>Randevu Akışı</h3>
              <div className="randevu-filtre-grup">
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "tum"} onClick={() => randevuFiltreSec("tum")}>Tüm</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "beklemede"} onClick={() => randevuFiltreSec("beklemede")}>Beklemede</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "onaylandi"} onClick={() => randevuFiltreSec("onaylandi")}>Onaylandi</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "geldi"} onClick={() => randevuFiltreSec("geldi")}>Geldi</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "muayenede"} onClick={() => randevuFiltreSec("muayenede")}>Muayenede</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "tamamlandi"} onClick={() => randevuFiltreSec("tamamlandi")}>Tamamlandi</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "no_show"} onClick={() => randevuFiltreSec("no_show")}>No-show</button>
                <button type="button" className="randevu-chip" data-active={randevuListeFiltresi === "iptal"} onClick={() => randevuFiltreSec("iptal")}>İptal</button>
              </div>
            </div>
            <div className="panel-grid-2" style={{ marginBottom: 10 }}>
              <select
                className="girdi"
                value={randevuDurumFiltre}
                onChange={(e) => {
                  const secim = e.target.value as "tum" | "beklemede" | "onaylandi" | "geldi" | "muayenede" | "tamamlandi" | "no_show" | "iptal";
                  setRandevuDurumFiltre(secim);
                  setRandevuListeFiltresi(secim);
                  setRandevuSayfa(1);
                }}
              >
                <option value="tum">Tüm durumlar</option>
                <option value="beklemede">Beklemede</option>
                <option value="onaylandi">Onaylandi</option>
                <option value="geldi">Geldi</option>
                <option value="muayenede">Muayenede</option>
                <option value="tamamlandi">Tamamlandi</option>
                <option value="no_show">No-show</option>
                <option value="iptal">İptal</option>
              </select>
              <select className="girdi" value={randevuSirala} onChange={(e) => setRandevuSirala(e.target.value)}>
                <option value="tarih_asc">Tarihe gore (Eski-Yeni)</option>
                <option value="tarih_desc">Tarihe gore (Yeni-Eski)</option>
              </select>
            </div>
            <div className="randevu-action-bar">
              <button type="button" className="satir-dugme" onClick={() => randevuFiltreSec("beklemede")}>
                Bekleyenlere odaklan
              </button>
              <button type="button" className="satir-dugme" onClick={() => randevuFiltreSec("onaylandi")}>
                Onayli takip
              </button>
              <button type="button" className="satir-dugme" onClick={() => randevuFiltreSec("muayenede")}>
                Muayene masasini ac
              </button>
              <button type="button" className="satir-dugme" onClick={() => setRandevuListeFiltresi("tamamlandi")}>
                Gun sonu kontrolu
              </button>
            </div>
            <div className="randevu-hibrit-liste">
              {gosterilenRandevular.map((x) => {
                const eksikAlanlar = randevuEksikKlinikAlanlar(x);
                return (
                <article key={x.id} className="randevu-hibrit-kart" data-durum={x.durum}>
                  <div className="randevu-hibrit-ust">
                    <div className="randevu-hibrit-zaman">
                      <Clock3 size={14} />
                      <strong>{x.randevu_tarihi}</strong>
                      <span>{x.randevu_saati}</span>
                    </div>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <AiOncelikRozeti oncelik={x.ai_oncelik || null} />
                      <DurumRozeti durum={x.durum} />
                    </div>
                  </div>
                  <div className="randevu-hibrit-icerik">
                    <p><strong>Hasta:</strong> {x.hayvan?.ad || "-"} {x.hayvan?.tur ? `(${x.hayvan.tur})` : ""}</p>
                    <p><strong>Sahip:</strong> {x.sahip ? `${x.sahip.ad} ${x.sahip.soyad}` : "-"}</p>
                    <p><strong>Kayıt:</strong> Randevu #{x.id}</p>
                    {x.sikayet_ozet ? <p><strong>Sikayet Ozeti:</strong> {x.sikayet_ozet}</p> : null}
                    {x.hasta_kabul_zamani ? <p><strong>Kabul:</strong> {new Date(x.hasta_kabul_zamani).toLocaleString("tr-TR")}</p> : null}
                    {x.muayene_baslama_zamani ? <p><strong>Muayene Başlangıç:</strong> {new Date(x.muayene_baslama_zamani).toLocaleString("tr-TR")}</p> : null}
                    {x.checkout_zamani ? <p><strong>Checkout:</strong> {new Date(x.checkout_zamani).toLocaleString("tr-TR")}</p> : null}
                    {x.no_show_zamani ? <p><strong>No-show:</strong> {new Date(x.no_show_zamani).toLocaleString("tr-TR")}</p> : null}
                  </div>
                  {eksikAlanlar.length > 0 ? (
                    <div className="randevu-eksik-uyari">
                      <strong>Eksik Klinik Alan:</strong> {eksikAlanlar.join(", ")}
                    </div>
                  ) : null}
                  <div className="randevu-hibrit-aksiyonlar">
                    {(x.durum === "beklemede" || x.durum === "onaylandi" || x.durum === "geldi") ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "ilerlet")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "İlerlet"}
                      </button>
                    ) : null}
                    {(x.durum === "onaylandi" || x.durum === "geldi" || x.durum === "muayenede") ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "tamamla")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "Tamamla"}
                      </button>
                    ) : null}
                    {x.durum !== "tamamlandi" && x.durum !== "iptal" ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "iptal")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "İptal"}
                      </button>
                    ) : null}
                    {(x.durum === "beklemede" || x.durum === "onaylandi") ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "no_show")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "Gelmedi"}
                      </button>
                    ) : null}
                    {x.durum === "tamamlandi" && !x.checkout_zamani ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "checkout")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "Çıkış"}
                      </button>
                    ) : null}
                    {(x.durum === "beklemede" || x.durum === "onaylandi" || x.durum === "geldi" || x.durum === "muayenede") ? (
                      <button className="satir-dugme" disabled={randevuIslemdeId === x.id} onClick={() => randevuIslem(x.id, "hizli_mesaj")}>
                        {randevuIslemdeId === x.id ? "İşleniyor..." : "Hızlı Mesaj"}
                      </button>
                    ) : null}
                    <button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Randevu Detayı", veri: x })}>İncele</button>
                  </div>
                </article>
                );
              })}
              {gosterilenRandevular.length === 0 ? (
                <div className="onboarding-kart">
                  <h4>Filtreye uygun randevu yok</h4>
                  <p>Durum veya tarih filtresini değiştirerek tekrar dene.</p>
                </div>
              ) : null}
            </div>
            <div className="sayfalama">
              <div className="sayfalama-bilgi">Sayfa {randevuAktifSayfa} / {randevuToplamSayfa}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="satir-dugme" disabled={randevuAktifSayfa <= 1} onClick={() => setRandevuSayfa((x) => Math.max(1, x - 1))}>Onceki</button>
                <button className="satir-dugme" disabled={randevuAktifSayfa >= randevuToplamSayfa} onClick={() => setRandevuSayfa((x) => Math.min(randevuToplamSayfa, x + 1))}>Sonraki</button>
              </div>
            </div>
            <h4 style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarCheck2 size={16} /> Takvim Timeline</h4>
            <div className="randevu-timeline-grid">
              {takvimOzeti.map(([tarih, adet]) => (
                <div key={tarih} className="randevu-timeline-item">
                  <div className="randevu-timeline-dot" />
                  <div>
                    <strong>{tarih}</strong>
                    <p>{adet} randevu planli</p>
                  </div>
                </div>
              ))}
              {takvimOzeti.length === 0 ? (
                <div className="onboarding-kart">
                  <h4>Takvimde randevu yok</h4>
                  <p>Yeni randevu olustukca burada gun bazli timeline gorunur.</p>
                </div>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}

      {aktifMenu === "kimlik" ? (
        <article className="kart bolum-kart">
          <h3 className="bolum-baslik">Hasta Dijital Kimlik Görüntüleme</h3>
          <div className="form-grid">
            <select
              className="girdi"
              value={seciliKimlikHayvanId}
              onChange={(e) => {
                setSeciliKimlikHayvanId(e.target.value);
                kimlikDetayGetir(e.target.value);
              }}
            >
              <option value="">Hasta sec</option>
              {hastalar.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.ad}
                </option>
              ))}
            </select>
          </div>
          {kimlikDetay ? (
            <div className="onboarding-kart" style={{ marginTop: 12 }}>
              <h4>{kimlikDetay.benzersiz_kimlik_no}</h4>
              <p>QR icerik: {kimlikDetay.qr_icerik}</p>
              <p>Kimlik notu: {kimlikDetay.kimlik_notu || "-"}</p>
              <p>
                Foto:{" "}
                {kimlikDetay.foto_erisim_url || kimlikDetay.foto_url ? (
                  <a href={kimlikDetay.foto_erisim_url || kimlikDetay.foto_url || "#"} target="_blank" rel="noreferrer">
                    Baglantiyi ac
                  </a>
                ) : (
                  "Yuklenmedi"
                )}
              </p>
            </div>
          ) : (
            <div className="onboarding-kart" style={{ marginTop: 12 }}>
              <h4>Kimlik kaydi secilmedi</h4>
              <p>Hasta secerek dijital kimlik kartini gorebilirsin.</p>
            </div>
          )}
        </article>
      ) : null}
      {detayModal ? (
        <DetayModal baslik={detayModal.baslik} veri={detayModal.veri} kapat={() => setDetayModal(null)} />
      ) : null}
      {hizliMesajModal ? (
        <div className="modal-arkaplan" onClick={() => setHizliMesajModal(null)}>
          <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-baslik">Hizli Mesaj Gonderimi</h4>
            <div className="modal-icerik">
              <div className="panel-grid-2">
                <div>
                  <strong>Hedef Sahip:</strong> {hizliMesajModal.sahip_ad_soyad}
                </div>
                <div>
                  <strong>Telefon:</strong> {telefonMaskele(hizliMesajModal.sahip_telefon)}
                </div>
                <div>
                  <strong>Hayvan:</strong> {hizliMesajModal.hayvan_adi}
                </div>
                <div>
                  <strong>Randevu:</strong> {hizliMesajModal.randevu_tarihi} {hizliMesajModal.randevu_saati}
                </div>
              </div>
              <div className="alan-yardim" data-valid={String(true)} style={{ marginTop: 8 }}>
                <CheckCircle2 size={14} />
                Mesaj once sohbet odasina kaydedilir, secilen kanala gore bildirim iletilir.
              </div>
              <select
                className="girdi"
                style={{ marginTop: 10 }}
                value={hizliMesajForm.kanal}
                onChange={(e) =>
                  setHizliMesajForm((x) => ({
                    ...x,
                    kanal: e.target.value as "push" | "whatsapp" | "sms",
                  }))
                }
              >
                <option value="push">Panel Mesaji (Push)</option>
                <option value="whatsapp">WhatsApp (Aninda Gonderim)</option>
                <option value="sms">SMS (Yedek Kanal)</option>
              </select>
              <textarea
                className="girdi"
                rows={4}
                style={{ marginTop: 10 }}
                placeholder="Mesaj metni"
                value={hizliMesajForm.mesaj}
                onChange={(e) => setHizliMesajForm((x) => ({ ...x, mesaj: e.target.value }))}
              />
              <div className="onboarding-kart" style={{ marginTop: 10 }}>
                <h4>Onizleme</h4>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{hizliMesajForm.mesaj || "-"}</p>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button className="satir-dugme" onClick={() => setHizliMesajModal(null)} disabled={hizliMesajGonderiliyor}>
                  Vazgec
                </button>
                <button className="dugme dugme-ana" onClick={hizliMesajGonder} disabled={hizliMesajGonderiliyor || !hizliMesajForm.mesaj.trim()}>
                  {hizliMesajGonderiliyor ? "Gonderiliyor..." : "Mesaji Gonder"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {tamamlaModal ? (
        <div className="modal-arkaplan" onClick={() => setTamamlaModal(null)}>
          <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-baslik">Randevu Tamamlama Kaydı</h4>
            <div className="form-grid">
              <div className="randevu-action-bar" style={{ marginBottom: 0 }}>
                <button className="satir-dugme" type="button" onClick={() => tamamlaSablonUygula("genel_kontrol")}>Şablon: Genel Kontrol</button>
                <button className="satir-dugme" type="button" onClick={() => tamamlaSablonUygula("asi_uygulama")}>Şablon: Aşı Uygulama</button>
                <button className="satir-dugme" type="button" onClick={() => tamamlaSablonUygula("acil_mudahale")}>Şablon: Acil Müdahale</button>
                <button className="satir-dugme" type="button" onClick={() => tamamlaSablonUygula("post_op_takip")}>Şablon: Post-op Takip</button>
              </div>
              <input
                className="girdi"
                placeholder="İşlem türü (ör. genel_kontrol)"
                value={tamamlaForm.islem_turu}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, islem_turu: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={3}
                placeholder="Tanı / notlar"
                value={tamamlaForm.tani_notu}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, tani_notu: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={2}
                placeholder="SOAP - Subjective (sahip anlatımı)"
                value={tamamlaForm.subjective}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, subjective: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={2}
                placeholder="SOAP - Objective (klinik bulgular)"
                value={tamamlaForm.objective}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, objective: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={2}
                placeholder="SOAP - Assessment (değerlendirme)"
                value={tamamlaForm.assessment}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, assessment: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={2}
                placeholder="SOAP - Plan (tedavi/takip planı)"
                value={tamamlaForm.plan}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, plan: e.target.value }))}
              />
              <input
                className="girdi"
                type="date"
                value={tamamlaForm.takip_kontrol_tarihi}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, takip_kontrol_tarihi: e.target.value }))}
              />
              <textarea
                className="girdi"
                rows={2}
                placeholder="Taburculuk / evde bakım notu"
                value={tamamlaForm.taburculuk_notu}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, taburculuk_notu: e.target.value }))}
              />
              <select
                className="girdi"
                value={tamamlaForm.triage_seviyesi}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, triage_seviyesi: e.target.value }))}
              >
                <option value="">Triage (opsiyonel)</option>
                <option value="dusuk">Düşük</option>
                <option value="orta">Orta</option>
                <option value="yuksek">Yüksek</option>
                <option value="kritik">Kritik</option>
              </select>
              <div className="panel-grid-3">
                <input
                  className="girdi"
                  type="number"
                  step="0.1"
                  placeholder="Ateş C (opsiyonel)"
                  value={tamamlaForm.ates_c}
                  onChange={(e) => setTamamlaForm((x) => ({ ...x, ates_c: e.target.value }))}
                />
                <input
                  className="girdi"
                  type="number"
                  placeholder="Nabız (opsiyonel)"
                  value={tamamlaForm.nabiz}
                  onChange={(e) => setTamamlaForm((x) => ({ ...x, nabiz: e.target.value }))}
                />
                <input
                  className="girdi"
                  type="number"
                  placeholder="Solunum (opsiyonel)"
                  value={tamamlaForm.solunum_sayisi}
                  onChange={(e) => setTamamlaForm((x) => ({ ...x, solunum_sayisi: e.target.value }))}
                />
              </div>
              <input
                className="girdi"
                type="number"
                step="0.1"
                placeholder="Ölçüm kilo kg (opsiyonel)"
                value={tamamlaForm.kilo_kg}
                onChange={(e) => setTamamlaForm((x) => ({ ...x, kilo_kg: e.target.value }))}
              />
              <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={tamamlaForm.asi_uygulandi}
                  onChange={(e) => setTamamlaForm((x) => ({ ...x, asi_uygulandi: e.target.checked }))}
                />
                Aşı uygulandı
              </label>
              <label className="etiket" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={tamamlaForm.checkout_ile_kapat}
                  onChange={(e) => setTamamlaForm((x) => ({ ...x, checkout_ile_kapat: e.target.checked }))}
                />
                Checkout ile kapat
              </label>
              {tamamlaForm.asi_uygulandi ? (
                <>
                  <input
                    className="girdi"
                    placeholder="Aşı adı"
                    value={tamamlaForm.asi_adi}
                    onChange={(e) => setTamamlaForm((x) => ({ ...x, asi_adi: e.target.value }))}
                  />
                  <input
                    className="girdi"
                    type="number"
                    placeholder="Tekrar gün sayısı"
                    value={tamamlaForm.tekrar_gun_sayisi}
                    onChange={(e) => setTamamlaForm((x) => ({ ...x, tekrar_gun_sayisi: e.target.value }))}
                  />
                  <textarea
                    className="girdi"
                    rows={2}
                    placeholder="Aşı notu"
                    value={tamamlaForm.asi_notu}
                    onChange={(e) => setTamamlaForm((x) => ({ ...x, asi_notu: e.target.value }))}
                  />
                </>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="satir-dugme" onClick={() => setTamamlaModal(null)} disabled={tamamlaKaydediliyor}>Vazgeç</button>
                <button className="dugme dugme-ana" onClick={randevuTamamlaKaydet} disabled={tamamlaKaydediliyor || !tamamlaForm.islem_turu.trim()}>
                  {tamamlaKaydediliyor ? "Kaydediliyor..." : "Tamamla ve Kayda İşle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PanelShell>
  );
}

function Durum({ mesaj, hata }: { mesaj: string; hata?: boolean }) {
  return <div className={hata ? "hata" : "toast"}>{mesaj}</div>;
}

type Randevu = {
  id: number;
  randevu_tarihi: string;
  randevu_saati: string;
  durum: string;
  sikayet_ozet?: string | null;
  ai_oncelik?: "acil" | "oncelikli" | "rutin" | null;
  hasta_kabul_zamani?: string | null;
  muayene_baslama_zamani?: string | null;
  checkout_zamani?: string | null;
  no_show_zamani?: string | null;
  no_show_nedeni?: string | null;
  hayvan?: { id: number; ad: string; tur?: string; irk?: string | null } | null;
  sahip?: { id: string; ad: string; soyad: string; telefon?: string | null } | null;
  muayene_ozeti?: {
    saglik_kaydi_id: number;
    islem_turu: string;
    tani_notu: string | null;
    islem_tarihi: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    takip_kontrol_tarihi: string | null;
    taburculuk_notu: string | null;
    triage_seviyesi: string | null;
    ates_c: number | null;
    nabiz: number | null;
    solunum_sayisi: number | null;
    kilo_kg: number | null;
    asi_uygulandi: boolean;
    asi_adi: string | null;
    asi_tekrar_gun_sayisi: number | null;
    asi_notu: string | null;
    asi_tarihi: string | null;
  } | null;
};
type YaklasanAsi = { id: number; hayvan_adi: string | null; islem_turu: string; kalan_gun: number };
type Hasta = { id: number; sahibi_id: string; ad: string };
type Sahip = {
  id: string;
  ad: string;
  soyad: string;
  eposta: string | null;
  telefon: string | null;
  durapet_user_id?: string | null;
  son_ziyaret_tarihi?: string | null;
  hayvanlar?: { id: number; ad: string; tur: string }[];
};
type SaglikKaydi = { id: number; islem_turu: string; islem_tarihi: string };
type AsiKaydi = { id: number; asi_adi: string; uygulama_tarihi: string; tekrar_gun_sayisi: number };
type IslemAkisKaydi = {
  id: string;
  zaman: string;
  baslik: string;
  detay: string;
  durum: "ok" | "warn" | "err";
};
type TamamlaForm = {
  islem_turu: string;
  tani_notu: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  takip_kontrol_tarihi: string;
  taburculuk_notu: string;
  triage_seviyesi: string;
  ates_c: string;
  nabiz: string;
  solunum_sayisi: string;
  kilo_kg: string;
  asi_uygulandi: boolean;
  asi_adi: string;
  tekrar_gun_sayisi: string;
  asi_notu: string;
  checkout_ile_kapat: boolean;
};
type HizliMesajHedef = {
  randevu_id: number;
  sahibi_id: string;
  sahip_ad_soyad: string;
  sahip_telefon: string | null;
  hayvan_id: number;
  hayvan_adi: string;
  randevu_tarihi: string;
  randevu_saati: string;
};
type SahipHayvan = {
  id: number;
  sahibi_id: string;
  ad: string;
  tur: string;
  irk: string | null;
  kimlik_no?: string | null;
  son_saglik_islem_turu?: string | null;
  son_saglik_tarihi?: string | null;
  son_randevu_durumu?: string | null;
  son_randevu_tarihi?: string | null;
  son_randevu_saati?: string | null;
};
type Kimlik = {
  id: number;
  hayvan_id: number;
  benzersiz_kimlik_no: string;
  qr_icerik: string;
  foto_url: string | null;
  foto_erisim_url?: string | null;
  kimlik_notu: string | null;
  pdf_url?: string | null;
  pdf_erisim_url?: string | null;
};

function telefonMaskele(telefon?: string | null) {
  const ham = String(telefon || "").replace(/\s+/g, "");
  if (!ham) return "-";
  if (ham.length <= 4) return `${"*".repeat(Math.max(0, ham.length - 2))}${ham.slice(-2)}`;
  return `${ham.slice(0, 3)}****${ham.slice(-3)}`;
}

function DurumRozeti({ durum }: { durum: string }) {
  const tip =
    durum === "onaylandi" || durum === "tamamlandi" || durum === "geldi" || durum === "muayenede"
      ? "durum-onay"
      : durum === "beklemede"
        ? "durum-bekle"
        : "durum-iptal";
  return <span className={`durum-rozeti ${tip}`}>{durumEtiketi(durum)}</span>;
}

function aiOncelikSirasi(oncelik?: string | null) {
  if (oncelik === "acil") return 0;
  if (oncelik === "oncelikli") return 1;
  if (oncelik === "rutin") return 2;
  return 3;
}

function AiOncelikRozeti({ oncelik }: { oncelik?: string | null }) {
  const tip =
    oncelik === "acil"
      ? "durum-iptal"
      : oncelik === "oncelikli"
        ? "durum-bekle"
        : oncelik === "rutin"
          ? "durum-onay"
          : "";
  const etiket = oncelik ? `AI: ${oncelik.toUpperCase()}` : "AI: -";
  return <span className={`durum-rozeti ${tip}`}>{etiket}</span>;
}

function randevuEksikKlinikAlanlar(randevu: Randevu) {
  const ozet = randevu.muayene_ozeti;
  if (!ozet) {
    if (["muayenede", "tamamlandi"].includes(randevu.durum)) return ["Muayene özeti"];
    return [];
  }
  const eksik = [];
  if (!ozet.objective) eksik.push("Objective");
  if (!ozet.assessment) eksik.push("Assessment");
  if (!ozet.plan) eksik.push("Plan");
  if (randevu.durum === "tamamlandi" && !ozet.takip_kontrol_tarihi) eksik.push("Takip tarihi");
  return eksik;
}

function tamamlaFormKontrolMesaji(form: TamamlaForm) {
  if (!form.islem_turu.trim()) return "İşlem türü zorunludur.";
  if (form.asi_uygulandi && (!form.asi_adi.trim() || Number(form.tekrar_gun_sayisi || 0) <= 0)) {
    return "Aşı uygulandı seçildiyse aşı adı ve tekrar gün sayısı zorunludur.";
  }
  if (form.takip_kontrol_tarihi) {
    const takip = new Date(`${form.takip_kontrol_tarihi}T00:00:00Z`);
    if (Number.isNaN(takip.getTime())) return "Takip kontrol tarihi geçersiz.";
  }
  return "";
}

function DetayModal({ baslik, veri, kapat }: { baslik: string; veri: unknown; kapat: () => void }) {
  const randevu = randevuDetayiCoz(veri);
  return (
    <div className="modal-arkaplan" onClick={kapat}>
      <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-baslik">{baslik}</h4>
        {randevu ? (
          <div className="modal-randevu-grid">
            <div className="modal-randevu-kart">
              <small>Randevu</small>
              <strong>#{randevu.id}</strong>
              <p>
                <span>Tarih:</span> {randevu.randevu_tarihi}
              </p>
              <p>
                <span>Saat:</span> {randevu.randevu_saati}
              </p>
              <p>
                <span>Durum:</span> {randevu.durum}
              </p>
              <p>
                <span>Kabul:</span> {randevu.hasta_kabul_zamani ? new Date(randevu.hasta_kabul_zamani).toLocaleString("tr-TR") : "-"}
              </p>
              <p>
                <span>Muayene:</span> {randevu.muayene_baslama_zamani ? new Date(randevu.muayene_baslama_zamani).toLocaleString("tr-TR") : "-"}
              </p>
              <p>
                <span>Checkout:</span> {randevu.checkout_zamani ? new Date(randevu.checkout_zamani).toLocaleString("tr-TR") : "-"}
              </p>
              <p>
                <span>No-show:</span> {randevu.no_show_zamani ? new Date(randevu.no_show_zamani).toLocaleString("tr-TR") : "-"}
              </p>
              {randevu.no_show_nedeni ? (
                <p>
                  <span>No-show Nedeni:</span> {randevu.no_show_nedeni}
                </p>
              ) : null}
            </div>
            <div className="modal-randevu-kart">
              <small>Hasta Bilgisi</small>
              <strong>{randevu.hayvan?.ad || "-"}</strong>
              <p>
                <span>Tur:</span> {randevu.hayvan?.tur || "-"}
              </p>
              <p>
                <span>Irk:</span> {randevu.hayvan?.irk || "-"}
              </p>
            </div>
            <div className="modal-randevu-kart">
              <small>Sahip Bilgisi</small>
              <strong>{randevu.sahip ? `${randevu.sahip.ad} ${randevu.sahip.soyad}` : "-"}</strong>
              <p>
                <span>Telefon:</span> {randevu.sahip?.telefon || "-"}
              </p>
            </div>
            <div className="modal-randevu-kart modal-randevu-kart-genis">
              <small>Muayene Sonucu</small>
              {randevu.muayene_ozeti ? (
                <>
                  <strong>{randevu.muayene_ozeti.islem_turu}</strong>
                  <div className="soap-liste">
                    <p><strong>Islem Tarihi</strong><span>{new Date(randevu.muayene_ozeti.islem_tarihi).toLocaleString("tr-TR")}</span></p>
                    <p><strong>Tani/Not</strong><span>{randevu.muayene_ozeti.tani_notu || "-"}</span></p>
                    <p><strong>Subjective</strong><span>{randevu.muayene_ozeti.subjective || "-"}</span></p>
                    <p><strong>Objective</strong><span>{randevu.muayene_ozeti.objective || "-"}</span></p>
                    <p><strong>Assessment</strong><span>{randevu.muayene_ozeti.assessment || "-"}</span></p>
                    <p><strong>Plan</strong><span>{randevu.muayene_ozeti.plan || "-"}</span></p>
                    <p><strong>Takip/Kontrol</strong><span>{randevu.muayene_ozeti.takip_kontrol_tarihi || "-"}</span></p>
                    <p><strong>Taburculuk Notu</strong><span>{randevu.muayene_ozeti.taburculuk_notu || "-"}</span></p>
                  <p><strong>Triage</strong><span>{triageEtiketi(randevu.muayene_ozeti.triage_seviyesi)}</span></p>
                  <p><strong>Ates</strong><span>{randevu.muayene_ozeti.ates_c != null ? `${randevu.muayene_ozeti.ates_c} C` : "-"}</span></p>
                  <p><strong>Nabiz</strong><span>{randevu.muayene_ozeti.nabiz ?? "-"}</span></p>
                  <p><strong>Solunum</strong><span>{randevu.muayene_ozeti.solunum_sayisi ?? "-"}</span></p>
                  <p><strong>Kilo</strong><span>{randevu.muayene_ozeti.kilo_kg != null ? `${randevu.muayene_ozeti.kilo_kg} kg` : "-"}</span></p>
                  </div>
                  <p>
                    <span>Asi Uygulamasi:</span>{" "}
                    {randevu.muayene_ozeti.asi_uygulandi
                      ? `${randevu.muayene_ozeti.asi_adi || "-"} (${randevu.muayene_ozeti.asi_tekrar_gun_sayisi || "-"} gun tekrar)`
                      : "Uygulanmadi"}
                  </p>
                  {randevu.muayene_ozeti.asi_uygulandi ? (
                    <p>
                      <span>Asi Notu:</span> {randevu.muayene_ozeti.asi_notu || "-"}
                    </p>
                  ) : null}
                </>
              ) : (
                <p>Bu randevu icin henuz muayene sonucu islenmemis.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="modal-icerik">{JSON.stringify(veri, null, 2)}</div>
        )}
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button className="satir-dugme" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

function randevuDetayiCoz(veri: unknown): Randevu | null {
  if (!veri || typeof veri !== "object") return null;
  const aday = veri as Partial<Randevu>;
  if (
    typeof aday.id === "number" &&
    typeof aday.randevu_tarihi === "string" &&
    typeof aday.randevu_saati === "string" &&
    typeof aday.durum === "string"
  ) {
    return {
      id: aday.id,
      randevu_tarihi: aday.randevu_tarihi,
      randevu_saati: aday.randevu_saati,
      durum: aday.durum,
      hasta_kabul_zamani: aday.hasta_kabul_zamani || null,
      muayene_baslama_zamani: aday.muayene_baslama_zamani || null,
      checkout_zamani: aday.checkout_zamani || null,
      no_show_zamani: aday.no_show_zamani || null,
      no_show_nedeni: aday.no_show_nedeni || null,
      hayvan: aday.hayvan || null,
      sahip: aday.sahip || null,
      muayene_ozeti: aday.muayene_ozeti || null,
    };
  }
  return null;
}
