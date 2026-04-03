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

Yerel geliştirme: kökte `.env.local`, `web/` içinde ayrı `.env.local` — `.env.example` dosyalarına bak.

Panel: `http://localhost:3000/giris`
