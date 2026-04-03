-- Veteriner profil fotografi + calisma saatleri metni (sahip listelerinde kart)

alter table if exists public.veteriner_profilleri
  add column if not exists profil_foto_yolu text,
  add column if not exists calisma_saatleri_metin text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veteriner-profil-fotolari',
  'veteriner-profil-fotolari',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "veteriner_profil_foto_kendi_dosya_yazar" on storage.objects;
create policy "veteriner_profil_foto_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'veteriner-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "veteriner_profil_foto_kendi_dosya_gunceller" on storage.objects;
create policy "veteriner_profil_foto_kendi_dosya_gunceller"
on storage.objects
for update
using (
  bucket_id = 'veteriner-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'veteriner-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "veteriner_profil_foto_kendi_dosya_siler" on storage.objects;
create policy "veteriner_profil_foto_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'veteriner-profil-fotolari'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
