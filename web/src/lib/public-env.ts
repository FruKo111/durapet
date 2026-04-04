/**
 * Tarayıcıda kullanılan public URL'ler.
 * Üretimde localhost varsayılanı yoktur; NEXT_PUBLIC_* build/runtime'da set edilmelidir.
 */

function sonSlashKaldir(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * NEXT_PUBLIC_API_BASE_URL bazen yanlislikla .../api veya .../api/v1 ile giriliyor;
 * kod zaten `/api/v1/profilim` ekliyor — cift path 404 verir.
 */
function apiKokuNormalize(ham: string): string {
  let u = sonSlashKaldir(ham);
  for (let i = 0; i < 3; i++) {
    const lower = u.toLowerCase();
    if (lower.endsWith("/api/v1")) {
      u = sonSlashKaldir(u.slice(0, -"/api/v1".length));
      continue;
    }
    if (lower.endsWith("/api")) {
      u = sonSlashKaldir(u.slice(0, -"/api".length));
      continue;
    }
    break;
  }
  return u;
}

function prodMu(): boolean {
  return process.env.NODE_ENV === "production";
}

/** DuraPet REST API kökü (örn. https://api.site.com — path yok, son / yok). */
export function publicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) {
    if (!prodMu()) return "http://localhost:4000";
    throw new Error(
      "[DuraPet] Üretimde NEXT_PUBLIC_API_BASE_URL zorunlu (örn. https://api.alanadin.com)."
    );
  }
  const url = apiKokuNormalize(raw);
  const lower = url.toLowerCase();
  if (prodMu() && (lower.includes("localhost") || lower.includes("127.0.0.1"))) {
    throw new Error(
      "[DuraPet] Üretimde NEXT_PUBLIC_API_BASE_URL localhost olamaz; gerçek API adresini kullanın."
    );
  }
  if (prodMu() && !lower.startsWith("https://")) {
    console.warn("[DuraPet] Üretimde API için https:// önerilir:", url);
  }
  if (typeof window !== "undefined" && prodMu()) {
    try {
      const apiOrigin = new URL(url).origin;
      if (apiOrigin === window.location.origin) {
        throw new Error(
          "[DuraPet] NEXT_PUBLIC_API_BASE_URL panel ile aynı siteye işaret ediyor; tarayıcı /api isteklerini panele atıyor (404). Değer API kökü olmalı, örn. https://durapet.site — hPanel ortam değişkenini düzeltip siteyi yeniden DERLEYIN."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("[DuraPet]")) throw err;
      throw new Error(
        `[DuraPet] NEXT_PUBLIC_API_BASE_URL geçersiz veya eksik görünüyor: ${String(raw)}`
      );
    }
  }
  return url;
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
