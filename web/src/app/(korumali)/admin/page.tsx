"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PanelShell } from "@/components/panel-shell";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { AlertCircle, CheckCircle2, CircleAlert, Clock3, LayoutDashboard, ShieldAlert, UserCog, Users } from "lucide-react";

export default function AdminSayfasi() {
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.ADMIN);
  const [aktifMenu, setAktifMenu] = useState("dashboard");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const [veriHatasi, setVeriHatasi] = useState("");
  const [islemMesaji, setIslemMesaji] = useState("");
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [toplamKullanici, setToplamKullanici] = useState(0);
  const [guvenlikLoglari, setGuvenlikLoglari] = useState<GuvenlikLog[]>([]);
  const [erisimLoglari, setErisimLoglari] = useState<ErisimLog[]>([]);
  const [operasyonOzet, setOperasyonOzet] = useState<OperasyonOzet | null>(null);
  const [klinikKpi, setKlinikKpi] = useState<KlinikKpi | null>(null);
  const [fallbackRapor, setFallbackRapor] = useState<FallbackRapor | null>(null);
  const [fallbackTrendler, setFallbackTrendler] = useState<FallbackTrendSatiri[]>([]);
  const [fallbackKuyruk, setFallbackKuyruk] = useState<FallbackKuyrukKaydi[]>([]);
  const [fallbackIsleniyor, setFallbackIsleniyor] = useState(false);
  const [fallbackKanalFiltre, setFallbackKanalFiltre] = useState("tum");
  const [fallbackDurumFiltre, setFallbackDurumFiltre] = useState("tum");
  const [fallbackKlinikFiltre, setFallbackKlinikFiltre] = useState("tum");
  const [fallbackGunFiltre, setFallbackGunFiltre] = useState(7);
  const [vetForm, setVetForm] = useState({
    eposta: "",
    sifre: "Veteriner123!",
    ad: "",
    soyad: "",
    diploma_no: "",
    klinik_adi: "",
  });
  const [globalArama, setGlobalArama] = useState("");
  const [sonAksiyon, setSonAksiyon] = useState("");
  const [aktifAksiyonAnahtari, setAktifAksiyonAnahtari] = useState("");
  const [sifreModal, setSifreModal] = useState<{ id: string; adSoyad: string } | null>(null);
  const [yeniSifre, setYeniSifre] = useState("");
  const [sirYenidenSifreleniyor, setSirYenidenSifreleniyor] = useState(false);
  const debouncedArama = useDebouncedValue(globalArama, 400);
  const [kullaniciSirala, setKullaniciSirala] = useState("ad_asc");
  const [kullaniciRolFiltre, setKullaniciRolFiltre] = useState("tum");
  const [kullaniciAktifFiltre, setKullaniciAktifFiltre] = useState("tum");
  const [kullaniciSayfa, setKullaniciSayfa] = useState(1);
  const [detayModal, setDetayModal] = useState<{ baslik: string; veri: unknown } | null>(null);

  const verileriYukle = useCallback(async () => {
    if (!token) return;
    const limit = 8;
    const offset = (kullaniciSayfa - 1) * limit;
    const [kullanicilarCevap, guvenlikCevap, erisimCevap, operasyonCevap, klinikKpiCevap, fallbackRaporCevap, fallbackKuyrukCevap] = await Promise.all([
      apiGet<{ kullanicilar: Kullanici[]; toplam_kayit?: number }>(
        `/api/v1/admin/kullanicilar?limit=${limit}&offset=${offset}&arama=${encodeURIComponent(debouncedArama)}&sirala=${kullaniciSirala}&rol_id=${encodeURIComponent(kullaniciRolFiltre)}&aktif_durum=${encodeURIComponent(kullaniciAktifFiltre)}`,
        token
      ),
      apiGet<{ loglar: GuvenlikLog[] }>("/api/v1/admin/guvenlik-loglari?limit=20", token),
      apiGet<{ loglar: ErisimLog[] }>("/api/v1/admin/erisim-loglari?limit=20", token),
      apiGet<{ performans: OperasyonOzet }>("/api/v1/admin/operasyon/ozet?limit=20", token),
      apiGet<KlinikKpi>("/api/v1/admin/klinik-kpi", token),
      apiGet<{ rapor: FallbackRapor; trendler: FallbackTrendSatiri[]; kayitlar: FallbackKuyrukKaydi[] }>(
        `/api/v1/admin/bildirimler/fallback-rapor?limit=300&kanal=${fallbackKanalFiltre}&durum=${fallbackDurumFiltre}&klinik=${encodeURIComponent(fallbackKlinikFiltre)}&gun=${fallbackGunFiltre}`,
        token
      ),
      apiGet<{ kuyruk_sayisi: number; kayitlar: FallbackKuyrukKaydi[] }>(
        `/api/v1/admin/bildirimler/fallback-kuyruk?limit=20&kanal=${fallbackKanalFiltre}&durum=${fallbackDurumFiltre}&klinik=${encodeURIComponent(fallbackKlinikFiltre)}`,
        token
      ),
    ]);
    setKullanicilar(kullanicilarCevap.kullanicilar || []);
    setToplamKullanici(kullanicilarCevap.toplam_kayit ?? (kullanicilarCevap.kullanicilar || []).length);
    setGuvenlikLoglari(guvenlikCevap.loglar || []);
    setErisimLoglari(erisimCevap.loglar || []);
    setOperasyonOzet(operasyonCevap.performans || null);
    setKlinikKpi(klinikKpiCevap || null);
    setFallbackRapor(fallbackRaporCevap.rapor || null);
    setFallbackTrendler(fallbackRaporCevap.trendler || []);
    setFallbackKuyruk(fallbackKuyrukCevap.kayitlar || []);
  }, [token, debouncedArama, kullaniciSirala, kullaniciRolFiltre, kullaniciAktifFiltre, kullaniciSayfa, fallbackKanalFiltre, fallbackDurumFiltre, fallbackKlinikFiltre, fallbackGunFiltre]);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      setVeriHatasi("");
      try {
        await verileriYukle();
      } catch (err) {
        setVeriHatasi(err instanceof Error ? err.message : "Veriler alinamadi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token, verileriYukle]);

  useEffect(() => {
    setKullaniciSayfa(1);
  }, [debouncedArama, kullaniciSirala, kullaniciRolFiltre, kullaniciAktifFiltre]);

  useEffect(() => {
    if (aktifMenu !== "dashboard") setAktifAksiyonAnahtari("");
  }, [aktifMenu]);

  async function veterinerOlustur(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setIslemMesaji("");
    try {
      await apiPost("/api/v1/admin/veterinerler", token, vetForm);
      setIslemMesaji("Veteriner hesabı oluşturuldu.");
      setSonAksiyon("Veteriner hesabı oluşturuldu");
      setAktifMenu("dashboard");
      setVetForm({
        eposta: "",
        sifre: "Veteriner123!",
        ad: "",
        soyad: "",
        diploma_no: "",
        klinik_adi: "",
      });
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Veteriner oluşturulamadı.");
    }
  }

  async function fallbackKuyrukIsle() {
    if (!token) return;
    setFallbackIsleniyor(true);
    try {
      const cevap = await apiPost<{ islenen_kayit: number }>("/api/v1/admin/bildirimler/fallback/kuyruk-isle?limit=20", token, {});
      setIslemMesaji(`Yedek kanal kuyrugu isletildi. Islenen kayit: ${cevap.islenen_kayit}`);
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Yedek kanal kuyrugu islenemedi.");
    } finally {
      setFallbackIsleniyor(false);
    }
  }

  async function kullaniciDurumDegistir(kullanici: Kullanici, aktif: boolean) {
    if (!token) return;
    try {
      await apiPatch(`/api/v1/admin/kullanicilar/${kullanici.id}/durum`, token, { aktif });
      setIslemMesaji(aktif ? "Kullanici aktif edildi." : "Kullanici pasife alindi.");
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Kullanici durumu guncellenemedi.");
    }
  }

  async function kullaniciSil(kullanici: Kullanici, kalici: boolean) {
    if (!token) return;
    const onay = window.confirm(
      kalici
        ? `${kullanici.ad} ${kullanici.soyad} kullanicisini kalici silmek istediginize emin misiniz?`
        : `${kullanici.ad} ${kullanici.soyad} kullanicisini pasife almak istediginize emin misiniz?`
    );
    if (!onay) return;
    try {
      await apiPost(`/api/v1/admin/kullanicilar/${kullanici.id}/sil`, token, {
        kalici,
        onay_metni: kalici ? "SIL" : null,
      });
      setIslemMesaji(kalici ? "Kullanici kalici silindi." : "Kullanici pasife alindi.");
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Silme islemi basarisiz.");
    }
  }

  async function kullaniciSifresiniDegistir() {
    if (!token || !sifreModal) return;
    if (yeniSifre.trim().length < 8) {
      setIslemMesaji("Yeni sifre en az 8 karakter olmalidir.");
      return;
    }
    try {
      await apiPost(`/api/v1/admin/kullanicilar/${sifreModal.id}/sifre`, token, {
        yeni_sifre: yeniSifre,
      });
      setIslemMesaji("Kullanici sifresi guncellendi.");
      setYeniSifre("");
      setSifreModal(null);
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Sifre guncellenemedi.");
    }
  }

  async function klinikSirlariYenidenSifrele() {
    if (!token) return;
    setSirYenidenSifreleniyor(true);
    try {
      const cevap = await apiPost<{ toplam: number; guncellenen: number; atlanan: number }>(
        "/api/v1/admin/iletisim/sirlar-yeniden-sifrele",
        token,
        {}
      );
      setIslemMesaji(
        `Klinik sir sifreleme tamamlandi. Toplam: ${cevap.toplam}, guncellenen: ${cevap.guncellenen}, atlanan: ${cevap.atlanan}`
      );
      await verileriYukle();
    } catch (err) {
      setIslemMesaji(err instanceof Error ? err.message : "Klinik sir sifreleme islemi basarisiz.");
    } finally {
      setSirYenidenSifreleniyor(false);
    }
  }

  if (yukleniyor) return <Durum mesaj="Admin paneli yükleniyor..." />;
  if (hata) return <Durum mesaj={hata} hata />;
  if (!profil) return <Durum mesaj="Profil bulunamadı." hata />;

  const aktifKullanici = kullanicilar.filter((x) => x.aktif).length;
  const kritikGuvenlik = guvenlikLoglari.filter((x) => x.seviye === "kritik").length;
  const ortalamaMs = operasyonOzet?.endpointler?.length
    ? Math.round(operasyonOzet.endpointler.reduce((acc, x) => acc + x.ortalama_ms, 0) / operasyonOzet.endpointler.length)
    : 0;
  const kullaniciToplamSayfa = Math.max(1, Math.ceil(toplamKullanici / 8));
  const kullaniciAktifSayfa = Math.min(kullaniciSayfa, kullaniciToplamSayfa);
  const toplamIstek = operasyonOzet?.toplam_istek ?? 0;

  return (
    <PanelShell
      rol="Admin"
      adSoyad={`${profil.ad} ${profil.soyad}`}
      menu={[
        { id: "dashboard", etiket: "Gösterge", aciklama: "Genel özet", ikon: <LayoutDashboard size={15} /> },
        { id: "veteriner", etiket: "Veteriner Yönetimi", aciklama: "Hesap aç / düzenle", ikon: <UserCog size={15} /> },
        { id: "loglar", etiket: "Güvenlik Logları", aciklama: "Sistem hareketleri", ikon: <ShieldAlert size={15} /> },
      ]}
      aktifMenu={aktifMenu}
      menuDegistir={setAktifMenu}
      aramaDegeri={globalArama}
      aramaDegistir={setGlobalArama}
      aramaPlaceholder="Kullanıcı veya rol ara"
      token={token}
      kullaniciId={profil.id}
      kartlar={[
        { baslik: "Toplam Kullanıcı", deger: String(kullanicilar.length), aciklama: `Aktif hesap: ${aktifKullanici}` },
        { baslik: "Güvenlik Olayı", deger: String(guvenlikLoglari.length), aciklama: `Kritik seviye: ${kritikGuvenlik}` },
        { baslik: "Ortalama Yanıt", deger: `${ortalamaMs} ms`, aciklama: `Toplam istek: ${operasyonOzet?.toplam_istek ?? 0}` },
      ]}
    >
      {veriYukleniyor ? <Durum mesaj="Panel verileri yükleniyor..." /> : null}
      {veriHatasi ? <Durum mesaj={veriHatasi} hata /> : null}
      {islemMesaji ? <Durum mesaj={islemMesaji} /> : null}
      {sonAksiyon ? <div className="aksiyon-durum-bandi">Son aksiyon: {sonAksiyon}</div> : null}
      {!veriYukleniyor && !veriHatasi ? (
        <>
          {aktifMenu === "dashboard" ? (
            <div style={{ display: "grid", gap: 14 }}>
              <article className="kart bolum-ust">
                <div>
                  <h3 className="bolum-ust-baslik">Yönetim Merkezi</h3>
                  <p className="bolum-ust-metin">
                    Kullanıcı yönetimi, güvenlik olayları ve operasyon metriklerini tek noktadan takip et.
                  </p>
                </div>
                <div className="aksiyon-satir">
                  <button className="pro-aksiyon-dugme" data-active={aktifAksiyonAnahtari === "vet-hesap"} onClick={() => { setAktifAksiyonAnahtari("vet-hesap"); setAktifMenu("veteriner"); setSonAksiyon("Veteriner hesap acma ekranina gecildi"); }}>
                    <UserCog size={14} /> Veteriner Hesabi Ac
                  </button>
                  <button className="pro-aksiyon-dugme" data-active={aktifAksiyonAnahtari === "guvenlik-log"} onClick={() => { setAktifAksiyonAnahtari("guvenlik-log"); setAktifMenu("loglar"); setSonAksiyon("Guvenlik loglari acildi"); }}>
                    <ShieldAlert size={14} /> Guvenlik Loglarini Ac
                  </button>
                </div>
              </article>
              <section className="oncelik-grid">
                <article className="kart oncelik-kart" data-tip="acil">
                  <div className="oncelik-kart-baslik"><CircleAlert size={16} /> Kritik Olay</div>
                  <div className="oncelik-kart-deger">{kritikGuvenlik}</div>
                  <p>Kritik guvenlik olaylari. Oncelikli takibi onerilir.</p>
                </article>
                <article className="kart oncelik-kart" data-tip="bugun">
                  <div className="oncelik-kart-baslik"><Users size={16} /> Aktif Kullanıcı</div>
                  <div className="oncelik-kart-deger">{aktifKullanici}</div>
                  <p>Sistemde aktif olan kullanicilarin mevcut dagilimi.</p>
                </article>
                <article className="kart oncelik-kart" data-tip="bekleyen">
                  <div className="oncelik-kart-baslik"><Clock3 size={16} /> Toplam Istek</div>
                  <div className="oncelik-kart-deger">{toplamIstek}</div>
                  <p>Operasyon metriklerinden toplanan toplam API istegi.</p>
                </article>
              </section>
              <div className="hizli-aksiyon-grid">
                <article className="kart hizli-aksiyon">
                  <h4>Veteriner hesabi ac</h4>
                  <p>Yeni veteriner kullanicisini hizli sekilde olustur.</p>
                  <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-vet"); setAktifMenu("veteriner"); setSonAksiyon("Hizli veteriner hesap aksiyonu calistirildi"); }}>
                    <UserCog size={14} /> Hesap Acma Ekrani
                  </button>
                </article>
                <article className="kart hizli-aksiyon">
                  <h4>Kritik loglari incele</h4>
                  <p>Guvenlik olaylarini log ekraninda takip et.</p>
                  <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-log"); setAktifMenu("loglar"); setSonAksiyon("Hizli guvenlik logu aksiyonu calistirildi"); }}>
                    <ShieldAlert size={14} /> Log Ekranina Git
                  </button>
                </article>
                <article className="kart hizli-aksiyon">
                  <h4>Filtreyi temizle</h4>
                  <p>Arama filtresini sifirlayip tum kayitlari getir.</p>
                  <button className="pro-aksiyon-dugme" onClick={() => { setAktifAksiyonAnahtari("hizli-filtre"); setGlobalArama(""); setSonAksiyon("Arama filtresi sifirlandi"); }}>
                    <LayoutDashboard size={14} /> Filtreyi Sifirla
                  </button>
                </article>
              </div>
              <article className="kart bolum-kart">
                <h3 className="bolum-baslik">Kullanıcı Tablosu</h3>
                <div className="sayfalama">
                  <div className="sayfalama-bilgi">Toplam kayıt: {toplamKullanici}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button className="satir-dugme" onClick={() => setKullaniciAktifFiltre("tum")} disabled={kullaniciAktifFiltre === "tum"}>
                      Tumu
                    </button>
                    <button className="satir-dugme" onClick={() => setKullaniciAktifFiltre("aktif")} disabled={kullaniciAktifFiltre === "aktif"}>
                      Aktif
                    </button>
                    <button className="satir-dugme" onClick={() => setKullaniciAktifFiltre("pasif")} disabled={kullaniciAktifFiltre === "pasif"}>
                      Pasif
                    </button>
                    <select className="girdi" style={{ maxWidth: 180 }} value={kullaniciRolFiltre} onChange={(e) => setKullaniciRolFiltre(e.target.value)}>
                      <option value="tum">Rol: Tum</option>
                      <option value="1">Rol: Admin</option>
                      <option value="2">Rol: Veteriner</option>
                      <option value="3">Rol: Sahip</option>
                    </select>
                    <select className="girdi" style={{ maxWidth: 220 }} value={kullaniciSirala} onChange={(e) => setKullaniciSirala(e.target.value)}>
                      <option value="ad_asc">Ada gore (A-Z)</option>
                      <option value="ad_desc">Ada gore (Z-A)</option>
                      <option value="rol">Role gore</option>
                    </select>
                  </div>
                </div>
                <table className="tablo">
                  <thead>
                    <tr><th>Ad Soyad</th><th>Rol</th><th>Durum</th><th>Iletisim</th><th>ID</th><th>Detay</th><th>Islemler</th></tr>
                  </thead>
                  <tbody>
                    {kullanicilar.map((x) => (
                      <tr key={x.id}>
                        <td>{x.ad} {x.soyad}</td>
                        <td>{rolMetni(x.rol_id)}</td>
                        <td><span className={`durum-rozeti ${x.aktif ? "durum-onay" : "durum-iptal"}`}>{x.aktif ? "Aktif" : "Pasif"}</span></td>
                        <td style={{ fontSize: 12 }}>
                          <div>{x.eposta || "-"}</div>
                          <div>{x.telefon || "-"}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>{x.id.slice(0, 8)}...</td>
                        <td><button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Kullanıcı Detayı", veri: x })}>İncele</button></td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button className="satir-dugme" onClick={() => kullaniciDurumDegistir(x, !x.aktif)}>
                              {x.aktif ? "Pasife Al" : "Aktif Et"}
                            </button>
                            <button
                              className="satir-dugme"
                              onClick={() => {
                                setYeniSifre("");
                                setSifreModal({ id: x.id, adSoyad: `${x.ad} ${x.soyad}` });
                              }}
                            >
                              Sifre Degistir
                            </button>
                            {x.rol_id !== 1 ? (
                              <button className="satir-dugme" onClick={() => kullaniciSil(x, true)}>
                                Kalici Sil
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {kullanicilar.length === 0 ? (
                      <tr><td colSpan={7}>Aramaya uygun kullanıcı bulunamadı.</td></tr>
                    ) : null}
                  </tbody>
                </table>
                <div className="sayfalama">
                  <div className="sayfalama-bilgi">Sayfa {kullaniciAktifSayfa} / {kullaniciToplamSayfa}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="satir-dugme" disabled={kullaniciAktifSayfa <= 1} onClick={() => setKullaniciSayfa((x) => Math.max(1, x - 1))}>Önceki</button>
                    <button className="satir-dugme" disabled={kullaniciAktifSayfa >= kullaniciToplamSayfa} onClick={() => setKullaniciSayfa((x) => Math.min(kullaniciToplamSayfa, x + 1))}>Sonraki</button>
                  </div>
                </div>
              </article>

              <article className="kart bolum-kart">
                <h3 className="bolum-baslik">Son İşlemler</h3>
                {guvenlikLoglari.length === 0 ? (
                  <div className="onboarding-kart">
                    <h4>Henuz guvenlik olayi yok</h4>
                    <p>Panel aktif kullanima alindikca kritik ve bilgi loglari bu alanda listelenir.</p>
                  </div>
                ) : (
                  <div className="zaman-cizelgesi">
                    {guvenlikLoglari.slice(0, 5).map((x) => (
                      <div className="zaman-cizelgesi-item" key={x.id}>
                        <div className="zaman-cizelgesi-ust">
                          <strong>{x.olay_turu}</strong>
                          <span className={`durum-rozeti ${x.seviye === "kritik" ? "durum-iptal" : "durum-bekle"}`}>{x.seviye}</span>
                        </div>
                        <div className="zaman-cizelgesi-zaman">{new Date(x.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="kart bolum-kart">
                <h3 className="bolum-baslik">Operasyon Özet Kartı</h3>
                {!operasyonOzet ? (
                  <div className="onboarding-kart">
                    <h4>Operasyon verisi bekleniyor</h4>
                    <p>Sunucu metrikleri geldikce bu alanda canli performans ozetini goreceksin.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="panel-grid-3">
                      <div className="onboarding-kart">
                        <h4>Toplam Istek</h4>
                        <p>{operasyonOzet.toplam_istek}</p>
                      </div>
                      <div className="onboarding-kart">
                        <h4>Aktif Istek</h4>
                        <p>{operasyonOzet.aktif_istek}</p>
                      </div>
                      <div className="onboarding-kart">
                        <h4>Uptime</h4>
                        <p>{Math.floor((operasyonOzet.uptime_saniye || 0) / 60)} dk</p>
                      </div>
                    </div>
                    <table className="tablo">
                      <thead>
                        <tr><th>Endpoint</th><th>İstek</th><th>Ort. ms</th><th>Min</th><th>Max</th><th>Son Durum</th></tr>
                      </thead>
                      <tbody>
                        {(operasyonOzet.endpointler || []).slice(0, 10).map((x) => (
                          <tr key={x.endpoint}>
                            <td style={{ fontSize: 12 }}>{x.endpoint}</td>
                            <td>{x.istek_sayisi}</td>
                            <td>{x.ortalama_ms}</td>
                            <td>{x.min_ms}</td>
                            <td>{x.max_ms}</td>
                            <td>{x.son_durum}</td>
                          </tr>
                        ))}
                        {(operasyonOzet.endpointler || []).length === 0 ? (
                          <tr><td colSpan={6}>Henüz endpoint metriği oluşmadı.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
              <article className="kart bolum-kart">
                <h3 className="bolum-baslik">Klinik KPI Ozeti</h3>
                {!klinikKpi ? (
                  <div className="onboarding-kart">
                    <h4>Klinik KPI bekleniyor</h4>
                    <p>Donemsel no-show, checkout ve bekleme suresi buradan izlenir.</p>
                  </div>
                ) : (
                  <div className="panel-grid-3">
                    <div className="onboarding-kart">
                      <h4>No-show Orani</h4>
                      <p>%{klinikKpi.no_show_orani}</p>
                    </div>
                    <div className="onboarding-kart">
                      <h4>Checkout Tamamlama</h4>
                      <p>%{klinikKpi.checkout_tamamlama_orani}</p>
                    </div>
                    <div className="onboarding-kart">
                      <h4>Ort. Bekleme</h4>
                      <p>{klinikKpi.ortalama_bekleme_dk} dk</p>
                    </div>
                  </div>
                )}
              </article>
              <article className="kart bolum-kart">
                <h3 className="bolum-baslik">Bildirim Yedek Kanal Merkezi</h3>
                {!fallbackRapor ? (
                  <div className="onboarding-kart">
                    <h4>Yedek kanal raporu bekleniyor</h4>
                    <p>Dis kanal yedek gonderim ozetleri yuklenemedi veya henuz kayit yok.</p>
                  </div>
                ) : (
                  <>
                    <div className="panel-grid-3">
                      <div className="onboarding-kart">
                        <h4>Gonderildi</h4>
                        <p>{fallbackRapor.gonderildi}</p>
                      </div>
                      <div className="onboarding-kart">
                        <h4>Kuyrukta</h4>
                        <p>{fallbackRapor.sirada}</p>
                      </div>
                      <div className="onboarding-kart">
                        <h4>Hata</h4>
                        <p>{fallbackRapor.hata}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                      <small>Ortalama tekrar denemesi: {fallbackRapor.ortalama_retry}</small>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select className="girdi" value={fallbackKanalFiltre} onChange={(e) => setFallbackKanalFiltre(e.target.value)}>
                          <option value="tum">Kanal: Tum</option>
                          <option value="whatsapp">Kanal: WhatsApp</option>
                          <option value="sms">Kanal: SMS</option>
                          <option value="arama">Kanal: Arama</option>
                        </select>
                        <select className="girdi" value={fallbackDurumFiltre} onChange={(e) => setFallbackDurumFiltre(e.target.value)}>
                          <option value="tum">Durum: Tum</option>
                          <option value="gonderildi">Durum: Gonderildi</option>
                          <option value="hata">Durum: Hata</option>
                          <option value="sirada">Durum: Sirada</option>
                          <option value="beklemede">Durum: Beklemede</option>
                        </select>
                        <select className="girdi" value={String(fallbackGunFiltre)} onChange={(e) => setFallbackGunFiltre(Number(e.target.value))}>
                          <option value="7">Son 7 gun</option>
                          <option value="14">Son 14 gun</option>
                          <option value="30">Son 30 gun</option>
                        </select>
                        <select className="girdi" value={fallbackKlinikFiltre} onChange={(e) => setFallbackKlinikFiltre(e.target.value)}>
                          <option value="tum">Klinik: Tum</option>
                          {Object.keys(fallbackRapor.klinik_bazli || {}).map((klinik) => (
                            <option value={klinik} key={klinik}>Klinik: {klinik}</option>
                          ))}
                        </select>
                        <button className="satir-dugme" onClick={fallbackKuyrukIsle} disabled={fallbackIsleniyor}>
                          {fallbackIsleniyor ? "Kuyruk isleniyor..." : "Yedek Kanal Kuyrugunu Islet"}
                        </button>
                        <button className="satir-dugme" onClick={klinikSirlariYenidenSifrele} disabled={sirYenidenSifreleniyor}>
                          {sirYenidenSifreleniyor ? "Sifreleme calisiyor..." : "Klinik Sirlarini Yeniden Sifrele"}
                        </button>
                      </div>
                    </div>
                    <table className="tablo" style={{ marginTop: 10 }}>
                      <thead>
                        <tr><th>Tarih</th><th>Toplam</th><th>Gonderildi</th><th>Hata</th><th>Sirada</th></tr>
                      </thead>
                      <tbody>
                        {fallbackTrendler.map((x) => (
                          <tr key={x.tarih}>
                            <td>{x.tarih}</td>
                            <td>{x.toplam}</td>
                            <td>{x.gonderildi}</td>
                            <td>{x.hata}</td>
                            <td>{x.sirada}</td>
                          </tr>
                        ))}
                        {fallbackTrendler.length === 0 ? (
                          <tr><td colSpan={5}>Secilen filtrelerde trend verisi yok.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                    <table className="tablo" style={{ marginTop: 10 }}>
                      <thead>
                        <tr><th>ID</th><th>Klinik</th><th>Kanal</th><th>Durum</th><th>Tekrar</th><th>Sonraki Deneme</th><th>Hata</th></tr>
                      </thead>
                      <tbody>
                        {fallbackKuyruk.map((x) => (
                          <tr key={x.id}>
                            <td>{x.id}</td>
                            <td>{x.klinik_adi || "-"}</td>
                            <td>{x.fallback_kanal || "-"}</td>
                            <td>{x.fallback_durum || "-"}</td>
                            <td>{x.retry_sayisi ?? 0}</td>
                            <td>{x.sonraki_deneme_kalan_sn ?? 0} sn</td>
                            <td style={{ fontSize: 12 }}>{x.son_hata || "-"}</td>
                          </tr>
                        ))}
                        {fallbackKuyruk.length === 0 ? (
                          <tr><td colSpan={7}>Kuyrukta bekleyen yedek kanal kaydi yok.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </>
                )}
              </article>
            </div>
          ) : null}

          {aktifMenu === "veteriner" ? (
            <div style={{ display: "grid", gap: 14 }}>
              <article className="kart bolum-ust">
                <div>
                  <h3 className="bolum-ust-baslik">Veteriner Hesabı Aç</h3>
                  <p className="bolum-ust-metin">Gerekli kimlik ve klinik bilgilerini girerek yeni veteriner kaydını oluştur.</p>
                </div>
              </article>
              <article className="kart bolum-kart">
                <form className="form-grid" onSubmit={veterinerOlustur}>
                  <input className="girdi" placeholder="E-posta" value={vetForm.eposta} onChange={(e) => setVetForm((x) => ({ ...x, eposta: e.target.value }))} required />
                  <div className="alan-yardim" data-valid={String(vetForm.eposta.includes("@"))}>
                    {vetForm.eposta.includes("@") ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    Kurumsal e-posta ile hesap acilmasi onerilir.
                  </div>
                  <input className="girdi" placeholder="Sifre" value={vetForm.sifre} onChange={(e) => setVetForm((x) => ({ ...x, sifre: e.target.value }))} required />
                  <div className="alan-yardim" data-valid={String(vetForm.sifre.length >= 8)}>
                    {vetForm.sifre.length >= 8 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    En az 8 karakter zorunlu.
                  </div>
                  <input className="girdi" placeholder="Ad" value={vetForm.ad} onChange={(e) => setVetForm((x) => ({ ...x, ad: e.target.value }))} required />
                  <input className="girdi" placeholder="Soyad" value={vetForm.soyad} onChange={(e) => setVetForm((x) => ({ ...x, soyad: e.target.value }))} required />
                  <input className="girdi" placeholder="Diploma No" value={vetForm.diploma_no} onChange={(e) => setVetForm((x) => ({ ...x, diploma_no: e.target.value }))} required />
                  <div className="alan-yardim" data-valid={String(vetForm.diploma_no.trim().length >= 5)}>
                    {vetForm.diploma_no.trim().length >= 5 ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    Diploma numarasi denetim icin kullanilir.
                  </div>
                  <input className="girdi" placeholder="Klinik Adi" value={vetForm.klinik_adi} onChange={(e) => setVetForm((x) => ({ ...x, klinik_adi: e.target.value }))} />
                  <button className="dugme dugme-ana" type="submit">Kaydi Ac</button>
                </form>
              </article>
            </div>
          ) : null}

          {aktifMenu === "loglar" ? (
            <article className="kart bolum-kart">
              <h3 className="bolum-baslik">Güvenlik Logları</h3>
              <table className="tablo">
                <thead>
                  <tr><th>Seviye</th><th>Olay</th><th>Zaman</th><th>Detay</th></tr>
                </thead>
                <tbody>
                  {guvenlikLoglari.slice(0, 20).map((x) => (
                    <tr key={x.id}>
                      <td><span className={`durum-rozeti ${x.seviye === "kritik" ? "durum-iptal" : "durum-bekle"}`}>{x.seviye}</span></td>
                      <td>{x.olay_turu}</td>
                      <td>{new Date(x.olusturma_tarihi).toLocaleString("tr-TR")}</td>
                      <td><button className="satir-dugme" onClick={() => setDetayModal({ baslik: "Güvenlik Olayı", veri: x })}>İncele</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}
        </>
      ) : null}
      {detayModal ? (
        <DetayModal baslik={detayModal.baslik} veri={detayModal.veri} kapat={() => setDetayModal(null)} />
      ) : null}
      {sifreModal ? (
        <SifreModal
          adSoyad={sifreModal.adSoyad}
          sifre={yeniSifre}
          sifreDegistir={setYeniSifre}
          onayla={kullaniciSifresiniDegistir}
          kapat={() => {
            setSifreModal(null);
            setYeniSifre("");
          }}
        />
      ) : null}
    </PanelShell>
  );
}

function Durum({ mesaj, hata }: { mesaj: string; hata?: boolean }) {
  return <main className="sayfa">{hata ? <div className="hata">{mesaj}</div> : <div>{mesaj}</div>}</main>;
}

function rolMetni(rolId: number) {
  if (rolId === 1) return "Admin";
  if (rolId === 2) return "Veteriner";
  if (rolId === 3) return "Sahip";
  return "Bilinmiyor";
}

type Kullanici = {
  id: string;
  rol_id: number;
  ad: string;
  soyad: string;
  telefon?: string | null;
  eposta?: string | null;
  aktif: boolean;
};

type GuvenlikLog = {
  id: number;
  seviye: string;
  olay_turu: string;
  olusturma_tarihi: string;
};

type ErisimLog = {
  id: number;
};

type OperasyonOzet = {
  baslangic: string;
  uptime_saniye: number;
  toplam_istek: number;
  aktif_istek: number;
  durum_kodlari: Record<string, number>;
  endpointler: Array<{
    endpoint: string;
    istek_sayisi: number;
    ortalama_ms: number;
    min_ms: number;
    max_ms: number;
    son_durum: number;
    son_istek_tarihi: string | null;
  }>;
};

type KlinikKpi = {
  donem?: { baslangic: string; bitis: string };
  toplam_randevu: number;
  tamamlanan_randevu: number;
  no_show_randevu: number;
  no_show_orani: number;
  checkout_tamamlama_orani: number;
  ortalama_bekleme_dk: number;
};

type FallbackRapor = {
  toplam: number;
  gonderildi: number;
  hata: number;
  sirada: number;
  beklemede: number;
  kanal_bazli: Record<string, number>;
  klinik_bazli: Record<string, number>;
  ortalama_retry: number;
};

type FallbackKuyrukKaydi = {
  id: number;
  klinik_adi?: string | null;
  fallback_kanal?: string | null;
  fallback_durum?: string | null;
  retry_sayisi?: number | null;
  sonraki_deneme_kalan_sn?: number | null;
  son_hata?: string | null;
};

type FallbackTrendSatiri = {
  tarih: string;
  toplam: number;
  gonderildi: number;
  hata: number;
  sirada: number;
  beklemede: number;
};

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

function SifreModal({
  adSoyad,
  sifre,
  sifreDegistir,
  onayla,
  kapat,
}: {
  adSoyad: string;
  sifre: string;
  sifreDegistir: (v: string) => void;
  onayla: () => void;
  kapat: () => void;
}) {
  return (
    <div className="modal-arkaplan" onClick={kapat}>
      <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-baslik">Sifre Degistir</h4>
        <p style={{ marginTop: 0 }}>{adSoyad} icin yeni sifre belirleyin.</p>
        <input
          className="girdi"
          type="password"
          placeholder="Yeni sifre (en az 8 karakter)"
          value={sifre}
          onChange={(e) => sifreDegistir(e.target.value)}
        />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="satir-dugme" onClick={kapat}>
            Vazgec
          </button>
          <button className="dugme dugme-ana" onClick={onayla}>
            Sifreyi Guncelle
          </button>
        </div>
      </div>
    </div>
  );
}

