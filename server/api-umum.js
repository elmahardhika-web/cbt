import crypto from 'node:crypto';
import { route } from './router.js';
import { all, one, run, tx, setting, setSetting } from './db.js';
import {
  hashPassword, verifyPassword, makeToken, httpError, requireRole, checkRateLimit, clearRateLimit,
  DEFAULT_PASSWORD, PUBLIC_USER_FIELDS,
} from './auth.js';
import { int, str, scopeNpsn, assertSekolahAccess, now, kkm, audit, jeda } from './util.js';
import { TAMPILAN_BAWAAN, LATAR } from './tampilan.js';
import { notify } from './events.js';
import { hapusDataDemo, buatDataDemo } from './seed.js';

const PERAN = ['superadmin', 'supervisor', 'admin', 'guru', 'siswa'];
const ONLINE_MS = 45e3;

function info() {
  return {
    nama_aplikasi: setting('nama_aplikasi', 'TKA SD 2026'),
    nama_instansi: setting('nama_instansi', '[Nama Instansi]'),
    tahun_ajaran: setting('tahun_ajaran', '2025/2026'),
    target_capaian: kkm(),
    tampilan: { ...TAMPILAN_BAWAAN, ...setting('tampilan', {}) },
    helpdesk: setting('helpdesk', []),
    dokumen: setting('dokumen', []),
  };
}

function sesiUser(u, impersonator) {
  const sekolah = u.npsn ? one('SELECT * FROM sekolah WHERE npsn = ?', u.npsn) : null;
  return { user: u, sekolah, impersonator };
}

// ---------- publik ----------
route('GET', '/api/public/info', () => info(), { public: true });

// sebaran sekolah pengguna untuk peta di halaman depan (hanya identitas sekolah, tanpa data siswa)
route('GET', '/api/public/sebaran', () => {
  const sekolah = all(`SELECT s.npsn, s.nama, s.provinsi_kode, s.provinsi, s.kabkota_kode, s.kabkota, s.kecamatan, s.kelurahan, s.lat, s.lng, s.is_demo AS demo,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'siswa') AS siswa
    FROM sekolah s ORDER BY s.provinsi, s.kabkota, s.nama`);
  return {
    sekolah,
    ringkasan: { sekolah: sekolah.length, provinsi: new Set(sekolah.map((x) => x.provinsi_kode).filter(Boolean)).size,
      kabkota: new Set(sekolah.map((x) => x.kabkota_kode).filter(Boolean)).size, siswa: sekolah.reduce((a, x) => a + x.siswa, 0) },
  };
}, { public: true });

route('POST', '/api/login', (ctx) => {
  const username = str(ctx.body.username);
  const password = String(ctx.body.password ?? '');
  const key = `${ctx.ip}|${username.toLowerCase()}`;
  checkRateLimit(key);
  const u = one('SELECT * FROM pengguna WHERE username = ?', username);
  if (!u || !verifyPassword(password, u.password_hash)) throw httpError(401, 'Username atau password salah.');
  if (!u.aktif) throw httpError(403, 'Akun dinonaktifkan. Hubungi admin sekolah.');
  if (u.npsn) {
    const s = one('SELECT aktif FROM sekolah WHERE npsn = ?', u.npsn);
    if (s && !s.aktif) throw httpError(403, 'Sekolah sedang dinonaktifkan oleh pusat.');
  }
  clearRateLimit(key);
  let sid = null;
  if (u.peran === 'siswa' && u.terkunci) {
    throw httpError(423, 'Akun dikunci karena ada upaya keluar dari ujian. Minta admin sekolah mereset login.');
  }
  if (u.peran === 'siswa') {
    if (u.sesi_login && u.last_active && now() - u.last_active < ONLINE_MS && !ctx.body.paksa) {
      throw httpError(409, 'Akun ini sedang aktif di perangkat lain. Minta proktor mereset login.');
    }
    sid = crypto.randomBytes(12).toString('hex');
    run('UPDATE pengguna SET sesi_login = ?, last_active = ? WHERE id = ?', sid, now(), u.id);
    notify(u.npsn);
  }
  const user = one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, u.id);
  audit('login', u.username, u.peran, ctx.ip);
  return { token: makeToken({ uid: u.id, sid }, u.peran === 'siswa' ? 8 : 12), ...sesiUser(user, null) };
}, { public: true });

route('GET', '/api/me', (ctx) => sesiUser(ctx.user, ctx.impersonator));

route('POST', '/api/logout', (ctx) => {
  if (ctx.user.peran === 'siswa' && !ctx.impersonator) {
    run('UPDATE pengguna SET sesi_login = NULL WHERE id = ?', ctx.user.id);
    // waktu ujian yang sedang berjalan ikut dijeda
    all(`SELECT id FROM peserta_ujian WHERE siswa_id = ? AND status = 'mengerjakan'`, ctx.user.id).forEach((p) => jeda(p.id));
    notify(ctx.user.npsn);
  }
  return true;
});

route('PUT', '/api/akun/password', (ctx) => {
  if (ctx.impersonator) throw httpError(400, 'Tidak bisa mengganti password saat mode samaran.');
  const u = one('SELECT password_hash FROM pengguna WHERE id = ?', ctx.user.id);
  if (!verifyPassword(ctx.body.lama ?? '', u.password_hash)) throw httpError(400, 'Password lama salah.');
  const baru = String(ctx.body.baru ?? '');
  if (baru.length < 6) throw httpError(400, 'Password baru minimal 6 karakter.');
  run('UPDATE pengguna SET password_hash = ?, password_awal = NULL WHERE id = ?', hashPassword(baru), ctx.user.id);
  return true;
});

// ---------- samaran (superadmin berpindah peran) ----------
function realSuperadmin(ctx) {
  const su = ctx.impersonator || ctx.user;
  if (su.peran !== 'superadmin') throw httpError(403, 'Hanya superadmin yang bisa berpindah peran.');
  return su;
}

route('GET', '/api/samaran/kandidat', (ctx) => {
  realSuperadmin(ctx);
  const peran = str(ctx.query.peran);
  if (!PERAN.includes(peran) || peran === 'superadmin') throw httpError(400, 'Peran tidak valid.');
  const q = `%${str(ctx.query.q)}%`;
  const npsn = str(ctx.query.npsn);
  return all(`SELECT p.id, p.username, p.nama, p.peran, p.kelas, p.sesi, p.npsn, s.nama AS sekolah
    FROM pengguna p LEFT JOIN sekolah s ON s.npsn = p.npsn
    WHERE p.peran = ? AND p.aktif = 1 AND (? = '' OR p.npsn = ?) AND (p.nama LIKE ? OR p.username LIKE ?)
    ORDER BY s.nama, p.kelas, p.nama LIMIT 60`, peran, npsn, npsn, q, q);
});

route('POST', '/api/samaran', (ctx) => {
  const su = realSuperadmin(ctx);
  const target = one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, int(ctx.body.user_id));
  if (!target || target.peran === 'superadmin') throw httpError(400, 'Pengguna tidak ditemukan.');
  audit('samaran', su.username, '->', target.username, target.peran);
  return { token: makeToken({ uid: target.id, imp: su.id }, 4), ...sesiUser(target, su) };
});

route('POST', '/api/samaran/selesai', (ctx) => {
  const su = realSuperadmin(ctx);
  const user = one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, su.id);
  return { token: makeToken({ uid: su.id }), ...sesiUser(user, null) };
});

// ---------- pengaturan ----------
route('GET', '/api/pengaturan', (ctx) => { requireRole(ctx, 'superadmin'); return info(); });
route('PUT', '/api/pengaturan', (ctx) => {
  requireRole(ctx, 'superadmin');
  const b = ctx.body;
  if (b.nama_aplikasi !== undefined) setSetting('nama_aplikasi', str(b.nama_aplikasi) || 'TKA SD 2026');
  if (b.nama_instansi !== undefined) setSetting('nama_instansi', str(b.nama_instansi));
  if (b.tahun_ajaran !== undefined) setSetting('tahun_ajaran', str(b.tahun_ajaran));
  if (b.target_capaian !== undefined) setSetting('target_capaian', Math.min(100, Math.max(0, Number(b.target_capaian) || 70)));
  if (b.tampilan && typeof b.tampilan === 'object') {
    const t = b.tampilan;
    const url = (v) => (v && /^(\/uploads\/|\/img\/)[\w./-]+$/.test(v) ? v : null);
    setSetting('tampilan', {
      latar: LATAR.includes(t.latar) ? t.latar : 'bawaan',
      latar_url: url(t.latar_url), login_url: url(t.login_url), logo_url: url(t.logo_url),
    });
  }
  if (Array.isArray(b.helpdesk)) setSetting('helpdesk', b.helpdesk.map((h) => ({ nama: str(h.nama), kontak: str(h.kontak) })).filter((h) => h.nama));
  if (Array.isArray(b.dokumen)) setSetting('dokumen', b.dokumen.map((h) => ({ nama: str(h.nama), keterangan: str(h.keterangan), url: str(h.url) })).filter((h) => h.nama && h.url));
  return info();
});
route('GET', '/api/demo', (ctx) => { requireRole(ctx, 'superadmin'); return { ada: !!one('SELECT 1 FROM sekolah WHERE is_demo = 1') }; });
route('POST', '/api/demo/hapus', (ctx) => { requireRole(ctx, 'superadmin'); return hapusDataDemo(); });
route('POST', '/api/demo/buat', (ctx) => { requireRole(ctx, 'superadmin'); return buatDataDemo(); });

// ---------- master mapel & kategori ----------
for (const [tabel, label] of [['mapel', 'Mata pelajaran'], ['kategori', 'Kategori']]) {
  route('GET', `/api/${tabel}`, () => all(`SELECT * FROM ${tabel} ORDER BY urutan, nama`));
  route('POST', `/api/${tabel}`, (ctx) => {
    requireRole(ctx, 'superadmin');
    const kode = str(ctx.body.kode).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nama = str(ctx.body.nama);
    if (!kode || !nama) throw httpError(400, 'Kode dan nama wajib diisi.');
    if (one(`SELECT 1 FROM ${tabel} WHERE kode = ?`, kode)) throw httpError(400, `${label} dengan kode ${kode} sudah ada.`);
    run(`INSERT INTO ${tabel} (kode, nama, aktif, urutan) VALUES (?, ?, ?, ?)`, kode, nama, ctx.body.aktif === false ? 0 : 1, int(ctx.body.urutan, 0));
    return one(`SELECT * FROM ${tabel} WHERE kode = ?`, kode);
  });
  route('PUT', `/api/${tabel}/:kode`, (ctx) => {
    requireRole(ctx, 'superadmin');
    const r = one(`SELECT * FROM ${tabel} WHERE kode = ?`, ctx.params.kode);
    if (!r) throw httpError(404, `${label} tidak ditemukan.`);
    run(`UPDATE ${tabel} SET nama = ?, aktif = ?, urutan = ? WHERE kode = ?`,
      str(ctx.body.nama) || r.nama, ctx.body.aktif === undefined ? r.aktif : ctx.body.aktif ? 1 : 0, int(ctx.body.urutan, r.urutan), r.kode);
    return one(`SELECT * FROM ${tabel} WHERE kode = ?`, r.kode);
  });
  route('DELETE', `/api/${tabel}/:kode`, (ctx) => {
    requireRole(ctx, 'superadmin');
    const col = tabel === 'mapel' ? 'mapel' : 'kategori';
    if (one(`SELECT 1 FROM soal WHERE ${col} = ? UNION SELECT 1 FROM ujian WHERE ${col} = ?`, ctx.params.kode, ctx.params.kode)) {
      throw httpError(400, `${label} masih dipakai soal atau ujian. Nonaktifkan saja.`);
    }
    run(`DELETE FROM ${tabel} WHERE kode = ?`, ctx.params.kode);
    return true;
  });
}

// ---------- wilayah lokal (kecamatan/kelurahan diketik sekolah) ----------
route('GET', '/api/wilayah/kecamatan', (ctx) =>
  all(`SELECT DISTINCT kecamatan AS nama FROM wilayah_lokal WHERE kabkota_kode = ? ORDER BY kecamatan`, str(ctx.query.kabkota)).map((r) => r.nama), { public: true });
route('GET', '/api/wilayah/kelurahan', (ctx) =>
  all(`SELECT kelurahan AS nama FROM wilayah_lokal WHERE kabkota_kode = ? AND kecamatan = ? AND kelurahan <> '' ORDER BY kelurahan`,
    str(ctx.query.kabkota), str(ctx.query.kecamatan)).map((r) => r.nama), { public: true });

const titleCase = (s) => str(s).replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export function simpanWilayahLokal(s) {
  if (!s.kabkota_kode || !s.kecamatan) return;
  run(`INSERT OR IGNORE INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, '')`, s.kabkota_kode, s.kecamatan);
  if (s.kelurahan) run(`INSERT OR IGNORE INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, ?)`, s.kabkota_kode, s.kecamatan, s.kelurahan);
}

// ---------- sekolah ----------
export const SEKOLAH_FIELDS = ['nama', 'provinsi_kode', 'provinsi', 'kabkota_kode', 'kabkota', 'kecamatan', 'kelurahan', 'alamat', 'kepala_sekolah', 'nip_kepsek', 'logo_url', 'ttd_url', 'target_capaian', 'lat', 'lng'];

export function bersihkanSekolah(b) {
  const s = Object.fromEntries(SEKOLAH_FIELDS.map((f) => [f, str(b[f])]));
  s.kecamatan = titleCase(s.kecamatan);
  s.kelurahan = titleCase(s.kelurahan);
  for (const f of ['logo_url', 'ttd_url']) s[f] = /^\/uploads\/[\w.-]+$/.test(s[f]) ? s[f] : null;
  const t = Number(b.target_capaian);
  s.target_capaian = b.target_capaian === '' || b.target_capaian == null || isNaN(t) ? null : Math.min(100, Math.max(0, t));
  // koordinat hanya diterima bila berada di wilayah Indonesia
  const lat = parseFloat(b.lat), lng = parseFloat(b.lng);
  const sah = !isNaN(lat) && !isNaN(lng) && lat >= -11.5 && lat <= 6.5 && lng >= 94 && lng <= 141.5;
  s.lat = sah ? Math.round(lat * 1e6) / 1e6 : null;
  s.lng = sah ? Math.round(lng * 1e6) / 1e6 : null;
  return s;
}

route('GET', '/api/sekolah', (ctx) => {
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  return all(`SELECT s.*,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'siswa') AS jml_siswa,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'guru') AS jml_guru,
      (SELECT GROUP_CONCAT(username, ', ') FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'admin') AS admin,
      (SELECT COUNT(*) FROM ujian u WHERE u.npsn = s.npsn AND u.aktif = 1) AS ujian_aktif
    FROM sekolah s WHERE (? IS NULL OR s.npsn = ?) ORDER BY s.is_demo, s.provinsi, s.kabkota, s.nama`, npsn, npsn);
});

route('POST', '/api/sekolah', (ctx) => {
  requireRole(ctx, 'superadmin');
  const npsn = str(ctx.body.npsn).replace(/\D/g, '');
  if (npsn.length !== 8) throw httpError(400, 'NPSN harus 8 digit angka.');
  if (one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw httpError(400, 'NPSN sudah terdaftar.');
  const s = bersihkanSekolah(ctx.body);
  if (!s.nama) throw httpError(400, 'Nama sekolah wajib diisi.');
  return tx(() => {
    run(`INSERT INTO sekolah (npsn, ${SEKOLAH_FIELDS.join(', ')}) VALUES (?, ${SEKOLAH_FIELDS.map(() => '?').join(', ')})`, npsn, ...SEKOLAH_FIELDS.map((f) => s[f]));
    simpanWilayahLokal(s);
    const au = str(ctx.body.admin_username);
    if (au) {
      if (one('SELECT 1 FROM pengguna WHERE username = ?', au)) throw httpError(400, `Username ${au} sudah dipakai.`);
      run(`INSERT INTO pengguna (username, password_hash, peran, nama, npsn) VALUES (?, ?, 'admin', ?, ?)`,
        au, hashPassword(ctx.body.admin_password || DEFAULT_PASSWORD), `Admin ${s.nama}`, npsn);
    }
    return one('SELECT * FROM sekolah WHERE npsn = ?', npsn);
  });
});

route('PUT', '/api/sekolah/:npsn', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin');
  assertSekolahAccess(ctx, ctx.params.npsn);
  const old = one('SELECT * FROM sekolah WHERE npsn = ?', ctx.params.npsn);
  if (!old) throw httpError(404, 'Sekolah tidak ditemukan.');
  const s = bersihkanSekolah({ ...old, ...ctx.body });
  if (!s.nama) throw httpError(400, 'Nama sekolah wajib diisi.');
  const aktif = ctx.user.peran === 'superadmin' && ctx.body.aktif !== undefined ? (ctx.body.aktif ? 1 : 0) : old.aktif;
  tx(() => {
    run(`UPDATE sekolah SET ${SEKOLAH_FIELDS.map((f) => `${f} = ?`).join(', ')}, aktif = ? WHERE npsn = ?`, ...SEKOLAH_FIELDS.map((f) => s[f]), aktif, old.npsn);
    simpanWilayahLokal(s);
  });
  return one('SELECT * FROM sekolah WHERE npsn = ?', old.npsn);
});

route('DELETE', '/api/sekolah/:npsn', (ctx) => {
  requireRole(ctx, 'superadmin');
  run('DELETE FROM sekolah WHERE npsn = ?', ctx.params.npsn);
  return true;
});

// ---------- pengguna ----------
function bolehKelola(ctx, peran, npsn) {
  const u = ctx.user;
  if (u.peran === 'superadmin') return peran !== 'superadmin';
  if (u.peran === 'admin') return (peran === 'siswa' || peran === 'guru') && npsn === u.npsn;
  return false;
}

route('GET', '/api/pengguna', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin', 'guru');
  const q = ctx.query;
  const npsn = scopeNpsn(ctx, q.npsn);
  let peran = str(q.peran);
  if (ctx.user.peran === 'admin' && !['siswa', 'guru'].includes(peran)) peran = 'siswa';
  if (ctx.user.peran === 'guru') peran = 'siswa';
  const where = ['p.peran <> ?'];
  const args = ['superadmin'];
  if (peran) { where.push('p.peran = ?'); args.push(peran); }
  if (npsn) { where.push('p.npsn = ?'); args.push(npsn); }
  if (str(q.kelas)) { where.push('p.kelas = ?'); args.push(str(q.kelas)); }
  if (str(q.sesi)) { where.push('p.sesi = ?'); args.push(str(q.sesi)); }
  if (q.aktif === '1' || q.aktif === '0') { where.push('p.aktif = ?'); args.push(+q.aktif); }
  if (str(q.q)) { where.push('(p.nama LIKE ? OR p.username LIKE ?)'); args.push(`%${str(q.q)}%`, `%${str(q.q)}%`); }
  const w = where.join(' AND ');
  const per = Math.min(500, int(q.per, 25));
  const hal = Math.max(1, int(q.halaman, 1));
  const total = one(`SELECT COUNT(*) AS n FROM pengguna p WHERE ${w}`, ...args).n;
  const items = all(`SELECT p.id, p.username, p.peran, p.nama, p.npsn, p.kelas, p.sesi, p.jk, p.nik, p.tgl_lahir, p.nip, p.aktif, p.bisa_monitor,
      p.last_active, p.terkunci, (p.sesi_login IS NOT NULL) AS sedang_login, s.nama AS sekolah
    FROM pengguna p LEFT JOIN sekolah s ON s.npsn = p.npsn WHERE ${w}
    ORDER BY s.nama, p.peran, p.kelas, p.nama LIMIT ? OFFSET ?`, ...args, per, (hal - 1) * per);
  const online = now() - ONLINE_MS;
  items.forEach((i) => { i.online = !!(i.sedang_login && i.last_active > online); });
  return { items, total, halaman: hal, per };
});

route('GET', '/api/pengguna/kelas', (ctx) => {
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  return {
    kelas: all(`SELECT DISTINCT kelas FROM pengguna WHERE peran = 'siswa' AND kelas IS NOT NULL AND kelas <> '' AND (? IS NULL OR npsn = ?) ORDER BY kelas`, npsn, npsn).map((r) => r.kelas),
    sesi: all(`SELECT DISTINCT sesi FROM pengguna WHERE peran = 'siswa' AND sesi IS NOT NULL AND sesi <> '' AND (? IS NULL OR npsn = ?) ORDER BY sesi`, npsn, npsn).map((r) => r.sesi),
  };
});

const USER_COLS = ['nama', 'kelas', 'sesi', 'jk', 'nik', 'tgl_lahir', 'nip'];

function normalisasiPengguna(b, peran) {
  const r = Object.fromEntries(USER_COLS.map((c) => [c, str(b[c])]));
  r.jk = r.jk.toUpperCase().startsWith('P') ? 'P' : r.jk.toUpperCase().startsWith('L') ? 'L' : '';
  r.kelas = r.kelas.toUpperCase().replace(/\s+/g, '');
  if (r.sesi && /^\d+$/.test(r.sesi)) r.sesi = `Sesi ${r.sesi}`;
  if (peran === 'siswa' && !r.sesi) r.sesi = 'Sesi 1';
  return r;
}

function validasiPengguna(r, peran) {
  if (!r.nama) return 'Nama wajib diisi';
  if (peran === 'siswa') {
    if (!r.jk) return 'L/P wajib diisi (L atau P)';
    if (!r.kelas) return 'Kelas wajib diisi';
  }
  return null;
}

function usernameOtomatis(npsn) {
  const base = npsn ? npsn.slice(-6) : 'U';
  for (let i = 1; i < 100000; i++) {
    const u = `${base}${String(i).padStart(3, '0')}`;
    if (!one('SELECT 1 FROM pengguna WHERE username = ?', u)) return u;
  }
  return `${base}${Date.now()}`;
}

function insertPengguna(b, peran, npsn) {
  const r = normalisasiPengguna(b, peran);
  const err = validasiPengguna(r, peran);
  if (err) throw httpError(400, err + '.');
  const username = str(b.username) || usernameOtomatis(npsn);
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw httpError(400, 'Username 3–40 karakter: huruf, angka, titik, garis.');
  if (one('SELECT 1 FROM pengguna WHERE username = ?', username)) throw httpError(400, `Username ${username} sudah dipakai.`);
  const pw = String(b.password || DEFAULT_PASSWORD);
  const info = run(`INSERT INTO pengguna (username, password_hash, password_awal, peran, npsn, bisa_monitor, ${USER_COLS.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ${USER_COLS.map(() => '?').join(', ')})`,
    username, hashPassword(pw), peran === 'siswa' ? pw : null, peran, npsn || null, b.bisa_monitor ? 1 : 0, ...USER_COLS.map((c) => r[c] || null));
  return Number(info.lastInsertRowid);
}

route('POST', '/api/pengguna', (ctx) => {
  const peran = str(ctx.body.peran) || 'siswa';
  const npsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(ctx.body.npsn) || null;
  if (!PERAN.includes(peran) || !bolehKelola(ctx, peran, npsn)) throw httpError(403, 'Anda tidak bisa membuat akun ini.');
  if (['admin', 'siswa'].includes(peran) && !npsn) throw httpError(400, 'Pilih sekolah.');
  if (npsn && !one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw httpError(400, 'Sekolah tidak ditemukan.');
  const id = insertPengguna(ctx.body, peran, npsn);
  return one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, id);
});

route('PUT', '/api/pengguna/:id', (ctx) => {
  const t = one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa mengubah akun ini.');
  const r = normalisasiPengguna({ ...t, ...ctx.body }, t.peran);
  const err = validasiPengguna(r, t.peran);
  if (err) throw httpError(400, err + '.');
  const username = str(ctx.body.username) || t.username;
  if (username.toLowerCase() !== t.username.toLowerCase() && one('SELECT 1 FROM pengguna WHERE username = ?', username)) throw httpError(400, `Username ${username} sudah dipakai.`);
  const npsn = ctx.user.peran === 'superadmin' && ctx.body.npsn !== undefined ? str(ctx.body.npsn) || null : t.npsn;
  run(`UPDATE pengguna SET username = ?, npsn = ?, aktif = ?, bisa_monitor = ?, ${USER_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    username, npsn, ctx.body.aktif === undefined ? t.aktif : ctx.body.aktif ? 1 : 0,
    ctx.body.bisa_monitor === undefined ? t.bisa_monitor : ctx.body.bisa_monitor ? 1 : 0, ...USER_COLS.map((c) => r[c] || null), t.id);
  if (ctx.body.password) {
    run('UPDATE pengguna SET password_hash = ?, password_awal = ? WHERE id = ?', hashPassword(ctx.body.password), t.peran === 'siswa' ? String(ctx.body.password) : null, t.id);
  }
  return one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, t.id);
});

route('DELETE', '/api/pengguna/:id', (ctx) => {
  const t = one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa menghapus akun ini.');
  run('DELETE FROM pengguna WHERE id = ?', t.id);
  return true;
});

route('POST', '/api/pengguna/:id/reset-password', (ctx) => {
  const t = one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa mereset akun ini.');
  run('UPDATE pengguna SET password_hash = ?, password_awal = ?, sesi_login = NULL WHERE id = ?',
    hashPassword(DEFAULT_PASSWORD), t.peran === 'siswa' ? DEFAULT_PASSWORD : null, t.id);
  return { password: DEFAULT_PASSWORD };
});

route('POST', '/api/pengguna/:id/reset-login', (ctx) => {
  const t = one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !(bolehKelola(ctx, t.peran, t.npsn) || (ctx.user.peran === 'guru' && ctx.user.bisa_monitor && t.npsn === ctx.user.npsn))) {
    throw httpError(403, 'Anda tidak bisa mereset login akun ini.');
  }
  run('UPDATE pengguna SET sesi_login = NULL, terkunci = 0 WHERE id = ?', t.id);
  all(`SELECT id FROM peserta_ujian WHERE siswa_id = ? AND status = 'mengerjakan'`, t.id).forEach((p) => jeda(p.id));
  notify(t.npsn);
  return true;
});

route('POST', '/api/pengguna/massal', (ctx) => {
  const ids = (ctx.body.ids || []).map((x) => int(x)).filter(Boolean);
  const aksi = str(ctx.body.aksi);
  const targets = ids.map((id) => one('SELECT * FROM pengguna WHERE id = ?', id)).filter((t) => t && bolehKelola(ctx, t.peran, t.npsn));
  if (!targets.length) throw httpError(400, 'Tidak ada akun yang bisa diproses.');
  const nilai = str(ctx.body.nilai);
  const pwHash = aksi === 'reset-password' ? hashPassword(DEFAULT_PASSWORD) : null;
  tx(() => {
    for (const t of targets) {
      if (aksi === 'aktif' || aksi === 'nonaktif') run('UPDATE pengguna SET aktif = ? WHERE id = ?', aksi === 'aktif' ? 1 : 0, t.id);
      else if (aksi === 'sesi') run('UPDATE pengguna SET sesi = ? WHERE id = ?', nilai, t.id);
      else if (aksi === 'kelas') run('UPDATE pengguna SET kelas = ? WHERE id = ?', nilai.toUpperCase(), t.id);
      else if (aksi === 'reset-password') run('UPDATE pengguna SET password_hash = ?, password_awal = ?, sesi_login = NULL WHERE id = ?', pwHash, t.peran === 'siswa' ? DEFAULT_PASSWORD : null, t.id);
      else if (aksi === 'reset-login') run('UPDATE pengguna SET sesi_login = NULL, terkunci = 0 WHERE id = ?', t.id);
      else if (aksi === 'hapus') run('DELETE FROM pengguna WHERE id = ?', t.id);
      else throw httpError(400, 'Aksi tidak dikenal.');
    }
  });
  return { diproses: targets.length };
});

/** Impor massal dengan validasi; kirim cek=true untuk pratinjau saja. */
route('POST', '/api/pengguna/impor', (ctx) => {
  const peran = str(ctx.body.peran) || 'siswa';
  const mode = ctx.body.mode === 'lewati' ? 'lewati' : 'perbarui';
  const cek = !!ctx.body.cek;
  const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows.slice(0, 5000) : [];
  const defaultNpsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(ctx.body.npsn) || null;
  const hasil = [];
  const seen = new Set();
  const lakukan = () => {
    rows.forEach((b, i) => {
      const baris = int(b._baris, i + 1);
      const npsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(b.npsn) || defaultNpsn;
      try {
        if (!bolehKelola(ctx, peran, npsn)) throw new Error('Tidak berhak mengimpor akun ini');
        if (['admin', 'siswa'].includes(peran) && !npsn) throw new Error('NPSN sekolah kosong');
        if (npsn && !one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw new Error(`NPSN ${npsn} tidak terdaftar`);
        const r = normalisasiPengguna(b, peran);
        const err = validasiPengguna(r, peran);
        if (err) throw new Error(err);
        const username = str(b.username);
        if (username && seen.has(username.toLowerCase())) throw new Error(`Username ${username} ganda di file`);
        if (username) seen.add(username.toLowerCase());
        const ada = username ? one('SELECT * FROM pengguna WHERE username = ?', username) : null;
        if (ada) {
          if (ada.peran !== peran || ada.npsn !== npsn) throw new Error(`Username ${username} sudah dipakai akun lain`);
          if (mode === 'lewati') { hasil.push({ baris, status: 'lewati', pesan: `${username} sudah terdaftar` }); return; }
          if (!cek) {
            run(`UPDATE pengguna SET ${USER_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...USER_COLS.map((c) => r[c] || null), ada.id);
            if (b.password) run('UPDATE pengguna SET password_hash = ?, password_awal = ? WHERE id = ?', hashPassword(b.password), peran === 'siswa' ? String(b.password) : null, ada.id);
          }
          hasil.push({ baris, status: 'perbarui', pesan: `${username} sudah terdaftar, data diperbarui` });
          return;
        }
        if (!cek) insertPengguna({ ...b, username: username || '' }, peran, npsn);
        hasil.push({ baris, status: 'baru', pesan: '' });
      } catch (e) {
        hasil.push({ baris, status: 'error', pesan: e.message });
      }
    });
  };
  if (cek) lakukan(); else tx(lakukan);
  const hitung = (s) => hasil.filter((h) => h.status === s).length;
  return { cek, hasil, ringkasan: { baru: hitung('baru'), perbarui: hitung('perbarui'), lewati: hitung('lewati'), error: hitung('error') } };
});

// ---------- dashboard ----------
route('GET', '/api/dashboard', (ctx) => {
  const u = ctx.user;
  const online = now() - ONLINE_MS;
  if (u.peran === 'superadmin' || u.peran === 'supervisor') {
    const c = (sql, ...a) => one(sql, ...a).n;
    return {
      sekolah: c(`SELECT COUNT(*) n FROM sekolah`),
      admin: c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'admin'`),
      guru: c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'guru'`),
      supervisor: c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'supervisor'`),
      siswa: c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'siswa'`),
      ujian_aktif: c(`SELECT COUNT(*) n FROM ujian WHERE aktif = 1`),
      mengerjakan: c(`SELECT COUNT(*) n FROM peserta_ujian WHERE status = 'mengerjakan' AND last_active > ?`, online),
      soal: all(`SELECT m.kode, m.nama,
          SUM(CASE WHEN s.status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
          SUM(CASE WHEN s.status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
          SUM(CASE WHEN s.status = 'revisi' THEN 1 ELSE 0 END) AS revisi,
          COUNT(s.id) AS total
        FROM mapel m LEFT JOIN soal s ON s.mapel = m.kode GROUP BY m.kode ORDER BY m.urutan, m.nama`),
      telaah_menunggu: c(`SELECT COUNT(*) n FROM soal WHERE status = 'menunggu'`),
    };
  }
  if (u.peran === 'admin' || u.peran === 'guru') {
    const npsn = u.npsn;
    const res = {};
    if (npsn) {
      res.siswa = one(`SELECT COUNT(*) n FROM pengguna WHERE npsn = ? AND peran = 'siswa'`, npsn).n;
      res.guru = one(`SELECT COUNT(*) n FROM pengguna WHERE npsn = ? AND peran = 'guru'`, npsn).n;
      res.mengerjakan = one(`SELECT COUNT(*) n FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id
        WHERE uj.npsn = ? AND pu.status = 'mengerjakan' AND pu.last_active > ?`, npsn, online).n;
      res.perlu_koreksi = one(`SELECT COALESCE(SUM(pu.perlu_koreksi), 0) n FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id WHERE uj.npsn = ?`, npsn).n;
      res.ujian = all(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama,
          (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'selesai') AS selesai,
          (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'mengerjakan') AS mengerjakan
        FROM ujian uj JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori
        WHERE uj.npsn = ? ORDER BY uj.aktif DESC, uj.tanggal DESC, uj.jam_mulai, uj.id DESC LIMIT 8`, npsn);
      for (const x of res.ujian) {
        x.sasaran = one(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'siswa' AND aktif = 1 AND npsn = ? AND (? = 'SEMUA' OR sesi = ?) AND (? = 'SEMUA' OR kelas = ?)`,
          npsn, x.sesi, x.sesi, x.kelas, x.kelas).n;
      }
      res.aktivitas = all(`SELECT p.nama, p.username, p.kelas, p.terkunci, pu.status, pu.aktif_sejak, pu.last_active, pu.keluar_layar, uj.mapel,
          json_array_length(pu.urutan) AS total,
          (SELECT COUNT(*) FROM jawaban j WHERE j.peserta_id = pu.id AND j.jawaban IS NOT NULL) AS dijawab
        FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id
        WHERE uj.npsn = ? AND pu.status <> 'absen' ORDER BY pu.last_active DESC LIMIT 6`, npsn);
    }
    if (u.peran === 'guru') {
      res.soal = one(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
          SUM(CASE WHEN status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
          SUM(CASE WHEN status = 'revisi' THEN 1 ELSE 0 END) AS revisi,
          SUM(CASE WHEN status = 'draf' THEN 1 ELSE 0 END) AS draf
        FROM soal WHERE penulis_id = ?`, u.id);
      res.feedback_baru = one(`SELECT COUNT(*) n FROM feedback f JOIN soal s ON s.id = f.soal_id WHERE s.penulis_id = ? AND f.dibaca = 0`, u.id).n;
    }
    return res;
  }
  return {};
});
