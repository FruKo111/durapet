-- DuraPet RLS ve rol bazli erisim politikalari

create or replace function public.mevcut_kullanici_rolu()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.ad
  from public.kullanicilar k
  join public.roller r on r.id = k.rol_id
  where k.id = auth.uid()
  limit 1;
$$;

create or replace function public.admin_mi()
returns boolean
language sql
stable
as $$
  select public.mevcut_kullanici_rolu() = 'admin';
$$;

create or replace function public.veteriner_mi()
returns boolean
language sql
stable
as $$
  select public.mevcut_kullanici_rolu() = 'veteriner';
$$;

create or replace function public.hayvan_sahibi_mi()
returns boolean
language sql
stable
as $$
  select public.mevcut_kullanici_rolu() = 'hayvan_sahibi';
$$;

create or replace function public.hayvan_sahibi_oldugum_hayvan(h_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hayvanlar h
    where h.id = h_id
      and h.sahibi_id = auth.uid()
  );
$$;

create or replace function public.veteriner_ilgili_hayvan(h_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.saglik_kayitlari sk
    where sk.hayvan_id = h_id
      and sk.veteriner_id = auth.uid()
  )
  or exists (
    select 1
    from public.randevular r
    where r.hayvan_id = h_id
      and r.veteriner_id = auth.uid()
  )
  or exists (
    select 1
    from public.mesaj_odalar mo
    where mo.hayvan_id = h_id
      and mo.veteriner_id = auth.uid()
  );
$$;

-- RLS ac
alter table public.kullanicilar enable row level security;
alter table public.veteriner_profilleri enable row level security;
alter table public.hayvan_sahibi_profilleri enable row level security;
alter table public.hayvanlar enable row level security;
alter table public.hayvan_kimlikleri enable row level security;
alter table public.saglik_kayitlari enable row level security;
alter table public.asilar enable row level security;
alter table public.receteler enable row level security;
alter table public.randevular enable row level security;
alter table public.mesaj_odalar enable row level security;
alter table public.mesajlar enable row level security;
alter table public.bildirimler enable row level security;
alter table public.hatirlatmalar enable row level security;
alter table public.erisim_loglari enable row level security;
alter table public.guvenlik_loglari enable row level security;

-- KULLANICILAR
drop policy if exists "kullanicilar_admin_tam_erisim" on public.kullanicilar;
create policy "kullanicilar_admin_tam_erisim"
on public.kullanicilar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "kullanicilar_kendi_kaydi" on public.kullanicilar;
create policy "kullanicilar_kendi_kaydi"
on public.kullanicilar
for select
using (id = auth.uid());

drop policy if exists "kullanicilar_kendi_kaydi_guncelle" on public.kullanicilar;
create policy "kullanicilar_kendi_kaydi_guncelle"
on public.kullanicilar
for update
using (id = auth.uid())
with check (id = auth.uid());

-- PROFILLER
drop policy if exists "veteriner_profilleri_admin_tam_erisim" on public.veteriner_profilleri;
create policy "veteriner_profilleri_admin_tam_erisim"
on public.veteriner_profilleri
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "veteriner_profilleri_kendi_profil" on public.veteriner_profilleri;
create policy "veteriner_profilleri_kendi_profil"
on public.veteriner_profilleri
for select
using (id = auth.uid());

drop policy if exists "hayvan_sahibi_profilleri_admin_tam_erisim" on public.hayvan_sahibi_profilleri;
create policy "hayvan_sahibi_profilleri_admin_tam_erisim"
on public.hayvan_sahibi_profilleri
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "hayvan_sahibi_profilleri_kendi_profil" on public.hayvan_sahibi_profilleri;
create policy "hayvan_sahibi_profilleri_kendi_profil"
on public.hayvan_sahibi_profilleri
for select
using (id = auth.uid());

-- HAYVANLAR
drop policy if exists "hayvanlar_admin_tam_erisim" on public.hayvanlar;
create policy "hayvanlar_admin_tam_erisim"
on public.hayvanlar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "hayvanlar_sahip_erisim" on public.hayvanlar;
create policy "hayvanlar_sahip_erisim"
on public.hayvanlar
for all
using (sahibi_id = auth.uid())
with check (sahibi_id = auth.uid());

drop policy if exists "hayvanlar_veteriner_goruntuleme" on public.hayvanlar;
create policy "hayvanlar_veteriner_goruntuleme"
on public.hayvanlar
for select
using (public.veteriner_mi() and public.veteriner_ilgili_hayvan(id));

-- HAYVAN KIMLIKLERI
drop policy if exists "hayvan_kimlikleri_admin" on public.hayvan_kimlikleri;
create policy "hayvan_kimlikleri_admin"
on public.hayvan_kimlikleri
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "hayvan_kimlikleri_sahip_veteriner_gorur" on public.hayvan_kimlikleri;
create policy "hayvan_kimlikleri_sahip_veteriner_gorur"
on public.hayvan_kimlikleri
for select
using (
  public.hayvan_sahibi_oldugum_hayvan(hayvan_id)
  or (public.veteriner_mi() and public.veteriner_ilgili_hayvan(hayvan_id))
);

-- SAGLIK KAYITLARI
drop policy if exists "saglik_kayitlari_admin" on public.saglik_kayitlari;
create policy "saglik_kayitlari_admin"
on public.saglik_kayitlari
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "saglik_kayitlari_sahip_gorur" on public.saglik_kayitlari;
create policy "saglik_kayitlari_sahip_gorur"
on public.saglik_kayitlari
for select
using (
  public.hayvan_sahibi_oldugum_hayvan(hayvan_id)
  and hassas_mi = false
);

drop policy if exists "saglik_kayitlari_veteriner_erisim" on public.saglik_kayitlari;
create policy "saglik_kayitlari_veteriner_erisim"
on public.saglik_kayitlari
for all
using (public.veteriner_mi() and veteriner_id = auth.uid())
with check (public.veteriner_mi() and veteriner_id = auth.uid());

-- ASILAR
drop policy if exists "asilar_admin" on public.asilar;
create policy "asilar_admin"
on public.asilar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "asilar_sahip_gorur" on public.asilar;
create policy "asilar_sahip_gorur"
on public.asilar
for select
using (public.hayvan_sahibi_oldugum_hayvan(hayvan_id));

drop policy if exists "asilar_veteriner_erisim" on public.asilar;
create policy "asilar_veteriner_erisim"
on public.asilar
for all
using (public.veteriner_mi() and veteriner_id = auth.uid())
with check (public.veteriner_mi() and veteriner_id = auth.uid());

-- RECETELER
drop policy if exists "receteler_admin" on public.receteler;
create policy "receteler_admin"
on public.receteler
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "receteler_sahip_gorur" on public.receteler;
create policy "receteler_sahip_gorur"
on public.receteler
for select
using (public.hayvan_sahibi_oldugum_hayvan(hayvan_id));

drop policy if exists "receteler_veteriner_erisim" on public.receteler;
create policy "receteler_veteriner_erisim"
on public.receteler
for all
using (public.veteriner_mi() and veteriner_id = auth.uid())
with check (public.veteriner_mi() and veteriner_id = auth.uid());

-- RANDEVULAR
drop policy if exists "randevular_admin" on public.randevular;
create policy "randevular_admin"
on public.randevular
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "randevular_sahip_erisim" on public.randevular;
create policy "randevular_sahip_erisim"
on public.randevular
for all
using (sahibi_id = auth.uid())
with check (sahibi_id = auth.uid());

drop policy if exists "randevular_veteriner_erisim" on public.randevular;
create policy "randevular_veteriner_erisim"
on public.randevular
for all
using (public.veteriner_mi() and veteriner_id = auth.uid())
with check (public.veteriner_mi() and veteriner_id = auth.uid());

-- MESAJ ODALARI
drop policy if exists "mesaj_odalar_admin" on public.mesaj_odalar;
create policy "mesaj_odalar_admin"
on public.mesaj_odalar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "mesaj_odalar_taraflar_erisim" on public.mesaj_odalar;
create policy "mesaj_odalar_taraflar_erisim"
on public.mesaj_odalar
for all
using (veteriner_id = auth.uid() or sahibi_id = auth.uid())
with check (veteriner_id = auth.uid() or sahibi_id = auth.uid());

-- MESAJLAR
drop policy if exists "mesajlar_admin" on public.mesajlar;
create policy "mesajlar_admin"
on public.mesajlar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "mesajlar_taraflar_gorur" on public.mesajlar;
create policy "mesajlar_taraflar_gorur"
on public.mesajlar
for select
using (
  exists (
    select 1
    from public.mesaj_odalar mo
    where mo.id = mesajlar.oda_id
      and (mo.veteriner_id = auth.uid() or mo.sahibi_id = auth.uid())
  )
);

drop policy if exists "mesajlar_taraflar_gonderir" on public.mesajlar;
create policy "mesajlar_taraflar_gonderir"
on public.mesajlar
for insert
with check (
  gonderen_id = auth.uid()
  and exists (
    select 1
    from public.mesaj_odalar mo
    where mo.id = mesajlar.oda_id
      and (mo.veteriner_id = auth.uid() or mo.sahibi_id = auth.uid())
  )
);

-- BILDIRIMLER
drop policy if exists "bildirimler_admin" on public.bildirimler;
create policy "bildirimler_admin"
on public.bildirimler
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "bildirimler_kendi_bildirimi" on public.bildirimler;
create policy "bildirimler_kendi_bildirimi"
on public.bildirimler
for select
using (kullanici_id = auth.uid());

-- HATIRLATMALAR
drop policy if exists "hatirlatmalar_admin" on public.hatirlatmalar;
create policy "hatirlatmalar_admin"
on public.hatirlatmalar
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "hatirlatmalar_veteriner_erisim" on public.hatirlatmalar;
create policy "hatirlatmalar_veteriner_erisim"
on public.hatirlatmalar
for all
using (public.veteriner_mi() and veteriner_id = auth.uid())
with check (public.veteriner_mi() and veteriner_id = auth.uid());

drop policy if exists "hatirlatmalar_sahip_gorur" on public.hatirlatmalar;
create policy "hatirlatmalar_sahip_gorur"
on public.hatirlatmalar
for select
using (sahibi_id = auth.uid());

-- LOG TABLOLARI
drop policy if exists "erisim_loglari_admin_sadece" on public.erisim_loglari;
create policy "erisim_loglari_admin_sadece"
on public.erisim_loglari
for select
using (public.admin_mi());

drop policy if exists "guvenlik_loglari_admin_sadece" on public.guvenlik_loglari;
create policy "guvenlik_loglari_admin_sadece"
on public.guvenlik_loglari
for select
using (public.admin_mi());

