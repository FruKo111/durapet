-- Dijital hayvan kimligi icin gorsel ve not alanlari

alter table if exists public.hayvan_kimlikleri
  add column if not exists foto_url text,
  add column if not exists kimlik_notu text,
  add column if not exists guncelleme_tarihi timestamptz not null default now();

create or replace function public.hayvan_kimlik_guncelleme_tarihi_ata()
returns trigger
language plpgsql
as $$
begin
  new.guncelleme_tarihi = now();
  return new;
end;
$$;

drop trigger if exists trg_hayvan_kimlik_guncelleme_tarihi on public.hayvan_kimlikleri;
create trigger trg_hayvan_kimlik_guncelleme_tarihi
before update on public.hayvan_kimlikleri
for each row
execute function public.hayvan_kimlik_guncelleme_tarihi_ata();
