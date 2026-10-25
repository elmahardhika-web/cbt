import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, one, run } from './db.js';
import { catatLaju, hapusLaju } from './redis.js';

// beberapa instans aplikasi harus memakai kunci yang sama: utamakan variabel APP_SECRET
const secretFile = path.join(DATA_DIR, 'secret.key');
if (!process.env.APP_SECRET && !fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
const SECRET = process.env.APP_SECRET || fs.readFileSync(secretFile, 'utf8').trim();

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
/** Versi async agar login massal (ratusan siswa sekaligus) tidak menahan proses. */
export function verifyPasswordAsync(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !h) return Promise.resolve(false);
  const expected = Buffer.from(h, 'base64');
  return new Promise((res) => crypto.scrypt(String(pw), Buffer.from(s, 'base64'), expected.length, (e, got) => res(!e && crypto.timingSafeEqual(expected, got))));
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
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

export const PUBLIC_USER_FIELDS = 'id, username, peran, nama, npsn, kelas, sesi, jk, nik, tgl_lahir, nip, aktif, bisa_monitor, terkunci, last_active, created_at';

/** Resolve the request's acting user; throws {status} on failure. */
export async function authenticate(req, queryToken) {
  const h = req.headers.authorization || '';
  const p = readToken(h.startsWith('Bearer ') ? h.slice(7) : queryToken || '');
  if (!p) throw httpError(401, 'Sesi berakhir, silakan masuk lagi.');
  const user = await one(`SELECT ${PUBLIC_USER_FIELDS}, sesi_login FROM pengguna WHERE id = ?`, p.uid);
  if (!user || !user.aktif || user.peran === 'supervisor') throw httpError(401, 'Akun tidak aktif.');
  // satu perangkat per siswa (tidak berlaku saat superadmin sedang menyamar)
  if (user.peran === 'siswa' && !p.imp && user.sesi_login !== p.sid) {
    throw httpError(401, user.sesi_login ? 'Akun ini dipakai di perangkat lain. Minta proktor mereset login.' : 'Kamu sudah dikeluarkan dari ujian. Minta admin sekolah mereset login.');
  }
  let impersonator = null;
  if (p.imp) {
    impersonator = await one(`SELECT id, username, nama, peran FROM pengguna WHERE id = ? AND peran = 'superadmin' AND aktif = 1`, p.imp);
    if (!impersonator) throw httpError(401, 'Sesi penyamaran tidak valid.');
  }
  delete user.sesi_login;
  // detak siswa ditulis paling sering tiap 10 detik agar database tidak dibanjiri
  if (user.peran === 'siswa' && !p.imp && !(user.last_active > Date.now() - 10e3)) await run('UPDATE pengguna SET last_active = ? WHERE id = ?', Date.now(), user.id);
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

// batasi percobaan login per IP+username (dibagi antar-instans lewat Redis)
export async function checkRateLimit(key, maks = Number(process.env.RL_LOGIN || 10), detik = 300) {
  const r = await catatLaju(`login:${key}`, maks, detik);
  if (!r.izin) throw httpError(429, `Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.max(1, Math.ceil(r.ulangDalam / 60))} menit.`);
}
export const clearRateLimit = (key) => hapusLaju(`login:${key}`);
