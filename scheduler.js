// Cron job που ελέγχει κάθε λεπτό αν υπάρχουν ραντεβού για υπενθύμιση SMS (30' πριν)
const cron = require('node-cron');
const db = require('./database');
const { sendSMS, buildReminderMessage } = require('./sms');

function getReminderWindowMinutesAhead() {
  // Στέλνουμε υπενθύμιση όταν το ραντεβού είναι μεταξύ 29 και 31 λεπτών μακριά
  return { min: 29, max: 31 };
}

function appointmentDateTime(a) {
  return new Date(`${a.appointment_date}T${a.appointment_time}:00`);
}

async function checkAndSendReminders() {
  const due = await db.findDueForReminder();
  if (!due.length) return;

  const now = new Date();
  const { min, max } = getReminderWindowMinutesAhead();

  for (const a of due) {
    const apptTime = appointmentDateTime(a);
    const diffMin = (apptTime - now) / 60000;
    if (diffMin >= min && diffMin <= max) {
      try {
        await sendSMS(a.customer_phone, buildReminderMessage(a));
        await db.markReminderSent(a.id);
      } catch (e) {
        console.error(`[scheduler] Αποτυχία υπενθύμισης για appt #${a.id}:`, e.message);
      }
    } else if (diffMin < -5) {
      await db.markReminderSent(a.id);
    }
  }
}

function start() {
  // Τρέξε κάθε λεπτό
  cron.schedule('* * * * *', () => {
    checkAndSendReminders().catch((e) => console.error('[scheduler]', e));
  });
  console.log('[scheduler] Ξεκίνησε. Έλεγχος για υπενθυμίσεις κάθε λεπτό.');
}

module.exports = { start, checkAndSendReminders };
