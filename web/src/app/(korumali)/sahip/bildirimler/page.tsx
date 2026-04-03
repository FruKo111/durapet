"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleMapEmbed, googleHaritaDisUrl } from "@/components/google-map-embed";
import { PanelShell } from "@/components/panel-shell";
import { apiGet, apiPatch } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { ActivitySquare, Bell, CalendarPlus, ExternalLink, IdCard, LayoutDashboard, MapPin, MessageSquare, PawPrint } from "lucide-react";

type Bildirim = {
  id: number;
  tur: string | null;
  baslik: string;
  icerik: string | null;
  durum: string;
  referans_oda_id?: number | null;
  referans_hayvan_id?: number | null;
  referans_enlem?: number | null;
  referans_boylam?: number | null;
  olusturma_tarihi: string;
};

type Konum = {
  id: number;
  hayvan_id: number;
  hayvan_ad: string;
  enlem: number;
  boylam: number;
  dogruluk_metre: number | null;
  olusturma_tarihi: string;
};

function turEtiket(t: string | null | undefined) {
  switch (t) {
    case "yeni_mesaj":
      return "Mesaj";
    case "kayip_hayvan_bulundu_konum":
      return "Konum (QR)";
    case "kayip_hayvan_iletisim_talebi":
      return "İletişim talebi";
    default:
      return t && t.length > 0 ? t : "Bildirim";
  }
}

function SahipBildirimlerSayfasi() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vurguId = Number(searchParams.get("b") || "");
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.HAYVAN_SAHIBI);
  const [aktifMenu, setAktifMenu] = useState("bildirim");
  const [liste, setListe] = useState<Bildirim[]>([]);
  const [konumlar, setKonumlar] = useState<Konum[]>([]);
  const [veriHatasi, setVeriHatasi] = useState("");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);
  const vurguRef = useRef<HTMLDivElement | null>(null);

  const yukle = useCallback(async () => {
    if (!token) return;
    setVeriYukleniyor(true);
    setVeriHatasi("");
    try {
      const [b, k] = await Promise.all([
        apiGet<{ bildirimler: Bildirim[] }>("/api/v1/bildirimler?limit=80&offset=0", token),
        apiGet<{ konumlar: Konum[] }>("/api/v1/sahip/kayip-bulunan-konumlar?limit=50", token),
      ]);
      setListe(b.bildirimler || []);
      setKonumlar(k.konumlar || []);
    } catch (err) {
      setVeriHatasi(err instanceof Error ? err.message : "Veriler alınamadı.");
    } finally {
      setVeriYukleniyor(false);
    }
  }, [token]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  useEffect(() => {
    if (!Number.isFinite(vurguId) || vurguId <= 0) return;
    const t = window.setTimeout(() => {
      vurguRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => window.clearTimeout(t);
  }, [vurguId, liste]);

  useEffect(() => {
    if (aktifMenu === "dashboard") router.push("/sahip");
    if (aktifMenu === "kayit") router.push("/sahip");
    if (aktifMenu === "kimlik") router.push("/sahip");
    if (aktifMenu === "randevu") router.push("/sahip");
    if (aktifMenu === "mesaj") router.push("/sahip/mesajlar");
    if (aktifMenu === "gecmis") router.push("/sahip");
  }, [aktifMenu, router]);

  async function mesajaGit(b: Bildirim) {
    if (!token || b.tur !== "yeni_mesaj" || !b.referans_oda_id) return;
    try {
      await apiPatch(`/api/v1/bildirimler/${b.id}/okundu`, token, {});
    } catch {
      /* sessiz */
    }
    router.push(`/sahip/mesajlar?sohbet=${b.referans_oda_id}`);
  }

  if (yukleniyor || veriYukleniyor) return <div className="toast">Bildirimler yükleniyor...</div>;
  if (hata) return <div className="hata">{hata}</div>;
  if (veriHatasi) return <div className="hata">{veriHatasi}</div>;
  if (!profil || !token) return <div className="hata">Oturum bulunamadı.</div>;

  const kartlar = [
    { baslik: "Bildirim", deger: String(liste.length), aciklama: "Kayıtlı uyarı ve talepler" },
    { baslik: "Konum noktası", deger: String(konumlar.length), aciklama: "QR ile paylaşılan yerler" },
    { baslik: "Güvenli iletişim", deger: "Aktif", aciklama: "Talepler bu ekranda toplanır" },
  ];

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
      token={token}
      kullaniciId={profil.id}
      kartlar={kartlar}
    >
      <article className="kart bolum-kart">
        <h3 className="bolum-baslik">Bildirimler ve güvenli iletişim</h3>
        <p className="bildirim-sayfa-aciklama">
          QR ile gelen <strong>iletişim talepleri</strong> ve <strong>konum paylaşımları</strong> burada listelenir. Mesaj bildirimleri için &quot;Sohbete git&quot; ile Mesajlar
          sekmesine geçin.
        </p>
        <div className="bildirim-sayfa-liste">
          {liste.length === 0 ? (
            <div className="onboarding-kart">
              <p>Henüz bildirim yok.</p>
            </div>
          ) : (
            liste.map((x) => (
              <div
                key={x.id}
                ref={x.id === vurguId ? vurguRef : undefined}
                className={`bildirim-detay-kart ${x.id === vurguId ? "bildirim-detay-kart-vurgu" : ""}`}
              >
                <div className="bildirim-detay-ust">
                  <span className="bildirim-tur-rozet">{turEtiket(x.tur)}</span>
                  <strong>{x.baslik}</strong>
                  {x.durum !== "okundu" ? <span className="mesaj-okunmamis">yeni</span> : null}
                </div>
                <p className="bildirim-detay-icerik">{x.icerik || "—"}</p>
                <div className="bildirim-detay-alt">
                  <small>{new Date(x.olusturma_tarihi).toLocaleString("tr-TR")}</small>
                  <div className="bildirim-detay-aksiyonlar">
                    {x.tur === "yeni_mesaj" && x.referans_oda_id ? (
                      <button type="button" className="satir-dugme" onClick={() => void mesajaGit(x)}>
                        Sohbete git
                      </button>
                    ) : null}
                    {x.referans_enlem != null && x.referans_boylam != null ? (
                      <a
                        className="satir-dugme"
                        href={googleHaritaDisUrl(x.referans_enlem, x.referans_boylam)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <MapPin size={14} /> Google Haritalar’da aç
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
                {x.referans_enlem != null && x.referans_boylam != null ? (
                  <GoogleMapEmbed
                    enlem={x.referans_enlem}
                    boylam={x.referans_boylam}
                    baslik={`Bildirim konumu ${x.id}`}
                    yukseklik={200}
                  />
                ) : null}
              </div>
            ))
          )}
        </div>
      </article>

      <article className="kart bolum-kart">
        <h3 className="bolum-baslik">QR ile paylaşılan konumlar (harita)</h3>
        <p className="bildirim-sayfa-aciklama">
          Birisi kimlik QR’ını okutup konum gönderdiğinde kayıt burada birikir. Her satırda haritayı yeni sekmede veya küçük önizleme ile görebilirsiniz.
        </p>
        {konumlar.length === 0 ? (
          <div className="onboarding-kart">
            <p>Henüz paylaşılmış konum yok.</p>
          </div>
        ) : (
          <div className="konum-paylasim-liste">
            {konumlar.map((k) => (
              <div key={k.id} className="konum-paylasim-satir">
                <div>
                  <strong>{k.hayvan_ad}</strong>
                  <div className="konum-paylasim-meta">
                    {new Date(k.olusturma_tarihi).toLocaleString("tr-TR")}
                    {k.dogruluk_metre != null ? ` · ±${Math.round(k.dogruluk_metre)} m` : null}
                  </div>
                </div>
                <div className="konum-paylasim-sag">
                  <a
                    href={googleHaritaDisUrl(k.enlem, k.boylam)}
                    target="_blank"
                    rel="noreferrer"
                    className="satir-dugme"
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <ExternalLink size={14} /> Google Haritalar’da aç
                    </span>
                  </a>
                </div>
                <GoogleMapEmbed enlem={k.enlem} boylam={k.boylam} baslik={`${k.hayvan_ad} konumu`} yukseklik={240} />
              </div>
            ))}
          </div>
        )}
      </article>
    </PanelShell>
  );
}

export default function SahipBildirimlerPage() {
  return (
    <Suspense fallback={<div className="toast">Bildirimler yükleniyor...</div>}>
      <SahipBildirimlerSayfasi />
    </Suspense>
  );
}
