-- Telefonlari TR odakli E.164 formatina normalize eder.
create or replace function public.telefon_normalize_tr(in_telefon text)
returns text
language plpgsql
immutable
as $$
declare
  ham text;
  rakam text;
begin
  ham := trim(coalesce(in_telefon, ''));
  if ham = '' then
    return null;
  end if;

  ham := regexp_replace(ham, '[^0-9+]', '', 'g');
  if ham = '' then
    return null;
  end if;

  if left(ham, 1) = '+' then
    return ham;
  end if;

  rakam := regexp_replace(ham, '[^0-9]', '', 'g');
  if rakam = '' then
    return null;
  end if;

  if length(rakam) = 10 then
    return '+90' || rakam;
  end if;

  if length(rakam) = 11 and left(rakam, 1) = '0' then
    return '+9' || rakam;
  end if;

  if left(rakam, 2) = '90' then
    return '+' || rakam;
  end if;

  return '+' || rakam;
end;
$$;

-- Eski migrationdaki katı unique index (tum satirlarda) normalize islemini bloklayabiliyor.
drop index if exists public.uq_kullanicilar_telefon;

-- Mevcut verileri normalize edip kanallar arasi tutarlilik saglar.
update public.kullanicilar
set telefon = public.telefon_normalize_tr(telefon)
where telefon is not null;

-- Yeni / guncellenen kayitlarda aktif kullanicilar icin telefon cakismasini engeller.
create or replace function public.kullanicilar_telefon_cakisma_kontrolu()
returns trigger
language plpgsql
as $$
declare
  yeni_tel text;
  cakisma_id uuid;
begin
  yeni_tel := public.telefon_normalize_tr(new.telefon);
  new.telefon := yeni_tel;

  if coalesce(new.aktif, true) is false or yeni_tel is null then
    return new;
  end if;

  select k.id
  into cakisma_id
  from public.kullanicilar k
  where k.id <> new.id
    and coalesce(k.aktif, true) = true
    and public.telefon_normalize_tr(k.telefon) = yeni_tel
  limit 1;

  if cakisma_id is not null then
    raise exception using
      errcode = '23505',
      message = 'Bu telefon numarasi baska bir aktif kullanicida kayitli.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kullanicilar_telefon_cakisma on public.kullanicilar;
create trigger trg_kullanicilar_telefon_cakisma
before insert or update of telefon, aktif
on public.kullanicilar
for each row
execute function public.kullanicilar_telefon_cakisma_kontrolu();

-- Arama performansi icin normalizasyon bazli index.
create index if not exists idx_kullanicilar_telefon_normalize
  on public.kullanicilar ((public.telefon_normalize_tr(telefon)));

-- Aktif kayitlarda duplicate kalmadiysa unique index olustur; varsa migration'i patlatma.
do $$
begin
  if exists (
    select 1
    from (
      select public.telefon_normalize_tr(telefon) as tel_norm, count(*) as adet
      from public.kullanicilar
      where coalesce(aktif, true) = true
        and telefon is not null
      group by 1
      having count(*) > 1
    ) d
  ) then
    raise notice 'Aktif kullanicilarda duplicate telefon bulundu; unique index atlandi. Once duplicate kayitlari duzeltin.';
  else
    create unique index if not exists uq_kullanicilar_telefon_aktif_norm
      on public.kullanicilar ((public.telefon_normalize_tr(telefon)))
      where coalesce(aktif, true) = true and telefon is not null;
  end if;
end $$;

