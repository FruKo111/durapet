"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { Bell, CalendarClock, IdCard, LayoutDashboard, MessageSquare, Send, Stethoscope } from "lucide-react";

type Hasta = { id: number; ad: string; sahibi_id: string };
type Sahip = { id: string; ad: string; soyad: string; telefon?: string | null };
type Sablon = {
  id: number;
  ad: string;
  kanal: "push" | "whatsapp" | "sms";
  icerik: string;
  aktif: boolean;
  olusturma_tarihi: string;
  guncelleme_tarihi: string;
};
type GecmisKaydi = {
  id: number;
  tur: string;
  baslik: string;
  mesaj_ozet: string;
  kanal: string;
  fallback_kanal: string | null;
  fallback_durum: string | null;
  dis_kanal_mesaj_id?: string | null;
  gonderim_zamani: string | null;
  son_denemede?: string | null;
  olusturma_tarihi: string;
  mesaj_sablon_adi: string | null;
  hayvan: { id: number; ad: string; tur?: string | null; irk?: string | null } | null;
  sahip: { id: string; ad: string; soyad: string; telefon?: string | null } | null;
  randevu: { id: number; randevu_tarihi: string; randevu_saati: string } | null;
};
type KlinikKanalAyari = {
  klinik: { klinik_adi: string | null; klinik_kodu: string };
  ayar: {
    provider: "mock" | "webhook" | "twilio" | "infobip";
    aktif: boolean;
    twilio_account_sid_maskeli: string | null;
    twilio_auth_token_tanimli: boolean;
    twilio_whatsapp_from: string | null;
    webhook_url: string | null;
    webhook_token_tanimli: boolean;
    infobip_base_url: string | null;
    infobip_api_key_tanimli: boolean;
    infobip_sender: string | null;
  };
};

const BOS_FORM = {
  hayvan_id: "",
  sahibi_id: "",
  sablon_id: "",
  kanal: "whatsapp" as "push" | "whatsapp" | "sms",
  mesaj: "",
};

export default function VeterinerIletisimMerkeziSayfasi() {
  const router = useRouter();
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.VETERINER);
  const [aktifMenu, setAktifMenu] = useState("iletisim");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const [islemMesaji, setIslemMesaji] = useState("");
  const [hastalar, setHastalar] = useState<Hasta[]>([]);
  const [sahipler, setSahipler] = useState<Sahip[]>([]);
  const [sablonlar, setSablonlar] = useState<Sablon[]>([]);
  const [gecmis, setGecmis] = useState<GecmisKaydi[]>([]);
  const [kaydetYukleniyor, setKaydetYukleniyor] = useState(false);
  const [gonderYukleniyor, setGonderYukleniyor] = useState(false);
  const [form, setForm] = useState(BOS_FORM);
  const [sablonForm, setSablonForm] = useState({ ad: "", kanal: "whatsapp" as "push" | "whatsapp" | "sms", icerik: "" });
  const [kanalAyar, setKanalAyar] = useState<KlinikKanalAyari | null>(null);
  const [kanalAyarForm, setKanalAyarForm] = useState({
    klinik_kodu: "",
    provider: "mock" as "mock" | "webhook" | "twilio" | "infobip",
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_whatsapp_from: "",
    webhook_url: "",
    webhook_token: "",
    infobip_base_url: "",
    infobip_api_key: "",
    infobip_sender: "",
    aktif: true,
  });
  const [kanalAyarKaydediliyor, setKanalAyarKaydediliyor] = useState(false);
  const [testMesajiGonderiliyor, setTestMesajiGonderiliyor] = useState(false);
  const [testForm, setTestForm] = useState({ telefon: "", kanal: "whatsapp" as "whatsapp" | "sms", mesaj: "" });

  const sahipMap = useMemo(() => {
    const map: Record<string, Sahip> = {};
    for (const x of sahipler) map[x.id] = x;
    return map;
  }, [sahipler]);

  const seciliHayvan = useMemo(() => hastalar.find((x) => String(x.id) === form.hayvan_id) || null, [hastalar, form.hayvan_id]);
  const seciliSahip = useMemo(() => (form.sahibi_id ? sahipMap[form.sahibi_id] || null : null), [form.sahibi_id, sahipMap]);
  const seciliSahipHayvanlari = useMemo(() => {
    if (!form.sahibi_id) return hastalar;
    return hastalar.filter((x) => x.sahibi_id === form.sahibi_id);
  }, [hastalar, form.sahibi_id]);
  const mockKayitSayisi = useMemo(
    () => gecmis.filter((x) => String(x.dis_kanal_mesaj_id || "").startsWith("mock-")).length,
    [gecmis]
  );
  const testModuAktif = kanalAyar?.ayar?.provider === "mock";

  const verileriYukle = useCallback(async () => {
    if (!token) return;
    const [hastaCevap, sahipCevap, sablonCevap, gecmisCevap, ayarCevap] = await Promise.all([
      apiGet<{ hastalar: Hasta[] }>("/api/v1/veteriner/hastalar?limit=300", token),
      apiGet<{ sahipler: Sahip[] }>("/api/v1/veteriner/sahipler?limit=300", token),
      apiGet<{ sablonlar: Sablon[] }>("/api/v1/veteriner/iletisim/sablonlar?limit=200", token),
      apiGet<{ kayitlar: GecmisKaydi[] }>("/api/v1/veteriner/iletisim/whatsapp-gecmis?limit=80&kanal=whatsapp", token),
      apiGet<KlinikKanalAyari>("/api/v1/veteriner/iletisim/kanal-ayarlari", token),
    ]);
    setHastalar(hastaCevap.hastalar || []);
    setSahipler(sahipCevap.sahipler || []);
    setSablonlar(sablonCevap.sablonlar || []);
    setGecmis(gecmisCevap.kayitlar || []);
    setKanalAyar(ayarCevap || null);
    setKanalAyarForm({
      klinik_kodu: ayarCevap?.klinik?.klinik_kodu || "",
      provider: ayarCevap?.ayar?.provider || "mock",
      twilio_account_sid: "",
      twilio_auth_token: "",
      twilio_whatsapp_from: ayarCevap?.ayar?.twilio_whatsapp_from || "",
      webhook_url: ayarCevap?.ayar?.webhook_url || "",
      webhook_token: "",
      infobip_base_url: ayarCevap?.ayar?.infobip_base_url || "",
      infobip_api_key: "",
      infobip_sender: ayarCevap?.ayar?.infobip_sender || "",
      aktif: ayarCevap?.ayar?.aktif !== false,
    });
  }, [token]);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      try {
        await verileriYukle();
      } catch (err) {
        setIslemMesaji(err instanceof Error ? err.message : "İletişim verileri yüklenemedi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token, verileriYukle]);

  useEffect(() => {
    if (aktifMenu === "dashboard") router.push("/veteriner");
    if (aktifMenu === "kayit") router.push("/veteriner");
    if (aktifMenu === "randevu") router.push("/veteriner");
    if (aktifMenu === "kimlik") router.push("/veteriner");
    if (aktifMenu === "mesaj") router.push("/veteriner/mesajlar");
    if (aktifMenu === "bildirim") router.push("/veteriner/bildirimler");
  }, [aktifMenu, router]);

  useEffect(() => {
    if (!seciliHayvan) return;
    if (form.sahibi_id === seciliHayvan.sahibi_id) return;
    setForm((x) => ({ ...x, sahibi_id: seciliHayvan.sahibi_id }));
  }, [seciliHayvan, form.sahibi_id]);

  useEffect(() => {
    if (!form.sahibi_id || !form.hayvan_id) return;
    const uyumlu = hastalar.some((x) => String(x.id) === form.hayvan_id && x.sahibi_id === form.sahibi_id);
    if (uyumlu) return;
    const ilkHayvan = hastalar.find((x) => x.sahibi_id === form.sahibi_id);
    setForm((x) => ({ ...x, hayvan_id: ilkHayvan ? String(ilkHayvan.id) : "" }));
  }, [hastalar, form.hayvan_id, form.sahibi_id]);

  async function sablonOlustur(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setKaydetYukleniyor(true);
    setIslemMesaji("");
    try {
      await apiPost("/api/v1/veteriner/iletisim/sablonlar", token, {
        ad: sablonForm.ad,
        kanal: sablonForm.kanal,
        icerik: sablonForm.icerik,
      });
      setSablonForm({ ad: "", kanal: "whatsapp", icerik: "" });
      await verileriYukle();
      setIslemMesaji("Şablon kaydedildi.");
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Şablon kaydedilemedi.");
    } finally {
      setKaydetYukleniyor(false);
    }
  }

  async function sablonDurumDegistir(id: number, aktif: boolean) {
    if (!token) return;
    try {
      await apiPatch(`/api/v1/veteriner/iletisim/sablonlar/${id}`, token, { aktif: !aktif });
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Şablon güncellenemedi.");
    }
  }

  async function manuelMesajGonder(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setGonderYukleniyor(true);
    setIslemMesaji("");
    try {
      const seciliSablon = sablonlar.find((x) => String(x.id) === form.sablon_id) || null;
      await apiPost("/api/v1/veteriner/hizli-mesaj", token, {
        sahibi_id: form.sahibi_id,
        hayvan_id: Number(form.hayvan_id),
        mesaj: form.mesaj,
        kanal: form.kanal,
        sablon_adi: seciliSablon?.ad || null,
      });
      setForm((x) => ({ ...BOS_FORM, kanal: x.kanal }));
      await verileriYukle();
      setIslemMesaji("Mesaj gönderildi.");
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
    } finally {
      setGonderYukleniyor(false);
    }
  }

  async function kanalAyariKaydet(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setKanalAyarKaydediliyor(true);
    setIslemMesaji("");
    try {
      const urlHazirla = (deger: string) => {
        const temiz = String(deger || "").trim();
        if (!temiz) return null;
        if (/^https?:\/\//i.test(temiz)) return temiz;
        return `https://${temiz}`;
      };
      const payload = {
        ...kanalAyarForm,
        klinik_kodu: String(kanalAyarForm.klinik_kodu || "").trim() || undefined,
        twilio_account_sid: String(kanalAyarForm.twilio_account_sid || "").trim() || null,
        twilio_auth_token: String(kanalAyarForm.twilio_auth_token || "").trim() || null,
        twilio_whatsapp_from: String(kanalAyarForm.twilio_whatsapp_from || "").trim() || null,
        webhook_url: urlHazirla(kanalAyarForm.webhook_url),
        webhook_token: String(kanalAyarForm.webhook_token || "").trim() || null,
        infobip_base_url: urlHazirla(kanalAyarForm.infobip_base_url),
        infobip_api_key: String(kanalAyarForm.infobip_api_key || "").trim() || null,
        infobip_sender: String(kanalAyarForm.infobip_sender || "").trim() || null,
      };
      await apiPatch("/api/v1/veteriner/iletisim/kanal-ayarlari", token, payload);
      await verileriYukle();
      setIslemMesaji("Klinik kanal ayarları kaydedildi.");
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Kanal ayarları kaydedilemedi.");
    } finally {
      setKanalAyarKaydediliyor(false);
    }
  }

  async function testMesajiGonder(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setTestMesajiGonderiliyor(true);
    setIslemMesaji("");
    try {
      const cevap = await apiPost<{ gonderim?: { dis_kanal_mesaj_id?: string | null; test_modu?: boolean } }>(
        "/api/v1/veteriner/iletisim/kanal-ayarlari/test",
        token,
        testForm
      );
      const testNotu = cevap?.gonderim?.test_modu ? " (test modu)" : "";
      setIslemMesaji(`Test mesajı gönderildi${testNotu}.`);
      setTestForm((x) => ({ ...x, mesaj: "" }));
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Test mesajı gönderilemedi.");
    } finally {
      setTestMesajiGonderiliyor(false);
    }
  }

  function sablonSec(id: string) {
    const secili = sablonlar.find((x) => String(x.id) === id) || null;
    if (!secili) {
      setForm((x) => ({ ...x, sablon_id: "", mesaj: "" }));
      return;
    }
    setForm((x) => ({
      ...x,
      sablon_id: id,
      kanal: secili.kanal,
      mesaj: secili.icerik,
    }));
  }

  function sahipDegistir(yeniSahipId: string) {
    const sahipHayvanlari = hastalar.filter((x) => x.sahibi_id === yeniSahipId);
    setForm((x) => ({
      ...x,
      sahibi_id: yeniSahipId,
      hayvan_id: sahipHayvanlari.some((h) => String(h.id) === x.hayvan_id) ? x.hayvan_id : sahipHayvanlari[0] ? String(sahipHayvanlari[0].id) : "",
    }));
  }

  function hayvanDegistir(yeniHayvanId: string) {
    const hayvan = hastalar.find((x) => String(x.id) === yeniHayvanId) || null;
    setForm((x) => ({
      ...x,
      hayvan_id: yeniHayvanId,
      sahibi_id: hayvan?.sahibi_id || "",
    }));
  }

  if (yukleniyor || veriYukleniyor) return <div className="toast">İletişim merkezi yükleniyor...</div>;
  if (hata) return <div className="hata">{hata}</div>;
  if (!profil || !token) return <div className="hata">Profil veya oturum bilgisi bulunamadı.</div>;

  return (
    <PanelShell
      rol="Veteriner"
      adSoyad={`${profil.ad} ${profil.soyad}`}
      menu={[
        { id: "dashboard", etiket: "Gösterge", aciklama: "Genel görünüm", ikon: <LayoutDashboard size={15} /> },
        { id: "kayit", etiket: "Kayıt İşlemleri", aciklama: "Hasta/sağlık/aşı", ikon: <Stethoscope size={15} /> },
        { id: "randevu", etiket: "Randevular", aciklama: "Onay/iptal", ikon: <CalendarClock size={15} /> },
        { id: "kimlik", etiket: "Dijital Kimlik", aciklama: "Hasta kimlik kartı", ikon: <IdCard size={15} /> },
        { id: "mesaj", etiket: "Mesajlar", aciklama: "Canlı sohbet", ikon: <MessageSquare size={15} /> },
        { id: "bildirim", etiket: "Bildirimler", aciklama: "Tüm uyarılar", ikon: <Bell size={15} /> },
        { id: "iletisim", etiket: "İletişim Merkezi", aciklama: "WhatsApp ve şablon yönetimi", ikon: <MessageSquare size={15} /> },
      ]}
      aktifMenu={aktifMenu}
      menuDegistir={setAktifMenu}
      token={token}
      kullaniciId={profil.id}
      kartlar={[
        { baslik: "WhatsApp Geçmişi", deger: String(gecmis.length), aciklama: "Son gönderim kayıtları" },
        { baslik: "Aktif Şablon", deger: String(sablonlar.filter((x) => x.aktif).length), aciklama: "Hazır hızlı mesaj setleri" },
        { baslik: "Klinik Provider", deger: String((kanalAyar?.ayar?.provider || "mock").toUpperCase()), aciklama: "Bu kliniğin dış kanal sağlayıcısı" },
      ]}
    >
      {islemMesaji ? <div className="toast">{islemMesaji}</div> : null}

      <section className="kart iletisim-bilgi-karti">
        <div className="iletisim-bilgi-ust">
          <strong>WhatsApp bağlantı durumu</strong>
          <span className={`iletisim-chip ${testModuAktif ? "test" : "canli"}`}>{testModuAktif ? "Test Modu" : "Canlı Mod"}</span>
        </div>
        <p>
          Klinik kodun: <strong>{kanalAyar?.klinik?.klinik_kodu || "-"}</strong>. Provider: <strong>{kanalAyar?.ayar?.provider || "-"}</strong>.
          {testModuAktif ? " Bu modda mesajlar gerçek WhatsApp yerine simüle edilir." : " Bu modda mesajlar gerçek dış kanala gönderilir."}
        </p>
        <p>Geçmişte toplam <strong>{mockKayitSayisi}</strong> adet test (mock) kayıt görünüyor.</p>
      </section>

      <section className="kart iletisim-ayar-kart">
        <strong>Klinik Kanal Ayarları</strong>
        <form onSubmit={kanalAyariKaydet} className="iletisim-form-grid" style={{ marginTop: 12 }}>
          <div className="satir">
            <input
              className="girdi"
              placeholder="Klinik kodu (orn: ankara-pati)"
              value={kanalAyarForm.klinik_kodu}
              onChange={(e) => setKanalAyarForm((x) => ({ ...x, klinik_kodu: e.target.value }))}
            />
            <select
              className="girdi"
              value={kanalAyarForm.provider}
              onChange={(e) => setKanalAyarForm((x) => ({ ...x, provider: e.target.value as "mock" | "webhook" | "twilio" | "infobip" }))}
            >
              <option value="mock">Mock (test)</option>
              <option value="twilio">Twilio</option>
              <option value="infobip">Infobip</option>
              <option value="webhook">Webhook</option>
            </select>
            <label className="etiket" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={kanalAyarForm.aktif}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, aktif: e.target.checked }))}
              />
              Aktif
            </label>
          </div>
          <small className="alan-yardim">Klinik kodu: Ayni klinikteki tum veterinerlerde ayni olmali. Farkli kliniklerde farkli kod kullanin.</small>
          <small className="alan-yardim">
            Provider secimi: {`mock = test, twilio/infobip = canli WhatsApp, webhook = dis servis uzerinden`}
          </small>
          {kanalAyarForm.provider === "twilio" ? (
            <div className="iletisim-form-grid">
              <input
                className="girdi"
                placeholder={`Twilio SID ${kanalAyar?.ayar?.twilio_account_sid_maskeli ? `(kayıtlı: ${kanalAyar.ayar.twilio_account_sid_maskeli})` : ""}`}
                value={kanalAyarForm.twilio_account_sid}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, twilio_account_sid: e.target.value }))}
              />
              <small className="alan-yardim">Twilio Console - Account SID alanini buraya yaz.</small>
              <input
                className="girdi"
                placeholder={`Twilio Token ${kanalAyar?.ayar?.twilio_auth_token_tanimli ? "(kayıtlı)" : ""}`}
                value={kanalAyarForm.twilio_auth_token}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, twilio_auth_token: e.target.value }))}
              />
              <small className="alan-yardim">Twilio Console - Auth Token alanini buraya yaz.</small>
              <input
                className="girdi"
                placeholder="Twilio WhatsApp From (örn: +14155238886)"
                value={kanalAyarForm.twilio_whatsapp_from}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, twilio_whatsapp_from: e.target.value }))}
              />
              <small className="alan-yardim">Twilio WhatsApp gonderici numarasini +90... veya +141... formatinda yaz.</small>
            </div>
          ) : null}
          {kanalAyarForm.provider === "infobip" ? (
            <div className="iletisim-form-grid">
              <input
                className="girdi"
                placeholder="Infobip Base URL (örn: https://xxxx.api.infobip.com)"
                value={kanalAyarForm.infobip_base_url}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, infobip_base_url: e.target.value }))}
              />
              <small className="alan-yardim">Infobip panelindeki API temel URL&apos;si (https ile baslamali).</small>
              <input
                className="girdi"
                placeholder={`Infobip API Key ${kanalAyar?.ayar?.infobip_api_key_tanimli ? "(kayıtlı)" : ""}`}
                value={kanalAyarForm.infobip_api_key}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, infobip_api_key: e.target.value }))}
              />
              <small className="alan-yardim">Infobip panelindeki API anahtarini oldugu gibi yapistir.</small>
              <input
                className="girdi"
                placeholder="Infobip Sender (örn: 447491163443 veya numara)"
                value={kanalAyarForm.infobip_sender}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, infobip_sender: e.target.value }))}
              />
              <small className="alan-yardim">Infobip WhatsApp sender bilgisini yaz (sender ID veya tahsisli numara).</small>
            </div>
          ) : null}
          {kanalAyarForm.provider === "webhook" ? (
            <div className="iletisim-form-grid">
              <input
                className="girdi"
                placeholder="Webhook URL"
                value={kanalAyarForm.webhook_url}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, webhook_url: e.target.value }))}
              />
              <small className="alan-yardim">Webhook URL: kendi adapter servisinizin endpoint&apos;i.</small>
              <input
                className="girdi"
                placeholder={`Webhook Token ${kanalAyar?.ayar?.webhook_token_tanimli ? "(kayıtlı)" : ""}`}
                value={kanalAyarForm.webhook_token}
                onChange={(e) => setKanalAyarForm((x) => ({ ...x, webhook_token: e.target.value }))}
              />
              <small className="alan-yardim">Webhook Token: adapter servisiniz bekliyorsa buraya yaz.</small>
            </div>
          ) : null}
          <div className="satir" style={{ justifyContent: "flex-end" }}>
            <button className="dugme" type="submit" disabled={kanalAyarKaydediliyor}>
              {kanalAyarKaydediliyor ? "Kaydediliyor..." : "Kanal Ayarlarını Kaydet"}
            </button>
          </div>
        </form>

        <form onSubmit={testMesajiGonder} className="iletisim-form-grid" style={{ marginTop: 14 }}>
          <strong>Bağlantı Testi</strong>
          <small className="alan-yardim">
            Bu test secili provider ile anlik gonderim dener. Infobip/Twilio seciliyse gercek gonderim yapar, mock seciliyse simule eder.
          </small>
          <div className="satir">
            <input
              className="girdi"
              placeholder="Telefon (örn: +90555...)"
              value={testForm.telefon}
              onChange={(e) => setTestForm((x) => ({ ...x, telefon: e.target.value }))}
            />
            <select className="girdi" value={testForm.kanal} onChange={(e) => setTestForm((x) => ({ ...x, kanal: e.target.value as "whatsapp" | "sms" }))}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <textarea
            className="girdi"
            rows={2}
            placeholder="Test mesajı (boş bırakılırsa otomatik metin gider)"
            value={testForm.mesaj}
            onChange={(e) => setTestForm((x) => ({ ...x, mesaj: e.target.value }))}
          />
          <div className="satir" style={{ justifyContent: "flex-end" }}>
            <button className="dugme" type="submit" disabled={testMesajiGonderiliyor || !testForm.telefon.trim()}>
              {testMesajiGonderiliyor ? "Gönderiliyor..." : "Test Mesajı Gönder"}
            </button>
          </div>
        </form>
      </section>

      <section className="kart iletisim-form-kart">
        <div className="satir iletisim-kart-baslik" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>Manuel WhatsApp / SMS Gönderimi</strong>
          <small>Hayvan + sahip otomatik bağlı, şablon uygula ve gönder.</small>
        </div>
        <form onSubmit={manuelMesajGonder} className="iletisim-form-grid" style={{ marginTop: 12 }}>
          <div className="satir">
            <select className="girdi" value={form.sahibi_id} onChange={(e) => sahipDegistir(e.target.value)}>
              <option value="">Sahip seçin</option>
              {sahipler.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.ad} {x.soyad}
                </option>
              ))}
            </select>
            <select className="girdi" value={form.hayvan_id} onChange={(e) => hayvanDegistir(e.target.value)}>
              <option value="">Hayvan seçin</option>
              {seciliSahipHayvanlari.map((x) => (
                <option key={x.id} value={x.id}>
                  #{x.id} - {x.ad}
                </option>
              ))}
            </select>
            <select className="girdi" value={form.kanal} onChange={(e) => setForm((x) => ({ ...x, kanal: e.target.value as "push" | "whatsapp" | "sms" }))}>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="push">Panel Mesajı</option>
            </select>
          </div>
          <div className="satir">
            <select className="girdi" value={form.sablon_id} onChange={(e) => sablonSec(e.target.value)}>
              <option value="">Şablon seçin (opsiyonel)</option>
              {sablonlar
                .filter((x) => x.aktif)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ad} ({x.kanal})
                  </option>
                ))}
            </select>
          </div>
          <textarea
            className="girdi"
            rows={4}
            placeholder="Mesaj metni"
            value={form.mesaj}
            onChange={(e) => setForm((x) => ({ ...x, mesaj: e.target.value }))}
          />
          <div className="onboarding-kart iletisim-onizleme">
            <strong>Önizleme</strong>
            <p style={{ marginTop: 6 }}>
              {seciliSahip ? `${seciliSahip.ad} ${seciliSahip.soyad}` : "Sahip seçilmedi"} / {seciliHayvan ? seciliHayvan.ad : "Hayvan seçilmedi"}
            </p>
            <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{form.mesaj || "Mesaj içeriği henüz yok."}</p>
          </div>
          <div className="satir" style={{ justifyContent: "flex-end" }}>
            <button className="dugme birincil" type="submit" disabled={gonderYukleniyor || !form.hayvan_id || !form.sahibi_id || !form.mesaj.trim()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Send size={14} />
                {gonderYukleniyor ? "Gönderiliyor..." : "Mesajı Gönder"}
              </span>
            </button>
          </div>
        </form>
      </section>

      <section className="kart iletisim-sablon-kart">
        <strong>Mesaj Şablonları</strong>
        <form onSubmit={sablonOlustur} className="satir" style={{ marginTop: 12 }}>
          <input className="girdi" placeholder="Şablon adı" value={sablonForm.ad} onChange={(e) => setSablonForm((x) => ({ ...x, ad: e.target.value }))} />
          <select className="girdi" value={sablonForm.kanal} onChange={(e) => setSablonForm((x) => ({ ...x, kanal: e.target.value as "push" | "whatsapp" | "sms" }))}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="push">Panel Mesajı</option>
          </select>
          <button className="dugme" type="submit" disabled={kaydetYukleniyor || !sablonForm.ad.trim() || !sablonForm.icerik.trim()}>
            {kaydetYukleniyor ? "Kaydediliyor..." : "Şablon Kaydet"}
          </button>
        </form>
        <textarea
          className="girdi"
          rows={3}
          style={{ marginTop: 10 }}
          placeholder="Şablon içeriği"
          value={sablonForm.icerik}
          onChange={(e) => setSablonForm((x) => ({ ...x, icerik: e.target.value }))}
        />
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {sablonlar.map((x) => (
            <div key={x.id} className="onboarding-kart">
              <div className="satir" style={{ justifyContent: "space-between" }}>
                <strong>
                  {x.ad} ({x.kanal})
                </strong>
                <button className="dugme mini" onClick={() => sablonDurumDegistir(x.id, x.aktif)} type="button">
                  {x.aktif ? "Pasife Al" : "Aktifleştir"}
                </button>
              </div>
              <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{x.icerik}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="kart">
        <strong>Son WhatsApp Gönderimleri</strong>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="tablo">
            <thead>
              <tr>
                <th>Tarih / Saat</th>
                <th>Hayvan</th>
                <th>Sahip</th>
                <th>Kanal</th>
                <th>Durum</th>
                <th>Mesaj</th>
              </tr>
            </thead>
            <tbody>
              {gecmis.length === 0 ? (
                <tr>
                  <td colSpan={6}>Kayıt bulunamadı.</td>
                </tr>
              ) : (
                gecmis.map((x) => (
                  <tr key={x.id}>
                    <td>{new Date(x.son_denemede || x.gonderim_zamani || x.olusturma_tarihi).toLocaleString("tr-TR")}</td>
                    <td>{x.hayvan ? `${x.hayvan.ad}${x.hayvan.tur ? ` (${x.hayvan.tur})` : ""}` : "-"}</td>
                    <td>{x.sahip ? `${x.sahip.ad} ${x.sahip.soyad}` : "-"}</td>
                    <td>{x.kanal === "whatsapp" || x.fallback_kanal === "whatsapp" ? "WhatsApp" : x.kanal}</td>
                    <td>
                      <span className={`durum-rozeti ${x.fallback_durum === "gonderildi" ? "durum-onay" : x.fallback_durum === "hata" ? "durum-iptal" : "durum-bekle"}`}>
                        {x.fallback_durum || "beklemede"}
                      </span>
                      {String(x.dis_kanal_mesaj_id || "").startsWith("mock-") ? <span className="iletisim-chip test">test</span> : null}
                    </td>
                    <td>{x.mesaj_ozet || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PanelShell>
  );
}

