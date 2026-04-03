-- Mobil push (FCM) cihaz jetonu
alter table public.kullanicilar
  add column if not exists fcm_token text,
  add column if not exists fcm_platform text,
  add column if not exists fcm_guncelleme timestamptz;

comment on column public.kullanicilar.fcm_token is 'Firebase Cloud Messaging registration token';
comment on column public.kullanicilar.fcm_platform is 'android | ios | web';

create index if not exists idx_kullanicilar_fcm_token on public.kullanicilar (fcm_token) where fcm_token is not null;
