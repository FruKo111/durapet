-- Klinik bazli bildirim ayarlari (WhatsApp/SMS)

alter table if exists public.veteriner_profilleri
  add column if not exists klinik_kodu text;

update public.veteriner_profilleri
set klinik_kodu = coalesce(nullif(trim(klinik_kodu), ''), concat('klinik-', left(id::text, 8)))
where klinik_kodu is null or trim(klinik_kodu) = '';

create unique index if not exists idx_veteriner_profilleri_klinik_kodu_uniq
  on public.veteriner_profilleri (klinik_kodu);

create table if not exists public.klinik_bildirim_ayarlari (
  id bigserial primary key,
  klinik_kodu text not null unique,
  provider text not null default 'mock' check (provider in ('mock', 'webhook', 'twilio')),
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_whatsapp_from text,
  webhook_url text,
  webhook_token text,
  aktif boolean not null default true,
  guncelleyen_veteriner_id uuid references public.veteriner_profilleri (id) on delete set null,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now()
);

create index if not exists idx_klinik_bildirim_ayarlari_kod_aktif
  on public.klinik_bildirim_ayarlari (klinik_kodu, aktif);

drop trigger if exists trg_klinik_bildirim_ayarlari_guncelleme_tarihi on public.klinik_bildirim_ayarlari;
create trigger trg_klinik_bildirim_ayarlari_guncelleme_tarihi
before update on public.klinik_bildirim_ayarlari
for each row
execute function public.guncelleme_tarihi_ata();

alter table if exists public.bildirimler
  add column if not exists kaynak_veteriner_id uuid references public.veteriner_profilleri (id) on delete set null,
  add column if not exists klinik_kodu text;

create index if not exists idx_bildirimler_klinik_kodu_tarih
  on public.bildirimler (klinik_kodu, olusturma_tarihi desc);

