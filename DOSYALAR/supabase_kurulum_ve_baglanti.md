# Supabase Kurulum ve Baglanti

Bu dokuman, mevcut migration dosyalarini Supabase projesine guvenli sekilde uygulamak ve API baglantisini test etmek icindir.

## 1) Guvenlik Notu (Onemli)

- `publishable` ve `anon` anahtarlari istemci tarafinda kullanilabilir.
- `service_role` anahtari sadece sunucu tarafinda tutulur.
- `service_role` anahtarini paylastigin icin Supabase panelinden bir kere **rotate** etmeni oneririm.

## 2) Gerekli Bilgiler

- Project ref: `poqwgpuhhaipkbouissry`
- URL: `https://poqwgpuhhaipkbouissry.supabase.co`

## 3) Ortam Degiskenleri

Kok dizinde `.env` olustur (ornek: `.env.example`).

```env
SUPABASE_URL=https://poqwgpuhhaipkbouissry.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

## 4) Supabase CLI Kurulum

macOS:

```bash
brew install supabase/tap/supabase
supabase --version
```

## 5) Projeyi Linkleyip Migration Basma

```bash
cd /Users/furkanerdogan/Desktop/DuraVet_Web
supabase login
supabase link --project-ref poqwgpuhhaipkbouissry
supabase db push
```

Bu komutlar asagidaki migrationlari sirasiyla uygular:

- `supabase/migrations/20260313_001_baslangic_sema.sql`
- `supabase/migrations/20260313_002_rls_politikalari.sql`
- `supabase/migrations/20260313_003_hatirlatma_gorevi.sql`

## 6) Hata Durumlari

- `pg_cron` yetkisi/plani acik degilse 3. migrationda cron schedule kismi hata verebilir.
- Bu durumda fonksiyon yine olusur; sadece otomatik zamanlayici calismaz.
- Alternatif: Supabase Scheduled Functions ile `public.gunluk_hatirlatma_kontrolu()` cagrisi.

## 7) API Baglantisi Ornegi

### Frontend (sadece anon/publishable)

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Backend (service role, sadece server)

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

## 8) Ilk Dogrulama Sorgulari

Migrationdan sonra SQL Editor'de calistir:

```sql
select count(*) from public.roller;
select count(*) from pg_policies where schemaname = 'public';
select proname from pg_proc where proname in ('otomatik_hatirlatma_olustur', 'gunluk_hatirlatma_kontrolu');
```

