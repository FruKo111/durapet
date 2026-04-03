-- Kayıp hayvan: QR tarayıcısından paylaşılan konum kayıtları (yalnızca servis rolü / API)
create table if not exists public.kayip_hayvan_bulunan_konumlar (
  id bigserial primary key,
  kimlik_id bigint not null references public.hayvan_kimlikleri (id) on delete cascade,
  hayvan_id bigint not null references public.hayvanlar (id) on delete cascade,
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id) on delete cascade,
  enlem double precision not null,
  boylam double precision not null,
  dogruluk_metre double precision,
  token_hash text not null,
  olusturma_tarihi timestamptz not null default now(),
  constraint kayip_konum_enlem_gecerli check (enlem >= -90 and enlem <= 90),
  constraint kayip_konum_boylam_gecerli check (boylam >= -180 and boylam <= 180)
);

create index if not exists idx_kayip_konum_sahibi_tarih
  on public.kayip_hayvan_bulunan_konumlar (sahibi_id, olusturma_tarihi desc);
create index if not exists idx_kayip_konum_hayvan_tarih
  on public.kayip_hayvan_bulunan_konumlar (hayvan_id, olusturma_tarihi desc);

alter table public.kayip_hayvan_bulunan_konumlar enable row level security;

drop policy if exists "kayip_konum_sahip_okur" on public.kayip_hayvan_bulunan_konumlar;
create policy "kayip_konum_sahip_okur"
on public.kayip_hayvan_bulunan_konumlar
for select
using (sahibi_id = auth.uid());

drop policy if exists "kayip_konum_admin" on public.kayip_hayvan_bulunan_konumlar;
create policy "kayip_konum_admin"
on public.kayip_hayvan_bulunan_konumlar
for all
using (public.admin_mi())
with check (public.admin_mi());

-- Günün Şanslı Patisi: yalnızca açık rıza veren hayvanlar
alter table if exists public.hayvanlar
  add column if not exists topluluk_patisi_goster boolean not null default false;

-- Push / bildirim listesinde harita açmak için koordinat (FCM ile uyumlu)
alter table if exists public.bildirimler
  add column if not exists referans_enlem double precision;
alter table if exists public.bildirimler
  add column if not exists referans_boylam double precision;
