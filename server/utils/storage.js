const { supabaseAdmin } = require("../supabase");

function storagePublicUrlYolCoz(url, bucket) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url));
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    const yol = parsed.pathname.slice(idx + marker.length);
    return decodeURIComponent(yol);
  } catch {
    return null;
  }
}

function storageRefYolCoz(ref, bucket) {
  if (!ref) return null;
  const ham = String(ref).trim();
  if (!ham) return null;
  const prefix = `${bucket}:`;
  if (ham.startsWith(prefix)) return ham.slice(prefix.length);
  return storagePublicUrlYolCoz(ham, bucket);
}

async function storageSignedUrlUret(bucket, ref, saniye = 120) {
  const dosyaYolu = storageRefYolCoz(ref, bucket);
  if (!dosyaYolu) return null;
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(dosyaYolu, saniye);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function storageRefOlustur(bucket, path) {
  const temizPath = String(path || "").trim();
  if (!temizPath) return null;
  return `${bucket}:${temizPath}`;
}

module.exports = {
  storagePublicUrlYolCoz,
  storageRefYolCoz,
  storageSignedUrlUret,
  storageRefOlustur,
};
