-- Faz-2: Bildirim fallback, recete ilac kalemleri ve mikrocip alanlari

alter table if exists public.bildirimler
  add column if not exists fallback_kanal text,
  add column if not exists fallback_durum text not null default 'beklemede',
  add column if not exists retry_sayisi integer not null default 0,
  add column if not exists son_hata text,
  add column if not exists dis_kanal_mesaj_id text,
  add column if not exists son_denemede timestamptz;

create index if not exists idx_bildirimler_fallback_durum
  on public.bildirimler (fallback_durum, olusturma_tarihi desc);

alter table if exists public.hayvan_kimlikleri
  add column if not exists mikrocip_no text;

create unique index if not exists uq_hayvan_kimlikleri_mikrocip_no
  on public.hayvan_kimlikleri (mikrocip_no)
  where mikrocip_no is not null;

alter table if exists public.receteler
  add column if not exists recete_tarihi date not null default current_date,
  add column if not exists tani text,
  add column if not exists durum text not null default 'aktif';

alter table if exists public.randevular
  add column if not exists sikayet_ozet text,
  add column if not exists ai_oncelik text;

alter table if exists public.randevular
  drop constraint if exists randevular_ai_oncelik_check;

alter table if exists public.randevular
  add constraint randevular_ai_oncelik_check
  check (ai_oncelik in ('rutin', 'oncelikli', 'acil') or ai_oncelik is null);

alter table if exists public.receteler
  drop constraint if exists receteler_durum_check;

alter table if exists public.receteler
  add constraint receteler_durum_check
  check (durum in ('aktif', 'tamamlandi', 'iptal'));

create table if not exists public.recete_ilac_kalemleri (
  id bigserial primary key,
  recete_id bigint not null references public.receteler (id) on delete cascade,
  ilac_adi text not null,
  doz text,
  kullanim_sikligi text,
  sure_gun integer,
  notlar text,
  olusturma_tarihi timestamptz not null default now()
);

create index if not exists idx_recete_ilac_kalemleri_recete_id
  on public.recete_ilac_kalemleri (recete_id);
