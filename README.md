# 📈 Signal Trading

គេហទំព័រ Signal Trading ដែល **host** និង **database** ទាំងអស់នៅលើ Cloudflare:

- **Cloudflare Workers** – host គេហទំព័រ (HTML/CSS/JS) និង API
- **Cloudflare D1** – database (SQLite) សម្រាប់រក្សាទុក Signals

## មុខងារ

- ទំព័រសាធារណៈ (`/`) – បង្ហាញ Signals (Pair, BUY/SELL, Entry, SL, TP1–TP3, Status, Pips), ស្ថិតិ Win rate, filter តាម status, refresh ស្វ័យប្រវត្តិរៀងរាល់ 30 វិនាទី
- ទំព័រ Admin (`/admin`) – ចូលដោយពាក្យសម្ងាត់ បន្ទាប់មក បង្កើត / កែ / ប្ដូរ status / លុប Signals

## រចនាសម្ព័ន្ធ

```
src/index.js              Worker: API /api/* + serve static files
public/                   Frontend (index.html, admin.html, CSS, JS)
migrations/0001_init.sql  D1 schema (table signals)
wrangler.toml             Cloudflare config
```

## API

| Method | Path | Auth | ពិពណ៌នា |
|---|---|---|---|
| GET | `/api/signals?status=&pair=&limit=&offset=` | – | បញ្ជី Signals |
| GET | `/api/signals/:id` | – | Signal មួយ |
| GET | `/api/stats` | – | ស្ថិតិ (total, open, wins, losses, win_rate, total_pips) |
| POST | `/api/login` | – | `{ "password": "..." }` |
| POST | `/api/logout` | – | |
| POST | `/api/signals` | Admin | បង្កើត Signal |
| PUT | `/api/signals/:id` | Admin | កែ Signal (អាចផ្ញើតែ field ដែលចង់កែ) |
| DELETE | `/api/signals/:id` | Admin | លុប Signal |

Status: `pending`, `active`, `tp_hit`, `sl_hit`, `closed`, `cancelled`

## ដំណើរការលើកុំព្យូទ័រ (Local)

```bash
npm install
cp .dev.vars.example .dev.vars        # កែ ADMIN_PASSWORD និង SESSION_SECRET
npm run db:migrate:local
npm run dev                           # បើក http://localhost:8787
```

## Deploy ទៅ Cloudflare

1. ចូល Cloudflare account:
   ```bash
   npx wrangler login
   ```
2. បង្កើត D1 database:
   ```bash
   npx wrangler d1 create signal-db
   ```
   Copy `database_id` ដែលវាបង្ហាញ ទៅដាក់ក្នុង `wrangler.toml` (ជំនួស `REPLACE_WITH_YOUR_D1_DATABASE_ID`)។
3. បង្កើត table នៅលើ D1:
   ```bash
   npm run db:migrate:remote
   ```
4. កំណត់ secrets (ពាក្យសម្ងាត់ Admin និង key សម្រាប់ cookie):
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET     # string វែងៗ random ឧ. openssl rand -hex 32
   ```
5. Deploy:
   ```bash
   npm run deploy
   ```
   គេហទំព័រនឹងនៅ `https://signal-trading.<your-subdomain>.workers.dev`។
   ចង់ប្រើ domain ផ្ទាល់ខ្លួន → Cloudflare Dashboard → Workers & Pages → signal-trading → Settings → Domains & Routes។

## សុវត្ថិភាព

- ពាក្យសម្ងាត់ និង secret រក្សាទុកជា Cloudflare secrets (មិនដាក់ក្នុង code)
- Session cookie ត្រូវបាន sign ដោយ HMAC-SHA256, `HttpOnly`, `Secure`, `SameSite=Strict`, ផុតកំណត់ក្នុង 7 ថ្ងៃ
- SQL ប្រើ prepared statements; field ទាំងអស់ត្រូវបាន validate
- អត្ថបទទាំងអស់ត្រូវបាន escape មុនបង្ហាញ (ការពារ XSS)
