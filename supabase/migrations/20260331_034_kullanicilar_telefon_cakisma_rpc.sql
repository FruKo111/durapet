-- API ve kayit akislari icin: normalize edilmis telefon eslesmesi (Node .in() ile kacan varyantlari da yakalar).
create or replace function public.kullanicilar_telefon_cakisma_var_mi(
  p_telefon text,
  p_haric_kullanici_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.kullanicilar k
    where coalesce(k.aktif, true) = true
      and k.telefon is not null
      and (
        p_haric_kullanici_id is null
        or k.id is distinct from p_haric_kullanici_id
      )
      and public.telefon_normalize_tr(k.telefon)
          is not distinct from public.telefon_normalize_tr(
            nullif(trim(coalesce(p_telefon, '')), '')
          )
  );
$$;

comment on function public.kullanicilar_telefon_cakisma_var_mi(text, uuid) is
  'Ayni telefon (TR normalize) ile baska aktif kullanici var mi; kayit ve guncelleme kontrolleri icin.';

grant execute on function public.kullanicilar_telefon_cakisma_var_mi(text, uuid) to service_role;
