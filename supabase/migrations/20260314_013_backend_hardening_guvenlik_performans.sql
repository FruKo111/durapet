-- Backend hardening: randevu veri butunlugu, kimlik token zorunlulugu, performans indeksleri

create extension if not exists pgcrypto;

-- Randevu slot cakismasini DB seviyesinde engelle (sadece aktif durumlar)
create unique index if not exists uq_randevu_veteriner_aktif_slot
  on public.randevular (veteriner_id, randevu_tarihi, randevu_saati)
  where durum in ('beklemede', 'onaylandi');

-- Randevu olustururken sahibi-hayvan eslesmesini zorunlu kil
create or replace function public.randevu_sahip_hayvan_kontrol()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.hayvanlar h
    where h.id = new.hayvan_id
      and h.sahibi_id = new.sahibi_id
  ) then
    raise exception 'Randevu sahibi secilen hayvanla eslesmiyor.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_randevu_sahip_hayvan_kontrol on public.randevular;
create trigger trg_randevu_sahip_hayvan_kontrol
before insert or update on public.randevular
for each row
execute function public.randevu_sahip_hayvan_kontrol();

-- Kimlik token zorunlu olsun
update public.hayvan_kimlikleri
set qr_dogrulama_token = gen_random_uuid()::text
where qr_dogrulama_token is null or btrim(qr_dogrulama_token) = '';

alter table public.hayvan_kimlikleri
  alter column qr_dogrulama_token set not null;

create unique index if not exists uq_hayvan_kimlikleri_qr_token
  on public.hayvan_kimlikleri (qr_dogrulama_token);

-- Yeni iliski alanlari icin performans indeksleri
create index if not exists idx_mesajlar_yanit_mesaj_id
  on public.mesajlar (yanit_mesaj_id);

create index if not exists idx_bildirimler_referans_oda_id
  on public.bildirimler (referans_oda_id);
