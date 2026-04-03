-- Randevu akis iyilestirmeleri: tamamlandi durumu ve randevu bazli hatirlatma baglantisi

alter table if exists public.randevular
  drop constraint if exists randevular_durum_check;

alter table if exists public.randevular
  add constraint randevular_durum_check
  check (durum in ('beklemede', 'onaylandi', 'iptal', 'tamamlandi'));

alter table if exists public.hatirlatmalar
  add column if not exists kaynak_randevu_id bigint references public.randevular (id) on delete cascade;

create index if not exists idx_hatirlatmalar_kaynak_randevu_id
  on public.hatirlatmalar (kaynak_randevu_id);
