-- QR kayip hayvan guvenligi, consent modeli ve private storage sertlestirmesi

alter table public.hayvan_kimlikleri
  add column if not exists kayip_hayvan_iletisim_izni boolean not null default false,
  add column if not exists kayip_hayvan_notu text;

create table if not exists public.kayip_hayvan_erisim_kayitlari (
  id bigserial primary key,
  kimlik_id bigint not null references public.hayvan_kimlikleri (id) on delete cascade,
  hayvan_id bigint references public.hayvanlar (id) on delete set null,
  token_hash text not null,
  erisim_durumu text not null,
  ip_adresi inet,
  kullanici_araci text,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_kayip_hayvan_erisim_kayitlari_kimlik_tarih
  on public.kayip_hayvan_erisim_kayitlari (kimlik_id, olusturma_tarihi desc);

create table if not exists public.kayip_hayvan_iletisim_talepleri (
  id bigserial primary key,
  kimlik_id bigint not null references public.hayvan_kimlikleri (id) on delete cascade,
  hayvan_id bigint references public.hayvanlar (id) on delete set null,
  sahib_id uuid not null references public.hayvan_sahibi_profilleri (id) on delete cascade,
  bulan_ad text not null,
  bulan_telefon text not null,
  mesaj text not null,
  token_hash text not null,
  ip_adresi inet,
  kullanici_araci text,
  durum text not null default 'beklemede',
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_kayip_hayvan_iletisim_talepleri_sahip_tarih
  on public.kayip_hayvan_iletisim_talepleri (sahib_id, olusturma_tarihi desc);

-- Kimlik fotograflarini private/signed modele tasir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hayvan-kimlik-fotolari',
  'hayvan-kimlik-fotolari',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kimlik_foto_herkes_okur" on storage.objects;
drop policy if exists "kimlik_foto_kendi_dosya_yazar" on storage.objects;
drop policy if exists "kimlik_foto_kendi_dosya_gunceller" on storage.objects;
drop policy if exists "kimlik_foto_kendi_dosya_siler" on storage.objects;

create policy "kimlik_foto_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "kimlik_foto_kendi_dosya_gunceller"
on storage.objects
for update
using (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "kimlik_foto_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Mesaj medyayi private/signed modele tasir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mesaj-medya',
  'mesaj-medya',
  false,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'audio/mpeg',
    'audio/mp4',
    'video/mp4'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mesaj_medya_herkes_okur" on storage.objects;
drop policy if exists "mesaj_medya_kendi_dosya_yazar" on storage.objects;
drop policy if exists "mesaj_medya_kendi_dosya_gunceller" on storage.objects;
drop policy if exists "mesaj_medya_kendi_dosya_siler" on storage.objects;

create policy "mesaj_medya_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'mesaj-medya'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "mesaj_medya_kendi_dosya_gunceller"
on storage.objects
for update
using (
  bucket_id = 'mesaj-medya'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'mesaj-medya'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "mesaj_medya_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'mesaj-medya'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Operasyonel log saklama yardimci fonksiyonu
create or replace function public.guvenlik_log_temizligi(gun_sayisi integer default 180)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.kayip_hayvan_erisim_kayitlari
  where olusturma_tarihi < now() - make_interval(days => gun_sayisi);

  delete from public.erisim_loglari
  where olusturma_tarihi < now() - make_interval(days => gun_sayisi);
end;
$$;
