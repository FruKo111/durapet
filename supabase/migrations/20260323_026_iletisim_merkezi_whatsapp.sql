-- Faz-3: Veteriner iletisim merkezi (WhatsApp takip + sablonlar)

alter table if exists public.bildirimler
  add column if not exists referans_hayvan_id bigint references public.hayvanlar (id) on delete set null,
  add column if not exists referans_randevu_id bigint references public.randevular (id) on delete set null,
  add column if not exists mesaj_sablon_adi text;

create index if not exists idx_bildirimler_referans_hayvan
  on public.bildirimler (referans_hayvan_id, olusturma_tarihi desc);

create index if not exists idx_bildirimler_referans_randevu
  on public.bildirimler (referans_randevu_id, olusturma_tarihi desc);

create table if not exists public.veteriner_mesaj_sablonlari (
  id bigserial primary key,
  veteriner_id uuid not null references public.veteriner_profilleri (id) on delete cascade,
  ad text not null,
  kanal text not null default 'whatsapp' check (kanal in ('push', 'whatsapp', 'sms')),
  icerik text not null,
  aktif boolean not null default true,
  olusturma_tarihi timestamptz not null default now(),
  guncelleme_tarihi timestamptz not null default now(),
  unique (veteriner_id, ad)
);

create index if not exists idx_veteriner_mesaj_sablonlari_veteriner
  on public.veteriner_mesaj_sablonlari (veteriner_id, aktif, olusturma_tarihi desc);

drop trigger if exists trg_veteriner_mesaj_sablonlari_guncelleme_tarihi on public.veteriner_mesaj_sablonlari;
create trigger trg_veteriner_mesaj_sablonlari_guncelleme_tarihi
before update on public.veteriner_mesaj_sablonlari
for each row
execute function public.guncelleme_tarihi_ata();

