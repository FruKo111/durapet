-- Hayvan sahibi profil fotografi (depolama yolu + private bucket)

alter table if exists public.hayvan_sahibi_profilleri
  add column if not exists profil_foto_yolu text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sahip-profil-fotolari',
  'sahip-profil-fotolari',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sahip_profil_foto_kendi_dosya_yazar" on storage.objects;
create policy "sahip_profil_foto_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'sahip-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "sahip_profil_foto_kendi_dosya_gunceller" on storage.objects;
create policy "sahip_profil_foto_kendi_dosya_gunceller"
on storage.objects
for update
using (
  bucket_id = 'sahip-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'sahip-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "sahip_profil_foto_kendi_dosya_siler" on storage.objects;
create policy "sahip_profil_foto_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'sahip-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
