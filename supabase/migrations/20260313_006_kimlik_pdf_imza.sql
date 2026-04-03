-- Dijital kimlikte imza ve PDF alanlari + PDF storage bucket

alter table if exists public.hayvan_kimlikleri
  add column if not exists imza_url text,
  add column if not exists pdf_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hayvan-kimlik-pdf',
  'hayvan-kimlik-pdf',
  true,
  5242880,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kimlik_pdf_herkes_okur" on storage.objects;
create policy "kimlik_pdf_herkes_okur"
on storage.objects
for select
using (bucket_id = 'hayvan-kimlik-pdf');

drop policy if exists "kimlik_pdf_kendi_dosya_yazar" on storage.objects;
create policy "kimlik_pdf_kendi_dosya_yazar"
on storage.objects
for insert
with check (
  bucket_id = 'hayvan-kimlik-pdf'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "kimlik_pdf_kendi_dosya_gunceller" on storage.objects;
create policy "kimlik_pdf_kendi_dosya_gunceller"
on storage.objects
for update
using (
  bucket_id = 'hayvan-kimlik-pdf'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'hayvan-kimlik-pdf'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "kimlik_pdf_kendi_dosya_siler" on storage.objects;
create policy "kimlik_pdf_kendi_dosya_siler"
on storage.objects
for delete
using (
  bucket_id = 'hayvan-kimlik-pdf'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
