# 🐘 Postgres setup στο Railway

Πλέον η εφαρμογή υποστηρίζει **Postgres** για production και **SQLite** για local development. Auto-detection με βάση την ύπαρξη του `DATABASE_URL`.

---

## 🚀 Setup σε Railway (~3 λεπτά)

### Βήμα 1: Πρόσθεσε Postgres database

1. Στο Railway project σου, πάτα **+ Create** → **Database** → **Add PostgreSQL**
2. Περίμενε ~30 δευτερόλεπτα να ξεκινήσει

✅ Έτοιμο — η Postgres τρέχει.

### Βήμα 2: Σύνδεσε το service με τη βάση

Το Railway δίνει αυτόματα το `DATABASE_URL` ως env var σε όλα τα services του project:

1. Στο service `barbershop-app` → **Variables** → **+ New Variable**
2. **Variable name**: `DATABASE_URL`
3. **Value**: πάτα το **+ Reference** στα δεξιά → επίλεξε `Postgres.DATABASE_URL`

Αυτό θα δώσει στο service το connection string της βάσης αυτόματα.

### Βήμα 3: Διαγραψέ το παλιό `DB_PATH` (πλέον δεν χρειάζεται)

Στις Variables αν έχεις `DB_PATH=...` → διαγραψέ το ή άσε το (αγνοείται όταν υπάρχει `DATABASE_URL`).

### Βήμα 4: Push τον κώδικα

Στο Mac:
```bash
cd /path/to/barbershop-app
git add -A
git commit -m "Add Postgres support with async db layer"
git push
```

Το Railway θα κάνει redeploy αυτόματα.

### Βήμα 5: Verify

Άνοιξε το URL — αν φορτώνει η εφαρμογή, **είσαι σε Postgres**! Στα Deploy Logs θα δεις:
```
[db] Using PostgreSQL
```

(Αντί για `[db] Using SQLite`.)

---

## ✅ Όφελος

| Πριν (SQLite ephemeral) | Μετά (Postgres) |
|---|---|
| Βάση χάνεται σε redeploy | Persistent, σταθερή |
| Single-instance | Πολλαπλά instances OK |
| Locking issues σε concurrent writes | Καμιά απώλεια |
| Δεν δουλεύει σε Render Free | Δουλεύει σε όλες τις πλατφόρμες |

---

## 💾 Migration από SQLite → Postgres (αν είχες δεδομένα)

Αν είχες ήδη ραντεβού/shops στο SQLite που θέλεις να μεταφέρεις:

### Επιλογή Α: Χειροκίνητα (αν έχεις λίγα δεδομένα)
Καταχώρησέ τα ξανά μέσω creator dashboard. Συνιστάται για το pilot.

### Επιλογή Β: Auto-migrate (αν έχεις πολλά)
1. Στο Mac σου, εξαγωγή δεδομένων:
   ```bash
   sqlite3 barbershop.db ".dump" > backup.sql
   ```
2. Καθαρισμός για Postgres:
   - Αντικατάσταση `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
   - Αφαίρεση `PRAGMA` lines
   - Booleans 0/1 → false/true
3. Σύνδεση στο Railway Postgres:
   ```bash
   psql "$DATABASE_URL" < backup.sql
   ```

(Πες μου αν χρειαστείς, σου γράφω script.)

---

## 🏠 Local development (χωρίς Postgres)

Για να συνεχίσεις να δουλεύεις τοπικά:

```bash
# Άσε κενό το DATABASE_URL — fallback σε SQLite
unset DATABASE_URL  # ή σβησέ το από .env
npm start
```

Θα δεις: `[db] Using SQLite`. Τα δεδομένα μένουν σε `./barbershop.db`.

---

## 🆓 Δωρεάν Postgres alternatives (εκτός Railway)

Αν θες Postgres χωρίς Railway:

### Neon.tech (συνιστώμενο)
- **3GB δωρεάν** στο free tier
- Serverless: αυτόματο sleep + wake
- 1. [neon.tech](https://neon.tech) → Sign up
- 2. Create project → αντίγραψε το connection string
- 3. Στα Railway Variables: `DATABASE_URL=postgresql://...`

### Supabase
- **500MB δωρεάν** + auth + storage
- 1. [supabase.com](https://supabase.com) → New Project
- 2. **Settings → Database** → Connection string
- 3. Copy → paste στο Railway

---

## 💰 Κόστος

| Στοιχείο | Cost |
|---|---|
| Railway Hobby plan + Postgres | $5 free credit + ~$5/μήνα Postgres |
| Railway + Neon Postgres (free) | **$5/μήνα** total (Hobby) |
| Render Starter + Render Postgres | $7 + $7 = $14/μήνα |

**Συνιστώμενο για production**: Railway Hobby + Neon free Postgres = ~$5/μήνα.

---

## 🆘 Troubleshooting

**"connection refused" / "ECONNREFUSED"**
- Έλεγξε ότι το `DATABASE_URL` είναι σωστά set
- Στο Railway, βεβαιώσου ότι το Reference δείχνει στο Postgres service

**"SSL required"**
- Το Neon/Supabase απαιτεί SSL. Το app το χειρίζεται αυτόματα (`ssl: { rejectUnauthorized: false }`)

**Στα logs βλέπεις "Using SQLite" ενώ θες Postgres**
- Σημαίνει ότι το `DATABASE_URL` δεν παίρνεται. Έλεγξε spelling στις Variables.

**Θέλω να επιστρέψω σε SQLite**
- Διαγραψέ το `DATABASE_URL` από Variables. Auto-redeploy. Πίσω σε ephemeral SQLite.
