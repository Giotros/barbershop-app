// Αποστολή email μέσω SMTP (nodemailer). Test mode (console log) αν λείπουν credentials.
const SHOP_NAME = process.env.SHOP_NAME || 'Το Κουρείο';

let transporter = null;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || `${SHOP_NAME} <noreply@example.com>`;

if (host && user && pass) {
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
    });
    console.log('[email] SMTP enabled, αποστολή πραγματικών email.');
  } catch (e) {
    console.warn('[email] Αποτυχία φόρτωσης nodemailer:', e.message);
  }
} else {
  console.log('[email] SMTP δεν είναι ρυθμισμένο. Test mode: τα email θα τυπώνονται στην κονσόλα.');
}

async function sendEmail(to, subject, text, html) {
  if (!to) return { skipped: true, reason: 'no email' };
  if (!transporter) {
    console.log(`\n[EMAIL TEST MODE] -> ${to}\nΘέμα: ${subject}\n${text}\n`);
    return { mode: 'test', to };
  }
  const info = await transporter.sendMail({ from, to, subject, text, html });
  console.log(`[email] Στάλθηκε στο ${to} (id=${info.messageId})`);
  return { mode: 'smtp', to, id: info.messageId };
}

function formatDate(iso) {
  return iso.split('-').reverse().join('/');
}

function buildConfirmationEmail(appointment) {
  const d = formatDate(appointment.appointment_date);
  const subject = `Επιβεβαίωση ραντεβού - ${SHOP_NAME}`;
  const text = `Γεια σας ${appointment.customer_name},

Το ραντεβού σας στο ${SHOP_NAME} επιβεβαιώθηκε.

Ημερομηνία: ${d}
Ώρα: ${appointment.appointment_time}
Υπηρεσία: Κούρεμα

Θα λάβετε υπενθύμιση με SMS 30 λεπτά πριν το ραντεβού σας.

Σε περίπτωση που χρειαστεί να κάνετε αλλαγή, παρακαλούμε επικοινωνήστε μαζί μας.

Ευχαριστούμε,
${SHOP_NAME}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
      <h2 style="color:#b6864e; margin: 0 0 8px;">✂️ ${SHOP_NAME}</h2>
      <p>Γεια σας <strong>${appointment.customer_name}</strong>,</p>
      <p>Το ραντεβού σας <strong>επιβεβαιώθηκε</strong>.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:6px 12px; color:#666;">Ημερομηνία</td><td style="padding:6px 12px;"><strong>${d}</strong></td></tr>
        <tr><td style="padding:6px 12px; color:#666;">Ώρα</td><td style="padding:6px 12px;"><strong>${appointment.appointment_time}</strong></td></tr>
        <tr><td style="padding:6px 12px; color:#666;">Υπηρεσία</td><td style="padding:6px 12px;">Κούρεμα</td></tr>
      </table>
      <p>Θα λάβετε υπενθύμιση SMS 30 λεπτά πριν το ραντεβού.</p>
      <p style="color:#666; font-size: 13px;">Αν χρειαστεί αλλαγή, επικοινωνήστε μαζί μας.</p>
    </div>`;
  return { subject, text, html };
}

function buildUpdateEmail(appointment) {
  const d = formatDate(appointment.appointment_date);
  const subject = `Αλλαγή ραντεβού - ${SHOP_NAME}`;
  const text = `Γεια σας ${appointment.customer_name},

Το ραντεβού σας στο ${SHOP_NAME} άλλαξε.

Νέα ημερομηνία: ${d}
Νέα ώρα: ${appointment.appointment_time}

Ευχαριστούμε,
${SHOP_NAME}`;
  const html = `<div style="font-family: Arial, sans-serif;"><h3>${SHOP_NAME}</h3><p>Το ραντεβού σας άλλαξε σε <strong>${d} στις ${appointment.appointment_time}</strong>.</p></div>`;
  return { subject, text, html };
}

module.exports = { sendEmail, buildConfirmationEmail, buildUpdateEmail };
