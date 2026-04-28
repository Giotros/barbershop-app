// Αποστολή SMS μέσω Twilio (ή απλό console log αν λείπουν credentials)
const SHOP_NAME = process.env.SHOP_NAME || 'Το Κουρείο';

let twilioClient = null;
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

if (sid && token && fromNumber) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(sid, token);
    console.log('[sms] Twilio enabled, αποστολή πραγματικών SMS.');
  } catch (e) {
    console.warn('[sms] Δεν φορτώθηκε το twilio:', e.message);
  }
} else {
  console.log('[sms] Twilio δεν είναι ρυθμισμένο. Test mode: τα SMS θα τυπώνονται στην κονσόλα.');
}

function normalizePhone(phone) {
  // Βασική κανονικοποίηση: αφαίρεση κενών, παύλες
  let p = String(phone || '').replace(/[\s\-()]/g, '');
  // Ελληνικός αριθμός χωρίς πρόθεμα → πρόσθεσε +30
  if (/^69\d{8}$/.test(p)) p = '+30' + p;
  if (/^\+/.test(p)) return p;
  if (/^00/.test(p)) return '+' + p.slice(2);
  return p;
}

function maskPhone(p) {
  const s = String(p || '');
  if (s.length < 6) return '***';
  return s.slice(0, 3) + '***' + s.slice(-3);
}

async function sendSMS(phone, message) {
  const to = normalizePhone(phone);
  const LOG_PII = String(process.env.LOG_PII || 'true') === 'true';
  if (!twilioClient) {
    if (LOG_PII) console.log(`\n[SMS TEST MODE] -> ${to}\n${message}\n`);
    else console.log(`[SMS TEST MODE] -> ${maskPhone(to)} (${message.length} chars)`);
    return { mode: 'test', to, body: message };
  }
  try {
    const result = await twilioClient.messages.create({
      from: fromNumber,
      to,
      body: message,
    });
    console.log(`[sms] Στάλθηκε στο ${maskPhone(to)} (sid=${result.sid})`);
    return { mode: 'twilio', to, sid: result.sid };
  } catch (e) {
    console.error(`[sms] Σφάλμα αποστολής στο ${maskPhone(to)}:`, e.message);
    throw e;
  }
}

function buildReminderMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `Γεια σας ${appointment.customer_name}! Υπενθύμιση: το ραντεβού σας στο ${SHOP_NAME} είναι σε 30 λεπτά (${d} στις ${appointment.appointment_time}). Σας περιμένουμε!`;
}

function buildRequestReceivedMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `${SHOP_NAME}: Το αίτημα ραντεβού για ${d} στις ${appointment.appointment_time} καταχωρήθηκε. Θα λάβετε επιβεβαίωση σύντομα.`;
}

function buildConfirmationMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `Το ραντεβού σας στο ${SHOP_NAME} επιβεβαιώθηκε για ${d} στις ${appointment.appointment_time}. Ευχαριστούμε ${appointment.customer_name}!`;
}

function buildDeclineMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `${SHOP_NAME}: Δυστυχώς η ώρα ${appointment.appointment_time} στις ${d} δεν είναι διαθέσιμη. Παρακαλούμε επιλέξτε άλλη ώρα.`;
}

function buildUpdateMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `Το ραντεβού σας στο ${SHOP_NAME} άλλαξε. Νέα ημ/νία: ${d} στις ${appointment.appointment_time}.`;
}

function buildCancelMessage(appointment) {
  const d = appointment.appointment_date.split('-').reverse().join('/');
  return `Το ραντεβού σας στο ${SHOP_NAME} (${d} στις ${appointment.appointment_time}) ακυρώθηκε.`;
}

module.exports = {
  sendSMS,
  buildReminderMessage,
  buildRequestReceivedMessage,
  buildConfirmationMessage,
  buildDeclineMessage,
  buildUpdateMessage,
  buildCancelMessage,
};
