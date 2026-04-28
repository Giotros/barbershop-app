#!/bin/bash
# Mac: διπλό-κλικ για να ξεκινήσει η εφαρμογή.
# Πάει στο φάκελο του script, βρίσκει την IP, ενημερώνει το PUBLIC_URL και ξεκινάει τον server.

cd "$(dirname "$0")"

# Έλεγχος για Node.js
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "❌ Δεν βρέθηκε το Node.js."
  echo "   Κατέβασέ το από: https://nodejs.org (LTS) και ξανατρέξε αυτό το script."
  echo ""
  read -p "Πάτα Enter για κλείσιμο..."
  exit 1
fi

# Πρώτη φορά: εγκατάσταση
if [ ! -d "node_modules" ]; then
  echo "📦 Εγκατάσταση εξαρτήσεων (μία φορά)..."
  npm install || { echo "❌ Αποτυχία εγκατάστασης"; read -p "Πάτα Enter..."; exit 1; }
fi

# Πρώτη φορά: αντιγραφή .env
if [ ! -f ".env" ]; then
  echo "📝 Δημιουργία .env από το πρότυπο..."
  cp .env.example .env
  echo "⚠️  Άνοιξε το .env και άλλαξε ADMIN_PASSWORD και SHOP_NAME!"
fi

# Auto-detect local IP για το PUBLIC_URL (Mac)
IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -z "$IP" ] && IP=$(ipconfig getifaddr en1 2>/dev/null)
[ -z "$IP" ] && IP="localhost"

PORT="${PORT:-3000}"
export PUBLIC_URL="http://${IP}:${PORT}"

echo ""
echo "✂️  Κουρείο app ξεκινάει..."
echo "   Local:    http://localhost:${PORT}"
echo "   Δίκτυο:   ${PUBLIC_URL}    ← βάλε αυτό σαν PUBLIC_URL αν θέλεις πελάτες στο WiFi"
echo "   Admin:    http://localhost:${PORT}/admin.html"
echo "   QR:       http://localhost:${PORT}/qr.html"
echo ""
echo "🛑 Για να σταματήσεις: πάτα Ctrl+C ή κλείσε αυτό το παράθυρο."
echo ""

npm start
