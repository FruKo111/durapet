"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { publicApiBaseUrl } from "@/lib/public-env";

type KimlikDogrulama = {
  kimlik: {
    id: number;
    benzersiz_kimlik_no: string;
    hayvan: { id: number; ad: string; tur: string; irk: string | null };
    hayvan_foto_erisim_url?: string | null;
    kayip_hayvan_notu: string | null;
    iletisim_izni_var: boolean;
    sahip: { ad: string | null; soyad: string | null; telefon_maskeli: string | null };
  };
};

function PublicKimlikDogrulamaPage() {
  const params = useParams<{ kimlikNo: string }>();
  const search = useSearchParams();
  const token = String(search.get("t") || "");
  const kimlikNo = String(params.kimlikNo || "");
  const sahibeUlasRef = useRef<HTMLElement | null>(null);

  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [veri, setVeri] = useState<KimlikDogrulama["kimlik"] | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [konumGonderiliyor, setKonumGonderiliyor] = useState(false);
  const [konumMesaj, setKonumMesaj] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [form, setForm] = useState({ bulan_ad: "", bulan_telefon: "", mesaj: "" });

  const apiUrl = useMemo(
    () =>
      `${publicApiBaseUrl()}/api/v1/kimlik/dogrula/${encodeURIComponent(kimlikNo)}?t=${encodeURIComponent(token)}`,
    [kimlikNo, token]
  );

  useEffect(() => {
    async function yukle() {
      if (!kimlikNo || !token) {
        setHata("Geçersiz QR bağlantısı.");
        setYukleniyor(false);
        return;
      }
      setYukleniyor(true);
      setHata("");
      try {
        const yanit = await fetch(apiUrl, { cache: "no-store" });
        const json = (await yanit.json()) as KimlikDogrulama & { hata?: string };
        if (!yanit.ok || !json.kimlik) {
          setHata(json?.hata || "Kimlik doğrulanamadı.");
          setVeri(null);
          return;
        }
        setVeri(json.kimlik);
      } catch {
        setHata("Sunucuya ulaşılamadı.");
        setVeri(null);
      } finally {
        setYukleniyor(false);
      }
    }
    yukle();
  }, [apiUrl, kimlikNo, token]);

  const sahibeKaydir = useCallback(() => {
    sahibeUlasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>("#public-sahibe-ulas-ad");
      el?.focus();
    }, 400);
  }, []);

  async function talepGonder(e: FormEvent) {
    e.preventDefault();
    if (!veri || !token || !kimlikNo) return;
    setGonderiliyor(true);
    setHata("");
    setMesaj("");
    try {
      const yanit = await fetch(
        `${publicApiBaseUrl()}/api/v1/kimlik/dogrula/${encodeURIComponent(kimlikNo)}/iletisim-talebi?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const json = (await yanit.json()) as { mesaj?: string; hata?: string };
      if (!yanit.ok) {
        setHata(json.hata || "İletişim talebi gönderilemedi.");
        return;
      }
      setMesaj(json.mesaj || "İletişim talebiniz iletildi.");
      setForm({ bulan_ad: "", bulan_telefon: "", mesaj: "" });
    } catch {
      setHata("İletişim talebi gönderilemedi.");
    } finally {
      setGonderiliyor(false);
    }
  }

  async function dostumuzuBuldukKonum() {
    if (!veri || !token || !kimlikNo) return;
    setKonumMesaj("");
    setHata("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setHata("Tarayıcı konum desteği yok.");
      return;
    }
    setKonumGonderiliyor(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });
      const enlem = pos.coords.latitude;
      const boylam = pos.coords.longitude;
      const dogruluk_metre = pos.coords.accuracy != null ? pos.coords.accuracy : undefined;
      const yanit = await fetch(
        `${publicApiBaseUrl()}/api/v1/kimlik/dogrula/${encodeURIComponent(kimlikNo)}/konum-bildir?t=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enlem, boylam, dogruluk_metre }),
        }
      );
      const json = (await yanit.json()) as { mesaj?: string; hata?: string };
      if (!yanit.ok) {
        setHata(json.hata || "Konum gönderilemedi.");
        return;
      }
      setKonumMesaj(json.mesaj || "Konum sahibe iletildi. Teşekkürler!");
    } catch (e: unknown) {
      const geo = e as { code?: number; message?: string };
      const reddedildi = geo?.code === 1;
      setHata(
        reddedildi
          ? "Konum izni reddedildi. Ayarlardan izin verebilirsiniz."
          : "Konum alınamadı veya sunucuya gönderilemedi."
      );
    } finally {
      setKonumGonderiliyor(false);
    }
  }

  const sahipEtiket = veri
    ? [veri.sahip.ad, veri.sahip.soyad].filter(Boolean).join(" ") || "Bilgi gizli"
    : "";

  return (
    <main className="sayfa">
      <section className="kart public-kimlik-kart">
        <div className="public-kimlik-ust">
          <h1>Hayvanı mı gördünüz?</h1>
          <span>DuraPet · Güvenli künye</span>
        </div>

        <p className="public-kunye-uyari">
          Bu sayfa <strong>tasma / künye</strong> içindir: sağlık geçmişi, tam kimlik ve klinik bilgileri <strong>burada paylaşılmaz</strong>. Sahip ve veteriner bu verilere yalnızca
          uygulama veya giriş yapmış panel üzerinden erişir.
        </p>

        {yukleniyor ? <div className="toast">Yükleniyor…</div> : null}
        {hata ? <div className="hata">{hata}</div> : null}
        {mesaj ? <div className="toast">{mesaj}</div> : null}
        {konumMesaj ? <div className="toast">{konumMesaj}</div> : null}

        {veri ? (
          <>
            <div className="public-kunye-hero">
              <div className="public-kunye-foto-wrap">
                {veri.hayvan_foto_erisim_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={veri.hayvan_foto_erisim_url}
                    alt={`${veri.hayvan.ad} fotoğrafı`}
                    className="public-kunye-foto"
                  />
                ) : (
                  <div className="public-kunye-foto-bos">Fotoğraf yok</div>
                )}
              </div>
              <div className="public-kunye-hero-metin">
                <h2 className="public-kunye-hayvan-ad">{veri.hayvan.ad}</h2>
                <p className="public-kunye-hayvan-alt">
                  {veri.hayvan.tur}
                  {veri.hayvan.irk ? ` · ${veri.hayvan.irk}` : ""}
                </p>
                <dl className="public-kunye-dl">
                  <div>
                    <dt>Sahip (kısmi)</dt>
                    <dd>{sahipEtiket}</dd>
                  </div>
                  <div>
                    <dt>Telefon</dt>
                    <dd>{veri.sahip.telefon_maskeli || "—"}</dd>
                  </div>
                  {veri.kayip_hayvan_notu ? (
                    <div className="public-kunye-dl-tam">
                      <dt>Sahibin notu</dt>
                      <dd>{veri.kayip_hayvan_notu}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>

            <div className="public-kunye-cta-satir">
              <button
                type="button"
                className="dugme dugme-dostumuzu-buldum public-kunye-cta-konum"
                disabled={konumGonderiliyor}
                onClick={() => void dostumuzuBuldukKonum()}
              >
                {konumGonderiliyor ? "Gönderiliyor…" : "Hayvanı buldum — konumumu paylaş"}
              </button>
              <button
                type="button"
                className="dugme dugme-ana public-kunye-cta-iletisim"
                disabled={!veri.iletisim_izni_var}
                onClick={() => (veri.iletisim_izni_var ? sahibeKaydir() : undefined)}
                title={!veri.iletisim_izni_var ? "Sahip iletişim talebini kapatmış." : undefined}
              >
                Sahibine ulaş
              </button>
            </div>
            {!veri.iletisim_izni_var ? (
              <p className="public-konum-aciklama">Sahip şu an güvenli iletişim formunu kapatmış; yine de konum paylaşarak yardımcı olabilirsiniz.</p>
            ) : null}

            <p className="public-konum-aciklama">
              <strong>Konum:</strong> Yaklaşık GPS noktanız yalnızca hayvan sahibine iletilir; sahip bunu paneldeki bildirimler ve harita bölümünden görür.
              {process.env.NODE_ENV !== "production" ? (
                <>
                  {" "}
                  <strong>İpucu (geliştirme):</strong> Bazı tarayıcılar <code>http://192.168…</code> üzerinde konumu engeller —{" "}
                  <strong>https</strong> veya <code>localhost</code> deneyin.
                </>
              ) : (
                <> Konum için tarayıcının HTTPS üzerinden açılması gerekir.</>
              )}
            </p>

            <section ref={sahibeUlasRef} id="sahibe-ulas" className="public-kimlik-bolum">
              <div className="public-kimlik-bolum-baslik">
                <span className="public-kimlik-adim">✉</span>
                <div>
                  <h2>Sahibine ulaş</h2>
                  <p className="public-kimlik-bolum-alt">
                    Numaranız sahibe doğrudan görünmez; talep <strong>Bildirimler</strong> listesine düşer. Lütfen nerede gördüğünüzü kısaca yazın.
                  </p>
                </div>
              </div>
              {veri.iletisim_izni_var ? (
                <form className="form-grid public-kimlik-form" onSubmit={talepGonder}>
                  <input
                    id="public-sahibe-ulas-ad"
                    className="girdi"
                    placeholder="Adınız Soyadınız"
                    value={form.bulan_ad}
                    onChange={(e) => setForm((x) => ({ ...x, bulan_ad: e.target.value }))}
                    required
                  />
                  <input
                    className="girdi"
                    placeholder="Telefon numaranız"
                    value={form.bulan_telefon}
                    onChange={(e) => setForm((x) => ({ ...x, bulan_telefon: e.target.value }))}
                    required
                  />
                  <textarea
                    className="girdi"
                    rows={3}
                    placeholder="Nerede gördünüz, nasıl iletişelim?"
                    value={form.mesaj}
                    onChange={(e) => setForm((x) => ({ ...x, mesaj: e.target.value }))}
                    required
                  />
                  <button className="dugme dugme-ana" type="submit" disabled={gonderiliyor}>
                    {gonderiliyor ? "Gönderiliyor…" : "Talebi gönder"}
                  </button>
                </form>
              ) : (
                <div className="onboarding-kart">
                  <p>Bu hayvan için iletişim formu kapalı.</p>
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

export default function PublicKimlikPage() {
  return (
    <Suspense
      fallback={
        <main className="public-kimlik-ana">
          <div className="toast" style={{ margin: "2rem auto", maxWidth: 420 }}>
            Kimlik sayfası yükleniyor...
          </div>
        </main>
      }
    >
      <PublicKimlikDogrulamaPage />
    </Suspense>
  );
}
