-- Kimlik karti icin ek alanlar

alter table if exists public.hayvanlar
  add column if not exists kan_grubu text;

alter table if exists public.hayvan_sahibi_profilleri
  add column if not exists il text,
  add column if not exists ilce text;
