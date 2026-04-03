-- Hatirlatma hedef sahip duzeltmesi ve bildirim metni sertlestirmesi

-- Veri drift: hayvan sahipligi degismis ancak hatirlatma sahibi eski kalmis olabilir.
update public.hatirlatmalar h
set sahibi_id = hv.sahibi_id
from public.hayvanlar hv
where hv.id = h.hayvan_id
  and hv.sahibi_id is not null
  and h.sahibi_id is distinct from hv.sahibi_id;

create or replace function public.gunluk_hatirlatma_kontrolu()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  eklenen_sayi integer := 0;
begin
  with adaylar as (
    select
      h.id as hatirlatma_id,
      hv.sahibi_id as kullanici_id,
      hv.id as hayvan_id,
      hv.ad as hayvan_adi,
      h.islem_turu,
      h.hedef_tarih,
      (h.hedef_tarih - current_date) as kalan_gun
    from public.hatirlatmalar h
    join public.hayvanlar hv on hv.id = h.hayvan_id
    where h.durum = 'planlandi'
      and h.islem_turu in ('kuduz_asi', 'karma_asi', 'ic_parazit', 'dis_parazit', 'genel_kontrol')
      and (h.hedef_tarih - current_date) in (7, 3, 0)
  ),
  eklenecekler as (
    insert into public.bildirimler (
      kullanici_id,
      tur,
      baslik,
      icerik,
      kanal,
      gonderim_zamani,
      durum,
      referans_hayvan_id
    )
    select
      a.kullanici_id,
      'asi_hatirlatma',
      'Asi/Kontrol Hatirlatmasi',
      case
        when a.kalan_gun = 0 then
          a.hayvan_adi || ' icin ' || a.islem_turu || ' bugun planli.'
        else
          a.hayvan_adi || ' icin ' || a.islem_turu || ' islemi ' || a.kalan_gun || ' gun sonra.'
      end as icerik,
      'push',
      now(),
      'bekliyor',
      a.hayvan_id
    from adaylar a
    where not exists (
      select 1
      from public.bildirimler b
      where b.kullanici_id = a.kullanici_id
        and b.tur = 'asi_hatirlatma'
        and b.referans_hayvan_id = a.hayvan_id
        and b.olusturma_tarihi::date = current_date
        and b.icerik = case
          when a.kalan_gun = 0 then
            a.hayvan_adi || ' icin ' || a.islem_turu || ' bugun planli.'
          else
            a.hayvan_adi || ' icin ' || a.islem_turu || ' islemi ' || a.kalan_gun || ' gun sonra.'
        end
    )
    returning id
  )
  select count(*) into eklenen_sayi from eklenecekler;

  return eklenen_sayi;
end;
$$;

