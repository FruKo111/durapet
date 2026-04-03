  -- DuraPet hatirlatma gorevi
  -- Bu fonksiyon gunluk cron ile calistirilir ve yaklasan hatirlatmalar icin bildirim kaydi olusturur.

  create extension if not exists pg_cron;

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
        h.sahibi_id as kullanici_id,
        hv.ad as hayvan_adi,
        h.islem_turu,
        h.hedef_tarih,
        (h.hedef_tarih - current_date) as kalan_gun
      from public.hatirlatmalar h
      join public.hayvanlar hv on hv.id = h.hayvan_id
      where h.durum = 'planlandi'
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
        durum
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
        'bekliyor'
      from adaylar a
      where not exists (
        select 1
        from public.bildirimler b
        where b.kullanici_id = a.kullanici_id
          and b.tur = 'asi_hatirlatma'
          and b.icerik = case
            when a.kalan_gun = 0 then
              a.hayvan_adi || ' icin ' || a.islem_turu || ' bugun planli.'
            else
              a.hayvan_adi || ' icin ' || a.islem_turu || ' islemi ' || a.kalan_gun || ' gun sonra.'
          end
          and b.olusturma_tarihi::date = current_date
      )
      returning id
    )
    select count(*) into eklenen_sayi from eklenecekler;

    return eklenen_sayi;
  end;
  $$;

  -- Supabase'de pg_cron aktifse asagidaki planlama calistirilabilir:
  -- Her gun 02:00 UTC
  do $$
  begin
    if not exists (
      select 1 from cron.job where jobname = 'durapet_gunluk_hatirlatma_kontrolu'
    ) then
      perform cron.schedule(
        'durapet_gunluk_hatirlatma_kontrolu',
        '0 2 * * *',
        $cron$select public.gunluk_hatirlatma_kontrolu();$cron$
      );
    end if;
  end
  $$;

