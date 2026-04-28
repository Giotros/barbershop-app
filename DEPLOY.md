# 🚀 Δωρεάν deploy — βήμα-βήμα

**Στόχος**: μηδενικό κόστος για το pilot με 50 testers.

---

## ΒΗΜΑ 1 · Push στο GitHub (~3 λεπτά)

### Στο Mac σου άνοιξε Terminal στον φάκελο:
```bash
cd "/Users/jorgievs/Library/Application Support/Claude/local-agent-mode-sessions/1a076c21-498e-4641-b406-a055a2c063d5/26487cba-79ab-4ef1-b3b4-9f83109f8903/local_76b78073-b46f-4bfc-8c4a-572289975da0/outputs/barbershop-app"
```

### Τρέξε το helper script:
```bash
./deploy.sh
```
Καθαρίζει τα πάντα, κάνει git init, παράγει JWT secret, κάνει initial commit.

### Φτιάξε νέο **private** repo στο [github.com/new](https://github.com/new):
- Name: `barberhub-app`
- Private ✅
- ΜΗΝ τσεκάρεις "Initialize with README"

### Push:
```bash
git remote add origin https://github.com/USERNAME/barberhub-app.git
git push -u origin main
```

✅ Στο GitHub.

---

## ΒΗΜΑ 2 · Διάλεξε hosting

Δες το `FREE_TIER.md` για σύγκριση. Βραχεία:

### 🥇 Συνιστώμενο: Railway (Persistent βάση, σχεδόν δωρεάν)

1. [railway.com](https://railway.com) → **Login with GitHub**
2. **+ New Project** → **Deploy from GitHub repo** → `barberhub-app`
3. Περίμενε build (~2 λεπτά)
4. **Settings → Variables** → πάτα **+ New Variable** για κάθε ένα:

   | Variable | Τιμή |
   |---|---|
   | `JWT_SECRET` | (αντίγραψε από `.env.production.example`) |
   | `SUPER_ADMIN_PASSWORD` | δικός σου ισχυρός κωδικός |
   | `NODE_ENV` | `production` |
   | `LOG_PII` | `false` |
   | `DB_PATH` | `/data/barbershop.db` |
   | `APP_NAME` | `Barberhub` |

5. **Settings → Networking → Generate Domain** → αντίγραψε το URL που σου δίνει
6. Πρόσθεσε νέα env var: `PUBLIC_URL` = το URL που πήρες
7. **Settings → Volumes → New Volume** → mount path `/data`, size 1GB → Save
8. Redeploy αυτόματα

✅ Ζωντανό! Άνοιξε το URL.

**Cost realistic**: ~$3-5/μήνα από το $5 free credit = **$0** out of pocket.

### 🥈 Εναλλακτικά: Render Free (100% δωρεάν)

⚠️ Βάση χάνεται σε redeploy. Acceptable για 1 βδομάδα testing αν δεν κάνεις push συχνά.

1. [render.com](https://render.com) (ήδη συνδεδεμένο GitHub σου)
2. **New +** → **Blueprint** → επίλεξε `barberhub-app`
3. Ανιχνεύει αυτόματα το `render.yaml` (plan: free)
4. **Apply** — συμπλήρωσε:
   - `SUPER_ADMIN_PASSWORD` = δικός σου κωδικός
   - Άσε κενά τα Twilio/SMTP
5. Περίμενε 2-3 λεπτά για build
6. Όταν ολοκληρωθεί → πήγαινε στο **Environment** → πρόσθεσε `PUBLIC_URL` με το URL που σου έδωσε

⚠️ **Workaround για το "κοιμάται"**: στο [cron-job.org](https://cron-job.org) δημιούργησε ping κάθε 14' στο `https://το-app-σου.onrender.com/api/config`. Δωρεάν.

⚠️ **Σημείωση για βάση**: στο Render free, η βάση είναι ephemeral. Αλλάξε `DB_PATH` σε `./barbershop.db` (όχι /data) γιατί δεν έχει disk.

---

## ΒΗΜΑ 3 · Email αντί για SMS (δωρεάν)

Gmail SMTP δωρεάν για ~500 email/ημέρα:

1. Ενεργοποίησε **2FA** στο Gmail account σου
2. Πήγαινε [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Δημιούργησε App Password (16 χαρακτήρες)
4. Στο Railway/Render Variables πρόσθεσε:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=ο.email.σου@gmail.com
   SMTP_PASS=app-password-που-πήρες
   SMTP_FROM=Barberhub <ο.email.σου@gmail.com>
   ```

Από εδώ και πέρα ο πελάτης λαμβάνει **email επιβεβαίωσης** όταν εγκρίνει ο κουρέας.

---

## ΒΗΜΑ 4 · SMS — Twilio Free Trial (προαιρετικό)

**$15 δωρεάν = ~150 SMS**, αρκετό για 50 testers.

1. [twilio.com](https://twilio.com) → δωρεάν λογαριασμός (παίρνεις $15)
2. **Get a Twilio phone number** (US number λειτουργεί μια χαρά για Ελλάδα)
3. Από Console αντίγραψε: Account SID, Auth Token, Phone
4. Στα env vars:
   ```
   TWILIO_ACCOUNT_SID=ACxxx
   TWILIO_AUTH_TOKEN=xxx
   TWILIO_FROM_NUMBER=+1xxx
   ```

⚠️ **Trial limitation**: στέλνει SMS μόνο σε **verified numbers**. Για το pilot **verify-άρεις** τα νούμερα των testers στο Twilio Console (Phone Numbers → Verified Caller IDs). Είναι 1 click + κωδικός που στέλνει στο τηλέφωνο.

**Αν θες να αποφύγεις την επαλήθευση**, παράκαμψέ το: μην ορίσεις TWILIO_* καθόλου, και χρησιμοποίησε μόνο email. Το app το υποστηρίζει.

---

## ΒΗΜΑ 5 · Δημιουργία Passalis Barbershop

Άνοιξε:
```
https://το-app-σου.railway.app/signup.html
```
Συμπληρώνετε στοιχεία και είστε έτοιμοι.

---

## 🆘 Quick troubleshooting

| Πρόβλημα | Λύση |
|---|---|
| `git push` ζητάει password | GitHub απαιτεί [Personal Access Token](https://github.com/settings/tokens). Τσέκαρε `repo` permissions |
| Railway "build failed" | Logs → πιθανό ότι τρέχει `npm install` χωρίς αρκετή μνήμη. Reduce concurrency: στο `package.json` πρόσθεσε `"engines": {"npm": ">=8"}` |
| Render: 502 Bad Gateway | Πρώτο deploy ή κοιμάται. Περίμενε 30s για cold start |
| Δεν φτάνει email | Check Gmail App Password (όχι το κανονικό σου). Tσέκαρε spam |
| SMS δεν φτάνει | Trial Twilio: verify το νούμερο πρώτα. Logs στο Twilio Console |

---

## ✅ Τι έχεις τώρα

- Public URL με HTTPS αυτόματα
- Persistent βάση (Railway) ή ephemeral (Render free)
- Email επιβεβαίωσης δωρεάν
- SMS optional ($15 trial αρκεί)
- Ενημερώσεις = `git push` και κάνει auto-redeploy
