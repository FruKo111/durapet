"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MesajlasmaPaneli } from "@/components/mesajlasma-paneli";
import { PanelShell } from "@/components/panel-shell";
import { apiGet } from "@/lib/api";
import { ROLLER } from "@/lib/rol";
import { useOturum } from "@/lib/use-oturum";
import { ActivitySquare, Bell, CalendarPlus, IdCard, LayoutDashboard, MessageSquare, PawPrint } from "lucide-react";

type Hayvan = { id: number; ad: string };
type Veteriner = { id: string; ad: string; soyad: string };

function SahipMesajlarSayfasi() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { yukleniyor, hata, profil, token } = useOturum(ROLLER.HAYVAN_SAHIBI);
  const [hayvanlar, setHayvanlar] = useState<Hayvan[]>([]);
  const [veterinerler, setVeterinerler] = useState<Veteriner[]>([]);
  const [aktifMenu, setAktifMenu] = useState("mesaj");
  const [veriHatasi, setVeriHatasi] = useState("");
  const [veriYukleniyor, setVeriYukleniyor] = useState(true);

  useEffect(() => {
    async function yukle() {
      if (!token) return;
      setVeriYukleniyor(true);
      setVeriHatasi("");
      try {
        const [hayvanCevap, veterinerCevap] = await Promise.all([
          apiGet<{ hayvanlar: Hayvan[] }>("/api/v1/sahip/hayvanlar?limit=500&offset=0&sirala=ad_asc&arama=", token),
          apiGet<{ veterinerler: Veteriner[] }>("/api/v1/sahip/veterinerler?limit=200&offset=0&arama=", token),
        ]);
        setHayvanlar(hayvanCevap.hayvanlar || []);
        setVeterinerler(veterinerCevap.veterinerler || []);
      } catch (err) {
        setVeriHatasi(err instanceof Error ? err.message : "Mesaj verileri alinamadi.");
      } finally {
        setVeriYukleniyor(false);
      }
    }
    yukle();
  }, [token]);

  useEffect(() => {
    if (aktifMenu === "dashboard") router.push("/sahip");
    if (aktifMenu === "kayit") router.push("/sahip");
    if (aktifMenu === "kimlik") router.push("/sahip");
    if (aktifMenu === "randevu") router.push("/sahip");
    if (aktifMenu === "bildirim") router.push("/sahip/bildirimler");
    if (aktifMenu === "gecmis") router.push("/sahip");
  }, [aktifMenu, router]);

  if (yukleniyor || veriYukleniyor) return <div className="toast">Mesajlaşma ekranı yükleniyor...</div>;
  if (hata) return <div className="hata">{hata}</div>;
  if (veriHatasi) return <div className="hata">{veriHatasi}</div>;
  if (!profil || !token) return <div className="hata">Profil veya oturum bilgisi bulunamadı.</div>;

  const kartlar = [
    { baslik: "Sohbet Potansiyeli", deger: String(hayvanlar.length), aciklama: "Hayvan bazli sohbetler" },
    { baslik: "Veteriner Havuzu", deger: String(veterinerler.length), aciklama: "Mesaj atılabilir veterinerler" },
    { baslik: "Anlık Mesaj", deger: "Canlı", aciklama: "Gerçek zamanlı bildirim akışı aktif" },
  ];
  const varsayilanSohbetId = Number(searchParams.get("sohbet") || "");
  const varsayilanMesajId = Number(searchParams.get("mesaj") || "");

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
      <MesajlasmaPaneli
        token={token}
        rol="sahip"
        kullaniciId={profil.id}
        hayvanlar={hayvanlar}
        kisiler={veterinerler}
        varsayilanHayvanId={hayvanlar[0]?.id ?? null}
        varsayilanSohbetId={Number.isFinite(varsayilanSohbetId) ? varsayilanSohbetId : null}
        varsayilanMesajId={Number.isFinite(varsayilanMesajId) ? varsayilanMesajId : null}
        kullaniciAdSoyad={`${profil.ad} ${profil.soyad}`}
        baslik="Veterinerlerle Canlı Sohbet"
      />
    </PanelShell>
  );
}

export default function SahipMesajlarPage() {
  return (
    <Suspense fallback={<div className="toast">Mesajlaşma ekranı yükleniyor...</div>}>
      <SahipMesajlarSayfasi />
    </Suspense>
  );
}
