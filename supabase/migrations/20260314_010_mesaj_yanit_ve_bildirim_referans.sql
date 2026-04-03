-- Mesaj yanitlama ve bildirim sohbet referansi

alter table if exists public.mesajlar
  add column if not exists yanit_mesaj_id bigint references public.mesajlar (id) on delete set null;

alter table if exists public.mesajlar
  add column if not exists yanit_ozet text;

alter table if exists public.bildirimler
  add column if not exists referans_oda_id bigint references public.mesaj_odalar (id) on delete set null;

