"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MesajlasmaPaneli } from "@/components/mesajlasma-paneli";
import { PanelShell } from "@/components/panel-shell";
import { apiGet } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { Bell, CalendarClock, IdCard, LayoutDashboard, MessageSquare, Stethoscope } from "lucide-react";

type Hasta = { id: number; ad: string; sahibi_id: string };
type Sahip = { id: string; ad: string; soyad: string };

function VeterinerMesajlarSayfasi() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.VETERINER);
  const [hastalar, setHastalar] = useState<Hasta[]>([]);
  const [sahipler, setSahipler] = useState<Sahip[]>([]);
  const [aktifMenu, setAktifMenu] = useState("mesaj");
  const [veriHatasi, setVeriHatasi] = useState("");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      setVeriHatasi("");
      try {
        const [hastaCevap, sahipCevap] = await Promise.all([
          apiGet<{ hastalar: Hasta[] }>("/api/v1/veteriner/hastalar?limit=200", token),
          apiGet<{ sahipler: Sahip[] }>("/api/v1/veteriner/sahipler?limit=200", token),
        ]);
        setHastalar(hastaCevap.hastalar || []);
        setSahipler(sahipCevap.sahipler || []);
      } catch (err) {
        setVeriHatasi(err instanceof Error ? err.message : "Mesaj verileri alinamadi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token]);

  useEffect(() => {
    if (aktifMenu === "dashboard") router.push("/veteriner");
    if (aktifMenu === "kayit") router.push("/veteriner");
    if (aktifMenu === "randevu") router.push("/veteriner");
    if (aktifMenu === "kimlik") router.push("/veteriner");
    if (aktifMenu === "bildirim") router.push("/veteriner/bildirimler");
    if (aktifMenu === "iletisim") router.push("/veteriner/iletisim");
  }, [aktifMenu, router]);

  if (yukleniyor || veriYukleniyor) return <div className="toast">Mesajlasma ekrani yukleniyor...</div>;
  if (hata) return <div className="hata">{hata}</div>;
  if (veriHatasi) return <div className="hata">{veriHatasi}</div>;
  if (!profil || !token) return <div className="hata">Profil veya oturum bilgisi bulunamadı.</div>;

  const kartlar = [
    { baslik: "Toplam Sohbet", deger: String(hastalar.length), aciklama: "Mesajlaşılabilir hasta listesi" },
    { baslik: "Sahip Havuzu", deger: String(sahipler.length), aciklama: "Aktif sahip profilleri" },
    { baslik: "Anlık Mesaj", deger: "Canlı", aciklama: "Gerçek zamanlı bildirim akışı aktif" },
  ];
  const varsayilanSohbetId = Number(searchParams.get("sohbet") || "");
  const varsayilanMesajId = Number(searchParams.get("mesaj") || "");

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
        { id: "iletisim", etiket: "İletişim Merkezi", aciklama: "WhatsApp geçmişi", ikon: <MessageSquare size={15} /> },
      ]}
      aktifMenu={aktifMenu}
      menuDegistir={setAktifMenu}
      token={token}
      kullaniciId={profil.id}
      kartlar={kartlar}
    >
      <MesajlasmaPaneli
        token={token}
        rol="veteriner"
        kullaniciId={profil.id}
        hayvanlar={hastalar}
        kisiler={sahipler}
        varsayilanHayvanId={hastalar[0]?.id ?? null}
        varsayilanSohbetId={Number.isFinite(varsayilanSohbetId) ? varsayilanSohbetId : null}
        varsayilanMesajId={Number.isFinite(varsayilanMesajId) ? varsayilanMesajId : null}
        kullaniciAdSoyad={`${profil.ad} ${profil.soyad}`}
        baslik="Hasta Sahipleriyle Canlı Sohbet"
      />
    </PanelShell>
  );
}

export default function VeterinerMesajlarPage() {
  return (
    <Suspense fallback={<div className="toast">Mesajlaşma ekranı yükleniyor...</div>}>
      <VeterinerMesajlarSayfasi />
    </Suspense>
  );
}
