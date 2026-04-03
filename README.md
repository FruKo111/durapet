# DuraPet

Monorepo: **Express API** (kök) + **Next.js panel** (`web/`).

## API (kök)

```bash
npm ci
npm run build   # Hostinger uyumlu doğrulama
npm start       # server/index.js
```

## Web panel

```bash
cd web
npm ci
npm run build
npm start
```

### Hostinger (kök `./` kilitliyse)

Aynı repoda iki site: **API** ve **panel** kökten `npm run build` / `npm start` kullanır.

- **API (`durapet.site`):** ekstra env gerekmez.
- **Panel (`durapet.com.tr`):** **Node.js 20.x veya 22.x** (Next.js 16, **18.x ile derleme başarısız**). Ortam: **`DURAPET_BUILD=web`** (veya **`BUILD_TARGET=web`** / **`HB_PANEL=web`**). Çıktı dizini: **`web/.next`**.
- **`.env.local` GitHub’da yok** (`.gitignore`); Hostinger’a değişkenleri **hPanel → Ortam değişkenleri** ile tek tek gir — dosya yüklemen deployment’ta otomatik okunmaz.
- **Next derlemesi** sırasında da (sadece runtime değil) şu **`NEXT_PUBLIC_*`** değişkenleri tanımlı olmalı; yoksa `npm run build` patlar:
  - **`NEXT_PUBLIC_API_BASE_URL`** → yalnızca API kökü: `https://durapet.site` (panel `durapet.com.tr` **yazma**). Bu değişince **mutlaka yeniden derle + dağıt** (Next değeri build anında gömer).
  - Derleme logunda **`NEXT_PUBLIC_API_BASE_URL => ...`** satırını kontrol et; yanlışsa Hostinger’daki değeri düzelt. Girişte hâlâ HTML 404 görürsen tarayıcıda **gizli sekme** veya **önbelleği temizle** (eski JS bundle cache’lenebilir).
  - CSS/JS bazen yüklenmiyorsa: başka cihazda **tam URL** `https://durapet.com.tr` (https) kullan; Hostinger **LiteSpeed / önbellek** varsa site için **önbelleği temizle / Purge**.
  - **`NEXT_PUBLIC_SUPABASE_URL`**
  - **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (veya **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`**)
  - **`NEXT_PUBLIC_SITE_URL`** → `https://durapet.com.tr` (veya **`NEXT_PUBLIC_QR_PUBLIC_BASE_URL`** aynı kök)
- Derlemede **`DuraPet API: derleme yok...`** görüp **`No output directory found`** alıyorsan: **`DURAPET_BUILD=web`** build ortamında yok → kaydet, yeniden dağıt.

Yerel kökten panel derlemek: `DURAPET_BUILD=web npm run build`

Yerel geliştirme: kökte `.env.local`, `web/` içinde ayrı `.env.local` — `.env.example` dosyalarına bak.

Panel: `http://localhost:3000/giris`
