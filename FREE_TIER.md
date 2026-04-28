# 🆓 Zero-cost setup

Όλη η εφαρμογή τρέχει **δωρεάν** — απλά υπάρχουν trade-offs ανά επιλογή.

---

## 📊 Σύγκριση επιλογών hosting

| Option | Cost | Persistent DB | Sleep policy | Ιδανικό για |
|---|---|---|---|---|
| **Render Free** | $0/μήνα | ❌ Χάνεται σε redeploy | Κοιμάται μετά 15' | Demos, βραχεία testing |
| **Railway** | $5 free credit/μήνα | ✅ Persistent disk | Δεν κοιμάται | **50 testers, Πέμπτη pilot** ← συνιστώ |
| **Fly.io** | Trial (24h free) | ✅ Persistent volume | Δεν κοιμάται | Γνώση Docker |

---

## 🥇 Επιλογή Α: Railway (συνιστώμενη)

**Πιο σταθερό. $5 credit/μήνα δωρεάν αρκεί άνετα για 50 testers.**

### Setup (~5 λεπτά)

1. Πήγαινε στο [railway.com](https://railway.com) → **Login with GitHub**
2. **+ New Project** → **Deploy from GitHub repo** → επίλεξε `barberhub-app`
3. Το Railway αυτόματα ανιχνεύει Node.js και κάνει deploy
4. **Settings → Variables** → πρόσθεσε:
   - `JWT_SECRET` = (αντίγραψε από `.env.production.example`)
   - `SUPER_ADMIN_PASSWORD` = δικός σου ισχυρός κωδικός
   - `PUBLIC_URL` = το URL που δίνει το Railway
   - `NODE_ENV` = `production`
   - `LOG_PII` = `false`
   - `DB_PATH` = `/data/barbershop.db`
5. **Settings → Networking → Generate Domain** → παίρνεις public URL
6. **Settings → Volumes → New Volume** → mount path `/data` (1GB δωρεάν)

### Cost realistic
- Free $5/μήνα credit
- Μικρή εφαρμογή σαν αυτή: ~$3-5/μήνα → **$0 actual cost**

---

## 🥈 Επιλογή Β: Render Free Tier

**100% δωρεάν αλλά με 2 trade-offs**.

### Trade-off 1: Δεν έχει persistent disk
Η βάση SQLite χάνεται σε:
- Κάθε redeploy (όταν σπρώχνεις commit)
- Spontaneous restarts (πολύ σπάνια)

**Workaround**: για το pilot με 50 testers, αν δεν redeploy-άρεις, η βάση επιβιώνει μέρες. Αρκετό για 1 βδομάδα testing.

### Trade-off 2: Κοιμάται μετά από 15' αδράνειας
Πρώτο load μετά από κοίμηση = 30-60 δευτερόλεπτα.

**Workaround — keep-alive ping**: φτιάξε δωρεάν cron που χτυπάει το app κάθε 14 λεπτά:

1. Πήγαινε στο [cron-job.org](https://cron-job.org) (δωρεάν)
2. Δημιούργησε λογαριασμό → **Create cronjob**
3. URL: `https://το-domain-σου.onrender.com/api/config`
4. Schedule: every 14 minutes
5. Save

Έτσι το Render service **δεν κοιμάται ποτέ**. Δωρεάν.

### Setup
Έτοιμο — απλά push στο GitHub και New + → Blueprint στο Render. Το `render.yaml` είναι ήδη `plan: free`.

---

## 🥉 Επιλογή Γ: Fly.io

Αν ξέρεις Docker, Fly.io έχει trial και μετά πληρώνεις per usage. Δεν συνιστώ για ανεπίτηρητο deployment.

---

## 📧 Επικοινωνία πελάτη — δωρεάν

### Email (δωρεάν, συνιστώμενο)
**Gmail SMTP** δωρεάν για ~500 email/ημέρα:

1. Στο Gmail σου: ενεργοποίησε 2FA
2. [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → δημιούργησε App Password
3. Στο Render/Railway env vars:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=ο.email.σου@gmail.com
   SMTP_PASS=app-password-16-chars
   SMTP_FROM=Barberhub <ο.email.σου@gmail.com>
   ```

### SMS — Twilio Free Trial
**$15 δωρεάν credit ≈ 150 SMS** προς Ελλάδα. Αρκεί για 50 testers × 3 SMS = 150.

⚠️ **Trial limitation**: στέλνει μόνο σε **verified numbers**. Για το pilot πρέπει να verify-άρεις τα 50 νούμερα στο Twilio Console (5' δουλειά).

Μετά το $15:
- Αναβάθμιση Twilio: $0.05/SMS
- Ή πιο φθηνή ελληνική επιλογή: [yuboto.com](https://yuboto.com) ~€0.04/SMS, [routee.net](https://routee.net) similar

### Skip SMS εντελώς (πιο φθηνό)
Η εφαρμογή δουλεύει χωρίς SMS — απλά χρησιμοποιεί email + browser notifications στο admin. Για το pilot ενδεχομένως αρκετό:
- Πελάτης κάνει αίτημα → φτάνει email "Λάβαμε το αίτημα"
- Κουρέας εγκρίνει → email "Επιβεβαιώθηκε"
- Δεν στέλνεται υπενθύμιση 30' πριν (μόνο μέσω SMS)

Άσε κενά τα `TWILIO_*` και η εφαρμογή πάει σε test mode (τυπώνει στα logs αντί για αποστολή).

---

## 💰 Συνολικό κόστος για 50 testers / 1 μήνα

| Setup | Hosting | SMS | Email | Σύνολο |
|---|---|---|---|---|
| **Bare minimum (μόνο email)** | Render Free | — | Gmail | **$0** |
| **Recommended** | Railway free credit | Twilio trial | Gmail | **~$0** |
| **Bulletproof** | Railway $5+ | Twilio paid | Gmail | **~$5-15** |

---

## 🎯 Σύσταση για την Πέμπτη

**Railway + Gmail + Twilio trial** = $0 cost και όλα δουλεύουν σωστά.

Αν κολλήσεις με Railway, fallback **Render Free + cron-job.org keep-alive + Gmail-only**, και προσθέτεις SMS αργότερα.
