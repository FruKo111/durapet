"use client";

import { FormEvent, ReactNode, useState } from "react";
import { Stethoscope, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { apiGet } from "@/lib/api";
import { apiBaglantiHataMetni, publicApiBaseUrl } from "@/lib/public-env";
import { rolYolu } from "@/lib/rol";

type ProfilCevap = {
  kullanici: {
    rolId: number;
    ad: string;
    soyad: string;
  };
};

export default function GirisSayfasi() {
  const router = useRouter();
  const [mod, setMod] = useState<"giris" | "kayit">("giris");
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [kayitAd, setKayitAd] = useState("");
  const [kayitSoyad, setKayitSoyad] = useState("");
  const [kayitTelefon, setKayitTelefon] = useState("");
  const [kayitEposta, setKayitEposta] = useState("");
  const [kayitSifre, setKayitSifre] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function girisYap(e: FormEvent) {
    e.preventDefault();
    setHata("");
    setYukleniyor(true);
    const emailNorm = eposta.trim().toLowerCase();

    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email: emailNorm,
        password: sifre,
      });

      if (error || !data.session?.access_token) {
        throw new Error(error?.message || "Giriş başarısız.");
      }

      const profil = await apiGet<ProfilCevap>("/api/v1/profilim", data.session.access_token);
      router.replace(rolYolu(profil.kullanici.rolId));
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : "Giriş sırasında hata oluştu.";
      if (mesaj.toLowerCase().includes("invalid login credentials")) {
        setHata("E-posta veya şifre hatalı. Hesap yeni projede yoksa önce 'Kayıt Ol' ile hesap aç.");
      } else if (mesaj.toLowerCase().includes("failed to fetch")) {
        setHata(apiBaglantiHataMetni());
      } else {
        setHata(mesaj);
      }
    } finally {
      setYukleniyor(false);
    }
  }

  async function kayitOl(e: FormEvent) {
    e.preventDefault();
    setHata("");
    setYukleniyor(true);
    const emailNorm = kayitEposta.trim().toLowerCase();
    try {
      const response = await fetch(`${publicApiBaseUrl()}/api/v1/auth/sahip-kayit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: kayitAd,
          soyad: kayitSoyad,
          telefon: kayitTelefon,
          eposta: emailNorm,
          sifre: kayitSifre,
        }),
      });
      const hamMetin = await response.text();
      let json = {} as { hata?: string };
      try {
        json = hamMetin ? (JSON.parse(hamMetin) as { hata?: string }) : {};
      } catch {
        json = {};
      }
      if (!response.ok) {
        const varsayilan =
          response.status === 404
            ? "Kayıt servisi bulunamadı. Backend yeniden başlatılmalı."
            : response.status === 409
              ? "Bu telefon veya e-posta zaten kayıtlı."
              : "Kayıt oluşturulamadı.";
        throw new Error(json.hata || varsayilan);
      }

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email: emailNorm,
        password: kayitSifre,
      });
      if (error || !data.session?.access_token) {
        throw new Error(error?.message || "Kayıt oluştu ancak otomatik giriş başarısız.");
      }
      const profil = await apiGet<ProfilCevap>("/api/v1/profilim", data.session.access_token);
      router.replace(rolYolu(profil.kullanici.rolId));
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.";
      if (mesaj.toLowerCase().includes("failed to fetch")) {
        setHata(apiBaglantiHataMetni());
      } else {
        setHata(mesaj);
      }
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <main className="sayfa">
      <section className="kart auth-kart">
        <div className="auth-grid">
          <div className="auth-sol">
            <span className="auth-etiket">DuraPet HBYS</span>
            <h1>Dijital Veteriner Operasyon Platformu</h1>
            <p>
              Veteriner, admin ve hayvan sahipleri için güvenli, hızlı ve merkezi klinik yönetim altyapısı.
            </p>
            <div className="auth-bilgi-listesi">
              <BilgiSatiri icon={<ShieldCheck size={18} />} text="Rol bazlı güvenli erişim" />
              <BilgiSatiri icon={<Stethoscope size={18} />} text="Klinik akış odaklı profesyonel panel" />
              <BilgiSatiri icon={<UserRound size={18} />} text="Veteriner - sahip canlı iletişim köprüsü" />
            </div>
            <div className="auth-metrik-grid">
              <div className="auth-metrik-kart"><strong>QR</strong><span>Kayıp hayvan güvenli bağlantı</span></div>
              <div className="auth-metrik-kart"><strong>RLS</strong><span>Rol tabanlı veri koruma</span></div>
              <div className="auth-metrik-kart"><strong>CANLI</strong><span>Anlık mesaj ve bildirim</span></div>
            </div>
          </div>

          <div className="auth-sag">
            <div className="sekme-grup" style={{ marginBottom: 10 }}>
              <button className="sekme-dugme" data-active={mod === "giris"} onClick={() => { setMod("giris"); setHata(""); }}>
                Giriş
              </button>
              <button className="sekme-dugme" data-active={mod === "kayit"} onClick={() => { setMod("kayit"); setHata(""); }}>
                Kayıt Ol
              </button>
            </div>
            <h2>{mod === "giris" ? "Panele Giriş" : "Yeni Hesap Oluştur"}</h2>
            <p>
              {mod === "giris"
                ? "Kurum hesabınızla giriş yaparak panelinize yönlendirilin."
                : "Hayvan sahibi olarak hesabınızı kendiniz oluşturabilirsiniz."}
            </p>

            {mod === "giris" ? (
              <form onSubmit={girisYap} className="auth-form">
                <label>
                  <span className="etiket">E-posta</span>
                  <input
                    className="girdi"
                    type="email"
                    placeholder="ornek@durapet.local"
                    value={eposta}
                    onChange={(e) => setEposta(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  <span className="etiket">Şifre</span>
                  <input
                    className="girdi"
                    type="password"
                    placeholder="********"
                    value={sifre}
                    onChange={(e) => setSifre(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {hata ? <div className="hata">{hata}</div> : null}
                <button className="dugme dugme-ana" type="submit" disabled={yukleniyor}>
                  {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
                </button>
              </form>
            ) : (
              <form onSubmit={kayitOl} className="auth-form">
                <label>
                  <span className="etiket">Ad</span>
                  <input className="girdi" value={kayitAd} onChange={(e) => setKayitAd(e.target.value)} autoComplete="given-name" required />
                </label>
                <label>
                  <span className="etiket">Soyad</span>
                  <input className="girdi" value={kayitSoyad} onChange={(e) => setKayitSoyad(e.target.value)} autoComplete="family-name" required />
                </label>
                <label>
                  <span className="etiket">Telefon</span>
                  <input className="girdi" value={kayitTelefon} onChange={(e) => setKayitTelefon(e.target.value)} autoComplete="tel" required />
                </label>
                <label>
                  <span className="etiket">E-posta</span>
                  <input className="girdi" type="email" value={kayitEposta} onChange={(e) => setKayitEposta(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" required />
                </label>
                <label>
                  <span className="etiket">Şifre</span>
                  <input className="girdi" type="password" value={kayitSifre} onChange={(e) => setKayitSifre(e.target.value)} autoComplete="new-password" minLength={8} required />
                </label>
                {hata ? <div className="hata">{hata}</div> : null}
                <button className="dugme dugme-ana" type="submit" disabled={yukleniyor}>
                  {yukleniyor ? "Hesap oluşturuluyor..." : "Hesap Oluştur"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function BilgiSatiri({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="auth-bilgi">
      {icon}
      <span>{text}</span>
    </div>
  );
}

