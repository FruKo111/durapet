-- Hayvan kimligi olusurken qr_dogrulama_token otomatik uretimi
-- Sorun: qr_dogrulama_token NOT NULL oldugu halde eski trigger bu alani set etmiyordu.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.hayvan_kimlikleri') is null then
    raise exception 'Gerekli tablo bulunamadi: public.hayvan_kimlikleri';
  end if;
end
$$;

-- Bazi ortamlarda kolon henuz olmayabilir
alter table public.hayvan_kimlikleri
  add column if not exists qr_dogrulama_token text;

-- Eksik tokenlari doldur
update public.hayvan_kimlikleri
set qr_dogrulama_token = gen_random_uuid()::text
where qr_dogrulama_token is null or btrim(qr_dogrulama_token) = '';

-- Yeni insertlerde default devrede olsun
alter table public.hayvan_kimlikleri
  alter column qr_dogrulama_token set default gen_random_uuid()::text;

-- Trigger fonksiyonunu token uretecek sekilde guncelle
create or replace function public.hayvan_kimligi_olustur()
returns trigger
language plpgsql
as $$
declare
  yeni_kimlik text;
  yeni_token text;
begin
  yeni_kimlik := 'DURAPET-' || to_char(now(), 'YYYYMMDD') || '-' || new.id::text || '-' || substr(gen_random_uuid()::text, 1, 8);
  yeni_token := gen_random_uuid()::text;

  insert into public.hayvan_kimlikleri (hayvan_id, benzersiz_kimlik_no, qr_icerik, qr_dogrulama_token)
  values (new.id, yeni_kimlik, yeni_kimlik, yeni_token);

  return new;
end;
$$;

-- Guvenlik: token benzersiz index garanti
create unique index if not exists uq_hayvan_kimlikleri_qr_token
  on public.hayvan_kimlikleri (qr_dogrulama_token);
