-- HBYS adimi: randevu durum akisina "geldi/muayenede" eklenir
-- ve randevuya bagli muayene kaydina SOAP + takip alani eklenir.

alter table if exists public.randevular
  drop constraint if exists randevular_durum_check;

alter table if exists public.randevular
  add constraint randevular_durum_check
  check (durum in ('beklemede', 'onaylandi', 'geldi', 'muayenede', 'iptal', 'tamamlandi'));

drop index if exists public.uq_randevu_veteriner_aktif_slot;
create unique index if not exists uq_randevu_veteriner_aktif_slot
  on public.randevular (veteriner_id, randevu_tarihi, randevu_saati)
  where durum in ('beklemede', 'onaylandi', 'geldi', 'muayenede');

alter table if exists public.saglik_kayitlari
  add column if not exists subjective text,
  add column if not exists objective text,
  add column if not exists assessment text,
  add column if not exists plan text,
  add column if not exists takip_kontrol_tarihi date,
  add column if not exists taburculuk_notu text;
