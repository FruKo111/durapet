-- Ayni kullanici telefonu degistirmeden PATCH ile tekrar gonderdiginde
-- (normalize sonucu onceki ile ayni) gereksiz cakisma kontrolu yapilmasin;
-- UI'da "baska aktif kullanici" yanlis pozitifini onler.
create or replace function public.kullanicilar_telefon_cakisma_kontrolu()
returns trigger
language plpgsql
as $$
declare
  yeni_tel text;
  eski_tel text;
  cakisma_id uuid;
begin
  yeni_tel := public.telefon_normalize_tr(new.telefon);
  new.telefon := yeni_tel;

  if coalesce(new.aktif, true) is false or yeni_tel is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    eski_tel := public.telefon_normalize_tr(old.telefon);
    if eski_tel is not distinct from yeni_tel then
      return new;
    end if;
  end if;

  select k.id
  into cakisma_id
  from public.kullanicilar k
  where k.id is distinct from new.id
    and coalesce(k.aktif, true) = true
    and public.telefon_normalize_tr(k.telefon) is not distinct from yeni_tel
  limit 1;

  if cakisma_id is not null then
    raise exception using
      errcode = '23505',
      message = 'Bu telefon numarasi baska bir aktif kullanicida kayitli.';
  end if;

  return new;
end;
$$;
