# ✂️ Barberhub — Checklist & Costs

Multi-tenant marketplace για κουρεία με Fresha-style aesthetic.

---

## 💰 Κόστη/μήνα

| Στοιχείο | Δωρεάν | Παραγωγή |
|---|---|---|
| **Hosting** Render.com | $0 (sleeps after 15') | **$7/μήνα** always-on |
| **Domain** π.χ. `barberhub.gr` | δωρεάν `*.onrender.com` | **~€10/χρόνο** |
| **SMS** Twilio (US) | — | $1/μήνα νούμερο + **$0.05/SMS** |
| **SMS** Yuboto/Routee (GR) | — | **~€0.04/SMS**, χωρίς πάγιο |
| **Email** Gmail SMTP | δωρεάν έως ~500/μέρα | δωρεάν |
| **Database** SQLite | μέρος του Render disk | δωρεάν |

**Συνολικά:**
- 🪙 **Δοκιμή**: ~€1/μήνα (μόνο domain) — αν θες την εφαρμογή zero-cost τότε χωρίς custom domain
- 💼 **1 κουρείο, 150 SMS/μήνα**: **~$15/μήνα** (~€14)
- 🚀 **10 κουρεία, 1500 SMS/μήνα**: ~$80/μήνα

Δεν υπάρχουν per-booking χρεώσεις από εμένα — μόνο τα παραπάνω infrastructure costs.

---

## 🏗️ Architecture

```
barberhub.gr
   ├── /                              → Λίστα κουρείων (ή deep-link με ?shop=slug)
   ├── /?shop=medusa-barber           → Πάει κατευθείαν σε κουρείο
   ├── /signup.html                   → Self-service εγγραφή νέου κουρείου
   ├── /admin.html                    → Admin panel για όλα τα κουρεία
   └── /qr.html?shop=slug             → Εκτυπώσιμο QR για το συγκεκριμένο κουρείο
```

---

## ✨ Όλα τα features

**Πελάτης:**
- 🎨 Fresha-style booking flow (4 βήματα: shop → barber → service+time → στοιχεία)
- 🌈 Color-coded slots: 🟢 χαλαρή | 🟠 πιο γεμάτη | 🔴 κλειστή/full
- ℹ️ Σαφής εξήγηση: "πορτοκαλί = ίσως ±15' απόκλιση"
- 📝 Σημείωση για κουρέα (προαιρετικό)
- ✓ Αίτημα → ο κουρέας εγκρίνει
- 📲 PWA install + SMS confirmation + email επιβεβαίωσης

**Κουρέας:**
- 📱 Bottom-nav mobile dashboard (Σήμερα · Ραντεβού · Πρόγραμμα · Ρυθμίσεις)
- 🏠 **Today's hero**: αριθμός σημερινών, αιτημάτων, εσόδων
- 🔔 Auto-refresh + notifications + ήχος beep όταν έρχεται νέο αίτημα
- ⭐ **Customer history**: εμφανίζει "Ν-στή επίσκεψη · €σύνολο" δίπλα σε κάθε ραντεβού (ταυτοποίηση από τηλέφωνο)
- 📅 **3 τρόποι ορισμού προγράμματος**:
  1. **Συγκεκριμένη μέρα**: tap σε ώρα → bottom sheet → 0-5/ώρα ή κλειστή
  2. **Εβδομαδιαίο**: ωράριο ανά μέρα + ρεπό
  3. **Ρυθμός**: λεπτά/κούρεμα → αυτόματος υπολογισμός cuts/ώρα
- 📞 **WhatsApp / Viber / SMS / κλήση** deep-links με προ-γραμμένο μήνυμα
- 💶 **Τιμοκατάλογος** ανά υπηρεσία (για revenue tracking)
- 🌐 **Google Maps "Κάντε κράτηση"** integration (ο κουρέας προσθέτει το URL στο GBP του)

**Marketplace owner:**
- 🏬 Multi-shop, multi-barber αρχιτεκτονική
- 🚀 Self-service signup σε <60 δευτερόλεπτα
- 🎨 Top-notch UI με animations, haptic feedback, toasts

---

## ✅ Τι έκανα ήδη εγώ

- 📦 Όλα τα αρχεία της εφαρμογής
- 🗄️ Multi-tenant βάση + seed data
- 🔧 `npm install` εκτελεσμένο
- 📝 `.env` αρχείο
- 🚀 `start.command` (Mac διπλό-κλικ)
- 🐳 `Dockerfile` + `render.yaml` για deploy
- 🧪 Smoke tests επιτυχή

## 🟢 Τι κάνεις εσύ

### Άμεση δοκιμή (5 λεπτά)
1. Άλλαξε `ADMIN_PASSWORD` στο `.env`
2. Διπλό-κλικ στο `start.command` (ή `npm start`)
3. Άνοιξε `http://localhost:3000` και `/admin.html` (κωδικός = ό,τι έβαλες στο .env)

### Παραγωγή (~45 λεπτά)
1. **GitHub** + **Render.com** (deploy μέσω blueprint)
2. **Twilio** για SMS — βάλε credentials στο Render Env Vars
3. **Gmail SMTP** για email — βάλε App Password στο Render
4. Άνοιξε admin URL στο κινητό σου → **Add to Home Screen** (PWA)
5. Σύνδεση με **Google Business Profile** μέσω booking link
6. Κάθε νέο κουρείο μπαίνει στο `/signup.html` → εγγράφεται → παίρνει το URL του

### Onboarding νέου κουρείου (60 sec)
1. Στείλε στον κουρέα: `https://barberhub.gr/signup.html`
2. Συμπληρώνει: όνομα κουρείου, slug, όνομά του ως κουρέας, password
3. Παίρνει: booking URL, admin URL, QR code
4. Στο admin: ρυθμίζει ωράριο/ρυθμό/τιμές, προσθέτει άλλους κουρείς
5. Κολλάει το booking URL στο Google Business Profile του → εμφανίζεται "Κάντε κράτηση"

---

## 🆘 FAQ

**"Πώς αλλάζει ο κουρέας τις κλειστές ώρες ή το ρυθμό του;"**
Admin → 📅 Πρόγραμμα → 3 sub-tabs: Συγκεκριμένη μέρα / Εβδομαδιαίο / Ρυθμός. Για μια ώρα, tap πάνω της → bottom sheet → επίλεξε 0/1/2/3/4/5/default.

**"Πώς ξέρω αν ο πελάτης είναι παλιός;"**
Στο admin σε κάθε ραντεβού φαίνεται tag: "⭐ 5η επίσκεψη · €75" ή "🆕 νέος πελάτης". Στο edit sheet έχεις full ιστορικό.

**"Γίνεται η ώρα που δηλώνει ο πελάτης να είναι 100% κλειδωμένη;"**
Όχι. Είναι αίτημα. Αν είναι 🟢 πράσινη ώρα = πιθανότατα στην ώρα. Αν 🟠 πορτοκαλί = ±15-20' απόκλιση. 🔴 κόκκινη = δεν επιλέγεται.

**"Πώς συνδέεται με Google Maps?"**
Settings → 🌐 Google Maps · "Κάντε κράτηση" κουμπί → αντιγραφή URL → επικόλληση στο [business.google.com](https://business.google.com) ως "Σύνδεσμος για κρατήσεις". Σε 1-24 ώρες εμφανίζεται το κουμπί.

**"Reserve with Google" (instant booking μέσα στο Google);**
Όχι — απαιτεί enterprise partnership με Google. Αλλά το "Κάντε κράτηση" external link 100% γίνεται.

---

## 📲 Στο κινητό

**Κουρέας** (κάθε κουρείο):
- iPhone Safari: `/admin.html` → Κοινοποίηση ⤴ → Προσθήκη στην οθόνη Αφετηρίας
- Android Chrome: `/admin.html` → μενού ⋮ → Εγκατάσταση

**Πελάτης**: σκανάρει το QR ή πατάει "Κάντε κράτηση" στο Google Maps → ανοίγει η φόρμα.
