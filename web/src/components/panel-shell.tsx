"use client";

import { Bell, LogOut, PanelLeftClose, PanelLeftOpen, Shield, Stethoscope, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";

const DURAPET_LOGO_URL = process.env.NEXT_PUBLIC_DURAPET_LOGO_URL ?? "/durapet-logo.png";

type Kart = {
  baslik: string;
  deger: string;
  aciklama: string;
  trend?: number[];
};

type MenuItem = {
  id: string;
  etiket: string;
  aciklama?: string;
  ikon?: ReactNode;
};

export function PanelShell({
  rol,
  adSoyad,
  kartlar,
  menu,
  aktifMenu,
  menuDegistir,
  aramaDegeri,
  aramaDegistir,
  aramaPlaceholder,
  token,
  kullaniciId,
  children,
}: {
  rol: "Admin" | "Veteriner" | "Hayvan Sahibi";
  adSoyad: string;
  kartlar: Kart[];
  menu: MenuItem[];
  aktifMenu: string;
  menuDegistir: (id: string) => void;
  aramaDegeri?: string;
  aramaDegistir?: (deger: string) => void;
  aramaPlaceholder?: string;
  token?: string;
  kullaniciId?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const aktifMenuEtiket = menu.find((x) => x.id === aktifMenu)?.etiket ?? "Panel";
  const [bildirimAcik, setBildirimAcik] = useState(false);
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [okunmamisSayi, setOkunmamisSayi] = useState(0);
  const [menuDar, setMenuDar] = useState(false);

  const okunmamisVar = useMemo(() => okunmamisSayi > 0, [okunmamisSayi]);

  const bildirimleriYukle = useCallback(async () => {
    if (!token) return;
    try {
      const cevap = await apiGet<{ bildirimler: Bildirim[]; okunmamis_sayi: number }>("/api/v1/bildirimler?limit=20&offset=0", token);
      setBildirimler(cevap.bildirimler || []);
      setOkunmamisSayi(cevap.okunmamis_sayi || 0);
    } catch {
      // Sessiz gec: panel akisinin bozulmamasi icin
    }
  }, [token]);

  async function tumBildirimleriOkunduYap() {
    if (!token || okunmamisSayi === 0) return;
    try {
      await apiPatch("/api/v1/bildirimler/okundu/tumu", token, {});
      setOkunmamisSayi(0);
      setBildirimler((onceki) => onceki.map((x) => ({ ...x, durum: "okundu" })));
    } catch {
      // Sessiz gec
    }
  }

  function mesajRoute() {
    if (rol === "Veteriner") return "/veteriner/mesajlar";
    if (rol === "Hayvan Sahibi") return "/sahip/mesajlar";
    return "/admin";
  }

  function bildirimlerSayfaRoute() {
    if (rol === "Veteriner") return "/veteriner/bildirimler";
    if (rol === "Hayvan Sahibi") return "/sahip/bildirimler";
    return "/admin";
  }

  async function bildirimeGit(bildirim: Bildirim) {
    if (!token) return;
    try {
      await apiPatch(`/api/v1/bildirimler/${bildirim.id}/okundu`, token, {});
      setBildirimler((onceki) => onceki.map((x) => (x.id === bildirim.id ? { ...x, durum: "okundu" } : x)));
      setOkunmamisSayi((x) => Math.max(0, x - (bildirim.durum === "okundu" ? 0 : 1)));
    } catch {
      // Sessiz gec
    }
    setBildirimAcik(false);
    if (bildirim.tur === "yeni_mesaj" && bildirim.referans_oda_id && rol !== "Admin") {
      router.push(`${mesajRoute()}?sohbet=${bildirim.referans_oda_id}`);
      return;
    }
    if (rol === "Hayvan Sahibi") {
      router.push(`/sahip/bildirimler?b=${bildirim.id}`);
      return;
    }
    if (rol === "Veteriner") {
      router.push(`/veteriner/bildirimler?b=${bildirim.id}`);
      return;
    }
    router.push("/admin");
  }

  useEffect(() => {
    if (!token) return;
    let iptal = false;
    apiGet<{ bildirimler: Bildirim[]; okunmamis_sayi: number }>("/api/v1/bildirimler?limit=20&offset=0", token)
      .then((cevap) => {
        if (iptal) return;
        setBildirimler(cevap.bildirimler || []);
        setOkunmamisSayi(cevap.okunmamis_sayi || 0);
      })
      .catch(() => {
        // Sessiz gec
      });
    return () => {
      iptal = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !kullaniciId) return;
    const kanal = supabaseBrowser
      .channel(`bildirim-${kullaniciId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bildirimler", filter: `kullanici_id=eq.${kullaniciId}` },
        () => {
          setOkunmamisSayi((x) => x + 1);
          bildirimleriYukle();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bildirimler", filter: `kullanici_id=eq.${kullaniciId}` },
        () => {
          bildirimleriYukle();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(kanal);
    };
  }, [token, kullaniciId, bildirimleriYukle]);

  async function cikis() {
    await supabaseBrowser.auth.signOut();
    router.replace("/giris");
  }

  return (
    <main className="uygulama">
      <aside className="yan-menu kart" data-collapsed={String(menuDar)}>
        <div className="yan-menu-baslik">
          <div className="yan-menu-marka">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DURAPET_LOGO_URL} alt="DuraPet logosu" className="yan-menu-logo" />
            {!menuDar ? <div className="yan-menu-urun">DuraPet {rol}</div> : null}
          </div>
          {!menuDar ? <div className="yan-menu-kullanici">{adSoyad}</div> : null}
          <button className="menu-daralt-dugme" onClick={() => setMenuDar((x) => !x)} type="button" aria-label="Menüyü daralt veya genişlet">
            {menuDar ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        <nav className="yan-menu-nav">
          {menu.map((item) => (
            <button
              key={item.id}
              className="menu-item"
              data-active={aktifMenu === item.id}
              onClick={() => menuDegistir(item.id)}
            >
              <span className="menu-item-etiket">
                {item.ikon ? <span className="menu-item-ikon">{item.ikon}</span> : null}
                {!menuDar ? <span>{item.etiket}</span> : null}
              </span>
              {!menuDar && item.aciklama ? <small>{item.aciklama}</small> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="icerik">
        <div className="panel-karsilama kart">
          <div>
            <strong>{rol} Operasyon Ekranı</strong>
            <small>Canlı klinik akış - {aktifMenuEtiket}</small>
          </div>
          <span>{new Date().toLocaleDateString("tr-TR")}</span>
        </div>
        <header className="kart panel-ust">
          <div className="panel-ust-sol">
            <div className="panel-ikon">
              {rol === "Admin" ? <Shield size={20} /> : rol === "Veteriner" ? <Stethoscope size={20} /> : <User size={20} />}
            </div>
            <div className="panel-ust-yazi">
              <div className="panel-ust-baslik">{rol} Paneli</div>
              <div className="panel-ust-aciklama">Komuta alanı / {aktifMenuEtiket}</div>
            </div>
          </div>
          <div className="panel-ust-sag">
            {aramaDegistir ? (
              <input
                className="girdi panel-arama"
                placeholder={aramaPlaceholder || "Panelde ara"}
                value={aramaDegeri || ""}
                onChange={(e) => aramaDegistir(e.target.value)}
              />
            ) : null}
            {token ? (
              <div style={{ position: "relative" }}>
                <button
                  className="dugme panel-cikis"
                  onClick={async () => {
                    const yeniDurum = !bildirimAcik;
                    setBildirimAcik(yeniDurum);
                    if (yeniDurum) {
                      await tumBildirimleriOkunduYap();
                    }
                  }}
                >
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <Bell size={16} />
                    Bildirimler
                    {okunmamisVar ? <span className="mesaj-okunmamis">{okunmamisSayi}</span> : null}
                  </span>
                </button>
                {bildirimAcik ? (
                  <div className="bildirim-popover kart">
                    <div className="bildirim-popover-baslik">
                      <strong>Son bildirimler</strong>
                      <small>{okunmamisSayi} okunmamış</small>
                    </div>
                    <div className="bildirim-popover-liste">
                      {bildirimler.length === 0 ? (
                        <div className="onboarding-kart" style={{ margin: 8 }}>
                          <p>Yeni bildirim yok.</p>
                        </div>
                      ) : (
                        bildirimler.map((x) => (
                          <button key={x.id} className="bildirim-item" onClick={() => bildirimeGit(x)}>
                            <div className="bildirim-item-ust">
                              <strong>{x.baslik}</strong>
                              {x.durum !== "okundu" ? <span className="mesaj-okunmamis">yeni</span> : null}
                            </div>
                            <div className="bildirim-item-icerik">{x.icerik || "-"}</div>
                            <div className="bildirim-item-zaman">{new Date(x.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                          </button>
                        ))
                      )}
                    </div>
                    {rol !== "Admin" ? (
                      <div style={{ padding: "0 10px 10px" }}>
                        <button
                          type="button"
                          className="satir-dugme"
                          style={{ width: "100%" }}
                          onClick={() => {
                            setBildirimAcik(false);
                            router.push(bildirimlerSayfaRoute());
                          }}
                        >
                          Tüm bildirimler ve takip
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <button className="dugme panel-cikis" onClick={cikis}>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <LogOut size={16} />
                Çıkış
              </span>
            </button>
          </div>
        </header>

        <section className="ust-metrik-bandi">
          {kartlar.map((kart) => (
            <article key={kart.baslik} className="kart metrik-kapsul">
              <div className="metrik-kapsul-ust">
                <span className="metrik-kapsul-baslik">{kart.baslik}</span>
                <strong className="metrik-kapsul-deger">{kart.deger}</strong>
              </div>
              <div className="metrik-kapsul-alt">
                <div className="mini-trend">
                  {(kart.trend || trendUret(kart.deger)).map((n, idx) => (
                    <span key={`${kart.baslik}-${idx}`} className="mini-trend-cubuk" style={{ height: `${Math.max(12, Math.min(26, n - 8))}px` }} />
                  ))}
                </div>
                <small>{kart.aciklama}</small>
              </div>
            </article>
          ))}
        </section>

        {children ? <section style={{ display: "grid", gap: 14 }}>{children}</section> : null}
      </section>
    </main>
  );
}

type Bildirim = {
  id: number;
  tur?: string | null;
  baslik: string;
  icerik: string | null;
  durum: string;
  referans_oda_id?: number | null;
  referans_hayvan_id?: number | null;
  referans_enlem?: number | null;
  referans_boylam?: number | null;
  olusturma_tarihi: string;
};

function trendUret(deger: string) {
  const sayi = Number(deger);
  if (!Number.isFinite(sayi)) return [18, 22, 26, 20, 24, 28];
  const baz = Math.max(12, Math.min(30, sayi + 12));
  return [baz - 6, baz - 2, baz + 4, baz - 1, baz + 6, baz + 2];
}

