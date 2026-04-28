// Authentication: bcrypt για passwords, JWT για sessions, per-shop όχι global
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET δεν είναι set - χρησιμοποιώ random. Σε production βάλτε σταθερό στο .env για να μη γίνονται invalidate τα sessions σε restart.');
}

const SUPER_ADMIN_PWD_HASH = process.env.SUPER_ADMIN_PASSWORD_HASH || null;
const SUPER_ADMIN_PWD = process.env.SUPER_ADMIN_PASSWORD || null;

function hashPassword(password) {
  return bcrypt.hashSync(String(password), 12);
}
function verifyPassword(password, hash) {
  if (!hash) return false;
  try { return bcrypt.compareSync(String(password), hash); } catch (_) { return false; }
}

function signToken(payload, expiresIn = '7d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}

// Verify super admin (marketplace owner)
function verifySuperAdmin(password) {
  if (SUPER_ADMIN_PWD_HASH) return verifyPassword(password, SUPER_ADMIN_PWD_HASH);
  if (SUPER_ADMIN_PWD) return password === SUPER_ADMIN_PWD;
  return false;
}

module.exports = {
  hashPassword, verifyPassword,
  signToken, verifyToken,
  verifySuperAdmin,
  hasSuperAdmin: () => !!(SUPER_ADMIN_PWD_HASH || SUPER_ADMIN_PWD),
};
