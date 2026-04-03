/**
 * Tarayıcıda kullanılan public URL'ler.
 * Üretimde localhost varsayılanı yoktur; NEXT_PUBLIC_* build/runtime'da set edilmelidir.
 */

function sonSlashKaldir(url: string): string {
  return url.replace(/\/+$/, "");
}

function prodMu(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * DuraPet REST API kökü (path yok, son / yok).
 * Boş string: aynı origin — istekler /api/v1/... olarak Next proxy üzerinden Express'e gider.
 */
export function publicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const siteFallback = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (raw) {
    const url = sonSlashKaldir(raw);
    const lower = url.toLowerCase();
    if (prodMu() && (lower.includes("localhost") || lower.includes("127.0.0.1"))) {
      throw new Error(
        "[DuraPet] Üretimde NEXT_PUBLIC_API_BASE_URL localhost olamaz; gerçek HTTPS adresini kullanın."
      );
    }
    if (prodMu() && !lower.startsWith("https://")) {
      console.warn("[DuraPet] Üretimde API için https:// önerilir:", url);
    }
    return url;
  }

  if (typeof window !== "undefined") {
    return "";
  }

  if (!prodMu()) {
    return `http://127.0.0.1:${process.env.PORT || "3000"}`;
  }

  if (siteFallback) {
    return sonSlashKaldir(siteFallback);
  }

  throw new Error(
    "Üretimde sunucu tarafı API adresi: NEXT_PUBLIC_SITE_URL veya NEXT_PUBLIC_API_BASE_URL tanımlayın (aynı domain + proxy için site kökü yeterli)."
  );
}

/**
 * Env yoksa aynı origin (Next proxy); geliştirmede sunucu tarafı için 127.0.0.1:PORT.
 */
export function publicApiBaseUrlVeyaDevOtomatik(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
    return publicApiBaseUrl();
  }
  if (typeof window !== "undefined") {
    return "";
  }
  if (!prodMu()) {
    return `http://127.0.0.1:${process.env.PORT || "3000"}`;
  }
  return publicApiBaseUrl();
}

/**
 * QR / kimlik linklerinde görünecek web kökü (Next sitesi, API değil).
 * Önce NEXT_PUBLIC_QR_PUBLIC_BASE_URL, yoksa NEXT_PUBLIC_SITE_URL, yoksa (istemci) window.origin.
 */
export function publicWebOriginForQr(): string {
  const qr = process.env.NEXT_PUBLIC_QR_PUBLIC_BASE_URL?.trim();
  if (qr) return sonSlashKaldir(qr);
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return sonSlashKaldir(site);
  if (typeof window !== "undefined") return window.location.origin;
  if (!prodMu()) return "http://localhost:3000";
  throw new Error(
    "[DuraPet] Üretimde NEXT_PUBLIC_QR_PUBLIC_BASE_URL veya NEXT_PUBLIC_SITE_URL tanımlayın (QR ve paylaşım linkleri)."
  );
}

/** Ağ hatası kullanıcı mesajı — geliştirmede port ipucu, üretimde genel metin. */
export function apiBaglantiHataMetni(): string {
  if (!prodMu()) {
    return "Sunucuya ulaşılamıyor. Geliştirmede `npm run dev` ile hem Next hem API’nin (ör. 4000) çalıştığından emin olun.";
  }
  return "Sunucuya şu an ulaşılamıyor. Lütfen bir süre sonra tekrar deneyin.";
}
