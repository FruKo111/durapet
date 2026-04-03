-- Kimlik olusturma trigger/fonksiyonunu zorunlu olarak yeniler.
-- Farkli ortamlarda eski fonksiyon/trigger kaldiginda NOT NULL qr_dogrulama_token hatasi alinabilir.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.hayvanlar') is null then
    raise exception 'Gerekli tablo bulunamadi: public.hayvanlar';
  end if;
  if to_regclass('public.hayvan_kimlikleri') is null then
    raise exception 'Gerekli tablo bulunamadi: public.hayvan_kimlikleri';
  end if;
end
$$;

alter table public.hayvan_kimlikleri
  add column if not exists qr_dogrulama_token text;

update public.hayvan_kimlikleri
set qr_dogrulama_token = gen_random_uuid()::text
where qr_dogrulama_token is null or btrim(qr_dogrulama_token) = '';

alter table public.hayvan_kimlikleri
  alter column qr_dogrulama_token set default gen_random_uuid()::text;

alter table public.hayvan_kimlikleri
  alter column qr_dogrulama_token set not null;

create unique index if not exists uq_hayvan_kimlikleri_qr_token
  on public.hayvan_kimlikleri (qr_dogrulama_token);

create or replace function public.hayvan_kimligi_olustur()
returns trigger
language plpgsql
as $$
declare
  yeni_kimlik text;
begin
  yeni_kimlik := 'DURAPET-' || to_char(now(), 'YYYYMMDD') || '-' || new.id::text || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.hayvan_kimlikleri (hayvan_id, benzersiz_kimlik_no, qr_icerik, qr_dogrulama_token)
  values (new.id, yeni_kimlik, yeni_kimlik, gen_random_uuid()::text);

  return new;
end;
$$;

drop trigger if exists trg_hayvan_kimligi_olustur on public.hayvanlar;
create trigger trg_hayvan_kimligi_olustur
after insert on public.hayvanlar
for each row
execute function public.hayvan_kimligi_olustur();
