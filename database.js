// Barberhub multi-tenant database
// Auto-select driver: PostgreSQL αν DATABASE_URL set, αλλιώς SQLite (local dev)
//
// Όλες οι exports είναι async functions.

const path = require('path');
const fs = require('fs');

const USE_PG = !!process.env.DATABASE_URL;
console.log(`[db] Using ${USE_PG ? 'PostgreSQL' : 'SQLite'}`);

// ============================================================
//                       PG ADAPTER
// ============================================================
class PgAdapter {
  constructor() {
    const { Pool } = require('pg');
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 10,
    });
    this.dialect = 'pg';
  }
  // Translate `?` placeholders → $1, $2, ...
  translateParams(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => '$' + (++i));
  }
  async run(sql, params = []) {
    const r = await this.pool.query(this.translateParams(sql), params);
    return { rows: r.rows, rowCount: r.rowCount, lastInsertRowid: r.rows[0]?.id };
  }
  async all(sql, params = []) {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows;
  }
  async get(sql, params = []) {
    const r = await this.pool.query(this.translateParams(sql), params);
    return r.rows[0] || null;
  }
  async exec(sql) {
    return this.pool.query(sql);
  }
  async close() { await this.pool.end(); }
}

// ============================================================
//                     SQLITE ADAPTER
// ============================================================
class SqliteAdapter {
  constructor() {
    const Database = require('better-sqlite3');
    const dbPath = resolveSqlitePath();
    console.log(`[db] SQLite path: ${dbPath}`);
    this.db = new Database(dbPath);
    try { this.db.pragma('journal_mode = WAL'); } catch (_) {}
    this.dialect = 'sqlite';
  }
  async run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const r = stmt.run(...params);
    return { rowCount: r.changes, lastInsertRowid: r.lastInsertRowid };
  }
  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }
  async get(sql, params = []) {
    return this.db.prepare(sql).get(...params) || null;
  }
  async exec(sql) {
    this.db.exec(sql);
  }
  async close() { this.db.close(); }
}

function resolveSqlitePath() {
  const envPath = process.env.DB_PATH;
  const fallback = path.join(__dirname, 'barbershop.db');
  if (!envPath) return fallback;
  const dir = path.dirname(envPath);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) {
      console.warn(`[db] cannot create ${dir} (${e.message}), falling back to ${fallback}`);
      return fallback;
    }
  }
  try { fs.accessSync(dir, fs.constants.W_OK); return envPath; }
  catch (e) {
    console.warn(`[db] no write access to ${dir}, falling back`);
    return fallback;
  }
}

const db = USE_PG ? new PgAdapter() : new SqliteAdapter();

// ============================================================
//                       SCHEMA
// ============================================================
const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  google_place_id TEXT DEFAULT '',
  google_maps_url TEXT DEFAULT '',
  admin_password_hash TEXT DEFAULT '',
  admin_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  subscription_status TEXT DEFAULT 'trial',
  subscription_period_end TEXT DEFAULT '',
  monthly_per_barber_eur INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  billing_notes TEXT DEFAULT '',
  two_factor_enabled INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS barbers (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  photo TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  default_capacity INTEGER DEFAULT 2,
  avg_minutes INTEGER DEFAULT 30,
  open_hour INTEGER DEFAULT 9,
  close_hour INTEGER DEFAULT 20,
  weekly_schedule TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop_id, slug)
);
CREATE TABLE IF NOT EXISTS shop_prices (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  haircut_type TEXT NOT NULL,
  price_eur REAL DEFAULT 0,
  UNIQUE(shop_id, haircut_type)
);
CREATE TABLE IF NOT EXISTS day_overrides (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  capacity INTEGER,
  open_hour INTEGER,
  close_hour INTEGER,
  blocked INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  UNIQUE(barber_id, date)
);
CREATE TABLE IF NOT EXISTS hour_overrides (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  capacity INTEGER,
  blocked INTEGER DEFAULT 0,
  UNIQUE(barber_id, date, hour)
);
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  haircut_type TEXT DEFAULT '',
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  reminder_sent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_appt_barber_date ON appointments(barber_id, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_barber_shop ON barbers(shop_id);
`;

const SQLITE_SCHEMA = `
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
  admin_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  subscription_status TEXT DEFAULT 'trial',
  subscription_period_end TEXT DEFAULT '',
  monthly_per_barber_eur INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  billing_notes TEXT DEFAULT '',
  two_factor_enabled INTEGER DEFAULT 0,
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
  avg_minutes INTEGER DEFAULT 30,
  open_hour INTEGER DEFAULT 9,
  close_hour INTEGER DEFAULT 20,
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
CREATE INDEX IF NOT EXISTS idx_appt_barber_date ON appointments(barber_id, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(customer_phone);
CREATE INDEX IF NOT EXISTS idx_barber_shop ON barbers(shop_id);
`;

let initPromise = null;
async function init() {
  await db.exec(USE_PG ? PG_SCHEMA : SQLITE_SCHEMA);
  await seedIfEmpty();
}
function ensureInit() {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function seedIfEmpty() {
  const r = await db.get(`SELECT COUNT(*) AS n FROM shops`);
  const n = Number(r.n || r.count || 0);
  if (n > 0) return;
  // Demo shop, μη χρειάζεται για production όπου ο creator καταχωρεί shops
  if (USE_PG) {
    await db.exec(`
      INSERT INTO shops (slug, name, address, phone) VALUES ('demo', 'Demo Barbershop', 'Ερμού 10', '210 1234567');
    `);
    const shop = await db.get(`SELECT id FROM shops WHERE slug = 'demo'`);
    await db.run(`INSERT INTO barbers (shop_id, slug, name, default_capacity, avg_minutes, open_hour, close_hour, sort_order)
      VALUES (?, 'demo-barber', 'Demo', 2, 30, 9, 20, 1)`, [shop.id]);
  } else {
    await db.run(`INSERT INTO shops (slug, name, address, phone) VALUES (?, ?, ?, ?)`,
      ['demo', 'Demo Barbershop', 'Ερμού 10', '210 1234567']);
    const shop = await db.get(`SELECT id FROM shops WHERE slug = 'demo'`);
    await db.run(`INSERT INTO barbers (shop_id, slug, name, default_capacity, avg_minutes, open_hour, close_hour, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [shop.id, 'demo-barber', 'Demo', 2, 30, 9, 20, 1]);
  }
  console.log('[db] Seeded demo shop');
}

// ============================================================
//                  HELPER: boolean for SQLite
// ============================================================
const B = (v) => USE_PG ? !!v : (v ? 1 : 0);  // booleans → 1/0 σε SQLite, true/false σε pg

// ============================================================
//                       PUBLIC API
// ============================================================

// Shops
async function listShops() { await ensureInit(); return db.all(`SELECT * FROM shops ORDER BY name`); }
async function getShopBySlug(slug) { await ensureInit(); return db.get(`SELECT * FROM shops WHERE slug = ?`, [slug]); }
async function getShopById(id) { await ensureInit(); return db.get(`SELECT * FROM shops WHERE id = ?`, [id]); }
async function createShop(s) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO shops (slug, name, address, phone, photo, google_place_id, google_maps_url, admin_password_hash) VALUES (?,?,?,?,?,?,?,?) RETURNING id`
    : `INSERT INTO shops (slug, name, address, phone, photo, google_place_id, google_maps_url, admin_password_hash) VALUES (?,?,?,?,?,?,?,?)`;
  const r = await db.run(sql, [
    s.slug, s.name, s.address || '', s.phone || '', s.photo || '',
    s.google_place_id || '', s.google_maps_url || '', s.admin_password_hash || '',
  ]);
  return { lastInsertRowid: r.lastInsertRowid };
}
async function updateShop(id, s) {
  await ensureInit();
  await db.run(`UPDATE shops SET slug=?, name=?, address=?, phone=?, photo=?, google_place_id=?, google_maps_url=? WHERE id=?`,
    [s.slug, s.name, s.address || '', s.phone || '', s.photo || '', s.google_place_id || '', s.google_maps_url || '', id]);
}
async function deleteShop(id) { await ensureInit(); await db.run(`DELETE FROM shops WHERE id = ?`, [id]); }
async function setShopPassword(id, hash) { await ensureInit(); await db.run(`UPDATE shops SET admin_password_hash = ? WHERE id = ?`, [hash, id]); }

async function updateShopSubscription(id, fields) {
  await ensureInit();
  const sql = `UPDATE shops SET
    subscription_status = COALESCE(?, subscription_status),
    subscription_period_end = COALESCE(?, subscription_period_end),
    monthly_per_barber_eur = COALESCE(?, monthly_per_barber_eur),
    is_active = COALESCE(?, is_active),
    billing_notes = COALESCE(?, billing_notes),
    contact_email = COALESCE(?, contact_email),
    admin_phone = COALESCE(?, admin_phone),
    two_factor_enabled = COALESCE(?, two_factor_enabled)
   WHERE id = ?`;
  await db.run(sql, [
    fields.subscription_status ?? null,
    fields.subscription_period_end ?? null,
    fields.monthly_per_barber_eur ?? null,
    fields.is_active != null ? B(fields.is_active) : null,
    fields.billing_notes ?? null,
    fields.contact_email ?? null,
    fields.admin_phone ?? null,
    fields.two_factor_enabled != null ? B(fields.two_factor_enabled) : null,
    id,
  ]);
}

async function findShopByPhone(phone) { await ensureInit(); return db.get(`SELECT * FROM shops WHERE admin_phone = ? LIMIT 1`, [phone]); }

// Barbers
async function listBarbersByShop(shopId, includeInactive = false) {
  await ensureInit();
  const sql = includeInactive
    ? `SELECT * FROM barbers WHERE shop_id = ? ORDER BY sort_order, name`
    : `SELECT * FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY sort_order, name`;
  return db.all(sql, [shopId]);
}
async function listBarbersByShopSlug(slug) {
  await ensureInit();
  return db.all(`SELECT b.* FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = ? AND b.active = 1 ORDER BY b.sort_order, b.name`, [slug]);
}
async function getBarberById(id) { await ensureInit(); return db.get(`SELECT * FROM barbers WHERE id = ?`, [id]); }
async function getBarberBySlug(shopSlug, barberSlug) {
  await ensureInit();
  return db.get(`SELECT b.* FROM barbers b JOIN shops s ON s.id = b.shop_id WHERE s.slug = ? AND b.slug = ?`, [shopSlug, barberSlug]);
}
async function createBarber(b) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO barbers (shop_id, slug, name, photo, bio, default_capacity, avg_minutes, open_hour, close_hour, weekly_schedule, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`
    : `INSERT INTO barbers (shop_id, slug, name, photo, bio, default_capacity, avg_minutes, open_hour, close_hour, weekly_schedule, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
  const r = await db.run(sql, [
    b.shop_id, b.slug, b.name, b.photo || '', b.bio || '',
    b.default_capacity ?? 2, b.avg_minutes ?? 30,
    b.open_hour ?? 9, b.close_hour ?? 20, b.weekly_schedule || '', b.sort_order ?? 0,
  ]);
  return { lastInsertRowid: r.lastInsertRowid };
}
async function updateBarber(id, b) {
  await ensureInit();
  const cur = await db.get(`SELECT * FROM barbers WHERE id = ?`, [id]);
  if (!cur) return;
  await db.run(`UPDATE barbers SET slug=?, name=?, photo=?, bio=?, default_capacity=?, avg_minutes=?, open_hour=?, close_hour=?, weekly_schedule=?, sort_order=?, active=? WHERE id=?`,
    [
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
      b.active != null ? B(b.active) : cur.active,
      id,
    ]);
}
async function deleteBarber(id) { await ensureInit(); await db.run(`DELETE FROM barbers WHERE id = ?`, [id]); }

// Day/Hour overrides
async function getDayOverride(barberId, date) {
  await ensureInit();
  return db.get(`SELECT * FROM day_overrides WHERE barber_id = ? AND date = ?`, [barberId, date]);
}
async function upsertDayOverride(barberId, date, o) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO day_overrides (barber_id, date, capacity, open_hour, close_hour, blocked, note)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (barber_id, date) DO UPDATE SET capacity=EXCLUDED.capacity, open_hour=EXCLUDED.open_hour, close_hour=EXCLUDED.close_hour, blocked=EXCLUDED.blocked, note=EXCLUDED.note`
    : `INSERT INTO day_overrides (barber_id, date, capacity, open_hour, close_hour, blocked, note)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(barber_id, date) DO UPDATE SET capacity=excluded.capacity, open_hour=excluded.open_hour, close_hour=excluded.close_hour, blocked=excluded.blocked, note=excluded.note`;
  await db.run(sql, [barberId, date, o.capacity ?? null, o.open_hour ?? null, o.close_hour ?? null, B(o.blocked), o.note || '']);
}
async function listDayOverrides(barberId, fromDate) {
  await ensureInit();
  return db.all(`SELECT * FROM day_overrides WHERE barber_id = ? AND date >= ? ORDER BY date`, [barberId, fromDate]);
}
async function deleteDayOverride(barberId, date) {
  await ensureInit();
  await db.run(`DELETE FROM day_overrides WHERE barber_id = ? AND date = ?`, [barberId, date]);
}

async function listHourOverrides(barberId, date) {
  await ensureInit();
  return db.all(`SELECT * FROM hour_overrides WHERE barber_id = ? AND date = ?`, [barberId, date]);
}
async function upsertHourOverride(barberId, date, hour, o) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO hour_overrides (barber_id, date, hour, capacity, blocked) VALUES (?,?,?,?,?)
       ON CONFLICT (barber_id, date, hour) DO UPDATE SET capacity=EXCLUDED.capacity, blocked=EXCLUDED.blocked`
    : `INSERT INTO hour_overrides (barber_id, date, hour, capacity, blocked) VALUES (?,?,?,?,?)
       ON CONFLICT(barber_id, date, hour) DO UPDATE SET capacity=excluded.capacity, blocked=excluded.blocked`;
  await db.run(sql, [barberId, date, hour, o.capacity ?? null, B(o.blocked)]);
}
async function deleteHourOverride(barberId, date, hour) {
  await ensureInit();
  await db.run(`DELETE FROM hour_overrides WHERE barber_id = ? AND date = ? AND hour = ?`, [barberId, date, hour]);
}

// Appointments
async function createAppointmentRequest(a) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO appointments (barber_id, customer_name, customer_phone, customer_email, haircut_type, appointment_date, appointment_time, notes, status)
       VALUES (?,?,?,?,?,?,?,?, 'pending') RETURNING id`
    : `INSERT INTO appointments (barber_id, customer_name, customer_phone, customer_email, haircut_type, appointment_date, appointment_time, notes, status)
       VALUES (?,?,?,?,?,?,?,?, 'pending')`;
  const r = await db.run(sql, [a.barber_id, a.customer_name, a.customer_phone, a.customer_email || '', a.haircut_type || '', a.appointment_date, a.appointment_time, a.notes || '']);
  return db.get(`SELECT * FROM appointments WHERE id = ?`, [r.lastInsertRowid]);
}
async function getAppointment(id) { await ensureInit(); return db.get(`SELECT * FROM appointments WHERE id = ?`, [id]); }
async function setAppointmentStatus(id, status) {
  await ensureInit();
  await db.run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, id]);
  return db.get(`SELECT * FROM appointments WHERE id = ?`, [id]);
}
async function updateAppointment(id, a) {
  await ensureInit();
  await db.run(`UPDATE appointments SET customer_name=?, customer_phone=?, customer_email=?, appointment_date=?, appointment_time=?, notes=?, reminder_sent=0 WHERE id=?`,
    [a.customer_name, a.customer_phone, a.customer_email || '', a.appointment_date, a.appointment_time, a.notes || '', id]);
  return db.get(`SELECT * FROM appointments WHERE id = ?`, [id]);
}
async function listAppointmentsByBarberDate(barberId, date) {
  await ensureInit();
  return db.all(`SELECT * FROM appointments WHERE barber_id = ? AND appointment_date = ? AND status IN ('pending','confirmed') ORDER BY appointment_time`, [barberId, date]);
}
async function listConfirmedByBarberDate(barberId, date) {
  await ensureInit();
  return db.all(`SELECT * FROM appointments WHERE barber_id = ? AND appointment_date = ? AND status = 'confirmed' ORDER BY appointment_time`, [barberId, date]);
}
async function countConfirmedByHour(barberId, date) {
  await ensureInit();
  const rows = await db.all(`SELECT substr(appointment_time, 1, 2) AS hh, COUNT(*) AS n FROM appointments WHERE barber_id = ? AND appointment_date = ? AND status = 'confirmed' GROUP BY substr(appointment_time, 1, 2)`, [barberId, date]);
  const map = {}; for (const r of rows) map[r.hh] = Number(r.n);
  return map;
}
async function countPendingByHour(barberId, date) {
  await ensureInit();
  const rows = await db.all(`SELECT substr(appointment_time, 1, 2) AS hh, COUNT(*) AS n FROM appointments WHERE barber_id = ? AND appointment_date = ? AND status = 'pending' GROUP BY substr(appointment_time, 1, 2)`, [barberId, date]);
  const map = {}; for (const r of rows) map[r.hh] = Number(r.n);
  return map;
}
async function listUpcomingForShop(shopId) {
  await ensureInit();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5);
  return db.all(`
    SELECT a.*, b.name AS barber_name, b.slug AS barber_slug
    FROM appointments a JOIN barbers b ON b.id = a.barber_id
    WHERE b.shop_id = ? AND a.status IN ('pending','confirmed')
      AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= ?))
    ORDER BY a.appointment_date, a.appointment_time`, [shopId, today, today, hhmm]);
}
async function listByShopAndDate(shopId, date) {
  await ensureInit();
  return db.all(`
    SELECT a.*, b.name AS barber_name, b.slug AS barber_slug
    FROM appointments a JOIN barbers b ON b.id = a.barber_id
    WHERE b.shop_id = ? AND a.appointment_date = ? AND a.status IN ('pending','confirmed')
    ORDER BY a.appointment_time, b.sort_order`, [shopId, date]);
}
async function findDueForReminder() {
  await ensureInit();
  return db.all(`SELECT * FROM appointments WHERE status='confirmed' AND reminder_sent = 0`);
}
async function markReminderSent(id) {
  await ensureInit();
  await db.run(`UPDATE appointments SET reminder_sent = 1 WHERE id = ?`, [id]);
}

// Customer history
async function getCustomerHistory(shopId, phone) {
  await ensureInit();
  const rows = await db.all(`
    SELECT a.*, b.name AS barber_name, b.shop_id, sp.price_eur
    FROM appointments a
    JOIN barbers b ON b.id = a.barber_id
    LEFT JOIN shop_prices sp ON sp.shop_id = b.shop_id AND sp.haircut_type = a.haircut_type
    WHERE a.customer_phone = ? AND b.shop_id = ?
    ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [phone, shopId]);
  const today = new Date().toISOString().slice(0,10);
  const completed = rows.filter(r => r.status === 'confirmed' && r.appointment_date < today);
  const upcoming = rows.filter(r => r.status === 'confirmed' && r.appointment_date >= today);
  const totalSpend = completed.reduce((s, r) => s + (Number(r.price_eur) || 0), 0);
  return { all: rows, completed, upcoming, totalSpend, visitsCompleted: completed.length };
}

// Prices
async function listShopPrices(shopId) { await ensureInit(); return db.all(`SELECT * FROM shop_prices WHERE shop_id = ?`, [shopId]); }
async function upsertShopPrice(shopId, haircutType, priceEur) {
  await ensureInit();
  const sql = USE_PG
    ? `INSERT INTO shop_prices (shop_id, haircut_type, price_eur) VALUES (?,?,?) ON CONFLICT (shop_id, haircut_type) DO UPDATE SET price_eur=EXCLUDED.price_eur`
    : `INSERT INTO shop_prices (shop_id, haircut_type, price_eur) VALUES (?,?,?) ON CONFLICT(shop_id, haircut_type) DO UPDATE SET price_eur=excluded.price_eur`;
  await db.run(sql, [shopId, haircutType, priceEur]);
}

// Stats / creator summary
async function shopStats(shopId) {
  await ensureInit();
  const today = new Date().toISOString().slice(0, 10);
  const r1 = await db.get(`SELECT COUNT(*) AS n FROM barbers WHERE shop_id = ? AND active = 1`, [shopId]);
  const r2 = await db.get(`SELECT COUNT(*) AS n FROM barbers WHERE shop_id = ?`, [shopId]);
  const r3 = await db.get(`SELECT COUNT(*) AS n FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE b.shop_id = ? AND a.status IN ('pending','confirmed') AND a.appointment_date >= ?`, [shopId, today]);
  const r4 = await db.get(`SELECT COUNT(*) AS n FROM appointments a JOIN barbers b ON b.id = a.barber_id WHERE b.shop_id = ?`, [shopId]);
  return {
    activeBarbers: Number(r1.n),
    totalBarbers: Number(r2.n),
    upcomingAppts: Number(r3.n),
    allTimeAppts: Number(r4.n),
  };
}
async function creatorSummary() {
  await ensureInit();
  const shops = await listShops();
  const enriched = await Promise.all(shops.map(async s => ({ ...s, stats: await shopStats(s.id) })));
  const activeShops = enriched.filter(s => s.is_active && s.subscription_status === 'active').length;
  const activeBarbers = enriched.filter(s => s.is_active).reduce((sum, s) => sum + s.stats.activeBarbers, 0);
  const monthlyRevenue = enriched.filter(s => s.is_active && s.subscription_status === 'active')
    .reduce((sum, s) => sum + s.stats.activeBarbers * (s.monthly_per_barber_eur || 0), 0);
  return {
    shops: enriched,
    totals: { shops: enriched.length, activeShops, barbers: activeBarbers, monthlyRevenue },
  };
}

module.exports = {
  // shops
  listShops, getShopBySlug, getShopById, createShop, updateShop, deleteShop, setShopPassword,
  updateShopSubscription, shopStats, creatorSummary, findShopByPhone,
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
  // internal
  _ensureInit: ensureInit,
};
