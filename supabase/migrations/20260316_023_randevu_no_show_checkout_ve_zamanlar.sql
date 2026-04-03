-- HBYS adimi: no-show, checkout ve hasta kabul zaman damgalari

alter table if exists public.randevular
  drop constraint if exists randevular_durum_check;

alter table if exists public.randevular
  add constraint randevular_durum_check
  check (durum in ('beklemede', 'onaylandi', 'geldi', 'muayenede', 'iptal', 'tamamlandi', 'no_show'));

alter table if exists public.randevular
  add column if not exists hasta_kabul_zamani timestamptz,
  add column if not exists muayene_baslama_zamani timestamptz,
  add column if not exists checkout_zamani timestamptz,
  add column if not exists no_show_zamani timestamptz,
  add column if not exists no_show_nedeni text;

drop index if exists public.uq_randevu_veteriner_aktif_slot;
create unique index if not exists uq_randevu_veteriner_aktif_slot
  on public.randevular (veteriner_id, randevu_tarihi, randevu_saati)
  where durum in ('beklemede', 'onaylandi', 'geldi', 'muayenede');
