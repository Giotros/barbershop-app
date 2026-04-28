# 🎯 Use case: Passalis Barbershop — Πέμπτη test με 50 πελάτες

Πλήρης οδηγός για να δοκιμάσει ο φίλος σου την εφαρμογή με πραγματικούς πελάτες.

---

## 🔒 ΠΡΩΤΟΥ ΑΠ' ΟΛΑ — Security checklist

Πριν δώσεις την εφαρμογή σε **οποιονδήποτε πραγματικό πελάτη**, βεβαιώσου ότι:

```bash
# 1. Έχεις τρέξει npm install ξανά για τις νέες security dependencies:
npm install

# 2. Στο .env έχεις:
JWT_SECRET=<32+ τυχαίοι χαρακτήρες>
SUPER_ADMIN_PASSWORD=<δικός σου ισχυρός κωδικός>

# 3. Δημιούργησε το JWT_SECRET αν δεν έχεις:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. ΠΟΤΕ μην αφήσεις το ADMIN_PASSWORD=changeme
# Άλλαξε το ή αφαίρεσέ το.
```

⚠️ **Για 50 testers σε production απαραίτητο HTTPS** (cookies + JWT απαιτούν secure transport). Στο Render.com είναι auto-enabled.

---

## 📋 Τα βήματα μέχρι την Πέμπτη

### Βήμα 1 · Deploy σε real server (~30 λεπτά, μία φορά)

**Επιλογή Α — Render.com (συνιστώμενο, δωρεάν tier ή $7/μήνα)**

1. Φτιάξε λογαριασμό σε [github.com](https://github.com) και [render.com](https://render.com)
2. Στο GitHub: δημιούργησε private repo και ανέβασε τον φάκελο `barberhub-app`. Σημαντικό: το `.env` ΔΕΝ ανεβαίνει (βρίσκεται στο `.gitignore`).
3. Στο Render: **New +** → **Blueprint** → επίλεξε το repo σου → ανιχνεύει αυτόματα το `render.yaml`
4. Ρύθμισε τα Environment Variables στη σελίδα του service:
   - `JWT_SECRET`: 64-char random string (από `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `SUPER_ADMIN_PASSWORD`: δικός σου ισχυρός κωδικός
   - `PUBLIC_URL`: το URL που σου έδωσε το Render (π.χ. `https://barberhub-xxxx.onrender.com`)
   - `APP_NAME`: `Barberhub` (ή ό,τι θες)
   - `LOG_PII`: `false` (να μη φαίνονται τηλέφωνα στα logs)

**Επιλογή Β — Τρέξε στον δικό σου υπολογιστή με ngrok (γρήγορη δοκιμή χωρίς deploy)**

```bash
# Terminal 1: τρέξε τον server τοπικά
npm start

# Terminal 2: άνοιξε public tunnel μέσω ngrok (κατέβασε από ngrok.com)
ngrok http 3000
```
Παίρνεις δημόσιο URL τύπου `https://abc123.ngrok-free.app`. Δούλεψε με αυτό για demo αλλά **όχι για real use** (αργό, ο υπολογιστής σου πρέπει να είναι πάντα on).

---

### Βήμα 2 · SMS provider (~15 λεπτά)

Για να φτάνουν πραγματικά SMS:

**Twilio (πιο εύκολο, δωρεάν trial $15)**:
1. [twilio.com](https://twilio.com) → δημιουργία λογαριασμού (παίρνεις $15 δωρεάν)
2. Console → πάρε ένα **trial number** (μπορεί να είναι US — δουλεύει)
3. Κράτα: **Account SID**, **Auth Token**, **Phone number**
4. Στο Render Env Vars (ή στο τοπικό `.env`):
   ```
   TWILIO_ACCOUNT_SID=ACxxx
   TWILIO_AUTH_TOKEN=xxx
   TWILIO_FROM_NUMBER=+1xxx
   ```

**Free trial $15 = ~150 SMS** προς Ελλάδα. Αρκετά για 50 πελάτες (3 SMS/πελάτη).

---

### Βήμα 3 · Δημιουργία Passalis Barbershop (~2 λεπτά)

Δύο τρόποι:

**Τρόπος Α — Από το signup (ο κουρέας μόνος του)**:
1. Στείλε τον φίλο σου: `https://το-domain-σου/signup.html`
2. Συμπληρώνει: όνομα = "Passalis Barbershop", slug = "passalis", δικό του όνομα ως κουρέα, ισχυρός κωδικός (8+ χαρακτήρες)
3. Auto-login στο admin

**Τρόπος Β — Εσύ από το super-admin** (αν δεν θες να του δώσεις το /signup):
1. Login στο `/admin.html` με τον super admin κωδικό
2. Top-left ⌂ icon → "+ Νέο κατάστημα"
3. Συμπλήρωσε στοιχεία και πρόσθεσε τον Passalis ως πρώτο κουρέα
4. Στείλε στον φίλο σου: το URL `/admin.html?shop=passalis` και τον κωδικό που του όρισες (αυτός μπορεί να τον αλλάξει)

---

### Βήμα 4 · Setup του κινητού του κουρέα (~5 λεπτά μαζί του)

**Στο iPhone του**:
1. Ανοίγει Safari → πάει στο `https://το-domain-σου/admin.html?shop=passalis`
2. Συμπληρώνει τον κωδικό → **Σύνδεση**
3. Πάτα **Κοινοποίηση** ⤴ (κάτω-μέση) → **Προσθήκη στην οθόνη Αφετηρίας**
4. Όνομα: "Passalis" → Προσθήκη
5. Πλέον έχει εικονίδιο app στην αρχική του οθόνη
6. Όταν ζητηθεί **"Επιτρέπω ειδοποιήσεις"** → πατά Ναι

**Στο Android Chrome**: ίδιο, αλλά μέσα από μενού ⋮ → **"Εγκατάσταση εφαρμογής"**.

**Settings που του ρυθμίζεις μαζί**:
- 📅 **Πρόγραμμα → Ρυθμός**: πόσα λεπτά διαρκεί κάθε κούρεμά του (π.χ. 25')
- 📅 **Πρόγραμμα → Εβδομαδιαίο**: ωράρια ανά ημέρα + ρεπό
- 💶 **Ρυθμίσεις → Τιμοκατάλογος**: τιμές κάθε υπηρεσίας

---

### Βήμα 5 · QR code στο μαγαζί (~2 λεπτά)

1. Στο admin → Ρυθμίσεις → 📱 **QR code** → "Άνοιξε για εκτύπωση"
2. Πάτα 🖨 Εκτύπωση
3. Κόλλα το στον τοίχο/ταμείο/καθρέφτη

Επίσης θα έχει κουμπί **"Αντιγραφή URL"** που να βάλει στο Google Business Profile του (για το "Κάντε κράτηση" στο Google Maps).

---

### Βήμα 6 · Τι θα κάνουν οι 50 testers

**Τίποτα τεχνικό!** Απλά:
1. Σκανάρουν το QR με την κάμερα του κινητού τους
2. Διαλέγουν κουρέα → υπηρεσία → ώρα → στοιχεία τους → στέλνουν αίτημα
3. Παίρνουν SMS μόλις ο Passalis εγκρίνει (αν έχεις ρυθμίσει Twilio)

**Δεν χρειάζονται να εγκαταστήσουν τίποτα.**

---

## 🆘 Troubleshooting κατά το test

| Πρόβλημα | Λύση |
|---|---|
| Δεν φτάνουν SMS | Τσέκαρε Twilio dashboard για κωδικούς error. Συνηθέστερο: το trial number δεν στέλνει σε μη-verified αριθμούς πελατών. Verify κάθε αριθμό από Twilio Console ή upgrade. |
| Ο κουρέας δεν λαμβάνει notifications | Άνοιγμα Safari/Chrome settings στο κινητό → Επιτρέπω notifications. Επίσης η εφαρμογή πρέπει να είναι ανοιχτή ή σε background. Για **real push** όταν κλειστή, χρειάζεται Web Push (επόμενη version). |
| Φεύγει η σύνδεση | Cookies διαρκούν 7 μέρες. Αν φύγει, ξανα-login. |
| Slow load | Αν είσαι σε Render free tier, κοιμάται μετά από 15' αδράνειας. Πάρε το $7 plan για 50 testers. |

---

## 📊 Τι να παρακολουθήσεις στο testing

1. **Conversion rate**: από όσους σκανάρουν, πόσοι τελειώνουν booking
2. **Drop-off**: σε ποιο step φεύγουν (κουρέας/υπηρεσία/ώρα/στοιχεία)
3. **Approval time**: πόσο γρήγορα απαντά ο Passalis
4. **Cancellations**: πόσοι ζητάνε αλλαγή
5. **SMS deliverability**: πόσα φτάνουν

Για analytics μπορώ να σου προσθέσω βασικό dashboard (επόμενη iteration αν θες).

---

## 🚀 Τι ΔΕΝ είναι ακόμα έτοιμο για 50 testers

Είναι MVP, οπότε προσοχή:

- ❌ **Web push notifications** όταν κλειστό το κινητό (μόνο in-tab notifications)
- ❌ **GDPR consent banner** (εμφάνισε το είτε στη φόρμα είτε στο /signup)
- ❌ **Backup της βάσης** (η SQLite στο Render persistent disk)
- ❌ **Emails για κουρέα** όταν έρχεται αίτημα (μόνο στον πελάτη όταν εγκριθεί)
- ❌ **Analytics dashboard** (μπορώ να το προσθέσω αν θες)
- ❌ **2FA για admin login** (ίσως υπερβολικό για 50 testers)

---

## 💸 Τελικό κόστος για 50 testers / 1 μήνα

| Στοιχείο | Cost |
|---|---|
| Render.com Hobby plan | **$7** |
| Twilio trial credit | $15 free |
| Twilio (μετά το trial — ~150 SMS) | ~$8 |
| Domain (αν θες) | ~$1/μήνα |
| **Σύνολο για το πρώτο μήνα** | **~$8** (με trial credit) |
| **Σύνολο για επόμενους μήνες** | **~$16/μήνα** |

---

## 🎯 Quick start για την Πέμπτη

```
1. Σήμερα (~1 ώρα):
   ├─ Deploy σε Render.com
   ├─ Twilio account + φόρτωση credentials
   ├─ Test: σκάναρε QR από δικό σου τηλέφωνο
   │  και πέρνα όλο το flow να σιγουρευτείς

2. Πέμπτη πρωί (~15 λεπτά μαζί με τον Passalis):
   ├─ Setup admin στο κινητό του (PWA install)
   ├─ Ρύθμιση πρόγραμμα/τιμές μαζί
   ├─ Εκτύπωση QR
   └─ Δοκιμαστικό booking-approval-SMS μαζί

3. Πέμπτη απόγευμα — 50 testers:
   └─ Παρακολούθηση από admin σου, ζήτηση feedback
```

Καλή επιτυχία! 🚀
