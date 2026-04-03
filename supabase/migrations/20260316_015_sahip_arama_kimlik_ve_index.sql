-- Veteriner sahip arama deneyimi iyilestirme:
-- - Her kullaniciya DP-USER formatinda benzersiz kimlik
-- - Telefon benzersizligi
-- - Sahip/hayvan/kimlik aramalari icin hiz indexleri

create extension if not exists pg_trgm;

do $$
begin
  if to_regclass('public.kullanicilar') is null then
    raise exception 'Gerekli tablo bulunamadi: public.kullanicilar. Once 20260313_001_baslangic_sema.sql migrationini calistirin.';
  end if;
  if to_regclass('public.hayvanlar') is null then
    raise exception 'Gerekli tablo bulunamadi: public.hayvanlar. Once 20260313_001_baslangic_sema.sql migrationini calistirin.';
  end if;
  if to_regclass('public.hayvan_kimlikleri') is null then
    raise exception 'Gerekli tablo bulunamadi: public.hayvan_kimlikleri. Once 20260313_001_baslangic_sema.sql migrationini calistirin.';
  end if;
end
$$;

alter table public.kullanicilar
  add column if not exists durapet_user_id text;

with sirali as (
  select
    id,
    row_number() over (order by olusturma_tarihi, id) as rn
  from public.kullanicilar
  where durapet_user_id is null
)
update public.kullanicilar k
set durapet_user_id = 'DP-USER-' || lpad(s.rn::text, 6, '0')
from sirali s
where s.id = k.id;

create sequence if not exists public.durapet_user_id_seq;

select setval(
  'public.durapet_user_id_seq',
  greatest(
    1,
    coalesce(
      (
        select max((regexp_match(durapet_user_id, '^DP-USER-(\d{6})$'))[1]::int)
        from public.kullanicilar
      ),
      0
    )
  ),
  true
);

create or replace function public.durapet_user_id_uret()
returns trigger
language plpgsql
as $$
begin
  if new.durapet_user_id is null or btrim(new.durapet_user_id) = '' then
    new.durapet_user_id := 'DP-USER-' || lpad(nextval('public.durapet_user_id_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_durapet_user_id_uret on public.kullanicilar;
create trigger trg_durapet_user_id_uret
before insert on public.kullanicilar
for each row
execute function public.durapet_user_id_uret();

create unique index if not exists uq_kullanicilar_durapet_user_id
  on public.kullanicilar (durapet_user_id);

create unique index if not exists uq_kullanicilar_telefon
  on public.kullanicilar ((regexp_replace(telefon, '[^0-9+]', '', 'g')))
  where telefon is not null and btrim(telefon) <> '';

create index if not exists idx_kullanicilar_ad_trgm
  on public.kullanicilar using gin (ad gin_trgm_ops);

create index if not exists idx_kullanicilar_soyad_trgm
  on public.kullanicilar using gin (soyad gin_trgm_ops);

create index if not exists idx_kullanicilar_telefon_trgm
  on public.kullanicilar using gin (telefon gin_trgm_ops)
  where telefon is not null;

create index if not exists idx_kullanicilar_durapet_user_id_trgm
  on public.kullanicilar using gin (durapet_user_id gin_trgm_ops);

create index if not exists idx_hayvanlar_ad_trgm
  on public.hayvanlar using gin (ad gin_trgm_ops);

create index if not exists idx_hayvanlar_tur_trgm
  on public.hayvanlar using gin (tur gin_trgm_ops);

create index if not exists idx_hayvanlar_irk_trgm
  on public.hayvanlar using gin (irk gin_trgm_ops);

create index if not exists idx_hayvan_kimlikleri_no_trgm
  on public.hayvan_kimlikleri using gin (benzersiz_kimlik_no gin_trgm_ops);
