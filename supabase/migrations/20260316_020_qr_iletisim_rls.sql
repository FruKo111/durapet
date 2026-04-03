-- QR erisim ve iletisim talepleri icin RLS

alter table public.kayip_hayvan_erisim_kayitlari enable row level security;
alter table public.kayip_hayvan_iletisim_talepleri enable row level security;

drop policy if exists "kayip_hayvan_erisim_admin" on public.kayip_hayvan_erisim_kayitlari;
create policy "kayip_hayvan_erisim_admin"
on public.kayip_hayvan_erisim_kayitlari
for select
using (public.admin_mi());

drop policy if exists "kayip_hayvan_iletisim_admin" on public.kayip_hayvan_iletisim_talepleri;
create policy "kayip_hayvan_iletisim_admin"
on public.kayip_hayvan_iletisim_talepleri
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "kayip_hayvan_iletisim_sahip_gorur" on public.kayip_hayvan_iletisim_talepleri;
create policy "kayip_hayvan_iletisim_sahip_gorur"
on public.kayip_hayvan_iletisim_talepleri
for select
using (sahib_id = auth.uid());

drop policy if exists "kayip_hayvan_iletisim_sahip_gunceller" on public.kayip_hayvan_iletisim_talepleri;
create policy "kayip_hayvan_iletisim_sahip_gunceller"
on public.kayip_hayvan_iletisim_talepleri
for update
using (sahib_id = auth.uid())
with check (sahib_id = auth.uid());
