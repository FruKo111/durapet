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
- **Panel (`durapet.com.tr`):** ortam değişkeni **`DURAPET_BUILD=web`** ver (alternatif: **`BUILD_TARGET=web`** veya **`HB_PANEL=web`**). Çıktı dizini: **`web/.next`**. Ayrıca `NEXT_PUBLIC_*` ve `NEXT_PUBLIC_API_BASE_URL`.
- Derlemede **`DuraPet API: derleme yok...`** görüp **`No output directory found after build`** alıyorsan: bu değişken **build aşamasında** tanımlı değil — hPanel’de kaydedip **yeniden dağıt**; bazen değişken sadece “çalışma zamanı”na eklenmiş olur.

Yerel kökten panel derlemek: `DURAPET_BUILD=web npm run build`

Yerel geliştirme: kökte `.env.local`, `web/` içinde ayrı `.env.local` — `.env.example` dosyalarına bak.

Panel: `http://localhost:3000/giris`
