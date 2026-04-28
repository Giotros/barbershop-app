#!/bin/bash
# Barberhub deployment helper
# Τρέξε αυτό από το Terminal μέσα στον φάκελο barbershop-app

set -e
cd "$(dirname "$0")"

echo ""
echo "🚀 Barberhub deployment helper"
echo "================================"
echo ""

# Καθάρισε τυχόν παλιό half-init git
if [ -d .git ] && [ ! -f .git/HEAD ]; then
  echo "Καθαρίζω παλιό git state..."
  rm -rf .git
fi

# Καθάρισε τοπικά αρχεία που δεν πρέπει να ανέβουν
rm -f .DS_Store barbershop.db barbershop.db-* 2>/dev/null || true

# Generate JWT secret αν δεν υπάρχει
if ! grep -q "^JWT_SECRET=.\+" .env 2>/dev/null; then
  if command -v node >/dev/null 2>&1; then
    JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  else
    JWT=$(openssl rand -hex 32)
  fi
  echo "✓ Νέο JWT_SECRET δημιουργήθηκε"
  if [ -f .env ]; then
    # Ενημέρωσε ή πρόσθεσε
    if grep -q "^JWT_SECRET=" .env; then
      sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env && rm .env.bak
    else
      echo "JWT_SECRET=$JWT" >> .env
    fi
  fi
  JWT_TO_SHOW="$JWT"
fi

# Init git
if [ ! -d .git ]; then
  git init -b main >/dev/null 2>&1 || git init >/dev/null
  git config user.email "${GIT_EMAIL:-you@example.com}" 2>/dev/null
  git config user.name "${GIT_NAME:-Barberhub Owner}" 2>/dev/null
  echo "✓ Git repo initialized"
fi

# Initial commit
if ! git log -1 >/dev/null 2>&1; then
  git add -A
  git commit -m "Initial Barberhub app" >/dev/null
  echo "✓ Initial commit"
else
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "Update" >/dev/null
    echo "✓ Νέο commit με τις αλλαγές"
  else
    echo "✓ Καθαρό repo, τίποτα νέο για commit"
  fi
fi

echo ""
echo "================================"
echo "✅ Έτοιμο για ανέβασμα στο GitHub!"
echo ""

if [ -n "$JWT_TO_SHOW" ]; then
  echo "🔐 JWT_SECRET (αντίγραψέ το για το Render):"
  echo "   $JWT_TO_SHOW"
  echo ""
fi

# Έλεγξε αν υπάρχει remote
if git remote get-url origin >/dev/null 2>&1; then
  REMOTE=$(git remote get-url origin)
  echo "✓ GitHub remote: $REMOTE"
  echo ""
  echo "Τώρα τρέξε: git push -u origin main"
else
  echo "📋 Επόμενα βήματα:"
  echo ""
  echo "1) Πήγαινε στο github.com/new και φτιάξε νέο PRIVATE repo"
  echo "   Όνομα: barberhub-app (ή ό,τι θες)"
  echo "   ΜΗΝ τσεκάρεις 'Initialize with README'"
  echo ""
  echo "2) Αντίγραψε το URL που σου δίνει το GitHub (https://github.com/USER/barberhub-app.git)"
  echo ""
  echo "3) Τρέξε αυτές τις 2 γραμμές (αντικατέστησε με δικό σου URL):"
  echo ""
  echo "   git remote add origin https://github.com/USER/barberhub-app.git"
  echo "   git push -u origin main"
  echo ""
  echo "4) Στο Render: New + → Blueprint → επίλεξε το repo"
  echo ""
fi
