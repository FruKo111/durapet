# DuraPet Baslangic Mimarisi (v0.1)

Bu dokuman, `cekirdak.md`, `mega_prompt.md`, `hatirlatma.md` ve `guvenlik.md` gereksinimlerine gore ilk teknik omurgayi verir.

## 1) Supabase Veritabani Semasi

Not: Tum tablo/kolon adlari Turkce secildi.

### 1.1 Roller ve kullanicilar

```sql
create table roller (
  id smallint primary key,
  ad text unique not null -- admin, veteriner, hayvan_sahibi
);

insert into roller (id, ad) values
  (1, 'admin'),
  (2, 'veteriner'),
  (3, 'hayvan_sahibi');

create table kullanicilar (
  id uuid primary key references auth.users(id) on delete cascade,
  rol_id smallint not null references roller(id),
  ad text not null,
  soyad text not null,
  telefon text,
  eposta text,
  aktif boolean not null default true,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index idx_kullanicilar_rol_id on kullanicilar(rol_id);
```

### 1.2 Veteriner ve hayvan sahibi profilleri

```sql
create table veteriner_profilleri (
  id uuid primary key references kullanicilar(id) on delete cascade,
  diploma_no text unique not null,
  klinik_adi text,
  uzmanlik_alani text,
  il text,
  ilce text,
  olusturma_tarihi timestamptz not null default now()
);

create table hayvan_sahibi_profilleri (
  id uuid primary key references kullanicilar(id) on delete cascade,
  tc_kimlik_no text,
  acil_durum_iletisim text,
  adres text,
  olusturma_tarihi timestamptz not null default now()
);
```

### 1.3 Hayvan, dijital kimlik, saglik gecmisi

```sql
create table hayvanlar (
  id bigserial primary key,
  sahibi_id uuid not null references hayvan_sahibi_profilleri(id),
  ad text not null,
  tur text not null, -- kedi, kopek vb.
  irk text,
  cinsiyet text,
  dogum_tarihi date,
  kilo numeric(6,2),
  kisirlastirma_durumu boolean,
  aktif boolean not null default true,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index idx_hayvanlar_sahibi_id on hayvanlar(sahibi_id);
create index idx_hayvanlar_tur_irk on hayvanlar(tur, irk);

create table hayvan_kimlikleri (
  id bigserial primary key,
  hayvan_id bigint not null unique references hayvanlar(id) on delete cascade,
  benzersiz_kimlik_no text not null unique,
  qr_icerik text not null unique,
  olusturma_tarihi timestamptz not null default now()
);

create table saglik_kayitlari (
  id bigserial primary key,
  hayvan_id bigint not null references hayvanlar(id) on delete cascade,
  veteriner_id uuid not null references veteriner_profilleri(id),
  islem_turu text not null, -- asi, muayene, ameliyat, kontrol
  tani_notu text,
  hassas_mi boolean not null default false,
  islem_tarihi timestamptz not null,
  olusturma_tarihi timestamptz not null default now()
);

create index idx_saglik_kayitlari_hayvan_tarih on saglik_kayitlari(hayvan_id, islem_tarihi desc);
create index idx_saglik_kayitlari_veteriner on saglik_kayitlari(veteriner_id);
```

### 1.4 Asi, recete, randevu

```sql
create table asilar (
  id bigserial primary key,
  hayvan_id bigint not null references hayvanlar(id) on delete cascade,
  saglik_kaydi_id bigint references saglik_kayitlari(id) on delete set null,
  veteriner_id uuid not null references veteriner_profilleri(id),
  asi_adi text not null, -- kuduz, karma, ic_parazit, dis_parazit
  uygulama_tarihi date not null,
  tekrar_gun_sayisi int not null,
  notlar text,
  olusturma_tarihi timestamptz not null default now()
);

create index idx_asilar_hayvan_tarih on asilar(hayvan_id, uygulama_tarihi desc);

create table receteler (
  id bigserial primary key,
  hayvan_id bigint not null references hayvanlar(id) on delete cascade,
  veteriner_id uuid not null references veteriner_profilleri(id),
  recete_metni text not null,
  olusturma_tarihi timestamptz not null default now()
);

create table randevular (
  id bigserial primary key,
  hayvan_id bigint not null references hayvanlar(id) on delete cascade,
  sahibi_id uuid not null references hayvan_sahibi_profilleri(id),
  veteriner_id uuid not null references veteriner_profilleri(id),
  randevu_tarihi date not null,
  randevu_saati time not null,
  durum text not null default 'beklemede', -- beklemede, onaylandi, iptal
  iptal_nedeni text,
  olusturma_tarihi timestamptz not null default now()
);

create index idx_randevular_veteriner_tarih on randevular(veteriner_id, randevu_tarihi, randevu_saati);
create index idx_randevular_sahibi_tarih on randevular(sahibi_id, randevu_tarihi);
```

### 1.5 Mesajlasma, bildirim ve hatirlatmalar

```sql
create table mesaj_odalar (
  id bigserial primary key,
  hayvan_id bigint references hayvanlar(id) on delete set null,
  veteriner_id uuid not null references veteriner_profilleri(id),
  sahibi_id uuid not null references hayvan_sahibi_profilleri(id),
  olusturma_tarihi timestamptz not null default now(),
  unique (veteriner_id, sahibi_id, hayvan_id)
);

create table mesajlar (
  id bigserial primary key,
  oda_id bigint not null references mesaj_odalar(id) on delete cascade,
  gonderen_id uuid not null references kullanicilar(id),
  icerik text,
  medya_url text,
  okundu boolean not null default false,
  olusturma_tarihi timestamptz not null default now()
);

create index idx_mesajlar_oda_tarih on mesajlar(oda_id, olusturma_tarihi desc);

create table bildirimler (
  id bigserial primary key,
  kullanici_id uuid not null references kullanicilar(id) on delete cascade,
  tur text not null, -- yeni_mesaj, randevu_hatirlatma, asi_hatirlatma
  baslik text not null,
  icerik text not null,
  kanal text not null, -- push, uygulama_ici, sms
  gonderim_zamani timestamptz,
  durum text not null default 'bekliyor', -- bekliyor, gonderildi, hata
  olusturma_tarihi timestamptz not null default now()
);

create index idx_bildirimler_kullanici_durum on bildirimler(kullanici_id, durum);

create table hatirlatmalar (
  id bigserial primary key,
  hayvan_id bigint not null references hayvanlar(id) on delete cascade,
  sahibi_id uuid not null references hayvan_sahibi_profilleri(id),
  veteriner_id uuid not null references veteriner_profilleri(id),
  islem_turu text not null, -- kuduz_asi, karma_asi, ic_parazit, dis_parazit, genel_kontrol
  kaynak_kayit_id bigint references saglik_kayitlari(id) on delete set null,
  hedef_tarih date not null,
  kalan_gun int generated always as (hedef_tarih - current_date) stored,
  durum text not null default 'planlandi', -- planlandi, tamamlandi, iptal
  olusturma_tarihi timestamptz not null default now()
);

create index idx_hatirlatmalar_hedef_tarih on hatirlatmalar(hedef_tarih, durum);
create index idx_hatirlatmalar_veteriner_durum on hatirlatmalar(veteriner_id, durum, hedef_tarih);
```

### 1.6 Guvenlik ve erisim loglari

```sql
create table erisim_loglari (
  id bigserial primary key,
  kullanici_id uuid not null references kullanicilar(id),
  hayvan_id bigint references hayvanlar(id),
  eylem text not null, -- goruntuleme, duzenleme, indirme
  kaynak text not null, -- api, panel, mobil
  ip_adresi inet,
  kullanici_araci text,
  olusturma_tarihi timestamptz not null default now()
);

create index idx_erisim_loglari_kullanici_tarih on erisim_loglari(kullanici_id, olusturma_tarihi desc);
create index idx_erisim_loglari_hayvan_tarih on erisim_loglari(hayvan_id, olusturma_tarihi desc);

create table guvenlik_loglari (
  id bigserial primary key,
  seviye text not null, -- bilgi, uyari, kritik
  olay_turu text not null, -- basarisiz_giris, yetkisiz_istek vb.
  aciklama text not null,
  iliskili_kullanici_id uuid references kullanicilar(id),
  olusturma_tarihi timestamptz not null default now()
);
```

## 2) Tablo Iliskileri (Ozet)

- `kullanicilar.rol_id -> roller.id`
- `veteriner_profilleri.id -> kullanicilar.id`
- `hayvan_sahibi_profilleri.id -> kullanicilar.id`
- `hayvanlar.sahibi_id -> hayvan_sahibi_profilleri.id`
- `hayvan_kimlikleri.hayvan_id -> hayvanlar.id` (1-1)
- `saglik_kayitlari.hayvan_id -> hayvanlar.id`
- `asilar.saglik_kaydi_id -> saglik_kayitlari.id`
- `randevular.(hayvan_id, sahibi_id, veteriner_id)` ilgili profillere bagli
- `mesaj_odalar` veteriner-sahip-hayvan baglamini tutar
- `mesajlar.oda_id -> mesaj_odalar.id`
- `hatirlatmalar` hayvan/sahip/veteriner baglantisi ile gelecek islemleri tutar

## 3) Turkce API Uc Noktalari (Ilk Taslak)

Not: Versionlama `api/v1` ile yapildi.

### 3.1 Kimlik ve profil

- `POST /api/v1/giris`
- `POST /api/v1/cikis`
- `GET /api/v1/profilim`
- `PATCH /api/v1/profilim`

### 3.2 Admin

- `POST /api/v1/admin/veterinerler`
- `PATCH /api/v1/admin/veterinerler/:id`
- `GET /api/v1/admin/kullanicilar`
- `GET /api/v1/admin/guvenlik-loglari`
- `GET /api/v1/admin/sistem-raporlari`
- `POST /api/v1/admin/bildirimler/toplu-gonder`

### 3.3 Veteriner

- `GET /api/v1/veteriner/hastalar`
- `POST /api/v1/veteriner/hastalar`
- `GET /api/v1/veteriner/hastalar/:hayvanId/saglik-gecmisi`
- `POST /api/v1/veteriner/hastalar/:hayvanId/asilar`
- `POST /api/v1/veteriner/hastalar/:hayvanId/receteler`
- `GET /api/v1/veteriner/randevular`
- `PATCH /api/v1/veteriner/randevular/:id/onayla`
- `PATCH /api/v1/veteriner/randevular/:id/iptal`
- `GET /api/v1/veteriner/asi-zamani-yaklasanlar`
- `POST /api/v1/veteriner/hizli-mesaj`

### 3.4 Hayvan sahibi

- `POST /api/v1/sahip/hayvanlar`
- `GET /api/v1/sahip/hayvanlar`
- `GET /api/v1/sahip/hayvanlar/:hayvanId`
- `GET /api/v1/sahip/hayvanlar/:hayvanId/saglik-gecmisi`
- `POST /api/v1/sahip/randevular`
- `GET /api/v1/sahip/bildirimler`

### 3.5 Mesajlasma

- `GET /api/v1/mesaj-odalari`
- `POST /api/v1/mesaj-odalari`
- `GET /api/v1/mesaj-odalari/:odaId/mesajlar`
- `POST /api/v1/mesaj-odalari/:odaId/mesajlar`
- `PATCH /api/v1/mesaj-odalari/:odaId/okundu`

## 4) Yetkilendirme Sistemi (Supabase Auth + RLS)

- Kimlik: Supabase Auth (JWT).
- Uygulama rolu: `kullanicilar.rol_id`.
- Veri erisimi: tum hassas tablolarda RLS aktif.

Ornek RLS mantigi:

- Admin: tum kayitlari gorebilir.
- Veteriner: sadece iliskili oldugu `hayvan`, `saglik_kayitlari`, `randevular`, `mesaj_odalar` kayitlarini gorebilir.
- Hayvan sahibi: sadece kendi hayvanlari ve kendi bildirim/mesaj kayitlarini gorebilir.
- Hassas kayitlar (`saglik_kayitlari.hassas_mi = true`) icin ek kosul: veteriner iliski kaydi veya sahip acik onayi.

Zorunlu guvenlik:

- Her goruntulemede `erisim_loglari`na kayit.
- Basarisiz yetki denemelerinde `guvenlik_loglari`na kayit.
- Medya dosyalari (rapor/fotograf) Supabase Storage private bucket + imzali URL ile servis.

## 5) Hatirlatma Algoritmasi

Islem: veteriner yeni asi/kontrol kaydi eklediginde otomatik hatirlatma olusur.

Tekrar gunu haritasi:

- kuduz_asi: `365`
- karma_asi: `365`
- ic_parazit: `90`
- dis_parazit: `30`
- genel_kontrol: `180`

Akis:

1. Yeni saglik kaydi eklenir.
2. `hedef_tarih = islem_tarihi + tekrar_gun_sayisi` hesaplanir.
3. `hatirlatmalar` tablosuna kayit atilir.
4. Bildirim planlari olusturulur: `hedef_tarih - 7`, `-3`, `0`.

Gunluk cron (Supabase):

- Her gece `02:00`de `durum='planlandi'` ve hedefe yaklasan kayitlar cekilir.
- Push gonderilir, basarisiz ise SMS kanalina dusurulur.
- Sonuc `bildirimler` tablosunda durum olarak isaretlenir.

## 6) Web Panel Ekran Mimarisi

### 6.1 Admin navigasyon

- Gosterge Paneli
- Veterinerler
- Kullanicilar
- Randevu Takibi
- Bildirim Yonetimi
- Guvenlik Loglari
- Sistem Raporlari

### 6.2 Veteriner navigasyon

- Gosterge Paneli
- Hasta Hayvanlar
- Saglik Kayitlari
- Asi Takvimi
- Randevular
- Mesajlar
- AciL Uyarilar

### 6.3 Tablo veri yapilari (ornek)

- Hasta Hayvanlar tablosu: `hayvan_adi`, `sahibi`, `tur`, `son_kontrol_tarihi`, `son_asi`, `durum`.
- Asi Yaklasanlar tablosu: `hayvan_adi`, `sahibi`, `yapilacak_islem`, `hedef_tarih`, `kalan_gun`, `hizli_mesaj`.
- Randevular tablosu: `tarih`, `saat`, `hayvan`, `sahip`, `durum`, `islemler`.

Tum tablolarda:

- hizli arama
- filtreleme (tarih, durum, veteriner, tur)
- siralama
- sayfalama

## 7) 300.000 Eszamanli Kullanici Icin Performans Stratejisi

- Yazma ve okuma ayrimi: kritik sorgularda read replica.
- Buyuk tablolar icin partition:
  - `mesajlar` aylik partition
  - `erisim_loglari` aylik partition
  - `bildirimler` aylik partition
- Yogun sorgu alanlarinda birlesik index kullanimi.
- Realtime kanallari:
  - mesaj bazli oda aboneligi (genel kanal yok)
  - gereksiz broadcast engeli
- Arkaplan isleri:
  - cron + kuyruk mantigi (batch gonderim)
  - tek tek degil, toplu bildirim pencereleri
- API katmaninda rate-limit ve circuit-breaker.

## 8) Cache Stratejisi

- Kisa omurlu cache (30-120 sn):
  - veteriner hasta listesi
  - asi yaklasanlar listesi
  - uygun randevu slotlari
- Orta omurlu cache (5-15 dk):
  - referans listeler (asi tipleri, tur/irk)
- Invalidasyon kurallari:
  - yeni saglik kaydi -> ilgili hayvan cache temizle
  - randevu guncellemesi -> veteriner/sahip randevu listesi temizle
  - yeni mesaj -> oda onizleme cache yenile

## 9) Sonraki Teknik Adimlar

1. Supabase migration dosyalarini olustur.
2. RLS policy SQL scriptlerini yaz.
3. `api/v1` endpoint sozlesmelerini (request/response) netlestir.
4. Veteriner panelinde `Asi Zamani Yaklasan Hastalar` ekranini ilk sprintte cikar.
5. Cron + bildirim gonderim isini gozlemlenebilir metriklerle devreye al.
