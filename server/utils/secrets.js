const crypto = require("crypto");

function anahtarGetir() {
  const ham = String(process.env.NOTIFY_SECRET_KEY || process.env.APP_SECRET_ENC_KEY || "").trim();
  if (!ham) return null;
  if (ham.startsWith("base64:")) {
    try {
      const b = Buffer.from(ham.slice(7), "base64");
      if (b.length >= 32) return b.subarray(0, 32);
    } catch (_) {}
  }
  if (ham.startsWith("hex:")) {
    try {
      const b = Buffer.from(ham.slice(4), "hex");
      if (b.length >= 32) return b.subarray(0, 32);
    } catch (_) {}
  }
  return crypto.createHash("sha256").update(ham).digest();
}

function secretSifrele(metin) {
  const acik = String(metin || "").trim();
  if (!acik) return null;
  if (acik.startsWith("enc:v1:")) return acik;
  const key = anahtarGetir();
  if (!key) return acik;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const c1 = cipher.update(acik, "utf8");
  const c2 = cipher.final();
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${Buffer.concat([c1, c2]).toString("base64")}`;
}

function secretCoz(deger) {
  const ham = String(deger || "").trim();
  if (!ham) return "";
  if (!ham.startsWith("enc:v1:")) return ham;
  const key = anahtarGetir();
  if (!key) return "";
  const parca = ham.split(":");
  if (parca.length !== 5) return "";
  const iv = Buffer.from(parca[2], "base64");
  const tag = Buffer.from(parca[3], "base64");
  const payload = Buffer.from(parca[4], "base64");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const p1 = decipher.update(payload);
    const p2 = decipher.final();
    return Buffer.concat([p1, p2]).toString("utf8");
  } catch (_) {
    return "";
  }
}

module.exports = {
  secretSifrele,
  secretCoz,
};

