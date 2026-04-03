-- DuraPet cekirdek veritabani semasi
-- Not: Tum tablo/kolon adlari Turkcedir.

create extension if not exists pgcrypto;

create table if not exists public.roller (
  id smallint primary key,
  ad text not null unique
);

insert into public.roller (id, ad)
values
  (1, 'admin'),
  (2, 'veteriner'),
  (3, 'hayvan_sahibi')
on conflict (id) do nothing;

create table if not exists public.kullanicilar (
  id uuid primary key references auth.users (id) on delete cascade,
  rol_id smallint not null references public.roller (id),
  ad text not null,
  soyad text not null,
  telefon text,
  eposta text,
  aktif boolean not null default true,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index if not exists idx_kullanicilar_rol_id on public.kullanicilar (rol_id);

create table if not exists public.veteriner_profilleri (
  id uuid primary key references public.kullanicilar (id) on delete cascade,
  diploma_no text not null unique,
  klinik_adi text,
  uzmanlik_alani text,
  il text,
  ilce text,
  olusturma_tarihi timestamptz not null default now()
);

create table if not exists public.hayvan_sahibi_profilleri (
  id uuid primary key references public.kullanicilar (id) on delete cascade,
  tc_kimlik_no text,
  acil_durum_iletisim text,
  adres text,
  olusturma_tarihi timestamptz not null default now()
);

create table if not exists public.hayvanlar (
  id bigserial primary key,
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id),
  ad text not null,
  tur text not null,
  irk text,
  cinsiyet text,
  dogum_tarihi date,
  kilo numeric(6,2),
  kisirlastirma_durumu boolean,
  aktif boolean not null default true,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index if not exists idx_hayvanlar_sahibi_id on public.hayvanlar (sahibi_id);
create index if not exists idx_hayvanlar_tur_irk on public.hayvanlar (tur, irk);

create table if not exists public.hayvan_kimlikleri (
  id bigserial primary key,
  hayvan_id bigint not null unique references public.hayvanlar (id) on delete cascade,
  benzersiz_kimlik_no text not null unique,
  qr_icerik text not null unique,
  olusturma_tarihi timestamptz not null default now()
);

create table if not exists public.saglik_kayitlari (
  id bigserial primary key,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  islem_turu text not null,
  tani_notu text,
  hassas_mi boolean not null default false,
  islem_tarihi timestamptz not null,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_saglik_kayitlari_hayvan_tarih on public.saglik_kayitlari (hayvan_id, islem_tarihi desc);
create index if not exists idx_saglik_kayitlari_veteriner on public.saglik_kayitlari (veteriner_id);
create index if not exists idx_saglik_kayitlari_islem_turu on public.saglik_kayitlari (islem_turu);

create table if not exists public.asilar (
  id bigserial primary key,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  saglik_kaydi_id bigint references public.saglik_kayitlari (id) on delete set null,
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  asi_adi text not null,
  uygulama_tarihi date not null,
  tekrar_gun_sayisi integer not null check (tekrar_gun_sayisi > 0),
  notlar text,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_asilar_hayvan_tarih on public.asilar (hayvan_id, uygulama_tarihi desc);

create table if not exists public.receteler (
  id bigserial primary key,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  recete_metni text not null,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_receteler_hayvan_tarih on public.receteler (hayvan_id, olusturma_tarihi desc);

create table if not exists public.randevular (
  id bigserial primary key,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id),
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  randevu_tarihi date not null,
  randevu_saati time not null,
  durum text not null default 'beklemede',
  iptal_nedeni text,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index if not exists idx_randevular_veteriner_tarih on public.randevular (veteriner_id, randevu_tarihi, randevu_saati);
create index if not exists idx_randevular_sahibi_tarih on public.randevular (sahibi_id, randevu_tarihi);

create table if not exists public.mesaj_odalar (
  id bigserial primary key,
  hayvan_id bigint references public.hayvanlar (id) on delete set null,
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id),
  olusturma_tarihi timestamptz not null default now(),
  unique (veteriner_id, sahibi_id, hayvan_id)
);

create table if not exists public.mesajlar (
  id bigserial primary key,
  oda_id bigint not null references public.mesaj_odalar (id) on delete cascade,
  gonderen_id uuid not null references public.kullanicilar (id),
  icerik text,
  medya_url text,
  okundu boolean not null default false,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_mesajlar_oda_tarih on public.mesajlar (oda_id, olusturma_tarihi desc);

create table if not exists public.bildirimler (
  id bigserial primary key,
  kullanici_id uuid not null references public.kullanicilar (id) on delete cascade,
  tur text not null,
  baslik text not null,
  icerik text not null,
  kanal text not null,
  gonderim_zamani timestamptz,
  durum text not null default 'bekliyor',
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_bildirimler_kullanici_durum on public.bildirimler (kullanici_id, durum);
create index if not exists idx_bildirimler_gonderim_zamani on public.bildirimler (gonderim_zamani);

create table if not exists public.hatirlatmalar (
  id bigserial primary key,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id),
  veteriner_id uuid not null references public.veteriner_profilleri (id),
  islem_turu text not null,
  kaynak_kayit_id bigint references public.saglik_kayitlari (id) on delete set null,
  hedef_tarih date not null,
  durum text not null default 'planlandi',
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_hatirlatmalar_hedef_tarih on public.hatirlatmalar (hedef_tarih, durum);
create index if not exists idx_hatirlatmalar_veteriner_durum on public.hatirlatmalar (veteriner_id, durum, hedef_tarih);

create table if not exists public.erisim_loglari (
  id bigserial primary key,
  kullanici_id uuid not null references public.kullanicilar (id),
  hayvan_id bigint references public.hayvanlar (id),
  eylem text not null,
  kaynak text not null,
  ip_adresi inet,
  kullanici_araci text,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_erisim_loglari_kullanici_tarih on public.erisim_loglari (kullanici_id, olusturma_tarihi desc);
create index if not exists idx_erisim_loglari_hayvan_tarih on public.erisim_loglari (hayvan_id, olusturma_tarihi desc);

create table if not exists public.guvenlik_loglari (
  id bigserial primary key,
  seviye text not null,
  olay_turu text not null,
  aciklama text not null,
  iliskili_kullanici_id uuid references public.kullanicilar (id),
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_guvenlik_loglari_tarih on public.guvenlik_loglari (olusturma_tarihi desc);

-- Zaman damgasi trigger yardimcilari
create or replace function public.guncelleme_tarihi_ata()
returns trigger
language plpgsql
as $$
begin
  new.guncelleme_tarihi = now();
  return new;
end;
$$;

drop trigger if exists trg_kullanicilar_guncelleme_tarihi on public.kullanicilar;
create trigger trg_kullanicilar_guncelleme_tarihi
before update on public.kullanicilar
for each row
execute function public.guncelleme_tarihi_ata();

drop trigger if exists trg_hayvanlar_guncelleme_tarihi on public.hayvanlar;
create trigger trg_hayvanlar_guncelleme_tarihi
before update on public.hayvanlar
for each row
execute function public.guncelleme_tarihi_ata();

drop trigger if exists trg_randevular_guncelleme_tarihi on public.randevular;
create trigger trg_randevular_guncelleme_tarihi
before update on public.randevular
for each row
execute function public.guncelleme_tarihi_ata();

-- Hayvan kimligi icin benzersiz numara/qr uretilmesi
create or replace function public.hayvan_kimligi_olustur()
returns trigger
language plpgsql
as $$
declare
  yeni_kimlik text;
begin
  yeni_kimlik := 'DURAPET-' || to_char(now(), 'YYYYMMDD') || '-' || new.id::text || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.hayvan_kimlikleri (hayvan_id, benzersiz_kimlik_no, qr_icerik)
  values (new.id, yeni_kimlik, yeni_kimlik);

  return new;
end;
$$;

drop trigger if exists trg_hayvan_kimligi_olustur on public.hayvanlar;
create trigger trg_hayvan_kimligi_olustur
after insert on public.hayvanlar
for each row
execute function public.hayvan_kimligi_olustur();

-- Saglik kaydi uzerinden otomatik hatirlatma olusturma
create or replace function public.tekrar_gun_hesapla(islem text)
returns integer
language sql
immutable
as $$
  select case lower(islem)
    when 'kuduz_asi' then 365
    when 'karma_asi' then 365
    when 'ic_parazit' then 90
    when 'dis_parazit' then 30
    when 'genel_kontrol' then 180
    else null
  end;
$$;

create or replace function public.otomatik_hatirlatma_olustur()
returns trigger
language plpgsql
as $$
declare
  tekrar_gun integer;
  hedef date;
  sahip uuid;
begin
  tekrar_gun := public.tekrar_gun_hesapla(new.islem_turu);

  if tekrar_gun is null then
    return new;
  end if;

  select h.sahibi_id into sahip
  from public.hayvanlar h
  where h.id = new.hayvan_id;

  hedef := (new.islem_tarihi at time zone 'UTC')::date + tekrar_gun;

  insert into public.hatirlatmalar (
    hayvan_id,
    sahibi_id,
    veteriner_id,
    islem_turu,
    kaynak_kayit_id,
    hedef_tarih,
    durum
  )
  values (
    new.hayvan_id,
    sahip,
    new.veteriner_id,
    new.islem_turu,
    new.id,
    hedef,
    'planlandi'
  );

  return new;
end;
$$;

drop trigger if exists trg_otomatik_hatirlatma_olustur on public.saglik_kayitlari;
create trigger trg_otomatik_hatirlatma_olustur
after insert on public.saglik_kayitlari
for each row
execute function public.otomatik_hatirlatma_olustur();

