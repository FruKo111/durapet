# WhatsApp Fallback Kurulum Notu

Bu dokuman, bildirim fallback mekanizmasini gercek provider ile calistirmak icin minimum ayarlari ozetler.

## 1) Provider Secimi

- `NOTIFY_PROVIDER=mock` -> test/dev icin sahte gonderim
- `NOTIFY_PROVIDER=webhook` -> dis webhook servisine JSON POST
- `NOTIFY_PROVIDER=twilio` -> Twilio WhatsApp API

## 2) Ortam Degiskenleri

Kok `.env.local` dosyasina ekle:

```env
NOTIFY_PROVIDER=twilio
NOTIFY_MAX_RETRY=3
NOTIFY_BACKOFF_BASE_MS=30000
NOTIFY_BACKOFF_MAX_MS=900000
FALLBACK_WORKER_ENABLED=true
FALLBACK_WORKER_INTERVAL_MS=30000
FALLBACK_WORKER_BATCH_SIZE=20
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=+14155238886
```

Webhook kullanacaksan:

```env
NOTIFY_PROVIDER=webhook
NOTIFY_WEBHOOK_URL=https://ornek-servis/bildirim
NOTIFY_WEBHOOK_TOKEN=opsiyonel_token
```

## 3) Admin Uclar

- Tek kayit fallback dene:
  - `PATCH /api/v1/admin/bildirimler/:id/fallback-dene`
- Kuyruk fallback isleme:
  - `POST /api/v1/admin/bildirimler/fallback/kuyruk-isle?limit=20`
- Kuyruk goruntuleme:
  - `GET /api/v1/admin/bildirimler/fallback-kuyruk?limit=20`
- Fallback raporu:
  - `GET /api/v1/admin/bildirimler/fallback-rapor?limit=300`
  - Opsiyonel filtreler: `kanal`, `durum`, `klinik`, `gun` (ornek: `...?limit=300&kanal=whatsapp&durum=hata&klinik=Merkez%20Klinik&gun=14`)

## 4) Beklenen Veri

- `kullanicilar.telefon` dolu olmalidir.
- Telefon formati sistemde normalize edilir.
- Basarisiz denemelerde `bildirimler.son_hata` ve `retry_sayisi` alanlari guncellenir.
