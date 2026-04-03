-- Klinik bildirim ayarlarina Infobip provider destegi

alter table if exists public.klinik_bildirim_ayarlari
  add column if not exists infobip_base_url text,
  add column if not exists infobip_api_key text,
  add column if not exists infobip_sender text;

alter table if exists public.klinik_bildirim_ayarlari
  drop constraint if exists klinik_bildirim_ayarlari_provider_check;

alter table if exists public.klinik_bildirim_ayarlari
  add constraint klinik_bildirim_ayarlari_provider_check
  check (provider in ('mock', 'webhook', 'twilio', 'infobip'));

