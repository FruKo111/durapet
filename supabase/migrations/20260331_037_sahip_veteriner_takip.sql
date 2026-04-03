-- Hayvan sahibinin veteriner takibi (hızlı erişim / hatırlatma)

create table if not exists public.sahip_veteriner_takipleri (
  sahibi_id uuid not null references public.hayvan_sahibi_profilleri (id) on delete cascade,
  veteriner_id uuid not null references public.veteriner_profilleri (id) on delete cascade,
  olusturma_tarihi timestamptz not null default now(),
  primary key (sahibi_id, veteriner_id)
);

create index if not exists idx_sahip_vet_takip_veteriner on public.sahip_veteriner_takipleri (veteriner_id);

alter table public.sahip_veteriner_takipleri enable row level security;

drop policy if exists "sahip_vet_takip_admin" on public.sahip_veteriner_takipleri;
create policy "sahip_vet_takip_admin"
on public.sahip_veteriner_takipleri
for all
using (public.admin_mi())
with check (public.admin_mi());

drop policy if exists "sahip_vet_takip_sahip_kendi" on public.sahip_veteriner_takipleri;
create policy "sahip_vet_takip_sahip_kendi"
on public.sahip_veteriner_takipleri
for all
using (sahibi_id = auth.uid())
with check (sahibi_id = auth.uid());
