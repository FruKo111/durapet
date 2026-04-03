"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ApiError, apiGet } from "@/lib/api";
import { rolYolu } from "@/lib/rol";

type ProfilCevap = {
  kullanici: {
    id: string;
    rolId: number;
    ad: string;
    soyad: string;
  };
};

export function useOturum(gerekliRolId?: number) {
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [profil, setProfil] = useState<ProfilCevap["kullanici"] | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    async function yukle() {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          router.replace("/giris");
          return;
        }
        setToken(token);

        const profilCevap = await apiGet<ProfilCevap>("/api/v1/profilim", token);
        setProfil(profilCevap.kullanici);

        if (gerekliRolId && profilCevap.kullanici.rolId !== gerekliRolId) {
          router.replace(rolYolu(profilCevap.kullanici.rolId));
          return;
        }
      } catch (err) {
        const mesaj = err instanceof Error ? err.message : "Bilinmeyen hata.";
        const tokenHatasi =
          (err instanceof ApiError && err.status === 401) ||
          mesaj.toLowerCase().includes("geçersiz token");

        if (tokenHatasi) {
          await supabaseBrowser.auth.signOut();
          router.replace("/giris");
          return;
        }

        setHata(mesaj);
      } finally {
        setYukleniyor(false);
      }
    }

    yukle();
  }, [gerekliRolId, router]);

  return { yukleniyor, hata, profil, token };
}

