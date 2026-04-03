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

/** DuraPet REST API kökü (path yok, son / yok). Aynı domainde API (reverse proxy) ise https://durapet.com.tr gibi olabilir. */
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

  if (!prodMu()) return "http://localhost:4000";

  if (typeof window !== "undefined") {
    return sonSlashKaldir(window.location.origin);
  }

  if (siteFallback) {
    return sonSlashKaldir(siteFallback);
  }

  throw new Error(
    "Üretimde API adresi gerekli: Hostinger Ortam Değişkenleri’ne NEXT_PUBLIC_API_BASE_URL=https://durapet.com.tr ekleyin (API bu domainde /api/v1 ile servis ediliyorsa). Farklı API sunucun varsa onun HTTPS kökünü yaz. Sonra yeniden deploy. Sunucu tarafı derleme için alternatif: NEXT_PUBLIC_SITE_URL."
  );
}

/**
 * Env yoksa yalnızca geliştirmede window.hostname:4000 kullanır (LAN test).
 * Üretimde publicApiBaseUrl ile aynı kurallar.
 */
export function publicApiBaseUrlVeyaDevOtomatik(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
    return publicApiBaseUrl();
  }
  if (!prodMu() && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  if (prodMu() && typeof window !== "undefined") {
    return sonSlashKaldir(window.location.origin);
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
    return "Sunucuya ulaşılamıyor. API’nin çalıştığından emin olun (geliştirme: genelde http://localhost:4000).";
  }
  return "Sunucuya şu an ulaşılamıyor. Lütfen bir süre sonra tekrar deneyin.";
}
