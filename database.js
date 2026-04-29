// Multi-tenant βάση: shops → barbers → appointments + capacity overrides
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Resolve DB path με graceful fallback αν το dir δεν υπάρχει
function resolveDbPath() {
  const envPath = process.env.DB_PATH;
  const fallback = path.join(__dirname, 'barbershop.db');
  if (!envPath) return fallback;

  const dir = path.dirname(envPath);
  // Αν το dir δεν υπάρχει, δοκίμασε να το φτιάξεις
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[db] Δημιουργήθηκε directory: ${dir}`);
    } catch (e) {
      console.warn(`[db] ΠΡΟΣΟΧΗ: Δεν μπορώ να φτιάξω το ${dir} (${e.message}). Fallback σε ${fallback}.`);
      return fallback;
    }
  }
  // Test write access
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return envPath;
  } catch (e) {
    console.warn(`[db] ΠΡΟΣΟΧΗ: Δεν έχω write access στο ${dir}. Fallback σε ${fallback}.`);
    return fallback;
  }
}

const DB_PATH = resolveDbPath();
console.log(`[db] Using database: ${DB_PATH}`);
const db = new Database(DB_PATH);
try { db.pragma('journal_mode = WAL'); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    photo TEXT DEFAULT '',
    google_place_id TEXT DEFAULT '',
    google_maps_url TEXT DEFAULT '',
    admin_password_hash TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS barbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    photo TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    default_capacity INTEGER DEFAULT 2,
    avg_minutes INTEGER DEFAULT 30,    -- μέσος όρος διάρκειας ανά κούρεμα
    open_hour INTEGER DEFAULT 9,
    close_hour INTEGER DEFAULT 20,
    -- weekly schedule: 7 days, JSON: [{open,close,blocked},...]  index 0=Sunday..6=Saturday
    weekly_schedule TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_id, slug),
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shop_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    haircut_type TEXT NOT NULL,
    price_eur REAL DEFAULT 0,
    UNIQUE(shop_id, haircut_type),
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS day_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barber_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    capacity INTEGER,
    open_hour INTEGER,
    close_hour INTEGER,
    blocked INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    UNIQUE(barber_id, date),
    FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hour_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barber_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hour INTEGER NOT NULL,
    capacity INTEGER,
    blocked INTEGER DEFAULT 0,
    UNIQUE(barber_id, date, hour),
    FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barber_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    haircut_type TEXT DEFAULT '',
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reminder_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_appt_barber_date
    ON appointments(barber_id, appointment_date, appointment_time);
  CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
  CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(customer_phone);
  CREATE INDEX IF NOT EXISTS idx_barber_shop ON barbers(shop_id);
`);

// Migrations
try {
  const bcols = db.prepare(`PRAGMA table_info(barbers)`).all();
  if (!bcols.some(c => c.name === 'avg_minutes')) db.exec(`ALTER TABLE barbers ADD COLUMN avg_minutes INTEGER DEFAULT 30`);
  if (!bcols.some(c => c.name === 'weekly_schedule')) db.exec(`ALTER TABLE barbers ADD COLUMN weekly_schedule TEXT DEFAULT ''`);
  const scols = db.prepare(`PRAGMA table_info(shops)`).all();
  if (!scols.some(c => c.name === 'google_place_id')) db.exec(`ALTER TABLE shops ADD COLUMN google_place_id TEXT DEFAULT ''`);
  if (!scols.some(c => c.name === 'google_maps_url')) db.exec(`ALTER TABLE shops ADD COLUMN google_maps_url TEXT DEFAULT ''`);
  if (!scols.some(c => c.name === 'admin_password_hash')) db.exec(`ALTER TABLE shops ADD COLUMN admin_password_hash TEXT DEFAULT ''`);
  // Subscriptions tracking
  if (!scols.some(c => c.name === 'subscription_status')) db.exec(`ALTER TABLE shops ADD COLUMN subscription_status TEXT DEFAULT 'trial'`);
  if (!scols.some(c => c.name === 'subscription_period_end')) db.exec(`ALTER TABLE shops ADD COLUMN subscription_period_end TEXT DEFAULT ''`);
  if (!scols.some(c => c.name === 'monthly_per_barber_eur')) db.exec(`ALTER TABLE shops ADD COLUMN monthly_per_barber_eur INTEGER DEFAULT 10`);
  if (!scols.some(c => c.name === 'is_active')) db.exec(`ALTER TABLE shops ADD COLUMN is_active INTEGER DEFAULT 1`);
  if (!scols.some(c => c.name === 'billing_notes')) db.exec(`ALTER TABLE shops ADD COLUMN billing_notes TEXT DEFAULT ''`);
  if (!scols.some(c => c.name === 'contact_email')) db.exec(`ALTER TABLE shops ADD COLUMN contact_email TEXT DEFAULT ''`);
} catch (_) {}

// ---------- Seed: αν δεν υπάρχει κανένα shop, βάλε ένα demo με 2 barbers ----------
function seedIfEmpty() {
  const shopCount = db.prepare(`SELECT COUNT(*) AS n FROM shops`).get().n;
  if (shopCount > 0) return;
  const shop = db.prepare(`
    INSERT INTO shops (slug, name, address, phone) VALUES (?, ?, ?, ?)
  `).run('demo', 'Το Κουρείο μου', 'Ερμού 10, Αθήνα', '210 1234567');
  const shopId = shop.lastInsertRowid;
  db.prepare(`
    INSERT INTO barbers (shop_id, slug, name, bio, default_capacity, open_hour, close_hour, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(shopId, 'nikos', 'Νίκος', 'Specialist σε classic & fade.', 3, 9, 20, 1);
  db.prepare(`
    INSERT INTO barbers (shop_id, slug, name, bio, default_capacity, open_hour, close_hour, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(shopId, 'giorgos', 'Γιώργος', 'Ψαλίδι, σχέδια, γενειάδα.', 2, 10, 21, 2);
  console.log('[db] Seeded demo shop with 2 barbers.');
}
seedIfEmpty();

// ---------- Prepared statements ----------
const stmts = {
  shops: {
    list: db.prepare(`SELECT * FROM shops ORDER BY name`),
    bySlug: db.prepare(`SELECT * FROM shops WHERE slug = ?`),
    byId: db.prepare(`SELECT * FROM shops WHERE id = ?`),
    insert: db.prepare(`INSERT INTO shops (slug, name, address, phone, photo, google_place_id, google_maps_url, admin_password_hash) VALUES (?,?,?,?,?,?,?,?)`),
    update: db.prepare(`UPDATE shops SET slug=?, name=?, address=?, phone=?, photo=?, google_place_id=?, google_maps_url=? WHERE id=?`),
    updatePassword: db.prepare(`UPDATE shops SET admin_password_hash = ? WHERE id = ?`),
    delete: db.prepare(`DELETE FROM shops WHERE id = ?`),
  },
  barbers: {
    listByShop: db.prepare(`SELECT * FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY sort_order, name`),
    listAllByShop: db.prepare(`SELECT * FROM barbers WHERE shop_id = ? ORDER BY sort_order, name`),
    byShopSlug: db.prepare(`
      SELECT b.* FROM barbers b
      JOIN shops s ON s.id = b.shop_id
      WHERE s.slug = ? AND b.active = 1
      ORDER BY b.sort_order, b.name
    `),
    byId: db.prepare(`SELECT * FROM barbers WHERE id = ?`),
    bySlug: db.prepare(`
      SELECT b.* FROM barbers b
      JOIN shops s ON s.id = b.shop_id
      WHERE s.slug = ? AND b.slug = ?
    `),
    insert: db.prepare(`
      INSERT INTO barbers (shop_id, slug, name, photo, bio, default_capacity, avg_minutes, open_hour, close_hour, weekly_schedule, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `),
    update: db.prepare(`
      UPDATE barbers SET slug=?, name=?, photo=?, bio=?, default_capacity=?, avg_minutes=?, open_hour=?, close_hour=?, weekly_schedule=?, sort_order=?, active=?
      WHERE id=?
    `),
    delete: db.prepare(`DELETE FROM barbers WHERE id = ?`),
  },
  appts: {
    insert: db.prepare(`
      INSERT INTO appointments (barber_id, customer_name, customer_phone, customer_email, haircut_type, appointment_date, appointment_time, notes, status)
      VALUES (?,?,?,?,?,?,?,?, 'pending')
    `),
    byId: db.prepare(`SELECT * FROM appointments WHERE id = ?`),
    listByBarberAndDate: db.prepare(`
      SELECT * FROM appointments
      WHERE barber_id = ? AND appointment_date = ? AND status IN ('pending','confirmed')
      ORDER BY appointment_time
    `),
    listConfirmedByBarberAndDate: db.prepare(`
      SELECT * FROM appointments
      WHERE barber_id = ? AND appointment_date = ? AND status = 'confirmed'
      ORDER BY appointment_time
    `),
    countConfirmedByHour: db.prepare(`
      SELECT substr(appointment_time, 1, 2) AS hh, COUNT(*) AS n
      FROM appointments
      WHERE barber_id = ? AND appointment_date = ? AND status = 'confirmed'
      GROUP BY hh
    `),
    countPendingByHour: db.prepare(`
      SELECT substr(appointment_time, 1, 2) AS hh, COUNT(*) AS n
      FROM appointments
      WHERE barber_id = ? AND appointment_date = ? AND status = 'pending'
      GROUP BY hh
    `),
    listUpcomingForShop: db.prepare(`
      SELECT a.*, b.name AS barber_name, b.slug AS barber_slug
      FROM appointments a
      JOIN barbers b ON b.id = a.barber_id
      WHERE b.shop_id = ? AND a.status IN ('pending','confirmed') AND
            (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?))
      ORDER BY a.appointment_date, a.appointment_time
    `),
    listByShopAndDate: db.prepare(`
      SELECT a.*, b.name AS barber_name, b.slug AS barber_slug
      FROM appointments a
      JOIN barbers b ON b.id = a.barber_id
      WHERE b.shop_id = ? AND a.appointment_date = ? AND a.status IN ('pending','confirmed')
      ORDER BY a.appointment_time, b.sort_order
    `),
    setStatus: db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`),
    update: db.prepare(`
      UPDATE appointments SET customer_name=?, customer_phone=?, customer_email=?, appointment_date=?, appointment_time=?, notes=?, reminder_sent=0
      WHERE id=?
    `),
    findDueForReminder: db.prepare(`SELECT * FROM appointments WHERE status='confirmed' AND reminder_sent = 0`),
    markReminderSent: db.prepare(`UPDATE appointments SET reminder_sent = 1 WHERE id = ?`),
  },
  dayOv: {
    get: db.prepare(`SELECT * FROM day_overrides WHERE barber_id = ? AND date = ?`),
    upsert: db.prepare(`
      INSERT INTO day_overrides (barber_id, date, capacity, open_hour, close_hour, blocked, note)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(barber_id, date) DO UPDATE SET capacity=excluded.capacity, open_hour=excluded.open_hour, close_hour=excluded.close_hour, blocked=excluded.blocked, note=excluded.note
    `),
    listForBarber: db.prepare(`SELECT * FROM day_overrides WHERE barber_id = ? AND date >= ? ORDER BY date`),
    delete: db.prepare(`DELETE FROM day_overrides WHERE barber_id = ? AND date = ?`),
  },
  hourOv: {
    listForBarberDay: db.prepare(`SELECT * FROM hour_overrides WHERE barber_id = ? AND date = ?`),
    upsert: db.prepare(`
      INSERT INTO hour_overrides (barber_id, date, hour, capacity, blocked)
      VALUES (?,?,?,?,?)
      ON CONFLICT(barber_id, date, hour) DO UPDATE SET capacity=excluded.capacity, blocked=excluded.blocked
    `),
    delete: db.prepare(`DELETE FROM hour_overrides WHERE barber_id = ? AND date = ? AND hour = ?`),
  },
  prices: {
    listForShop: db.prepare(`SELECT * FROM shop_prices WHERE shop_id = ?`),
    upsert: db.prepare(`
      INSERT INTO shop_prices (shop_id, haircut_type, price_eur)
      VALUES (?,?,?)
      ON CONFLICT(shop_id, haircut_type) DO UPDATE SET price_eur = excluded.price_eur
    `),
  },
  customers: {
    historyByPhone: db.prepare(`
      SELECT a.*, b.name AS barber_name, b.shop_id, sp.price_eur
      FROM appointments a
      JOIN barbers b ON b.id = a.barber_id
      LEFT JOIN shop_prices sp ON sp.shop_id = b.shop_id AND sp.haircut_type = a.haircut_type
      WHERE a.customer_phone = ? AND b.shop_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `),
  },
};

// ---------- Public API ----------
function listShops()         { return stmts.shops.list.all(); }
function getShopBySlug(slug) { return stmts.shops.bySlug.get(slug); }
function getShopById(id)     { return stmts.shops.byId.get(id); }
function createShop(s) {
  return stmts.shops.insert.run(
    s.slug, s.name, s.address || '', s.phone || '', s.photo || '',
    s.google_place_id || '', s.google_maps_url || '', s.admin_password_hash || ''
  );
}
function updateShop(id, s) {
  return stmts.shops.update.run(
    s.slug, s.name, s.address || '', s.phone || '', s.photo || '',
    s.google_place_id || '', s.google_maps_url || '', id
  );
}
function setShopPassword(id, hash) { return stmts.shops.updatePassword.run(hash, id); }
function getShopByIdWithAuth(id) { return stmts.shops.byId.get(id); }

// Subscriptions / billing
function updateShopSubscription(id, fields) {
  const sql = `UPDATE shops SET
    subscription_status = COALESCE(?, subscription_status),
    subscription_period_end = COALESCE(?, subscription_period_end),
    monthly_per_barber_eur = COALESCE(?, monthly_per_barber_eur),
    is_active = COALESCE(?, is_active),
    billing_notes = COALESCE(?, billing_notes),
    contact_email = COALESCE(?, contact_email)
   WHERE id = ?`;
  return db.prepare(sql).run(
    fields.subscription_status ?? null,
    fields.subscription_period_end ?? null,
    fields.monthly_per_barber_eur ?? null,
    fields.is_active != null ? (fields.is_active ? 1 : 0) : null,
    fields.billing_notes ?? null,
    fields.contact_email ?? null,
    id
  );
}

function shopStats(shopId) {
  const barbers = db.prepare(`SELECT COUNT(*) AS n FROM barbers WHERE shop_id = ? AND active = 1`).get(shopId).n;
  const totalBarbers = db.prepare(`SELECT COUNT(*) AS n FROM barbers WHERE shop_id = ?`).get(shopId).n;
  const upcoming = db.prepare(`
    SELECT COUNT(*) AS n FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.shop_id = ? AND a.status IN ('pending','confirmed')
      AND a.appointment_date >= ?
  `).get(shopId, new Date().toISOString().slice(0,10)).n;
  const allTime = db.prepare(`
    SELECT COUNT(*) AS n FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    WHERE b.shop_id = ?
  `).get(shopId).n;
  return { activeBarbers: barbers, totalBarbers, upcomingAppts: upcoming, allTimeAppts: allTime };
}

function creatorSummary() {
  const shops = stmts.shops.list.all();
  const enriched = shops.map(s => ({ ...s, stats: shopStats(s.id) }));
  const totalActiveShops = enriched.filter(s => s.is_active && s.subscription_status === 'active').length;
  const totalActiveBarbers = enriched.filter(s => s.is_active).reduce((sum, s) => sum + s.stats.activeBarbers, 0);
  const monthlyRevenue = enriched
    .filter(s => s.is_active && s.subscription_status === 'active')
    .reduce((sum, s) => sum + s.stats.activeBarbers * (s.monthly_per_barber_eur || 0), 0);
  return {
    shops: enriched,
    totals: {
      shops: enriched.length,
      activeShops: totalActiveShops,
      barbers: totalActiveBarbers,
      monthlyRevenue,
    },
  };
}
function deleteShop(id)      { return stmts.shops.delete.run(id); }

function listBarbersByShop(shopId, includeInactive=false) {
  return includeInactive ? stmts.barbers.listAllByShop.all(shopId) : stmts.barbers.listByShop.all(shopId);
}
function listBarbersByShopSlug(slug) { return stmts.barbers.byShopSlug.all(slug); }
function getBarberById(id)            { return stmts.barbers.byId.get(id); }
function getBarberBySlug(shopSlug, barberSlug) { return stmts.barbers.bySlug.get(shopSlug, barberSlug); }
function createBarber(b) {
  return stmts.barbers.insert.run(
    b.shop_id, b.slug, b.name, b.photo || '', b.bio || '',
    b.default_capacity ?? 2, b.avg_minutes ?? 30,
    b.open_hour ?? 9, b.close_hour ?? 20,
    b.weekly_schedule || '',
    b.sort_order ?? 0
  );
}
function updateBarber(id, b) {
  // Αν δεν δοθεί κάποιο πεδίο, κράτα την υπάρχουσα τιμή
  const cur = stmts.barbers.byId.get(id) || {};
  return stmts.barbers.update.run(
    b.slug ?? cur.slug,
    b.name ?? cur.name,
    b.photo ?? cur.photo ?? '',
    b.bio ?? cur.bio ?? '',
    b.default_capacity ?? cur.default_capacity ?? 2,
    b.avg_minutes ?? cur.avg_minutes ?? 30,
    b.open_hour ?? cur.open_hour ?? 9,
    b.close_hour ?? cur.close_hour ?? 20,
    b.weekly_schedule !== undefined ? b.weekly_schedule : (cur.weekly_schedule || ''),
    b.sort_order ?? cur.sort_order ?? 0,
    b.active ?? cur.active ?? 1,
    id
  );
}
function deleteBarber(id) { return stmts.barbers.delete.run(id); }

function getDayOverride(barberId, date) { return stmts.dayOv.get.get(barberId, date); }
function upsertDayOverride(barberId, date, o) {
  return stmts.dayOv.upsert.run(barberId, date, o.capacity ?? null, o.open_hour ?? null, o.close_hour ?? null, o.blocked ? 1 : 0, o.note || '');
}
function listDayOverrides(barberId, fromDate) {
  return stmts.dayOv.listForBarber.all(barberId, fromDate);
}
function deleteDayOverride(barberId, date) { return stmts.dayOv.delete.run(barberId, date); }

function listHourOverrides(barberId, date) { return stmts.hourOv.listForBarberDay.all(barberId, date); }
function upsertHourOverride(barberId, date, hour, o) {
  return stmts.hourOv.upsert.run(barberId, date, hour, o.capacity ?? null, o.blocked ? 1 : 0);
}
function deleteHourOverride(barberId, date, hour) {
  return stmts.hourOv.delete.run(barberId, date, hour);
}

function createAppointmentRequest(a) {
  // Capacity check: στο specific time, μην κάνεις duplicate confirmed στην ίδια ώρα ίδιου barber.
  // Αλλά πολλαπλά pending επιτρέπονται.
  const result = stmts.appts.insert.run(
    a.barber_id, a.customer_name, a.customer_phone, a.customer_email || '',
    a.haircut_type || '', a.appointment_date, a.appointment_time, a.notes || ''
  );
  return stmts.appts.byId.get(result.lastInsertRowid);
}
function getAppointment(id) { return stmts.appts.byId.get(id); }
function setAppointmentStatus(id, status) {
  stmts.appts.setStatus.run(status, id);
  return stmts.appts.byId.get(id);
}
function updateAppointment(id, a) {
  stmts.appts.update.run(a.customer_name, a.customer_phone, a.customer_email || '', a.appointment_date, a.appointment_time, a.notes || '', id);
  return stmts.appts.byId.get(id);
}
function listAppointmentsByBarberDate(barberId, date) { return stmts.appts.listByBarberAndDate.all(barberId, date); }
function listConfirmedByBarberDate(barberId, date)    { return stmts.appts.listConfirmedByBarberAndDate.all(barberId, date); }
function countConfirmedByHour(barberId, date) {
  const rows = stmts.appts.countConfirmedByHour.all(barberId, date);
  const map = {};
  for (const r of rows) map[r.hh] = r.n;
  return map;
}
function countPendingByHour(barberId, date) {
  const rows = stmts.appts.countPendingByHour.all(barberId, date);
  const map = {};
  for (const r of rows) map[r.hh] = r.n;
  return map;
}
function listUpcomingForShop(shopId) {
  const now = new Date();
  return stmts.appts.listUpcomingForShop.all(shopId, now.toISOString().slice(0,10), now.toISOString().slice(0,10), now.toTimeString().slice(0,5));
}
function listByShopAndDate(shopId, date) { return stmts.appts.listByShopAndDate.all(shopId, date); }
function findDueForReminder() { return stmts.appts.findDueForReminder.all(); }
function markReminderSent(id) { stmts.appts.markReminderSent.run(id); }

// Customer history by phone (μέσα σε ένα shop)
function getCustomerHistory(shopId, phone) {
  const rows = stmts.customers.historyByPhone.all(phone, shopId);
  const completed = rows.filter(r => r.status === 'confirmed' && r.appointment_date < new Date().toISOString().slice(0,10));
  const upcoming = rows.filter(r => r.status === 'confirmed' && r.appointment_date >= new Date().toISOString().slice(0,10));
  const totalSpend = completed.reduce((sum, r) => sum + (Number(r.price_eur) || 0), 0);
  return { all: rows, completed, upcoming, totalSpend, visitsCompleted: completed.length };
}

// Prices
function listShopPrices(shopId) { return stmts.prices.listForShop.all(shopId); }
function upsertShopPrice(shopId, haircutType, priceEur) {
  return stmts.prices.upsert.run(shopId, haircutType, priceEur);
}

module.exports = {
  // shops
  listShops, getShopBySlug, getShopById, createShop, updateShop, deleteShop, setShopPassword,
  updateShopSubscription, shopStats, creatorSummary,
  // customer history & prices
  getCustomerHistory, listShopPrices, upsertShopPrice,
  // barbers
  listBarbersByShop, listBarbersByShopSlug, getBarberById, getBarberBySlug,
  createBarber, updateBarber, deleteBarber,
  // overrides
  getDayOverride, upsertDayOverride, listDayOverrides, deleteDayOverride,
  listHourOverrides, upsertHourOverride, deleteHourOverride,
  // appointments
  createAppointmentRequest, getAppointment, setAppointmentStatus, updateAppointment,
  listAppointmentsByBarberDate, listConfirmedByBarberDate,
  countConfirmedByHour, countPendingByHour,
  listUpcomingForShop, listByShopAndDate,
  findDueForReminder, markReminderSent,
};
