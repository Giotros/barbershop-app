#!/bin/bash
# Καθαρίζει άχρηστα αρχεία. Τρέξε στο Mac σου.
cd "$(dirname "$0")"
set -e

echo "🧹 Καθαρίζω άχρηστα αρχεία..."

# Πολλαπλά docs που πλέον δεν χρειάζονται (τα κρίσιμα έχουν περάσει στο README)
rm -f CHECKLIST.md USE_CASE.md FREE_TIER.md DEPLOY.md POSTGRES_SETUP.md
echo "  ✓ Διπλά docs"

# Dev scripts που δεν χρειάζονται πλέον σε production
rm -f start.command deploy.sh
echo "  ✓ Local dev scripts"

# Render.yaml — χρησιμοποιείς Railway
rm -f render.yaml
echo "  ✓ render.yaml"

# Διπλό env example
rm -f .env.example
echo "  ✓ .env.example (κρατάω το .production.example)"

# signup.html — αντικαταστάθηκε από pricing flow
rm -f public/signup.html
echo "  ✓ public/signup.html"

# Local SQLite database
rm -f barbershop.db barbershop.db-* 2>/dev/null
echo "  ✓ Local SQLite"

echo ""
echo "✅ Έτοιμο. Έμειναν:"
echo ""
ls -1 | grep -v node_modules
echo ""
echo "public/:"
ls -1 public/

echo ""
echo "Push στο Railway:"
echo "  git add -A && git commit -m 'Cleanup: remove unused docs/scripts' && git push"
