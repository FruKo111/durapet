"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Check, CheckCheck, FileAudio2, FileImage, FileText, FileVideo, MoreHorizontal, Paperclip, Reply, X } from "lucide-react";

type Oda = {
  id: number;
  hayvan_id: number | null;
  veteriner_id: string;
  sahibi_id: string;
  olusturma_tarihi: string;
  hayvan: { id: number; ad: string } | null;
  sahip: { id: string; ad: string; soyad: string } | null;
  veteriner: { id: string; ad: string; soyad: string } | null;
  son_mesaj: {
    id: number;
    gonderen_id: string;
    icerik: string | null;
    okundu: boolean;
    olusturma_tarihi: string;
  } | null;
  okunmamis_sayi: number;
};

type Mesaj = {
  id: number;
  oda_id: number;
  gonderen_id: string;
  icerik: string | null;
  medya_url?: string | null;
  medya_erisim_url?: string | null;
  yanit_mesaj_id?: number | null;
  yanit_ozet?: string | null;
  okundu: boolean;
  olusturma_tarihi: string;
  gonderen: { id: string; ad: string; soyad: string } | null;
};

type Kisi = { id: string; ad: string; soyad: string };
type Hayvan = { id: number; ad: string; sahibi_id?: string };

export function MesajlasmaPaneli({
  token,
  rol,
  kullaniciId,
  hayvanlar,
  kisiler,
  varsayilanHayvanId,
  varsayilanSohbetId,
  varsayilanMesajId,
  kullaniciAdSoyad,
  baslik,
}: {
  token: string;
  rol: "veteriner" | "sahip";
  kullaniciId: string;
  hayvanlar: Hayvan[];
  kisiler: Kisi[];
  varsayilanHayvanId?: number | null;
  varsayilanSohbetId?: number | null;
  varsayilanMesajId?: number | null;
  kullaniciAdSoyad: string;
  baslik: string;
}) {
  const [odalar, setOdalar] = useState<Oda[]>([]);
  const [seciliOdaId, setSeciliOdaId] = useState<number | null>(null);
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [yeniMesaj, setYeniMesaj] = useState("");
  const [odaArama, setOdaArama] = useState("");
  const [mesajArama, setMesajArama] = useState("");
  const [durumMesaji, setDurumMesaji] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [medyaYukleniyor, setMedyaYukleniyor] = useState(false);
  const [medyaYuklenmeYuzde, setMedyaYuklenmeYuzde] = useState(0);
  const [odaOlusturuluyor, setOdaOlusturuluyor] = useState(false);
  const [yeniSohbetAcik, setYeniSohbetAcik] = useState(false);
  const [yanitlananMesaj, setYanitlananMesaj] = useState<Mesaj | null>(null);
  const [karsiTarafYaziyor, setKarsiTarafYaziyor] = useState("");
  const [aksiyonMesajId, setAksiyonMesajId] = useState<number | null>(null);
  const [duzenlenenMesajId, setDuzenlenenMesajId] = useState<number | null>(null);
  const [duzenlenenIcerik, setDuzenlenenIcerik] = useState("");
  const [vurguluMesajId, setVurguluMesajId] = useState<number | null>(null);
  const [iletilecekMesaj, setIletilecekMesaj] = useState<Mesaj | null>(null);
  const [iletHedefSohbetId, setIletHedefSohbetId] = useState<string>("");
  const [seciliHayvanId, setSeciliHayvanId] = useState(String(varsayilanHayvanId || hayvanlar[0]?.id || ""));
  const [seciliKisiId, setSeciliKisiId] = useState(kisiler[0]?.id || "");
  const [seciliDosya, setSeciliDosya] = useState<File | null>(null);
  const dosyaInputRef = useRef<HTMLInputElement | null>(null);
  const mesajListeRef = useRef<HTMLDivElement | null>(null);
  const mesajRefMap = useRef<Record<number, HTMLDivElement | null>>({});
  const yaziyorKanalRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const yaziyorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SECILI_KEY = `durapet_secili_sohbet_${rol}_${kullaniciId}`;

  const seciliOda = useMemo(() => odalar.find((x) => x.id === seciliOdaId) || null, [odalar, seciliOdaId]);
  const filtreliOdalar = useMemo(() => {
    const q = odaArama.trim().toLowerCase();
    const temel = !q
      ? odalar
      : odalar.filter((oda) => {
          const karsiTaraf = rol === "veteriner" ? oda.sahip : oda.veteriner;
          const alan = [oda.hayvan?.ad, karsiTaraf?.ad, karsiTaraf?.soyad, oda.son_mesaj?.icerik].filter(Boolean).join(" ").toLowerCase();
          return alan.includes(q);
        });
    return [...temel].sort((a, b) => {
      const aT = String(a.son_mesaj?.olusturma_tarihi || a.olusturma_tarihi || "");
      const bT = String(b.son_mesaj?.olusturma_tarihi || b.olusturma_tarihi || "");
      return bT.localeCompare(aT);
    });
  }, [odalar, odaArama, rol]);
  const filtreliMesajlar = useMemo(() => {
    const q = mesajArama.trim().toLowerCase();
    if (!q) return mesajlar;
    return mesajlar.filter((m) => {
      const alan = [m.icerik, m.gonderen?.ad, m.gonderen?.soyad, m.medya_erisim_url || m.medya_url].filter(Boolean).join(" ").toLowerCase();
      return alan.includes(q);
    });
  }, [mesajlar, mesajArama]);

  const odalariYukle = useCallback(
    async (ilkYukleme = false) => {
      if (!token) return;
      try {
        if (ilkYukleme) setYukleniyor(true);
        const cevap = await apiGet<{ odalar: Oda[] }>("/api/v1/mesaj/odalar", token);
        const odaListesi = cevap.odalar || [];
        setOdalar(odaListesi);
        setSeciliOdaId((onceki) => {
          if (onceki && odaListesi.some((x) => x.id === onceki)) return onceki;
          if (varsayilanSohbetId && odaListesi.some((x) => x.id === varsayilanSohbetId)) return varsayilanSohbetId;
          if (typeof window !== "undefined") {
            const kayitli = Number(window.localStorage.getItem(SECILI_KEY) || "");
            if (Number.isFinite(kayitli) && odaListesi.some((x) => x.id === kayitli)) return kayitli;
          }
          return odaListesi[0]?.id ?? null;
        });
      } catch (err) {
        setHata(err instanceof Error ? err.message : "Sohbetler alınamadı.");
      } finally {
        if (ilkYukleme) setYukleniyor(false);
      }
    },
    [token, varsayilanSohbetId, SECILI_KEY]
  );

  const mesajlariYukle = useCallback(
    async (odaId: number) => {
      try {
        const cevap = await apiGet<{ mesajlar: Mesaj[] }>(`/api/v1/mesaj/odalar/${odaId}/mesajlar?limit=120&offset=0`, token);
        setMesajlar(cevap.mesajlar || []);
      } catch (err) {
        setHata(err instanceof Error ? err.message : "Mesajlar alınamadı.");
      }
    },
    [token]
  );

  useEffect(() => {
    odalariYukle(true);
  }, [odalariYukle]);

  useEffect(() => {
    if (!seciliOdaId) {
      setMesajlar([]);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SECILI_KEY, String(seciliOdaId));
    }
    mesajlariYukle(seciliOdaId);
  }, [seciliOdaId, mesajlariYukle, SECILI_KEY]);

  useEffect(() => {
    if (!mesajListeRef.current) return;
    mesajListeRef.current.scrollTop = mesajListeRef.current.scrollHeight;
  }, [filtreliMesajlar.length, seciliOdaId]);

  useEffect(() => {
    if (!varsayilanMesajId || !mesajlar.length) return;
    const hedef = mesajlar.find((x) => x.id === varsayilanMesajId);
    if (!hedef) return;
    const el = mesajRefMap.current[varsayilanMesajId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setVurguluMesajId(varsayilanMesajId);
    const t = setTimeout(() => setVurguluMesajId(null), 2200);
    return () => clearTimeout(t);
  }, [varsayilanMesajId, mesajlar]);

  useEffect(() => {
    if (!seciliOdaId) return;
    const kanal = supabaseBrowser
      .channel(`mesaj-oda-${seciliOdaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mesajlar", filter: `oda_id=eq.${seciliOdaId}` },
        () => {
          mesajlariYukle(seciliOdaId);
          odalariYukle();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mesajlar", filter: `oda_id=eq.${seciliOdaId}` },
        () => {
          mesajlariYukle(seciliOdaId);
          odalariYukle();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(kanal);
    };
  }, [seciliOdaId, odalariYukle, mesajlariYukle]);

  useEffect(() => {
    if (!seciliOdaId) return;
    if (yaziyorKanalRef.current) {
      supabaseBrowser.removeChannel(yaziyorKanalRef.current);
      yaziyorKanalRef.current = null;
    }
    const kanal = supabaseBrowser
      .channel(`typing-${seciliOdaId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.kullaniciId === kullaniciId) return;
        if (payload.yaziyor) {
          setKarsiTarafYaziyor(payload.ad || "Karşı taraf");
        } else {
          setKarsiTarafYaziyor("");
        }
      })
      .subscribe();
    yaziyorKanalRef.current = kanal;
    return () => {
      supabaseBrowser.removeChannel(kanal);
    };
  }, [seciliOdaId, kullaniciId]);

  useEffect(() => {
    return () => {
      if (yaziyorTimeoutRef.current) clearTimeout(yaziyorTimeoutRef.current);
    };
  }, []);

  async function odaOlustur(e: FormEvent) {
    e.preventDefault();
    if (!seciliHayvanId || !seciliKisiId) return;
    setOdaOlusturuluyor(true);
    setHata("");
    try {
      const body =
        rol === "veteriner"
          ? { hayvan_id: Number(seciliHayvanId), sahibi_id: seciliKisiId }
          : { hayvan_id: Number(seciliHayvanId), veteriner_id: seciliKisiId };
      const cevap = await apiPost<{ oda: Oda }>("/api/v1/mesaj/odalar", token, body);
      setDurumMesaji("Sohbet hazırlandı.");
      await odalariYukle();
      if (cevap.oda?.id) setSeciliOdaId(cevap.oda.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Sohbet oluşturulamadı.");
    } finally {
      setOdaOlusturuluyor(false);
    }
  }

  async function mesajGonder(e: FormEvent) {
    e.preventDefault();
    if (!seciliOdaId || (!yeniMesaj.trim() && !seciliDosya)) return;
    setHata("");
    try {
      let medyaUrl: string | null = null;
      if (seciliDosya) {
        setMedyaYukleniyor(true);
        setMedyaYuklenmeYuzde(0);
        medyaUrl = await mesajMedyasiYukle(seciliOdaId, seciliDosya, (oran) => setMedyaYuklenmeYuzde(oran));
      }
      await apiPost(`/api/v1/mesaj/odalar/${seciliOdaId}/mesajlar`, token, {
        icerik: yeniMesaj.trim() || null,
        medya_url: medyaUrl,
        yanit_mesaj_id: yanitlananMesaj?.id || null,
        yanit_ozet: yanitOzetiUret(yanitlananMesaj),
      });
      yaziyorYayinla(false);
      setYeniMesaj("");
      setSeciliDosya(null);
      setYanitlananMesaj(null);
      setKarsiTarafYaziyor("");
      await Promise.all([mesajlariYukle(seciliOdaId), odalariYukle()]);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
    } finally {
      setMedyaYukleniyor(false);
      setMedyaYuklenmeYuzde(0);
    }
  }

  function dosyaSecildi(e: ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0] || null;
    if (!dosya) return;
    const maxBoyut = 8 * 1024 * 1024;
    if (dosya.size > maxBoyut) {
      setHata("Medya dosyasi 8MB sinirini asamaz.");
      return;
    }
    if (dosya.type.startsWith("video/")) {
      videoSureKontrol(dosya)
        .then((sure) => {
          if (sure > 10.01) {
            setHata("Video suresi en fazla 10 saniye olabilir.");
            return;
          }
          setSeciliDosya(dosya);
          setHata("");
        })
        .catch(() => {
          setHata("Video suresi kontrol edilemedi.");
        });
      return;
    }
    setSeciliDosya(dosya);
    setHata("");
  }

  async function mesajSil(mesajId: number) {
    try {
      await apiPatch(`/api/v1/mesajlar/${mesajId}/sil`, token, {});
      if (seciliOdaId) await Promise.all([mesajlariYukle(seciliOdaId), odalariYukle()]);
      setAksiyonMesajId(null);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Mesaj silinemedi.");
    }
  }

  async function mesajDuzenleKaydet(mesajId: number) {
    if (!duzenlenenIcerik.trim()) return;
    try {
      await apiPatch(`/api/v1/mesajlar/${mesajId}`, token, { icerik: duzenlenenIcerik.trim() });
      if (seciliOdaId) await Promise.all([mesajlariYukle(seciliOdaId), odalariYukle()]);
      setDuzenlenenMesajId(null);
      setDuzenlenenIcerik("");
      setAksiyonMesajId(null);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Mesaj güncellenemedi.");
    }
  }

  async function metinKopyala(metin: string) {
    if (!metin) return;
    try {
      await navigator.clipboard.writeText(metin);
      setDurumMesaji("Mesaj panoya kopyalandı.");
      setAksiyonMesajId(null);
    } catch {
      setHata("Mesaj kopyalanamadı.");
    }
  }

  async function baglantiPaylas(mesaj: Mesaj) {
    const url = `${window.location.pathname}?sohbet=${mesaj.oda_id}&mesaj=${mesaj.id}`;
    try {
      await navigator.clipboard.writeText(window.location.origin + url);
      setDurumMesaji("Mesaj bağlantısı panoya kopyalandı.");
      setAksiyonMesajId(null);
    } catch {
      setHata("Bağlantı kopyalanamadı.");
    }
  }

  async function mesajiIlet() {
    if (!iletilecekMesaj || !iletHedefSohbetId) return;
    const hedefId = Number(iletHedefSohbetId);
    if (!Number.isFinite(hedefId)) return;
    const iletilenMetin = iletilecekMesaj.icerik
      ? `[İletilen mesaj]\n${iletilecekMesaj.icerik}`
      : "[İletilen medya]";
    try {
      await apiPost(`/api/v1/mesaj/odalar/${hedefId}/mesajlar`, token, {
        icerik: iletilenMetin,
        medya_url: iletilecekMesaj.medya_url || null,
        yanit_mesaj_id: null,
        yanit_ozet: null,
      });
      setDurumMesaji("Mesaj iletildi.");
      setIletilecekMesaj(null);
      setIletHedefSohbetId("");
      await odalariYukle();
      if (seciliOdaId) await mesajlariYukle(seciliOdaId);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Mesaj iletilemedi.");
    }
  }

  function yaziyorYayinla(yaziyor: boolean) {
    if (!yaziyorKanalRef.current) return;
    yaziyorKanalRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { yaziyor, kullaniciId, ad: kullaniciAdSoyad },
    });
  }

  return (
    <article className="mesaj-ekran kart">
      <div className="mesaj-ekran-ust">
        <h3 className="bolum-baslik" style={{ margin: 0 }}>{baslik}</h3>
        <div className="mesaj-ekran-ust-sag">
          <input
            className="girdi"
            placeholder="Odalarda ara..."
            value={odaArama}
            onChange={(e) => setOdaArama(e.target.value)}
          />
          <input
            className="girdi"
            placeholder="Mesajlarda ara..."
            value={mesajArama}
            onChange={(e) => setMesajArama(e.target.value)}
          />
        </div>
      </div>
      {durumMesaji ? <div className="toast">{durumMesaji}</div> : null}
      {hata ? <div className="hata">{hata}</div> : null}
      {yukleniyor ? <div className="toast">Sohbetler yukleniyor...</div> : null}

      <div className="mesaj-layout">
        <aside className="mesaj-odalar">
          <div className="mesaj-odalar-baslik">
            <strong>Sohbetler</strong>
            <small>{filtreliOdalar.length} sohbet</small>
          </div>
          <div className="mesaj-yeni-oda">
            <button className="satir-dugme" onClick={() => setYeniSohbetAcik((x) => !x)} type="button">
              {yeniSohbetAcik ? "Yeni sohbet panelini kapat" : "Yeni sohbet başlat"}
            </button>
            {yeniSohbetAcik ? (
              <form onSubmit={odaOlustur} className="form-grid" style={{ marginTop: 8 }}>
                <select className="girdi" value={seciliHayvanId} onChange={(e) => setSeciliHayvanId(e.target.value)} required>
                  <option value="">Hayvan sec</option>
                  {hayvanlar.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.ad}
                    </option>
                  ))}
                </select>
                <select className="girdi" value={seciliKisiId} onChange={(e) => setSeciliKisiId(e.target.value)} required>
                  <option value="">{rol === "veteriner" ? "Sahip sec" : "Veteriner sec"}</option>
                  {kisiler.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.ad} {x.soyad}
                    </option>
                  ))}
                </select>
                <button className="satir-dugme" type="submit" disabled={odaOlusturuluyor}>
                  {odaOlusturuluyor ? "Hazırlanıyor..." : "Sohbeti Aç"}
                </button>
              </form>
            ) : null}
          </div>
          <div className="mesaj-oda-liste">
            {filtreliOdalar.map((oda) => {
              const karsiTaraf = rol === "veteriner" ? oda.sahip : oda.veteriner;
              return (
                <button
                  key={oda.id}
                  className="mesaj-oda-item"
                  data-active={String(seciliOdaId === oda.id)}
                  onClick={() => setSeciliOdaId(oda.id)}
                >
                  <div className="mesaj-oda-item-ust">
                    <strong>{oda.hayvan?.ad || "Hayvan"}</strong>
                    {oda.okunmamis_sayi > 0 ? <span className="mesaj-okunmamis">{oda.okunmamis_sayi}</span> : null}
                  </div>
                  <div className="mesaj-oda-item-alt">{karsiTaraf?.ad || "-"} {karsiTaraf?.soyad || ""}</div>
                  <div className="mesaj-oda-item-son">{oda.son_mesaj?.icerik || "Henuz mesaj yok"}</div>
                </button>
              );
            })}
            {filtreliOdalar.length === 0 ? <div className="onboarding-kart"><p>Aramaya uygun sohbet yok.</p></div> : null}
          </div>
        </aside>

        <section className="mesaj-sohbet">
          {seciliOda ? (
            <>
              <div className="mesaj-sohbet-baslik">
                <div>
                  <strong>{seciliOda.hayvan?.ad || "Hayvan"} sohbeti</strong>
                  <small>{rol === "veteriner" ? `${seciliOda.sahip?.ad || "-"} ${seciliOda.sahip?.soyad || ""}` : `${seciliOda.veteriner?.ad || "-"} ${seciliOda.veteriner?.soyad || ""}`}</small>
                </div>
                {karsiTarafYaziyor ? <div className="toast">{karsiTarafYaziyor} yaziyor...</div> : null}
              </div>
              <div className="mesaj-listesi" ref={mesajListeRef}>
                {filtreliMesajlar.map((m) => {
                  const benGonderdim = m.gonderen_id === kullaniciId;
                  return (
                    <div
                      key={m.id}
                      ref={(el) => {
                        mesajRefMap.current[m.id] = el;
                      }}
                      className="mesaj-balonu"
                      data-mine={String(benGonderdim)}
                      data-highlight={String(vurguluMesajId === m.id)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div className="mesaj-balonu-kisi">
                          {m.gonderen?.ad || "-"} {m.gonderen?.soyad || ""}
                        </div>
                        <div style={{ position: "relative" }}>
                          <button className="satir-dugme" type="button" onClick={() => setAksiyonMesajId((x) => (x === m.id ? null : m.id))}>
                            <MoreHorizontal size={12} />
                          </button>
                          {aksiyonMesajId === m.id ? (
                            <div className="mesaj-hizli-aksiyon">
                              <button className="satir-dugme" type="button" onClick={() => { setYanitlananMesaj(m); setAksiyonMesajId(null); }}>
                                <Reply size={12} /> Yanitla
                              </button>
                              <button className="satir-dugme" type="button" onClick={() => metinKopyala(m.icerik || "")}>
                                Kopyala
                              </button>
                              <button
                                className="satir-dugme"
                                type="button"
                                onClick={() => {
                                  setIletilecekMesaj(m);
                                  setIletHedefSohbetId("");
                                  setAksiyonMesajId(null);
                                }}
                              >
                                Mesaji ilet
                              </button>
                              <button className="satir-dugme" type="button" onClick={() => baglantiPaylas(m)}>
                                Baglanti olarak paylas
                              </button>
                              {benGonderdim ? (
                                <>
                                  <button
                                    className="satir-dugme"
                                    type="button"
                                    onClick={() => {
                                      setDuzenlenenMesajId(m.id);
                                      setDuzenlenenIcerik(m.icerik || "");
                                      setAksiyonMesajId(null);
                                    }}
                                  >
                                    Duzenle
                                  </button>
                                  <button className="satir-dugme" type="button" onClick={() => mesajSil(m.id)}>
                                    Sil
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {m.yanit_ozet ? <div className="mesaj-yanit-kutu">{m.yanit_ozet}</div> : null}
                      {duzenlenenMesajId === m.id ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <textarea className="girdi" rows={2} value={duzenlenenIcerik} onChange={(e) => setDuzenlenenIcerik(e.target.value)} />
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className="satir-dugme" type="button" onClick={() => { setDuzenlenenMesajId(null); setDuzenlenenIcerik(""); }}>
                              Iptal
                            </button>
                            <button className="satir-dugme" type="button" onClick={() => mesajDuzenleKaydet(m.id)}>
                              Kaydet
                            </button>
                          </div>
                        </div>
                      ) : m.icerik ? (
                        <div>{m.icerik}</div>
                      ) : null}
                      {(m.medya_erisim_url || m.medya_url) ? (
                        <div style={{ marginTop: 6 }}>
                          {medyaResimMi(m.medya_erisim_url || m.medya_url || "") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.medya_erisim_url || m.medya_url || ""} alt="Mesaj medyası" className="mesaj-medya-gorsel" />
                          ) : (
                            <div className="mesaj-medya-dosya">
                              {medyaIkonu(m.medya_erisim_url || m.medya_url || "")}
                              <a href={m.medya_erisim_url || m.medya_url || "#"} target="_blank" rel="noreferrer" className="mesaj-medya-baglantisi">
                                Medya dosyasini ac
                              </a>
                            </div>
                          )}
                        </div>
                      ) : null}
                      <div className="mesaj-balonu-tarih">
                        {new Date(m.olusturma_tarihi).toLocaleString("tr-TR")}
                        {benGonderdim ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6 }}>
                            {m.okundu ? <CheckCheck size={12} color="#109a78" /> : <Check size={12} color="#176ca6" />}
                            {m.okundu ? "Okundu" : "Teslim edildi"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {filtreliMesajlar.length === 0 ? <div className="onboarding-kart"><p>Bu filtrede mesaj yok.</p></div> : null}
              </div>
              <form onSubmit={mesajGonder} className="mesaj-form">
                {yanitlananMesaj ? (
                  <div className="mesaj-yanit-kutu">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <strong>Yanitlanan mesaj</strong>
                      <button type="button" className="satir-dugme" onClick={() => setYanitlananMesaj(null)}>
                        <X size={12} />
                      </button>
                    </div>
                    <div>{yanitOzetiUret(yanitlananMesaj)}</div>
                  </div>
                ) : null}
                <textarea
                  className="girdi"
                  rows={3}
                  placeholder="Mesajını yaz..."
                  value={yeniMesaj}
                  onChange={(e) => {
                    setYeniMesaj(e.target.value);
                    yaziyorYayinla(true);
                    if (yaziyorTimeoutRef.current) clearTimeout(yaziyorTimeoutRef.current);
                    yaziyorTimeoutRef.current = setTimeout(() => yaziyorYayinla(false), 1200);
                  }}
                />
                <div className="mesaj-form-alt">
                  <input
                    ref={dosyaInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={dosyaSecildi}
                    accept="image/*,application/pdf,audio/*,video/mp4"
                  />
                  <button type="button" className="satir-dugme" onClick={() => dosyaInputRef.current?.click()}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Paperclip size={14} />
                      Medya Ekle
                    </span>
                  </button>
                  {seciliDosya ? <small className="mesaj-dosya-etiket">{seciliDosya.name}</small> : <span />}
                  <button className="dugme dugme-ana" type="submit" disabled={(!yeniMesaj.trim() && !seciliDosya) || medyaYukleniyor}>
                    {medyaYukleniyor ? `Yükleniyor %${medyaYuklenmeYuzde}` : "Mesaj Gönder"}
                  </button>
                </div>
                {medyaYukleniyor ? <progress max={100} value={medyaYuklenmeYuzde} className="mesaj-progress" /> : null}
              </form>
            </>
          ) : (
            <div className="onboarding-kart">
              <h4>Bir sohbet seç veya yenisini başlat</h4>
              <p>Sag tarafta mesajlasma akisi secili sohbete gore acilir.</p>
            </div>
          )}
        </section>
      </div>
      {iletilecekMesaj ? (
        <div className="modal-arkaplan" onClick={() => setIletilecekMesaj(null)}>
          <div className="modal-kart" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-baslik">Mesajı İlet</h4>
            <div className="modal-icerik" style={{ marginBottom: 10 }}>
              {iletilecekMesaj.icerik || "Medya mesaji"}
            </div>
            <select
              className="girdi"
              value={iletHedefSohbetId}
              onChange={(e) => setIletHedefSohbetId(e.target.value)}
            >
              <option value="">Hedef sohbet sec</option>
              {odalar
                .filter((x) => x.id !== iletilecekMesaj.oda_id)
                .map((x) => {
                  const karsiTaraf = rol === "veteriner" ? x.sahip : x.veteriner;
                  return (
                    <option key={x.id} value={x.id}>
                      {x.hayvan?.ad || "Hayvan"} - {karsiTaraf?.ad || "-"} {karsiTaraf?.soyad || ""}
                    </option>
                  );
                })}
            </select>
            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="satir-dugme" onClick={() => setIletilecekMesaj(null)}>
                Vazgec
              </button>
              <button className="dugme dugme-ana" onClick={mesajiIlet} disabled={!iletHedefSohbetId}>
                İlet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

async function mesajMedyasiYukle(odaId: number, dosya: File, ilerleme: (oran: number) => void): Promise<string> {
  const [oturumSonuc, sessionSonuc] = await Promise.all([
    supabaseBrowser.auth.getUser(),
    supabaseBrowser.auth.getSession(),
  ]);
  const kullaniciId = oturumSonuc.data.user?.id;
  const accessToken = sessionSonuc.data.session?.access_token;
  if (!kullaniciId) throw new Error("Kullanıcı oturumu bulunamadı.");
  if (!accessToken) throw new Error("Oturum tokeni bulunamadı.");
  const temizAd = dosya.name.replace(/\s+/g, "-").toLowerCase();
  const yol = `${kullaniciId}/${odaId}/${Date.now()}-${temizAd}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase ayarlari eksik.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/mesaj-medya/${encodeURI(yol)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", dosya.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const oran = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      ilerleme(oran);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        ilerleme(100);
        resolve();
      } else {
        reject(new Error("Medya yükleme hatası."));
      }
    };
    xhr.onerror = () => reject(new Error("Medya yükleme bağlantı hatası."));
    xhr.send(dosya);
  });

  return `mesaj-medya:${yol}`;
}

function medyaResimMi(url: string) {
  const u = url.toLowerCase();
  return u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png") || u.includes(".webp");
}

function medyaIkonu(url: string) {
  const u = url.toLowerCase();
  if (u.includes(".mp4")) return <FileVideo size={14} />;
  if (u.includes(".mp3") || u.includes(".m4a") || u.includes(".wav")) return <FileAudio2 size={14} />;
  if (u.includes(".pdf")) return <FileText size={14} />;
  if (u.includes(".jpg") || u.includes(".jpeg") || u.includes(".png") || u.includes(".webp")) return <FileImage size={14} />;
  return <FileText size={14} />;
}

function yanitOzetiUret(mesaj: Mesaj | null) {
  if (!mesaj) return null;
  if (mesaj.icerik && mesaj.icerik.trim()) return mesaj.icerik.slice(0, 180);
  if (mesaj.medya_url) return "Medya mesaji";
  return "Mesaj";
}

async function videoSureKontrol(dosya: File): Promise<number> {
  const kaynak = URL.createObjectURL(dosya);
  try {
    const sure = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration || 0);
      video.onerror = () => reject(new Error("Video okunamadi."));
      video.src = kaynak;
    });
    return sure;
  } finally {
    URL.revokeObjectURL(kaynak);
  }
}

