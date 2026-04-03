# DuraPet Faz-1 Az Tus Akis Sozlesmesi

Bu dokuman, Faz-1 kapsaminda klinik verimini arttirmak icin uygulamaya alinacak API ve UI degisimlerini sabitler.

## 1) Hedefler

- Veteriner randevu akisini 3 ana aksiyona indir.
- Tamamlama ve checkout adimlarini tek akista birlestir.
- Randevu kartindan hizli mesaji tek tikla calistir.
- Sahip randevu formunda varsayilan veteriner ve onerilen saatle daha hizli kayit alin.

## 2) API Sozlesmesi

### 2.1 Yeni endpoint: `PATCH /api/v1/veteriner/randevular/:id/ilerlet`

- Yetki: `veteriner`
- Amac: Mevcut duruma gore bir sonraki uygun asamaya gecirmek.
- Gecis matrisi:
  - `beklemede -> onaylandi`
  - `onaylandi -> geldi`
  - `geldi -> muayenede`
  - `muayenede -> hata` (tamamla endpointi kullanilmali)
- Cevap:
  - `mesaj`
  - `randevu`
  - `onceki_durum`
  - `yeni_durum`

### 2.2 Guncelleme: `PATCH /api/v1/veteriner/randevular/:id/tamamla`

- Yeni alan: `checkout_ile_kapat` (`boolean`, default `false`)
- `true` ise:
  - randevu `tamamlandi` olur
  - `checkout_zamani` ayni istekte set edilir

### 2.3 Yeni endpoint: `POST /api/v1/sahip/randevular/oneri`

- Yetki: `hayvan_sahibi`
- Girdi:
  - `hayvan_id`
  - `veteriner_id` (opsiyonel)
  - `tarih` (opsiyonel)
- Cikti:
  - `onerilen_veteriner_id`
  - `onerilen_tarih`
  - `onerilen_saat`
  - `gerekce`

## 3) UI Sozlesmesi

### 3.1 Veteriner paneli

- Randevu kartinda yeni birincil buton: `Ilerlet`
- `Tamamla` modalinda yeni secenek: `Checkout ile kapat`
- Randevu kartinda tek tik `Hizli Mesaj` aksiyonu:
  - Mesajlasma ekranina gitmeden API cagrisi yapar

### 3.2 Sahip paneli

- Randevu formunda varsayilan veteriner otomatik secilir.
- Tarih seciminden sonra `Onerilen Saat` doldurulur.
- Form acilisinda en uygun varsayilan saat (`10:30:00`) korunur; oneriler geldiginde guncellenir.

## 4) Kabul Kriterleri

- Veterinerde randevu ilerletme tek butonla calisir.
- Tamamlama adiminda checkout birlestirilebilir.
- Hizli mesaj randevu kartindan dogrudan gonderilebilir.
- Sahip randevu formu manuel alan doldurma ihtiyacini azaltir.
