-- Kalici hayvan silmede erisim_loglari FK engelini kaldir.
-- Hayvan silinince log satirlari kalsin, hayvan_id null olsun.

do $$
begin
  if to_regclass('public.erisim_loglari') is null then
    raise exception 'Gerekli tablo bulunamadi: public.erisim_loglari';
  end if;
end
$$;

alter table public.erisim_loglari
  drop constraint if exists erisim_loglari_hayvan_id_fkey;

alter table public.erisim_loglari
  add constraint erisim_loglari_hayvan_id_fkey
  foreign key (hayvan_id)
  references public.hayvanlar (id)
  on delete set null;
