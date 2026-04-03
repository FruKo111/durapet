-- Randevu tamamlamada olusan muayene kaydini randevuya dogrudan baglar

alter table if exists public.saglik_kayitlari
  add column if not exists randevu_id bigint references public.randevular (id) on delete set null;

create index if not exists idx_saglik_kayitlari_randevu_id
  on public.saglik_kayitlari (randevu_id);
