# DuraPet API v1 Sozlesmesi (Ilk Surum)

Taban URL:

- `http://localhost:4000/api/v1`

Kimliklendirme:

- Korumali endpointlerde `Authorization: Bearer <supabase_access_token>`

## Genel

### `GET /durum`

Amac: API + DB baglanti kontrolu.

Basarili cevap:

```json
{
  "durum": "hazir",
  "servis": "durapet-api-v1"
}
```

### `GET /profilim`

Amac: token ile giris yapan kullanicinin rol bilgisi.

Basarili cevap:

```json
{
  "kullanici": {
    "id": "uuid",
    "rolId": 2,
    "ad": "Ali",
    "soyad": "Yilmaz",
    "token": "..."
  }
}
```

## Admin

### `GET /admin/kullanicilar`

Yetki: `admin (rol_id=1)`

Basarili cevap:

```json
{
  "kayit_sayisi": 2,
  "kullanicilar": [
    {
      "id": "uuid",
      "rol_id": 2,
      "ad": "Ayse",
      "soyad": "Kara",
      "telefon": "05xx",
      "eposta": "ayse@ornek.com",
      "aktif": true,
      "olusturma_tarihi": "2026-03-13T11:00:00.000Z"
    }
  ]
}
```

### `POST /admin/veterinerler`

Yetki: `admin (rol_id=1)`

Istek govdesi:

```json
{
  "eposta": "vet@ornek.com",
  "sifre": "GucluSifre123!",
  "ad": "Ayse",
  "soyad": "Kara",
  "telefon": "05xx",
  "diploma_no": "VET-12345",
  "klinik_adi": "DuraPet Klinik",
  "uzmanlik_alani": "Genel",
  "il": "Istanbul",
  "ilce": "Kadikoy"
}
```

### `PATCH /admin/veterinerler/:id`

Yetki: `admin (rol_id=1)`

Guncellenebilir alanlar:

- `ad`, `soyad`, `telefon`, `eposta`, `aktif`
- `diploma_no`, `klinik_adi`, `uzmanlik_alani`, `il`, `ilce`

### `GET /admin/guvenlik-loglari`

Yetki: `admin (rol_id=1)`

Not: `?limit=200` gibi limit parametresi desteklenir.

### `GET /admin/erisim-loglari`

Yetki: `admin (rol_id=1)`

Not: `?limit=200` gibi limit parametresi desteklenir.

## Veteriner

### `GET /veteriner/hastalar`

Yetki: `veteriner (rol_id=2)`

Not: `?limit=200` parametresi desteklenir.

### `POST /veteriner/hastalar`

Yetki: `veteriner (rol_id=2)`

Istek govdesi:

```json
{
  "sahibi_id": "uuid",
  "ad": "Karabas",
  "tur": "kopek",
  "irk": "golden",
  "cinsiyet": "erkek",
  "dogum_tarihi": "2024-05-01",
  "kilo": 18.2
}
```

### `GET /veteriner/hastalar/:hayvanId/saglik-gecmisi`

Yetki: `veteriner (rol_id=2)`

### `POST /veteriner/hastalar/:hayvanId/saglik-kayitlari`

Yetki: `veteriner (rol_id=2)`

### `POST /veteriner/hastalar/:hayvanId/asilar`

Yetki: `veteriner (rol_id=2)`

### `GET /veteriner/asi-zamani-yaklasanlar`

Yetki: `veteriner (rol_id=2)`

Kurallar:

- Sadece kendi `veteriner_id` kayitlari
- `durum = planlandi`
- Hedef tarihe 7 gun veya daha az kalmis kayitlar

Basarili cevap:

```json
{
  "kayit_sayisi": 1,
  "veriler": [
    {
      "id": 10,
      "hayvan_id": 22,
      "hayvan_adi": "Karabas",
      "sahibi_id": "uuid",
      "islem_turu": "kuduz_asi",
      "hedef_tarih": "2026-03-20",
      "kalan_gun": 7
    }
  ]
}
```

### `GET /veteriner/randevular`

Yetki: `veteriner (rol_id=2)`

Basarili cevap:

```json
{
  "kayit_sayisi": 2,
  "randevular": [
    {
      "id": 101,
      "hayvan_id": 22,
      "sahibi_id": "uuid",
      "randevu_tarihi": "2026-03-18",
      "randevu_saati": "10:30:00",
      "durum": "beklemede"
    }
  ]
}
```

### `PATCH /veteriner/randevular/:id/onayla`

Yetki: `veteriner (rol_id=2)`

Basarili cevap:

```json
{
  "mesaj": "Randevu onaylandi.",
  "randevu": {
    "id": 101,
    "hayvan_id": 22,
    "sahibi_id": "uuid",
    "veteriner_id": "uuid",
    "randevu_tarihi": "2026-03-18",
    "randevu_saati": "10:30:00",
    "durum": "onaylandi"
  }
}
```

### `PATCH /veteriner/randevular/:id/iptal`

Yetki: `veteriner (rol_id=2)`

Istek govdesi (opsiyonel):

```json
{
  "iptal_nedeni": "Acil durum"
}
```

Basarili cevap:

```json
{
  "mesaj": "Randevu iptal edildi.",
  "randevu": {
    "id": 101,
    "hayvan_id": 22,
    "sahibi_id": "uuid",
    "veteriner_id": "uuid",
    "randevu_tarihi": "2026-03-18",
    "randevu_saati": "10:30:00",
    "durum": "iptal",
    "iptal_nedeni": "Acil durum"
  }
}
```

### `POST /veteriner/hizli-mesaj`

Yetki: `veteriner (rol_id=2)`

Istek govdesi:

```json
{
  "sahibi_id": "uuid",
  "hayvan_id": 22,
  "mesaj": "Karabas'in kuduz asi zamani geldi. Randevu almak ister misiniz?"
}
```

Basarili cevap:

```json
{
  "mesaj": "Hizli mesaj gonderildi.",
  "oda": {
    "id": 12,
    "veteriner_id": "uuid",
    "sahibi_id": "uuid",
    "hayvan_id": 22
  },
  "ileti": {
    "id": 99,
    "oda_id": 12,
    "gonderen_id": "uuid",
    "icerik": "Karabas'in kuduz asi zamani geldi. Randevu almak ister misiniz?",
    "olusturma_tarihi": "2026-03-13T12:00:00.000Z"
  }
}
```

## Hayvan Sahibi

### `GET /sahip/hayvanlar`

Yetki: `hayvan_sahibi (rol_id=3)`

Not: `?limit=200` parametresi desteklenir.

### `POST /sahip/hayvanlar`

Yetki: `hayvan_sahibi (rol_id=3)`

### `GET /sahip/hayvanlar/:hayvanId`

Yetki: `hayvan_sahibi (rol_id=3)`

### `GET /sahip/hayvanlar/:hayvanId/saglik-gecmisi`

Yetki: `hayvan_sahibi (rol_id=3)`

### `POST /sahip/randevular`

Yetki: `hayvan_sahibi (rol_id=3)`

Istek govdesi:

```json
{
  "hayvan_id": 22,
  "veteriner_id": "uuid",
  "randevu_tarihi": "2026-03-20",
  "randevu_saati": "14:00:00"
}
```

Basarili cevap:

```json
{
  "mesaj": "Randevu olusturuldu.",
  "randevu": {
    "id": 1001,
    "hayvan_id": 22,
    "sahibi_id": "uuid",
    "veteriner_id": "uuid",
    "randevu_tarihi": "2026-03-20",
    "randevu_saati": "14:00:00",
    "durum": "beklemede"
  }
}
```

## Hata Formati

Tum hatalarda ortak format:

```json
{
  "kod": "GECERSIZ_ISTEK",
  "hata": "Aciklayici hata mesaji",
  "detay": null
}
```

Yaygin hata kodlari:

- `GECERSIZ_ISTEK`
- `TOKEN_YOK`
- `TOKEN_GECERSIZ`
- `YETKI_YOK`
- `SERVICE_ROLE_GEREKLI`
- `COK_FAZLA_ISTEK`
- `SUNUCU_HATASI`

## Erisim Logu

Korumali endpointlerde basarili islemler sonrasinda `erisim_loglari` tablosuna kayit atilir:

- `kullanici_id`
- `hayvan_id` (varsa)
- `eylem`
- `kaynak = api`
- `ip_adresi`
- `kullanici_araci`

## Guvenlik Sertlestirmeleri

- Sahip, sadece kendi hayvani icin randevu olusturabilir.
- Veteriner-hizli mesajda `sahibi_id` ve `hayvan_id` uyumu kontrol edilir.
- Veteriner saglik gecmisi/asi/saglik kaydi endpointlerinde hayvana iliski kontrolu yapilir.
- Service role gerektiren endpointler (`admin/veterinerler`) middleware ile korunur.
- Istek govdeleri Zod ile dogrulanir; bozuk payload DB katmanina inmez.

## Performans Katmani

- `helmet` ile temel guvenlik basliklari aktif.
- `compression` ile JSON cevaplari sikistirilir.
- `express-rate-limit` ile `/api/v1` icin dakika bazli istek limiti aktif.
- Liste endpointlerinde `limit` parametresi kontrollu kullanilir.

