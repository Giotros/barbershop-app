// Multi-tenant barbershop server
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const db = require('./database');
const scheduler = require('./scheduler');
const auth = require('./auth');
const {
  sendSMS,
  buildRequestReceivedMessage,
  buildConfirmationMessage,
  buildDeclineMessage,
  buildUpdateMessage,
  buildCancelMessage,
} = require('./sms');
const { sendEmail, buildConfirmationEmail, buildUpdateEmail } = require('./email');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
// DEPRECATED: παλιό global admin password. Το νέο σύστημα χρησιμοποιεί per-shop auth.
const LEGACY_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const APP_NAME = process.env.APP_NAME || 'Barberhub';
const PROD = process.env.NODE_ENV === 'production';
const CORS_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.set('trust proxy', 1); // για να δουλέψει σωστά rate limit + secure cookies πίσω από proxy

const HAIRCUT_TYPES = [
  { id: 'classic',  label: 'Κλασικό κούρεμα',     minutes: 30 },
  { id: 'scissors', label: 'Κούρεμα ψαλίδι',      minutes: 45 },
  { id: 'fade',     label: 'Fade / Skin fade',    minutes: 45 },
  { id: 'beard',    label: 'Κούρεμα + γενειάδα',  minutes: 45 },
  { id: 'design',   label: 'Σχέδιο',              minutes: 45 },
  { id: 'kids',     label: 'Παιδικό',             minutes: 20 },
];

const SLOT_MINUTES = 30; // υποδιαίρεση εμφάνισης (το capacity είναι ανά ώρα)

// ============ SECURITY MIDDLEWARE ============
// Helmet: security headers (XSS protection, clickjacking, etc)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://maps.googleapis.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS: επιτρέπει μόνο τα origins που έχουν δηλωθεί
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && (CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Admin-Password');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: PROD ? '1d' : 0,
}));

// Rate limit για το login endpoint (anti brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 λεπτά
  max: 8, // 8 attempts ανά IP ανά 15 λεπτά
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Πάρα πολλές προσπάθειες. Περίμενε 15 λεπτά.' },
});

// Rate limit για signup (anti spam)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ώρα
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Πάρα πολλές εγγραφές. Δοκίμασε αργότερα.' },
});

// Rate limit για τα booking requests από πελάτες
const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5, // 5 αιτήματα ανά 10 λεπτά / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Πάρα πολλά αιτήματα από αυτή τη συσκευή.' },
});

// Sanitization: αφαιρεί επικίνδυνα chars για XSS
function sanitizeStr(s, maxLen = 200) {
  if (s == null) return '';
  return String(s).slice(0, maxLen).replace(/[<>]/g, '').trim();
}
function sanitizePhone(p) {
  if (p == null) return '';
  return String(p).slice(0, 20).replace(/[^\d+\-()\s]/g, '').trim();
}
function sanitizeEmail(e) {
  if (e == null) return '';
  return String(e).slice(0, 100).replace(/[^a-zA-Z0-9.@_+\-]/g, '').trim();
}
function sanitizeSlug(s) {
  if (s == null) return '';
  return String(s).slice(0, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ---------- helpers ----------
function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function isValidTime(s) { return /^\d{2}:\d{2}$/.test(s); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function isPastDate(d) { return d < todayISO(); }

function generateHalfSlots(openHour, closeHour) {
  const slots = [];
  for (let h = openHour; h < closeHour; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  return slots;
}

function defaultCapFromBarber(barber) {
  // Αν έχει default_capacity, κράτα το. Αλλιώς: από avg_minutes υπολογίζω 60/avg
  if (barber.default_capacity && barber.default_capacity > 0) return barber.default_capacity;
  if (barber.avg_minutes && barber.avg_minutes > 0) return Math.max(1, Math.round(60 / barber.avg_minutes));
  return 2;
}

function getWeekly(barber, date) {
  // Επιστρέφει { open, close, blocked, shifts? } για τη μέρα της εβδομάδας.
  // shifts = προαιρετικός πίνακας [{open, close}] για σπαστό ωράριο
  // (π.χ. Τρ 9-14 και 17-21 = [{open:9,close:14},{open:17,close:21}]).
  if (!barber.weekly_schedule) return null;
  try {
    const arr = JSON.parse(barber.weekly_schedule);
    const dow = new Date(date).getDay();
    return arr[dow] || null;
  } catch (_) { return null; }
}

function getShiftsForDay(barber, date, dayOv) {
  // Priority: dayOv > weekly.shifts > weekly.open/close > barber default
  if (dayOv && dayOv.blocked) return [];
  if (dayOv && dayOv.open_hour != null && dayOv.close_hour != null) {
    return [{ open: dayOv.open_hour, close: dayOv.close_hour }];
  }
  const weekly = getWeekly(barber, date);
  if (weekly) {
    if (weekly.blocked) return [];
    if (Array.isArray(weekly.shifts) && weekly.shifts.length) {
      return weekly.shifts.filter(s => s && s.open != null && s.close != null);
    }
    if (weekly.open != null && weekly.close != null) {
      return [{ open: weekly.open, close: weekly.close }];
    }
  }
  return [{ open: barber.open_hour, close: barber.close_hour }];
}

function effectiveCapacityForHour({ barber, dayOv, hourOv }) {
  if (hourOv && hourOv.blocked) return { capacity: 0, blocked: true };
  if (dayOv && dayOv.blocked) return { capacity: 0, blocked: true };
  const cap = (hourOv && hourOv.capacity != null) ? hourOv.capacity
            : (dayOv && dayOv.capacity != null) ? dayOv.capacity
            : defaultCapFromBarber(barber);
  return { capacity: cap, blocked: false };
}

function effectiveOpenClose({ barber, dayOv, weekly }) {
  // Priority: dayOv > weekly > barber default
  if (weekly && weekly.blocked) return { open: 0, close: 0, blocked: true };
  return {
    open: (dayOv && dayOv.open_hour != null) ? dayOv.open_hour
        : (weekly && weekly.open != null) ? weekly.open
        : barber.open_hour,
    close: (dayOv && dayOv.close_hour != null) ? dayOv.close_hour
         : (weekly && weekly.close != null) ? weekly.close
         : barber.close_hour,
    blocked: false,
  };
}

function demandColorFromUtilization(confirmed, capacity, blocked, isPast) {
  if (isPast) return 'past';
  if (blocked || capacity <= 0) return 'red';
  if (confirmed >= capacity) return 'red';
  // user spec: 1-2/hr → green, 2-4/hr → orange
  if (confirmed <= 1) return 'green';
  if (confirmed <= 3) return 'orange';
  return 'orange';
}

// ---------- public config ----------
app.get('/api/config', (req, res) => {
  res.json({ appName: APP_NAME, haircutTypes: HAIRCUT_TYPES, slotMinutes: SLOT_MINUTES });
});

// ---------- shops ----------
app.get('/api/shops', (req, res) => {
  res.json(db.listShops());
});

app.get('/api/shops/:slug', (req, res) => {
  const shop = db.getShopBySlug(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  const barbers = db.listBarbersByShopSlug(req.params.slug).map(b => ({
    ...b,
    default_capacity: defaultCapFromBarber(b),
    avg_minutes: b.avg_minutes || 30,
  }));
  const prices = db.listShopPrices(shop.id);
  res.json({ shop, barbers, prices });
});

// ---------- barber availability (per-hour color coding) ----------
app.get('/api/shops/:shopSlug/barbers/:barberSlug/availability', (req, res) => {
  const { shopSlug, barberSlug } = req.params;
  const { date } = req.query;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Μη έγκυρη ημερομηνία' });
  const barber = db.getBarberBySlug(shopSlug, barberSlug);
  if (!barber) return res.status(404).json({ error: 'Δεν βρέθηκε ο κουρέας.' });

  const dayOv = db.getDayOverride(barber.id, date);
  const hourOvList = db.listHourOverrides(barber.id, date);
  const hourOvMap = {};
  for (const h of hourOvList) hourOvMap[String(h.hour).padStart(2,'0')] = h;

  const shifts = getShiftsForDay(barber, date, dayOv);
  if (!shifts.length) return res.json({ date, barber: { id: barber.id, slug: barber.slug, name: barber.name }, slots: [], blockedDay: true, reason: 'Ρεπό' });
  // Generate slots για κάθε shift, και combine
  const slots = [];
  for (const shift of shifts) slots.push(...generateHalfSlots(shift.open, shift.close));

  const confirmedByHour = db.countConfirmedByHour(barber.id, date);
  const pendingByHour = db.countPendingByHour(barber.id, date);
  const isToday = date === todayISO();
  const nowHHMM = new Date().toTimeString().slice(0, 5);

  const result = slots.map((time) => {
    const hh = time.slice(0, 2);
    const { capacity, blocked } = effectiveCapacityForHour({ barber, dayOv, hourOv: hourOvMap[hh] });
    const confirmed = confirmedByHour[hh] || 0;
    const pending = pendingByHour[hh] || 0;
    const past = isPastDate(date) || (isToday && time <= nowHHMM);
    const color = demandColorFromUtilization(confirmed, capacity, blocked, past);
    const available = !past && !blocked && confirmed < capacity;
    return { time, hour: hh, capacity, confirmed, pending, blocked: !!blocked, past, available, color };
  });

  res.json({
    date,
    barber: {
      id: barber.id, slug: barber.slug, name: barber.name,
      default_capacity: defaultCapFromBarber(barber),
      avg_minutes: barber.avg_minutes,
    },
    overrides: { day: dayOv || null },
    slots: result,
  });
});

// ---------- create appointment request ----------
app.post('/api/shops/:shopSlug/barbers/:barberSlug/appointments', bookingLimiter, (req, res) => {
  const { shopSlug, barberSlug } = req.params;
  const barber = db.getBarberBySlug(shopSlug, barberSlug);
  if (!barber) return res.status(404).json({ error: 'Δεν βρέθηκε ο κουρέας.' });

  // Sanitization: αφαίρεση επικίνδυνων chars + length limit
  const name = sanitizeStr(req.body?.name, 100);
  const phone = sanitizePhone(req.body?.phone);
  const email = sanitizeEmail(req.body?.email);
  const haircutType = sanitizeStr(req.body?.haircutType, 30);
  const date = sanitizeStr(req.body?.date, 10);
  const time = sanitizeStr(req.body?.time, 5);
  const notes = sanitizeStr(req.body?.notes, 200);

  if (!name || !phone || !isValidDate(date) || !isValidTime(time)) {
    return res.status(400).json({ error: 'Συμπλήρωσε όνομα, τηλέφωνο, ημερομηνία και ώρα.' });
  }
  // Phone validation: τουλάχιστον 6 digits
  if (phone.replace(/\D/g, '').length < 6) {
    return res.status(400).json({ error: 'Μη έγκυρο τηλέφωνο.' });
  }
  if (isPastDate(date)) return res.status(400).json({ error: 'Επίλεξε μελλοντική ημερομηνία.' });
  if (haircutType && !HAIRCUT_TYPES.some((h) => h.id === haircutType)) {
    return res.status(400).json({ error: 'Μη έγκυρος τύπος κουρέματος.' });
  }

  // Έλεγχος capacity για την ώρα (θα το ξαναελέγξει ο κουρέας στην έγκριση)
  const dayOv = db.getDayOverride(barber.id, date);
  const hourOvList = db.listHourOverrides(barber.id, date);
  const hourOvMap = {};
  for (const h of hourOvList) hourOvMap[String(h.hour).padStart(2,'0')] = h;
  const hh = time.slice(0,2);
  const { capacity, blocked } = effectiveCapacityForHour({ barber, dayOv, hourOv: hourOvMap[hh] });
  if (blocked) return res.status(409).json({ error: 'Αυτή η ώρα είναι κλειστή.' });
  const confirmed = (db.countConfirmedByHour(barber.id, date)[hh] || 0);
  if (confirmed >= capacity) return res.status(409).json({ error: 'Δεν υπάρχει διαθεσιμότητα στη συγκεκριμένη ώρα.' });

  const appt = db.createAppointmentRequest({
    barber_id: barber.id,
    customer_name: name, customer_phone: phone, customer_email: email,
    haircut_type: haircutType,
    appointment_date: date, appointment_time: time,
    notes,
  });
  // Ενημέρωση πελάτη ότι λάβαμε αίτημα
  sendSMS(appt.customer_phone, buildRequestReceivedMessage({ ...appt, _shop: barber.name })).catch(() => {});
  res.json({ ok: true, appointment: appt });
});

// ============ AUTH ============
// Δύο επίπεδα auth:
//   1) Super-admin (marketplace owner): πρόσβαση σε όλα τα shops
//   2) Shop-admin (κουρέας/owner): πρόσβαση μόνο στο δικό του shop
// Token = JWT σε httpOnly cookie ή Authorization header.

function getToken(req) {
  if (req.cookies?.bh_session) return req.cookies.bh_session;
  const authH = req.get('Authorization') || '';
  if (authH.startsWith('Bearer ')) return authH.slice(7);
  return null;
}

function setSession(res, payload) {
  const token = auth.signToken(payload);
  res.cookie('bh_session', token, {
    httpOnly: true,
    secure: PROD, // HTTPS only σε production
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  const session = token ? auth.verifyToken(token) : null;
  if (!session) {
    // Backwards compat: legacy admin password (deprecation phase)
    const legacy = req.get('X-Admin-Password');
    if (LEGACY_ADMIN_PASSWORD && legacy === LEGACY_ADMIN_PASSWORD) {
      req.session = { role: 'super', legacy: true };
      return next();
    }
    return res.status(401).json({ error: 'Μη εξουσιοδοτημένη πρόσβαση.' });
  }
  req.session = session;
  next();
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.role !== 'super') return res.status(403).json({ error: 'Μόνο για super admin.' });
    next();
  });
}

function requireShopAccess(shopIdParam = 'shopId') {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const targetShopId = Number(req.params[shopIdParam] || req.body?.shopId || 0);
      if (req.session.role === 'super') return next();
      if (req.session.role === 'shop' && req.session.shopId === targetShopId) return next();
      return res.status(403).json({ error: 'Δεν έχεις πρόσβαση σε αυτό το κατάστημα.' });
    });
  };
}

// Login για super admin (marketplace owner)
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password, mode = 'super' } = req.body || {};
  if (mode === 'super') {
    if (auth.verifySuperAdmin(password)) {
      setSession(res, { role: 'super' });
      return res.json({ ok: true, role: 'super' });
    }
    // Backwards compat
    if (LEGACY_ADMIN_PASSWORD && password === LEGACY_ADMIN_PASSWORD) {
      setSession(res, { role: 'super', legacy: true });
      return res.json({ ok: true, role: 'super', legacy: true });
    }
  }
  return res.status(401).json({ error: 'Λάθος κωδικός.' });
});

// Login για συγκεκριμένο κουρείο (shop owner)
app.post('/api/shops/:slug/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const shop = db.getShopBySlug(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  if (!shop.admin_password_hash) return res.status(403).json({ error: 'Δεν έχει οριστεί κωδικός για το κατάστημα.' });
  if (!auth.verifyPassword(password, shop.admin_password_hash)) {
    return res.status(401).json({ error: 'Λάθος κωδικός.' });
  }
  setSession(res, { role: 'shop', shopId: shop.id, shopSlug: shop.slug });
  res.json({ ok: true, role: 'shop', shopSlug: shop.slug, shopId: shop.id });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('bh_session');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const token = getToken(req);
  const session = token ? auth.verifyToken(token) : null;
  if (!session) return res.status(401).json({ error: 'not authenticated' });
  res.json(session);
});

// Backwards compat alias που δε σπάει το παλιό admin.html
const requireAdmin = requireAuth;

// ---------- admin: shops ----------
app.get('/api/admin/shops', requireAdmin, (req, res) => res.json(db.listShops()));
app.post('/api/admin/shops', requireAdmin, (req, res) => {
  const { slug, name, address, phone } = req.body || {};
  if (!slug || !name) return res.status(400).json({ error: 'Slug και όνομα απαιτούνται.' });
  try {
    const r = db.createShop({ slug: slug.trim().toLowerCase(), name: name.trim(), address, phone });
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.status(409).json({ error: 'Αυτό το slug υπάρχει ήδη.' }); }
});
app.put('/api/admin/shops/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { slug, name, address, phone, google_place_id, google_maps_url } = req.body || {};
  try {
    db.updateShop(id, {
      slug: slug.trim().toLowerCase(), name: name.trim(),
      address, phone,
      google_place_id: google_place_id || '',
      google_maps_url: google_maps_url || '',
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/shops/:id', requireSuperAdmin, (req, res) => {
  db.deleteShop(Number(req.params.id));
  res.json({ ok: true });
});

// Αλλαγή κωδικού καταστήματος
app.post('/api/admin/shops/:id/change-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  // Μόνο super admin ή ο ίδιος ο shop owner του shop
  if (req.session.role === 'shop' && req.session.shopId !== id) {
    return res.status(403).json({ error: 'Δεν έχεις δικαιώματα.' });
  }
  const newPwd = String(req.body?.new_password || '');
  if (newPwd.length < 8) return res.status(400).json({ error: 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.' });
  // Αν είναι shop role, ελέγχεται και current password
  if (req.session.role === 'shop') {
    const shop = db.getShopById(id);
    if (!auth.verifyPassword(req.body?.current_password, shop.admin_password_hash)) {
      return res.status(401).json({ error: 'Λάθος τρέχων κωδικός.' });
    }
  }
  db.setShopPassword(id, auth.hashPassword(newPwd));
  res.json({ ok: true });
});

// ---------- admin: barbers ----------
app.get('/api/admin/shops/:shopId/barbers', requireAdmin, (req, res) => {
  res.json(db.listBarbersByShop(Number(req.params.shopId), true));
});
function normalizeWeeklySchedule(input) {
  // Accepts array of 7 items: { blocked, shifts: [{open,close}, ...] }
  // or legacy { blocked, open, close }
  if (!input) return '';
  if (typeof input === 'string') {
    try { JSON.parse(input); return input; } catch (_) { return ''; }
  }
  if (Array.isArray(input) && input.length === 7) {
    return JSON.stringify(input.map(d => {
      if (!d) return { blocked: true };
      if (d.blocked) return { blocked: true };
      // Νέο format με shifts
      if (Array.isArray(d.shifts) && d.shifts.length) {
        const shifts = d.shifts
          .filter(s => s && s.open != null && s.close != null && Number(s.close) > Number(s.open))
          .map(s => ({ open: Number(s.open), close: Number(s.close) }));
        if (shifts.length) return { blocked: false, shifts };
        return { blocked: true };
      }
      // Legacy: open/close → ένα shift
      if (d.open != null && d.close != null) {
        return { blocked: false, shifts: [{ open: Number(d.open), close: Number(d.close) }] };
      }
      return { blocked: true };
    }));
  }
  return '';
}

app.post('/api/admin/shops/:shopId/barbers', requireAdmin, (req, res) => {
  const shopId = Number(req.params.shopId);
  const b = req.body || {};
  if (!b.slug || !b.name) return res.status(400).json({ error: 'Slug και όνομα απαιτούνται.' });
  try {
    const r = db.createBarber({
      ...b, shop_id: shopId, slug: b.slug.trim().toLowerCase(),
      weekly_schedule: normalizeWeeklySchedule(b.weekly_schedule),
    });
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.status(409).json({ error: 'Αυτό το slug υπάρχει στο κατάστημα.' }); }
});
app.put('/api/admin/barbers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  try {
    const update = { ...b };
    if (typeof b.slug === 'string' && b.slug.trim()) update.slug = b.slug.trim().toLowerCase();
    else delete update.slug;
    if (b.weekly_schedule !== undefined) update.weekly_schedule = normalizeWeeklySchedule(b.weekly_schedule);
    db.updateBarber(id, update);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/admin/barbers/:id', requireAdmin, (req, res) => {
  db.deleteBarber(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- admin: capacity overrides ----------
app.get('/api/admin/barbers/:id/day/:date', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const date = req.params.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Μη έγκυρη ημ.' });
  res.json({
    day: db.getDayOverride(id, date) || null,
    hours: db.listHourOverrides(id, date),
  });
});
app.put('/api/admin/barbers/:id/day/:date', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const date = req.params.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Μη έγκυρη ημ.' });
  db.upsertDayOverride(id, date, req.body || {});
  res.json({ ok: true });
});
app.delete('/api/admin/barbers/:id/day/:date', requireAdmin, (req, res) => {
  db.deleteDayOverride(Number(req.params.id), req.params.date);
  res.json({ ok: true });
});
app.put('/api/admin/barbers/:id/hour', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { date, hour } = req.body || {};
  if (!isValidDate(date) || hour == null) return res.status(400).json({ error: 'Λείπει date/hour.' });
  db.upsertHourOverride(id, date, Number(hour), req.body);
  res.json({ ok: true });
});
app.delete('/api/admin/barbers/:id/hour', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { date, hour } = req.body || {};
  db.deleteHourOverride(id, date, Number(hour));
  res.json({ ok: true });
});

// ---------- admin: appointments ----------
app.get('/api/admin/shops/:shopId/appointments', requireAdmin, (req, res) => {
  const shopId = Number(req.params.shopId);
  const { date, status } = req.query;
  let list = (date && isValidDate(date)) ? db.listByShopAndDate(shopId, date) : db.listUpcomingForShop(shopId);
  if (status) {
    const allow = String(status).split(',').map((s) => s.trim());
    list = list.filter((a) => allow.includes(a.status));
  }
  res.json(list);
});
app.get('/api/admin/shops/:shopId/counts', requireAdmin, (req, res) => {
  const list = db.listUpcomingForShop(Number(req.params.shopId));
  res.json({
    pending: list.filter((a) => a.status === 'pending').length,
    confirmed: list.filter((a) => a.status === 'confirmed').length,
    total: list.length,
  });
});

app.post('/api/admin/appointments/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.getAppointment(id);
  if (!cur) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  // Έλεγχος capacity: αν είναι στην ίδια ώρα και έχει γεμίσει, μην το εγκρίνεις
  const barber = db.getBarberById(cur.barber_id);
  const hh = cur.appointment_time.slice(0, 2);
  const dayOv = db.getDayOverride(barber.id, cur.appointment_date);
  const hourOvList = db.listHourOverrides(barber.id, cur.appointment_date);
  const hourOv = hourOvList.find((h) => String(h.hour).padStart(2,'0') === hh);
  const { capacity, blocked } = effectiveCapacityForHour({ barber, dayOv, hourOv });
  const confirmedNow = db.countConfirmedByHour(barber.id, cur.appointment_date)[hh] || 0;
  if (blocked) return res.status(409).json({ error: 'Αυτή η ώρα είναι κλειστή.' });
  if (confirmedNow >= capacity) return res.status(409).json({ error: `Έχεις ήδη ${confirmedNow}/${capacity} ραντεβού αυτή την ώρα.` });

  const appt = db.setAppointmentStatus(id, 'confirmed');
  sendSMS(appt.customer_phone, buildConfirmationMessage(appt)).catch(() => {});
  if (appt.customer_email) {
    const e = buildConfirmationEmail(appt);
    sendEmail(appt.customer_email, e.subject, e.text, e.html).catch(() => {});
  }
  res.json({ ok: true, appointment: appt });
});

app.post('/api/admin/appointments/:id/decline', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const appt = db.setAppointmentStatus(id, 'declined');
  if (!appt) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  sendSMS(appt.customer_phone, buildDeclineMessage(appt)).catch(() => {});
  res.json({ ok: true, appointment: appt });
});

app.post('/api/admin/appointments/:id/cancel', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const appt = db.setAppointmentStatus(id, 'cancelled');
  if (!appt) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  sendSMS(appt.customer_phone, buildCancelMessage(appt)).catch(() => {});
  res.json({ ok: true, appointment: appt });
});

app.put('/api/admin/appointments/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.getAppointment(id);
  if (!cur) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  const a = {
    customer_name: (req.body.name ?? cur.customer_name).trim(),
    customer_phone: (req.body.phone ?? cur.customer_phone).trim(),
    customer_email: (req.body.email !== undefined ? req.body.email : cur.customer_email).trim(),
    appointment_date: req.body.date || cur.appointment_date,
    appointment_time: req.body.time || cur.appointment_time,
    notes: req.body.notes ?? cur.notes ?? '',
  };
  const updated = db.updateAppointment(id, a);
  sendSMS(updated.customer_phone, buildUpdateMessage(updated)).catch(() => {});
  if (updated.customer_email) {
    const e = buildUpdateEmail(updated);
    sendEmail(updated.customer_email, e.subject, e.text, e.html).catch(() => {});
  }
  res.json({ ok: true, appointment: updated });
});

// Νέο ραντεβού από κουρέα (απευθείας confirmed)
app.post('/api/admin/barbers/:id/appointments', requireAdmin, (req, res) => {
  const barberId = Number(req.params.id);
  const barber = db.getBarberById(barberId);
  if (!barber) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  const { name, phone, email = '', haircutType = '', date, time, notes = '' } = req.body || {};
  if (!name || !phone || !isValidDate(date) || !isValidTime(time)) {
    return res.status(400).json({ error: 'Συμπληρώστε όλα τα πεδία.' });
  }
  const appt = db.createAppointmentRequest({
    barber_id: barberId,
    customer_name: name.trim(), customer_phone: phone.trim(), customer_email: email.trim(),
    haircut_type: haircutType, appointment_date: date, appointment_time: time, notes,
  });
  const approved = db.setAppointmentStatus(appt.id, 'confirmed');
  sendSMS(approved.customer_phone, buildConfirmationMessage(approved)).catch(() => {});
  if (approved.customer_email) {
    const e = buildConfirmationEmail(approved);
    sendEmail(approved.customer_email, e.subject, e.text, e.html).catch(() => {});
  }
  res.json({ ok: true, appointment: approved });
});

// ---------- admin: customer history (ταυτοποίηση από κινητό) ----------
function normalizePhoneCmp(p) {
  let v = String(p||'').replace(/[\s\-()]/g,'');
  if (/^00/.test(v)) v = '+' + v.slice(2);
  if (/^69\d{8}$/.test(v)) v = '+30' + v;
  return v;
}
app.get('/api/admin/shops/:shopId/customers/:phone', requireAdmin, (req, res) => {
  const shopId = Number(req.params.shopId);
  const phone = decodeURIComponent(req.params.phone).trim();
  // Δοκίμασε και τις δύο μορφές (με/χωρίς +30)
  const variants = [phone, normalizePhoneCmp(phone), phone.replace(/^\+30/, ''), phone.replace(/[\s\-()]/g, '')];
  const seen = new Set();
  const merged = [];
  for (const v of variants) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    const h = db.getCustomerHistory(shopId, v);
    for (const a of h.all) {
      if (!merged.find(x => x.id === a.id)) merged.push(a);
    }
  }
  const today = todayISO();
  const completed = merged.filter(r => r.status === 'confirmed' && r.appointment_date < today);
  const upcoming = merged.filter(r => r.status === 'confirmed' && r.appointment_date >= today);
  const totalSpend = completed.reduce((s, r) => s + (Number(r.price_eur) || 0), 0);
  res.json({
    phone,
    visits: completed.length,
    upcoming: upcoming.length,
    totalSpend: Math.round(totalSpend * 100) / 100,
    history: merged,
  });
});

// ---------- prices ----------
app.get('/api/shops/:slug/prices', (req, res) => {
  const shop = db.getShopBySlug(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  res.json(db.listShopPrices(shop.id));
});
app.put('/api/admin/shops/:id/prices', requireAdmin, (req, res) => {
  const shopId = Number(req.params.id);
  const items = req.body?.prices || []; // [{haircut_type, price_eur}, ...]
  for (const it of items) {
    db.upsertShopPrice(shopId, it.haircut_type, Number(it.price_eur) || 0);
  }
  res.json({ ok: true });
});

// ---------- self-service signup ----------
app.post('/api/signup', signupLimiter, (req, res) => {
  const shop_name = sanitizeStr(req.body?.shop_name, 80);
  const slug = sanitizeSlug(req.body?.shop_slug);
  const address = sanitizeStr(req.body?.address, 160);
  const phone = sanitizePhone(req.body?.phone);
  const barber_name = sanitizeStr(req.body?.barber_name, 60);
  const password = String(req.body?.password || '');

  if (!shop_name || !slug || !barber_name || !password) {
    return res.status(400).json({ error: 'Συμπλήρωσε όλα τα πεδία.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.' });
  if (slug.length < 3) return res.status(400).json({ error: 'Το URL slug πρέπει να έχει 3+ χαρακτήρες.' });
  if (db.getShopBySlug(slug)) return res.status(409).json({ error: 'Αυτό το slug υπάρχει ήδη.' });

  try {
    // Bcrypt hash για το password (12 rounds)
    const password_hash = auth.hashPassword(password);
    const r = db.createShop({
      slug, name: shop_name, address, phone,
      admin_password_hash: password_hash,
    });
    const shopId = r.lastInsertRowid;
    const barberSlug = sanitizeSlug(barber_name);
    db.createBarber({
      shop_id: shopId, slug: barberSlug || 'barber',
      name: barber_name,
      default_capacity: 2, avg_minutes: 30,
      open_hour: 9, close_hour: 20, sort_order: 1,
    });
    // Auto-login: επιστρέφουμε JWT για άμεση πρόσβαση στο shop admin
    setSession(res, { role: 'shop', shopId, shopSlug: slug });
    res.json({
      ok: true,
      shop_slug: slug,
      booking_url: `${PUBLIC_URL}/?shop=${encodeURIComponent(slug)}`,
      admin_url: `${PUBLIC_URL}/admin.html`,
      qr_url: `${PUBLIC_URL}/qr.html?shop=${encodeURIComponent(slug)}`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Σφάλμα δημιουργίας.' });
  }
});

// ---------- Google Places API (φωτογραφίες/reviews/info από GBP) ----------
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
app.get('/api/shops/:slug/google', async (req, res) => {
  const shop = db.getShopBySlug(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  if (!shop.google_place_id || !GOOGLE_API_KEY) {
    return res.json({ enabled: false });
  }
  try {
    const fields = 'name,rating,user_ratings_total,formatted_address,formatted_phone_number,opening_hours,reviews,photos,url';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${shop.google_place_id}&fields=${fields}&language=el&key=${GOOGLE_API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json({ enabled: true, place: data.result || null });
  } catch (e) {
    res.json({ enabled: false, error: e.message });
  }
});

// ============ CREATOR DASHBOARD API ============
// Όλα απαιτούν super-admin (creator) auth.

app.get('/api/creator/summary', requireSuperAdmin, (req, res) => {
  const data = db.creatorSummary();
  // Ενημερώστε με URLs για κάθε shop
  data.shops = data.shops.map(s => ({
    ...s,
    booking_url: `${PUBLIC_URL}/?shop=${encodeURIComponent(s.slug)}`,
    admin_url: `${PUBLIC_URL}/admin.html?shop=${encodeURIComponent(s.slug)}`,
    qr_url: `${PUBLIC_URL}/qr.html?shop=${encodeURIComponent(s.slug)}`,
  }));
  res.json(data);
});

app.post('/api/creator/shops', requireSuperAdmin, (req, res) => {
  const name = sanitizeStr(req.body?.name, 80);
  const slug = sanitizeSlug(req.body?.slug || req.body?.name);
  const address = sanitizeStr(req.body?.address, 160);
  const phone = sanitizePhone(req.body?.phone);
  const contact_email = sanitizeEmail(req.body?.contact_email);
  const password = String(req.body?.password || '');
  const barber_name = sanitizeStr(req.body?.barber_name, 60);
  const monthly_per_barber_eur = Number(req.body?.monthly_per_barber_eur ?? 10);
  const subscription_status = ['active','trial','inactive'].includes(req.body?.subscription_status) ? req.body.subscription_status : 'trial';

  if (!name || !slug || !password) {
    return res.status(400).json({ error: 'Συμπλήρωσε όνομα, slug και password.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Ο κωδικός θέλει 8+ χαρακτήρες.' });
  if (db.getShopBySlug(slug)) return res.status(409).json({ error: 'Αυτό το slug υπάρχει ήδη.' });

  try {
    const r = db.createShop({
      slug, name, address, phone, contact_email,
      admin_password_hash: auth.hashPassword(password),
    });
    const shopId = r.lastInsertRowid;
    db.updateShopSubscription(shopId, { subscription_status, monthly_per_barber_eur, contact_email });
    if (barber_name) {
      db.createBarber({
        shop_id: shopId, slug: sanitizeSlug(barber_name) || 'barber',
        name: barber_name, default_capacity: 2, avg_minutes: 30,
        open_hour: 9, close_hour: 20, sort_order: 1,
      });
    }
    res.json({ ok: true, id: shopId, slug });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Σφάλμα δημιουργίας.' });
  }
});

app.patch('/api/creator/shops/:id', requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const shop = db.getShopById(id);
  if (!shop) return res.status(404).json({ error: 'Δεν βρέθηκε.' });

  // Update basic info
  if (req.body.name || req.body.address != null || req.body.phone != null || req.body.slug) {
    db.updateShop(id, {
      slug: req.body.slug ? sanitizeSlug(req.body.slug) : shop.slug,
      name: sanitizeStr(req.body.name, 80) || shop.name,
      address: req.body.address != null ? sanitizeStr(req.body.address, 160) : shop.address,
      phone: req.body.phone != null ? sanitizePhone(req.body.phone) : shop.phone,
      photo: shop.photo,
      google_place_id: shop.google_place_id,
      google_maps_url: shop.google_maps_url,
    });
  }
  // Update subscription
  db.updateShopSubscription(id, {
    subscription_status: req.body.subscription_status,
    subscription_period_end: req.body.subscription_period_end,
    monthly_per_barber_eur: req.body.monthly_per_barber_eur != null ? Number(req.body.monthly_per_barber_eur) : null,
    is_active: req.body.is_active,
    billing_notes: req.body.billing_notes,
    contact_email: req.body.contact_email != null ? sanitizeEmail(req.body.contact_email) : null,
  });
  res.json({ ok: true });
});

app.post('/api/creator/shops/:id/reset-password', requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const newPwd = String(req.body?.password || '');
  if (newPwd.length < 8) return res.status(400).json({ error: 'Κωδικός 8+ χαρακτήρες.' });
  if (!db.getShopById(id)) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  db.setShopPassword(id, auth.hashPassword(newPwd));
  res.json({ ok: true });
});

app.delete('/api/creator/shops/:id', requireSuperAdmin, (req, res) => {
  db.deleteShop(Number(req.params.id));
  res.json({ ok: true });
});

// Add barber to existing shop
app.post('/api/creator/shops/:id/barbers', requireSuperAdmin, (req, res) => {
  const shopId = Number(req.params.id);
  if (!db.getShopById(shopId)) return res.status(404).json({ error: 'Δεν βρέθηκε.' });
  const name = sanitizeStr(req.body?.name, 60);
  const slug = sanitizeSlug(req.body?.slug || name);
  if (!name || !slug) return res.status(400).json({ error: 'Όνομα και slug απαιτούνται.' });
  try {
    const r = db.createBarber({
      shop_id: shopId, slug, name,
      bio: sanitizeStr(req.body?.bio, 100),
      default_capacity: Number(req.body?.default_capacity) || 2,
      avg_minutes: Number(req.body?.avg_minutes) || 30,
      open_hour: Number(req.body?.open_hour) || 9,
      close_hour: Number(req.body?.close_hour) || 20,
      sort_order: Number(req.body?.sort_order) || 0,
    });
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Αυτό το slug υπάρχει στο κουρείο.' });
  }
});

app.delete('/api/creator/barbers/:id', requireSuperAdmin, (req, res) => {
  db.deleteBarber(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/creator/shops/:id/barbers', requireSuperAdmin, (req, res) => {
  res.json(db.listBarbersByShop(Number(req.params.id), true));
});

// ---------- QR (per shop ή generic) ----------
app.get('/api/qr.png', async (req, res) => {
  const url = req.query.url ? String(req.query.url) : `${PUBLIC_URL}/`;
  try {
    res.type('png');
    res.send(await QRCode.toBuffer(url, { width: 600, margin: 2 }));
  } catch (e) { res.status(500).send('QR error'); }
});

// ---------- PWA icons ----------
app.get('/icon-192.png', (req, res) => { res.type('image/svg+xml'); res.send(fs.readFileSync(path.join(__dirname, 'public', 'icon.svg'))); });
app.get('/icon-512.png', (req, res) => { res.type('image/svg+xml'); res.send(fs.readFileSync(path.join(__dirname, 'public', 'icon.svg'))); });

// Start
scheduler.start();
app.listen(PORT, () => {
  console.log(`\n✂️  ${APP_NAME} τρέχει στο ${PUBLIC_URL}`);
  console.log(`   Πελάτες:  ${PUBLIC_URL}/`);
  console.log(`   Admin:    ${PUBLIC_URL}/admin.html`);
  console.log(`   QR:       ${PUBLIC_URL}/qr.html\n`);
});
