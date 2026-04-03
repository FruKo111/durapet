-- Opsiyonel HBYS alanlari: triage ve vital bulgular
-- Bu alanlar zorunlu degil; girilmezse null kalir.

alter table if exists public.saglik_kayitlari
  add column if not exists triage_seviyesi text
    check (triage_seviyesi in ('dusuk', 'orta', 'yuksek', 'kritik')),
  add column if not exists ates_c numeric(4,1),
  add column if not exists nabiz integer,
  add column if not exists solunum_sayisi integer,
  add column if not exists kilo_kg numeric(6,2);
