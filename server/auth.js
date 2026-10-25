import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, one, run } from './db.js';

const secretFile = path.join(DATA_DIR, 'secret.key');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

export const DEFAULT_PASSWORD = '123456';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, got);
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

export function makeToken(payload, hours = 12) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + hours * 3600e3 }));
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}

export const PUBLIC_USER_FIELDS = 'id, username, peran, nama, npsn, kelas, sesi, jk, nik, tgl_lahir, nip, aktif, bisa_monitor, terkunci, last_active, created_at';

/** Resolve the request's acting user; throws {status} on failure. */
export function authenticate(req, queryToken) {
  const h = req.headers.authorization || '';
  const p = readToken(h.startsWith('Bearer ') ? h.slice(7) : queryToken || '');
  if (!p) throw httpError(401, 'Sesi berakhir, silakan masuk lagi.');
  const user = one(`SELECT ${PUBLIC_USER_FIELDS}, sesi_login FROM pengguna WHERE id = ?`, p.uid);
  if (!user || !user.aktif) throw httpError(401, 'Akun tidak aktif.');
  // satu perangkat per siswa (tidak berlaku saat superadmin sedang menyamar)
  if (user.peran === 'siswa' && !p.imp && user.sesi_login !== p.sid) {
    throw httpError(401, user.sesi_login ? 'Akun ini dipakai di perangkat lain. Minta proktor mereset login.' : 'Kamu sudah dikeluarkan dari ujian. Minta admin sekolah mereset login.');
  }
  let impersonator = null;
  if (p.imp) {
    impersonator = one(`SELECT id, username, nama, peran FROM pengguna WHERE id = ? AND peran = 'superadmin' AND aktif = 1`, p.imp);
    if (!impersonator) throw httpError(401, 'Sesi penyamaran tidak valid.');
  }
  delete user.sesi_login;
  if (user.peran === 'siswa' && !p.imp) run('UPDATE pengguna SET last_active = ? WHERE id = ?', Date.now(), user.id);
  return { user, impersonator, token: p };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function requireRole(ctx, ...roles) {
  if (!roles.includes(ctx.user.peran)) throw httpError(403, 'Anda tidak punya akses ke fitur ini.');
}

// sederhana: batasi percobaan login per IP+username
const attempts = new Map();
export function checkRateLimit(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < 5 * 60e3);
  if (a.length >= 10) throw httpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 5 menit.');
  a.push(now);
  attempts.set(key, a);
}
export const clearRateLimit = (key) => attempts.delete(key);
