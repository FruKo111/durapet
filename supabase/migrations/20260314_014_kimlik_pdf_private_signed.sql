-- Kimlik PDF bucket private + signed URL odakli erisim modeli

update storage.buckets
set public = false
where id = 'hayvan-kimlik-pdf';

drop policy if exists "kimlik_pdf_herkes_okur" on storage.objects;

drop policy if exists "kimlik_pdf_kendi_dosya_okur" on storage.objects;
create policy "kimlik_pdf_kendi_dosya_okur"
on storage.objects
for select
using (
  bucket_id = 'hayvan-kimlik-pdf'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
