-- Dijital kimlik foto bucket ve RLS politikasi

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hayvan-kimlik-fotolari',
  'hayvan-kimlik-fotolari',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kimlik_foto_herkes_okur" on storage.objects;
create policy "kimlik_foto_herkes_okur"
on storage.objects
for select
using (bucket_id = 'hayvan-kimlik-fotolari');

drop policy if exists "kimlik_foto_kendi_dosya_yazar" on storage.objects;
create policy "kimlik_foto_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "kimlik_foto_kendi_dosya_gunceller" on storage.objects;
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

drop policy if exists "kimlik_foto_kendi_dosya_siler" on storage.objects;
create policy "kimlik_foto_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'hayvan-kimlik-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
