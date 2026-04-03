-- mesajlar satir degisikliklerini Realtime ile istemcilere iletmek icin yayina al
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesajlar'
  ) then
    alter publication supabase_realtime add table public.mesajlar;
  end if;
end $$;
