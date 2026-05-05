# Barberhub

Multi-tenant SaaS για online κρατήσεις κουρείων. PHP-style clean URLs, Postgres backend, mobile-first UI.

---

## Public URLs

| Path | Σκοπός |
|---|---|
| `/` | Marketing landing |
| `/features` | Δυνατότητες |
| `/pricing` | Πακέτα + signup |
| `/?shop=SLUG` | Booking page πελάτη |
| `/admin` | Login + dashboard κουρέα |
| `/admin/today` | Σήμερα |
| `/admin/appointments` | Ραντεβού |
| `/admin/schedule` | Πρόγραμμα |
| `/admin/settings` | Ρυθμίσεις |
| `/creator` | Creator dashboard (marketplace owner) |
| `/qr?shop=SLUG` | Εκτυπώσιμο QR |

Όλα τα `.html` URLs κάνουν 301 redirect σε clean version.

---

## Quick start (local dev)

```bash
npm install
cp .env.production.example .env
# Άλλαξε JWT_SECRET, CREATOR_PASSWORD
npm start
```

Άνοιγμα `http://localhost:3000`.

## Production deployment (Railway)

1. **Add PostgreSQL** στο Railway project
2. Στις Variables του service:
   - `DATABASE_URL` = reference στο Postgres.DATABASE_PUBLIC_URL
   - `CREATOR_PASSWORD` = δικός σου ισχυρός κωδικός
   - `JWT_SECRET` = `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PUBLIC_URL` = το domain από Railway
   - `NODE_ENV=production`, `LOG_PII=false`
3. **Connect GitHub repo** → push → auto-deploy

## Stack

- **Backend**: Node.js + Express + bcrypt + JWT + helmet + rate-limit
- **Database**: PostgreSQL (production) / SQLite (local fallback)
- **Frontend**: Vanilla JS + Inter/Fraunces fonts + custom CSS
- **Email**: Nodemailer + Gmail SMTP (optional)
- **SMS**: Twilio (optional)

## Files

```
server.js          Express server + routes
database.js        DB abstraction (PG/SQLite auto-switch)
auth.js            bcrypt + JWT helpers
sms.js             Twilio integration
email.js           Nodemailer integration
scheduler.js       Cron για SMS υπενθυμίσεις
public/
  welcome.html     Marketing landing
  features.html    Features page
  pricing.html     Pricing + signup form
  index.html       Customer booking flow
  admin.html       Barber/shop owner dashboard
  creator.html     Marketplace owner dashboard
  qr.html          Printable QR
  styles.css       Global styles
  manifest.webmanifest, sw.js, icon.svg   PWA
  robots.txt, sitemap.xml                 SEO
```

## Pricing tiers

- **Solo** (1 κουρέας) — €15/μήνα
- **Duo** (2) — €25/μήνα
- **Team** (3+) — €10/κουρέα/μήνα
- 7 ημέρες δωρεάν δοκιμή σε όλα

## Security

- Per-shop auth με bcrypt (12 rounds)
- JWT cookies (httpOnly, secure σε prod, 7 ημέρες)
- Rate limiting (login 8/15min, signup 3/hr, booking 5/10min)
- Helmet headers + CSP
- Input sanitization (XSS protection)
- PII masking στα logs
