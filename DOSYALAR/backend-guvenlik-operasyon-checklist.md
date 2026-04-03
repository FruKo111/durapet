# DuraPet Backend Guvenlik ve Operasyon Checklist

Bu dokuman backend'i production seviyesine tasimak icin operasyonel kontrol listesidir.
Odak: guvenlik, performans, dayaniklilik, gozlemlenebilirlik.

Not:
- `[x]` = bu ortamda dogrulandi.
- `[ ]` = manuel/operasyonel adim gerekiyor.

## 1) Secrets Rotation (Kritik)

- [ ] Supabase `SERVICE_ROLE_KEY` rotate et (Dashboard -> Project Settings -> API).
- [ ] Supabase `ANON_KEY` rotate et (mobil/web tarafi da birlikte guncellenmeli).
- [ ] JWT secret rotate planini maintenance penceresinde uygula.
- [ ] Tum ortamlarda (`local`, `staging`, `prod`) `.env` degiskenlerini guncelle:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `CORS_ORIGINS`
  - [ ] `NEXT_PUBLIC_API_BASE_URL`
- [ ] Eski key'lerin hala kullanilmadigini dogrula (loglarda 401/403 anomali taramasi).
- [ ] Key'leri asla repoya commit etme; sadece gizli degisken yonetimi kullan.

## 2) Environment ve Runtime Sertlestirme

- [ ] `NODE_ENV=production` altinda API acilisi dogrulandi.
- [x] `CORS_ORIGINS` sadece gerekli domain'leri iceriyor (wildcard yok).
- [x] Health endpoint'leri canli:
  - [x] `/health/live`
  - [x] `/health/ready`
- [ ] Rate limit stratejisi endpoint bazli dogrulandi (auth, read, write ayrimi).
- [ ] API timeout ve reverse-proxy timeout degerleri uyumlu.
- [ ] Production process manager aktif (PM2/systemd/container restart policy).

## 3) Supabase / DB Guvenlik Kontrolleri

- [ ] Tum migration'lar uygulandi ve drift yok:
  - [ ] `20260314_010_mesaj_yanit_ve_bildirim_referans.sql`
  - [ ] `20260314_011_randevu_akisi_iyilestirme.sql`
  - [ ] `20260314_012_kimlik_qr_guvenlik_ve_audit.sql`
  - [ ] `20260314_013_backend_hardening_guvenlik_performans.sql`
  - [ ] `20260314_014_kimlik_pdf_private_signed.sql`
- [ ] `hayvan-kimlik-pdf` bucket private durumda.
- [ ] Signed URL sureleri kisa ve amaca uygun (kimlik okuma akisi icin).
- [ ] RLS policy'leri rol bazli test edildi (admin, veteriner, sahip).
- [ ] Randevu cakisma unique index'i calisiyor (`uq_randevu_veteriner_aktif_slot`).
- [ ] Audit kayitlari yaziliyor (`guvenlik_loglari`, erisim loglari, kimlik gecmisi).

## 4) Gozlemlenebilirlik ve Alarm

- [ ] Merkezi log toplama aktif (en az error + security + access).
- [ ] Uyari esikleri tanimli:
  - [ ] 5xx oran artisi
  - [ ] p95 response suresi artisi
  - [ ] auth hatasi patlamasi
  - [ ] depolama upload hatasi artisi
- [ ] Request metric ozetleri duzenli takip ediliyor (`/admin/operasyon/ozet`).
- [ ] Log retention suresi ve KVKK politikasina uyum kontrol edildi.

## 5) Performans ve Yuk Hazirligi (300k hedefi icin)

- [ ] DB index analizi yapildi (yuksek trafige giren sorgular).
- [ ] Sayfalama olmayan endpoint kalmadi (`limit`/`offset` zorunlu).
- [ ] Dosya yukleme limitleri net:
  - [ ] mesaj medya boyut limitleri
  - [ ] kimlik PDF optimize (boyut ve kalite dengesi)
- [ ] Cache stratejisi netlesti (uygun endpointlerde response caching).
- [ ] Kademeli yuk testi plani hazirlandi (kucuk -> orta -> spike -> soak).

## 6) CI/CD ve Yayina Alma Kapilari

- [ ] Pipeline adimlari zorunlu:
  - [ ] lint
  - [ ] unit/integration test
  - [ ] smoke test
  - [ ] migration check
- [ ] Deploy sonrasi otomatik smoke test kosuyor.
- [ ] Rollback plani yazili ve test edildi.
- [ ] Staging -> production promotion kurali tanimli.

## 7) Hemen Uygulanacak Test Listesi

Asagidaki komutlar deploy oncesi/sonrasi calistirilmali:

```bash
node scripts/api-smoke.js
node scripts/api-smoke-auth.js
```

Manuel kritik senaryolar:

- [ ] QR okutunca en guncel kimlik PDF aciliyor.
- [ ] Sahip kimlik alanlari refresh sonrasi kalici.
- [ ] Mesajlasmada medya (video <= 10sn) dogru calisiyor.
- [ ] Randevu onay/iptal/tamamlandi gecisleri dogru.
- [x] Admin operasyon ozet karti veri donuyor.

## 8) Tamamlanma Kriteri (Backend "Hazir")

Backend'i "production'a hazir" saymak icin:

- [ ] Secrets rotation tamamlandi.
- [ ] Tum checklist maddeleri tiklandi.
- [ ] Son 24 saatte kritik (P0/P1) hata yok.
- [x] Smoke + rol bazli testler PASS.
- [ ] Ekibin rollback ve incident proseduru net.

