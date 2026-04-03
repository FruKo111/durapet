"use client";

/**
 * Google Maps Embed API (view). Anahtar yoksa klasik embed URL’ye düşer (sınırlı görünüm olabilir).
 * Üretim: Google Cloud’da "Maps Embed API" açın; anahtarı HTTP referrer ile kısıtlayın.
 */
const MAPS_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() : "";

export function googleHaritaDisUrl(enlem: number, boylam: number) {
  return `https://www.google.com/maps?q=${enlem},${boylam}`;
}

export function GoogleMapEmbed({
  enlem,
  boylam,
  baslik,
  yukseklik = 220,
}: {
  enlem: number;
  boylam: number;
  baslik: string;
  yukseklik?: number;
}) {
  const src = MAPS_KEY
    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(MAPS_KEY)}&center=${enlem},${boylam}&zoom=15&maptype=roadmap`
    : `https://www.google.com/maps?q=${enlem},${boylam}&z=15&output=embed`;

  return (
    <div className="konum-embed-kapsul">
      <div className="konum-embed-wrap">
        <iframe
          title={baslik}
          className="konum-embed-iframe"
          style={{ height: yukseklik }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
          allowFullScreen
        />
      </div>
    </div>
  );
}
