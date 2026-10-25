import crypto from 'node:crypto';
import { route } from './router.js';
import { all, one, run, tx, insertId, setting, setSetting } from './db.js';
import {
  hashPassword, verifyPasswordAsync, makeToken, httpError, requireRole, checkRateLimit, clearRateLimit,
  DEFAULT_PASSWORD, PUBLIC_USER_FIELDS,
} from './auth.js';
import { int, str, scopeNpsn, assertSekolahAccess, now, kkm, audit, jeda } from './util.js';
import { TAMPILAN_BAWAAN, LATAR } from './tampilan.js';
import { notify } from './events.js';
import { hapusDataDemo, buatDataDemo } from './seed.js';
import { cached, cacheHapus } from './redis.js';

// supervisor (penelaah soal) sudah digabung ke superadmin; peran lama tetap dikenali agar data lama terbaca
const PERAN = ['superadmin', 'admin', 'guru', 'siswa'];
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
    capaian_publik: setting('capaian_publik', true),
  };
}

async function sesiUser(u, impersonator) {
  const sekolah = u.npsn ? await one('SELECT * FROM sekolah WHERE npsn = ?', u.npsn) : null;
  return { user: u, sekolah, impersonator };
}

/** Data publik berubah → buang cache halaman depan. */
export const segarkanPublik = () => cacheHapus('publik:sebaran', 'publik:statistik', 'publik:capaian');

// ---------- publik ----------
route('GET', '/api/public/info', () => info(), { public: true, noLimit: true });

// sebaran sekolah pengguna untuk peta di halaman depan (hanya identitas sekolah, tanpa data siswa)
route('GET', '/api/public/sebaran', () => cached('publik:sebaran', 120, async () => {
  const sekolah = await all(`SELECT s.npsn, s.nama, s.provinsi_kode, s.provinsi, s.kabkota_kode, s.kabkota, s.kecamatan, s.kelurahan, s.lat, s.lng, s.is_demo AS demo,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'siswa') AS siswa
    FROM sekolah s WHERE s.aktif = 1 ORDER BY s.provinsi, s.kabkota, s.nama`);
  return {
    sekolah,
    ringkasan: { sekolah: sekolah.length, provinsi: new Set(sekolah.map((x) => x.provinsi_kode).filter(Boolean)).size,
      kabkota: new Set(sekolah.map((x) => x.kabkota_kode).filter(Boolean)).size, siswa: sekolah.reduce((a, x) => a + x.siswa, 0) },
  };
}), { public: true });

/** Angka gabungan untuk halaman depan & halaman masuk (tanpa nama siswa). */
route('GET', '/api/public/statistik', () => cached('publik:statistik', 120, async () => {
  const c = async (sql, ...a) => (await one(sql, ...a)).n;
  const perProvinsi = await all(`SELECT s.provinsi_kode AS kode, MAX(s.provinsi) AS nama, COUNT(DISTINCT s.npsn) AS sekolah,
      COUNT(DISTINCT s.kabkota_kode) AS kabkota,
      (SELECT COUNT(*) FROM pengguna p JOIN sekolah x ON x.npsn = p.npsn WHERE p.peran = 'siswa' AND x.provinsi_kode = s.provinsi_kode AND x.aktif = 1) AS siswa
    FROM sekolah s WHERE s.aktif = 1 AND s.provinsi_kode IS NOT NULL AND s.provinsi_kode <> '' GROUP BY s.provinsi_kode ORDER BY sekolah DESC`);
  const nilai = await all(`SELECT s.provinsi_kode AS kode, COUNT(*) AS n, AVG(pu.nilai) AS rata
    FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN sekolah s ON s.npsn = uj.npsn
    WHERE pu.status = 'selesai' AND pu.nilai IS NOT NULL AND s.aktif = 1 GROUP BY s.provinsi_kode`);
  const nMap = new Map(nilai.map((x) => [x.kode, x]));
  perProvinsi.forEach((p) => { const x = nMap.get(p.kode); p.ujian_selesai = x?.n || 0; p.rata = x?.rata == null ? null : Math.round(x.rata * 10) / 10; });
  return {
    sekolah: await c(`SELECT COUNT(*) n FROM sekolah WHERE aktif = 1`),
    siswa: await c(`SELECT COUNT(*) n FROM pengguna p JOIN sekolah s ON s.npsn = p.npsn WHERE p.peran = 'siswa' AND s.aktif = 1`),
    guru: await c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'guru'`),
    soal: await c(`SELECT COUNT(*) n FROM soal WHERE status = 'disetujui' AND aktif = 1`),
    ujian_selesai: await c(`SELECT COUNT(*) n FROM peserta_ujian WHERE status = 'selesai'`),
    mapel: await c(`SELECT COUNT(*) n FROM mapel WHERE aktif = 1`),
    provinsi: perProvinsi.length,
    kabkota: await c(`SELECT COUNT(DISTINCT kabkota_kode) n FROM sekolah WHERE aktif = 1 AND kabkota_kode IS NOT NULL AND kabkota_kode <> ''`),
    per_provinsi: perProvinsi,
    diperbarui: now(),
  };
}), { public: true });

/**
 * Capaian hasil ujian per sekolah untuk halaman masuk admin sekolah.
 * Hanya rata-rata gabungan (sekolah dengan ≥ 5 peserta dinilai), bisa dimatikan superadmin di Pengaturan.
 */
route('GET', '/api/public/capaian', async () => {
  if (!setting('capaian_publik', true)) return { tampil: false };
  return cached('publik:capaian', 180, async () => {
    const target = kkm();
    const total = await one(`SELECT COUNT(*) AS n, AVG(pu.nilai) AS rata, SUM(CASE WHEN pu.nilai >= ? THEN 1 ELSE 0 END) AS capai,
        COUNT(DISTINCT uj.npsn) AS sekolah
      FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN sekolah s ON s.npsn = uj.npsn
      WHERE pu.status = 'selesai' AND pu.nilai IS NOT NULL AND s.aktif = 1 AND s.is_demo = 0`, target);
    const perMapel = await all(`SELECT m.kode, m.nama, COUNT(*) AS n, AVG(pu.nilai) AS rata
      FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel JOIN sekolah s ON s.npsn = uj.npsn
      WHERE pu.status = 'selesai' AND pu.nilai IS NOT NULL AND s.aktif = 1 AND s.is_demo = 0
      GROUP BY m.kode, m.nama, m.urutan ORDER BY m.urutan, m.nama`);
    const perKategori = await all(`SELECT k.kode, k.nama, COUNT(*) AS n, AVG(pu.nilai) AS rata, MIN(pu.selesai_at) AS mulai
      FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn
      WHERE pu.status = 'selesai' AND pu.nilai IS NOT NULL AND s.aktif = 1 AND s.is_demo = 0
      GROUP BY k.kode, k.nama, k.urutan ORDER BY k.urutan, k.nama`);
    const sekolah = await all(`SELECT s.npsn, s.nama, s.kabkota, s.provinsi, s.logo_url, COUNT(*) AS n, AVG(pu.nilai) AS rata,
        SUM(CASE WHEN pu.nilai >= COALESCE(s.target_capaian, ?) THEN 1 ELSE 0 END) AS capai
      FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN sekolah s ON s.npsn = uj.npsn
      WHERE pu.status = 'selesai' AND pu.nilai IS NOT NULL AND s.aktif = 1 AND s.is_demo = 0
      GROUP BY s.npsn HAVING COUNT(*) >= 5 ORDER BY AVG(pu.nilai) DESC LIMIT 8`, target);
    const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
    return {
      tampil: true, target,
      ringkasan: { peserta: total.n, sekolah: total.sekolah, rata: r1(total.rata), persen_capai: total.n ? r1((total.capai / total.n) * 100) : null },
      per_mapel: perMapel.map((x) => ({ ...x, rata: r1(x.rata) })),
      per_kategori: perKategori.map((x) => ({ ...x, rata: r1(x.rata) })),
      sekolah: sekolah.map((x) => ({ ...x, rata: r1(x.rata), persen_capai: r1((x.capai / x.n) * 100) })),
      diperbarui: now(),
    };
  });
}, { public: true });

route('POST', '/api/login', async (ctx) => {
  const username = str(ctx.body.username);
  const password = String(ctx.body.password ?? '');
  const key = `${ctx.ip}|${username.toLowerCase()}`;
  await checkRateLimit(key);
  const u = await one('SELECT * FROM pengguna WHERE username = ?', username);
  if (!u || !(await verifyPasswordAsync(password, u.password_hash))) throw httpError(401, 'Username atau password salah.');
  if (u.peran === 'supervisor') throw httpError(403, 'Peran supervisor sudah digabung ke superadmin. Telaah soal kini dilakukan superadmin.');
  if (!u.aktif) throw httpError(403, 'Akun dinonaktifkan. Hubungi admin sekolah.');
  if (u.npsn) {
    const s = await one('SELECT aktif FROM sekolah WHERE npsn = ?', u.npsn);
    if (s && !s.aktif) throw httpError(403, 'Sekolah sedang dinonaktifkan oleh pusat.');
  }
  await clearRateLimit(key);
  let sid = null;
  if (u.peran === 'siswa' && u.terkunci) {
    throw httpError(423, 'Akun dikunci karena ada upaya keluar dari ujian. Minta admin sekolah mereset login.');
  }
  if (u.peran === 'siswa') {
    if (u.sesi_login && u.last_active && now() - u.last_active < ONLINE_MS && !ctx.body.paksa) {
      throw httpError(409, 'Akun ini sedang aktif di perangkat lain. Minta proktor mereset login.');
    }
    sid = crypto.randomBytes(12).toString('hex');
    await run('UPDATE pengguna SET sesi_login = ?, last_active = ? WHERE id = ?', sid, now(), u.id);
    notify(u.npsn);
  }
  const user = await one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, u.id);
  audit('login', u.username, u.peran, ctx.ip);
  return { token: makeToken({ uid: u.id, sid }, u.peran === 'siswa' ? 8 : 12), ...(await sesiUser(user, null)) };
}, { public: true });

route('GET', '/api/me', (ctx) => sesiUser(ctx.user, ctx.impersonator));

route('POST', '/api/logout', async (ctx) => {
  if (ctx.user.peran === 'siswa' && !ctx.impersonator) {
    await run('UPDATE pengguna SET sesi_login = NULL WHERE id = ?', ctx.user.id);
    // waktu ujian yang sedang berjalan ikut dijeda
    for (const p of await all(`SELECT id FROM peserta_ujian WHERE siswa_id = ? AND status = 'mengerjakan'`, ctx.user.id)) await jeda(p.id);
    notify(ctx.user.npsn);
  }
  return true;
});

route('PUT', '/api/akun/password', async (ctx) => {
  if (ctx.impersonator) throw httpError(400, 'Tidak bisa mengganti password saat mode samaran.');
  const u = await one('SELECT password_hash FROM pengguna WHERE id = ?', ctx.user.id);
  if (!(await verifyPasswordAsync(ctx.body.lama ?? '', u.password_hash))) throw httpError(400, 'Password lama salah.');
  const baru = String(ctx.body.baru ?? '');
  if (baru.length < 6) throw httpError(400, 'Password baru minimal 6 karakter.');
  await run('UPDATE pengguna SET password_hash = ?, password_awal = NULL WHERE id = ?', hashPassword(baru), ctx.user.id);
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
    WHERE p.peran = ? AND p.aktif = 1 AND (? = '' OR p.npsn = ?) AND (p.nama ILIKE ? OR p.username ILIKE ?)
    ORDER BY s.nama, p.kelas, p.nama LIMIT 60`, peran, npsn, npsn, q, q);
});

route('POST', '/api/samaran', async (ctx) => {
  const su = realSuperadmin(ctx);
  const target = await one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, int(ctx.body.user_id));
  if (!target || target.peran === 'superadmin' || target.peran === 'supervisor') throw httpError(400, 'Pengguna tidak ditemukan.');
  audit('samaran', su.username, '->', target.username, target.peran);
  return { token: makeToken({ uid: target.id, imp: su.id }, 4), ...(await sesiUser(target, su)) };
});

route('POST', '/api/samaran/selesai', async (ctx) => {
  const su = realSuperadmin(ctx);
  const user = await one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, su.id);
  return { token: makeToken({ uid: su.id }), ...(await sesiUser(user, null)) };
});

// ---------- pengaturan ----------
route('GET', '/api/pengaturan', (ctx) => { requireRole(ctx, 'superadmin'); return info(); });
route('PUT', '/api/pengaturan', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const b = ctx.body;
  if (b.nama_aplikasi !== undefined) await setSetting('nama_aplikasi', str(b.nama_aplikasi) || 'TKA SD 2026');
  if (b.nama_instansi !== undefined) await setSetting('nama_instansi', str(b.nama_instansi));
  if (b.tahun_ajaran !== undefined) await setSetting('tahun_ajaran', str(b.tahun_ajaran));
  if (b.target_capaian !== undefined) await setSetting('target_capaian', Math.min(100, Math.max(0, Number(b.target_capaian) || 70)));
  if (b.capaian_publik !== undefined) await setSetting('capaian_publik', !!b.capaian_publik);
  if (b.tampilan && typeof b.tampilan === 'object') {
    const t = b.tampilan;
    const url = (v) => (v && /^(\/uploads\/|\/img\/)[\w./-]+$/.test(v) ? v : null);
    await setSetting('tampilan', {
      latar: LATAR.includes(t.latar) ? t.latar : 'bawaan',
      latar_url: url(t.latar_url), login_url: url(t.login_url), logo_url: url(t.logo_url),
    });
  }
  if (Array.isArray(b.helpdesk)) {
    const JENIS = ['whatsapp', 'telepon', 'email', 'telegram', 'tautan'];
    await setSetting('helpdesk', b.helpdesk.map((h) => ({
      nama: str(h.nama), kontak: str(h.kontak), jenis: JENIS.includes(h.jenis) ? h.jenis : tebakJenis(str(h.kontak)), jam: str(h.jam),
    })).filter((h) => h.nama));
  }
  if (Array.isArray(b.dokumen)) await setSetting('dokumen', b.dokumen.map((h) => ({ nama: str(h.nama), keterangan: str(h.keterangan), url: str(h.url) })).filter((h) => h.nama && h.url));
  await segarkanPublik();
  return info();
});
/** Kontak lama tanpa jenis: tebak dari isinya. */
function tebakJenis(k) {
  if (/@/.test(k) && !/^https?:/i.test(k)) return 'email';
  if (/^https?:\/\/(t\.me|telegram)/i.test(k)) return 'telegram';
  if (/^https?:/i.test(k)) return 'tautan';
  if (/^(\+?62|0)8/.test(k.replace(/[\s-]/g, ''))) return 'whatsapp';
  return 'telepon';
}
route('GET', '/api/demo', async (ctx) => { requireRole(ctx, 'superadmin'); return { ada: !!(await one('SELECT 1 FROM sekolah WHERE is_demo = 1')) }; });
route('POST', '/api/demo/hapus', async (ctx) => { requireRole(ctx, 'superadmin'); const r = await hapusDataDemo(); await segarkanPublik(); return r; });
route('POST', '/api/demo/buat', async (ctx) => { requireRole(ctx, 'superadmin'); const r = await buatDataDemo(); await segarkanPublik(); return r; });

// ---------- master mapel & kategori ----------
for (const [tabel, label] of [['mapel', 'Mata pelajaran'], ['kategori', 'Kategori']]) {
  route('GET', `/api/${tabel}`, () => all(`SELECT * FROM ${tabel} ORDER BY urutan, nama`));
  route('POST', `/api/${tabel}`, async (ctx) => {
    requireRole(ctx, 'superadmin');
    const kode = str(ctx.body.kode).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nama = str(ctx.body.nama);
    if (!kode || !nama) throw httpError(400, 'Kode dan nama wajib diisi.');
    if (await one(`SELECT 1 FROM ${tabel} WHERE kode = ?`, kode)) throw httpError(400, `${label} dengan kode ${kode} sudah ada.`);
    await run(`INSERT INTO ${tabel} (kode, nama, aktif, urutan) VALUES (?, ?, ?, ?)`, kode, nama, ctx.body.aktif === false ? 0 : 1, int(ctx.body.urutan, 0));
    return one(`SELECT * FROM ${tabel} WHERE kode = ?`, kode);
  });
  route('PUT', `/api/${tabel}/:kode`, async (ctx) => {
    requireRole(ctx, 'superadmin');
    const r = await one(`SELECT * FROM ${tabel} WHERE kode = ?`, ctx.params.kode);
    if (!r) throw httpError(404, `${label} tidak ditemukan.`);
    await run(`UPDATE ${tabel} SET nama = ?, aktif = ?, urutan = ? WHERE kode = ?`,
      str(ctx.body.nama) || r.nama, ctx.body.aktif === undefined ? r.aktif : ctx.body.aktif ? 1 : 0, int(ctx.body.urutan, r.urutan), r.kode);
    return one(`SELECT * FROM ${tabel} WHERE kode = ?`, r.kode);
  });
  route('DELETE', `/api/${tabel}/:kode`, async (ctx) => {
    requireRole(ctx, 'superadmin');
    const col = tabel === 'mapel' ? 'mapel' : 'kategori';
    if (await one(`SELECT 1 FROM soal WHERE ${col} = ? UNION SELECT 1 FROM ujian WHERE ${col} = ?`, ctx.params.kode, ctx.params.kode)) {
      throw httpError(400, `${label} masih dipakai soal atau ujian. Nonaktifkan saja.`);
    }
    await run(`DELETE FROM ${tabel} WHERE kode = ?`, ctx.params.kode);
    return true;
  });
}

// ---------- wilayah lokal (kecamatan/kelurahan diketik sekolah) ----------
route('GET', '/api/wilayah/kecamatan', async (ctx) =>
  (await all(`SELECT DISTINCT kecamatan AS nama FROM wilayah_lokal WHERE kabkota_kode = ? ORDER BY kecamatan`, str(ctx.query.kabkota))).map((r) => r.nama), { public: true });
route('GET', '/api/wilayah/kelurahan', async (ctx) =>
  (await all(`SELECT kelurahan AS nama FROM wilayah_lokal WHERE kabkota_kode = ? AND kecamatan = ? AND kelurahan <> '' ORDER BY kelurahan`,
    str(ctx.query.kabkota), str(ctx.query.kecamatan))).map((r) => r.nama), { public: true });

const titleCase = (s) => str(s).replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export async function simpanWilayahLokal(s) {
  if (!s.kabkota_kode || !s.kecamatan) return;
  await run(`INSERT INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, '') ON CONFLICT DO NOTHING`, s.kabkota_kode, s.kecamatan);
  if (s.kelurahan) await run(`INSERT INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, s.kabkota_kode, s.kecamatan, s.kelurahan);
}

// ---------- sekolah ----------
export const SEKOLAH_FIELDS = ['nama', 'provinsi_kode', 'provinsi', 'kabkota_kode', 'kabkota', 'kecamatan', 'kelurahan', 'alamat', 'kepala_sekolah', 'nip_kepsek',
  'logo_url', 'ttd_url', 'stempel_url', 'target_capaian', 'lat', 'lng', 'telepon', 'email', 'kota_ttd'];

export function bersihkanSekolah(b) {
  const s = Object.fromEntries(SEKOLAH_FIELDS.map((f) => [f, str(b[f])]));
  s.kecamatan = titleCase(s.kecamatan);
  s.kelurahan = titleCase(s.kelurahan);
  for (const f of ['logo_url', 'ttd_url', 'stempel_url']) s[f] = /^\/uploads\/[\w.-]+$/.test(s[f]) ? s[f] : null;
  s.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) ? s.email.slice(0, 120) : null;
  s.telepon = s.telepon.replace(/[^0-9+\-\s()]/g, '').slice(0, 30) || null;
  s.kota_ttd = s.kota_ttd.slice(0, 60) || null;
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
      (SELECT string_agg(username::text, ', ') FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'admin') AS admin,
      (SELECT COUNT(*) FROM ujian u WHERE u.npsn = s.npsn AND u.aktif = 1) AS ujian_aktif
    FROM sekolah s WHERE (?::text IS NULL OR s.npsn = ?) ORDER BY s.is_demo, s.provinsi, s.kabkota, s.nama`, npsn, npsn);
});

route('POST', '/api/sekolah', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const npsn = str(ctx.body.npsn).replace(/\D/g, '');
  if (npsn.length !== 8) throw httpError(400, 'NPSN harus 8 digit angka.');
  if (await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw httpError(400, 'NPSN sudah terdaftar.');
  const s = bersihkanSekolah(ctx.body);
  if (!s.nama) throw httpError(400, 'Nama sekolah wajib diisi.');
  const hasil = await tx(async () => {
    await run(`INSERT INTO sekolah (npsn, ${SEKOLAH_FIELDS.join(', ')}) VALUES (?, ${SEKOLAH_FIELDS.map(() => '?').join(', ')})`, npsn, ...SEKOLAH_FIELDS.map((f) => s[f]));
    await simpanWilayahLokal(s);
    const au = str(ctx.body.admin_username);
    if (au) {
      if (await one('SELECT 1 FROM pengguna WHERE username = ?', au)) throw httpError(400, `Username ${au} sudah dipakai.`);
      await run(`INSERT INTO pengguna (username, password_hash, peran, nama, npsn) VALUES (?, ?, 'admin', ?, ?)`,
        au, hashPassword(ctx.body.admin_password || DEFAULT_PASSWORD), `Admin ${s.nama}`, npsn);
    }
    return one('SELECT * FROM sekolah WHERE npsn = ?', npsn);
  });
  await segarkanPublik();
  return hasil;
});

route('PUT', '/api/sekolah/:npsn', async (ctx) => {
  requireRole(ctx, 'superadmin', 'admin');
  assertSekolahAccess(ctx, ctx.params.npsn);
  const old = await one('SELECT * FROM sekolah WHERE npsn = ?', ctx.params.npsn);
  if (!old) throw httpError(404, 'Sekolah tidak ditemukan.');
  const s = bersihkanSekolah({ ...old, ...ctx.body });
  if (!s.nama) throw httpError(400, 'Nama sekolah wajib diisi.');
  const aktif = ctx.user.peran === 'superadmin' && ctx.body.aktif !== undefined ? (ctx.body.aktif ? 1 : 0) : old.aktif;
  await tx(async () => {
    await run(`UPDATE sekolah SET ${SEKOLAH_FIELDS.map((f) => `${f} = ?`).join(', ')}, aktif = ? WHERE npsn = ?`, ...SEKOLAH_FIELDS.map((f) => s[f]), aktif, old.npsn);
    await simpanWilayahLokal(s);
  });
  await segarkanPublik();
  return one('SELECT * FROM sekolah WHERE npsn = ?', old.npsn);
});

route('DELETE', '/api/sekolah/:npsn', async (ctx) => {
  requireRole(ctx, 'superadmin');
  await run('DELETE FROM sekolah WHERE npsn = ?', ctx.params.npsn);
  await segarkanPublik();
  return true;
});

// ---------- pengguna ----------
function bolehKelola(ctx, peran, npsn) {
  const u = ctx.user;
  if (u.peran === 'superadmin') return peran !== 'superadmin';
  if (u.peran === 'admin') return (peran === 'siswa' || peran === 'guru') && npsn === u.npsn;
  return false;
}

route('GET', '/api/pengguna', async (ctx) => {
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
  if (str(q.q)) { where.push('(p.nama ILIKE ? OR p.username ILIKE ?)'); args.push(`%${str(q.q)}%`, `%${str(q.q)}%`); }
  const w = where.join(' AND ');
  const per = Math.min(500, int(q.per, 25));
  const hal = Math.max(1, int(q.halaman, 1));
  const total = (await one(`SELECT COUNT(*) AS n FROM pengguna p WHERE ${w}`, ...args)).n;
  const items = await all(`SELECT p.id, p.username, p.peran, p.nama, p.npsn, p.kelas, p.sesi, p.jk, p.nik, p.tgl_lahir, p.nip, p.aktif, p.bisa_monitor,
      p.last_active, p.terkunci, (p.sesi_login IS NOT NULL) AS sedang_login, s.nama AS sekolah
    FROM pengguna p LEFT JOIN sekolah s ON s.npsn = p.npsn WHERE ${w}
    ORDER BY s.nama NULLS FIRST, p.peran, p.kelas, p.nama LIMIT ? OFFSET ?`, ...args, per, (hal - 1) * per);
  const online = now() - ONLINE_MS;
  items.forEach((i) => { i.online = !!(i.sedang_login && i.last_active > online); });
  return { items, total, halaman: hal, per };
});

route('GET', '/api/pengguna/kelas', async (ctx) => {
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  return {
    kelas: (await all(`SELECT DISTINCT kelas FROM pengguna WHERE peran = 'siswa' AND kelas IS NOT NULL AND kelas <> '' AND (?::text IS NULL OR npsn = ?) ORDER BY kelas`, npsn, npsn)).map((r) => r.kelas),
    sesi: (await all(`SELECT DISTINCT sesi FROM pengguna WHERE peran = 'siswa' AND sesi IS NOT NULL AND sesi <> '' AND (?::text IS NULL OR npsn = ?) ORDER BY sesi`, npsn, npsn)).map((r) => r.sesi),
  };
});

/** Hitungan untuk kolom angka/penghitung di halaman sekolah: per kelas, per sesi, per jenis kelamin, status akun. */
route('GET', '/api/pengguna/ringkasan', async (ctx) => {
  requireRole(ctx, 'superadmin', 'admin', 'guru');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  const peran = ['siswa', 'guru'].includes(ctx.query.peran) ? ctx.query.peran : 'siswa';
  const w = `peran = ? AND (?::text IS NULL OR npsn = ?)`;
  const a = [peran, npsn, npsn];
  const online = now() - ONLINE_MS;
  const r = await one(`SELECT COUNT(*) AS total, SUM(aktif) AS aktif, SUM(CASE WHEN jk = 'L' THEN 1 ELSE 0 END) AS l, SUM(CASE WHEN jk = 'P' THEN 1 ELSE 0 END) AS p,
      SUM(terkunci) AS terkunci, SUM(CASE WHEN sesi_login IS NOT NULL AND last_active > ? THEN 1 ELSE 0 END) AS online,
      SUM(CASE WHEN password_awal IS NOT NULL THEN 1 ELSE 0 END) AS password_awal
    FROM pengguna WHERE ${w}`, online, ...a);
  const perKelas = await all(`SELECT COALESCE(kelas, '') AS kelas, COUNT(*) AS n, SUM(CASE WHEN jk = 'L' THEN 1 ELSE 0 END) AS l, SUM(CASE WHEN jk = 'P' THEN 1 ELSE 0 END) AS p
    FROM pengguna WHERE ${w} GROUP BY COALESCE(kelas, '') ORDER BY 1`, ...a);
  const perSesi = await all(`SELECT COALESCE(sesi, '') AS sesi, COUNT(*) AS n FROM pengguna WHERE ${w} GROUP BY COALESCE(sesi, '') ORDER BY 1`, ...a);
  const z = (x) => x || 0;
  return { total: z(r.total), aktif: z(r.aktif), nonaktif: z(r.total) - z(r.aktif), l: z(r.l), p: z(r.p), terkunci: z(r.terkunci), online: z(r.online),
    password_awal: z(r.password_awal), per_kelas: perKelas, per_sesi: perSesi };
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

async function usernameOtomatis(npsn) {
  const base = npsn ? npsn.slice(-6) : 'U';
  // cari nomor terbesar yang sudah dipakai lalu lanjutkan (tidak memeriksa satu per satu)
  const r = await one(`SELECT MAX(CAST(substr(username::text, ?) AS INTEGER)) AS n FROM pengguna
    WHERE username::text ~ ?`, base.length + 1, `^${base}[0-9]{3,6}$`);
  for (let i = (r?.n || 0) + 1; i < (r?.n || 0) + 50; i++) {
    const u = `${base}${String(i).padStart(3, '0')}`;
    if (!(await one('SELECT 1 FROM pengguna WHERE username = ?', u))) return u;
  }
  return `${base}${Date.now()}`;
}

async function insertPengguna(b, peran, npsn) {
  const r = normalisasiPengguna(b, peran);
  const err = validasiPengguna(r, peran);
  if (err) throw httpError(400, err + '.');
  const username = str(b.username) || (await usernameOtomatis(npsn));
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw httpError(400, 'Username 3–40 karakter: huruf, angka, titik, garis.');
  if (await one('SELECT 1 FROM pengguna WHERE username = ?', username)) throw httpError(400, `Username ${username} sudah dipakai.`);
  const pw = String(b.password || DEFAULT_PASSWORD);
  return insertId(`INSERT INTO pengguna (username, password_hash, password_awal, peran, npsn, bisa_monitor, ${USER_COLS.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ${USER_COLS.map(() => '?').join(', ')})`,
  username, hashPassword(pw), peran === 'siswa' ? pw : null, peran, npsn || null, b.bisa_monitor ? 1 : 0, ...USER_COLS.map((c) => r[c] || null));
}

route('POST', '/api/pengguna', async (ctx) => {
  const peran = str(ctx.body.peran) || 'siswa';
  const npsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(ctx.body.npsn) || null;
  if (!PERAN.includes(peran) || !bolehKelola(ctx, peran, npsn)) throw httpError(403, 'Anda tidak bisa membuat akun ini.');
  if (['admin', 'siswa'].includes(peran) && !npsn) throw httpError(400, 'Pilih sekolah.');
  if (npsn && !(await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn))) throw httpError(400, 'Sekolah tidak ditemukan.');
  const id = await insertPengguna(ctx.body, peran, npsn);
  return one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, id);
});

route('PUT', '/api/pengguna/:id', async (ctx) => {
  const t = await one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa mengubah akun ini.');
  const r = normalisasiPengguna({ ...t, ...ctx.body }, t.peran);
  const err = validasiPengguna(r, t.peran);
  if (err) throw httpError(400, err + '.');
  const username = str(ctx.body.username) || t.username;
  if (username.toLowerCase() !== t.username.toLowerCase() && (await one('SELECT 1 FROM pengguna WHERE username = ?', username))) throw httpError(400, `Username ${username} sudah dipakai.`);
  const npsn = ctx.user.peran === 'superadmin' && ctx.body.npsn !== undefined ? str(ctx.body.npsn) || null : t.npsn;
  await run(`UPDATE pengguna SET username = ?, npsn = ?, aktif = ?, bisa_monitor = ?, ${USER_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    username, npsn, ctx.body.aktif === undefined ? t.aktif : ctx.body.aktif ? 1 : 0,
    ctx.body.bisa_monitor === undefined ? t.bisa_monitor : ctx.body.bisa_monitor ? 1 : 0, ...USER_COLS.map((c) => r[c] || null), t.id);
  if (ctx.body.password) {
    await run('UPDATE pengguna SET password_hash = ?, password_awal = ? WHERE id = ?', hashPassword(ctx.body.password), t.peran === 'siswa' ? String(ctx.body.password) : null, t.id);
  }
  return one(`SELECT ${PUBLIC_USER_FIELDS} FROM pengguna WHERE id = ?`, t.id);
});

route('DELETE', '/api/pengguna/:id', async (ctx) => {
  const t = await one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa menghapus akun ini.');
  await run('DELETE FROM pengguna WHERE id = ?', t.id);
  return true;
});

route('POST', '/api/pengguna/:id/reset-password', async (ctx) => {
  const t = await one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !bolehKelola(ctx, t.peran, t.npsn)) throw httpError(403, 'Anda tidak bisa mereset akun ini.');
  await run('UPDATE pengguna SET password_hash = ?, password_awal = ?, sesi_login = NULL WHERE id = ?',
    hashPassword(DEFAULT_PASSWORD), t.peran === 'siswa' ? DEFAULT_PASSWORD : null, t.id);
  return { password: DEFAULT_PASSWORD };
});

route('POST', '/api/pengguna/:id/reset-login', async (ctx) => {
  const t = await one('SELECT * FROM pengguna WHERE id = ?', int(ctx.params.id));
  if (!t || !(bolehKelola(ctx, t.peran, t.npsn) || (ctx.user.peran === 'guru' && ctx.user.bisa_monitor && t.npsn === ctx.user.npsn))) {
    throw httpError(403, 'Anda tidak bisa mereset login akun ini.');
  }
  await run('UPDATE pengguna SET sesi_login = NULL, terkunci = 0 WHERE id = ?', t.id);
  for (const p of await all(`SELECT id FROM peserta_ujian WHERE siswa_id = ? AND status = 'mengerjakan'`, t.id)) await jeda(p.id);
  notify(t.npsn);
  return true;
});

route('POST', '/api/pengguna/massal', async (ctx) => {
  const ids = (ctx.body.ids || []).map((x) => int(x)).filter(Boolean);
  const aksi = str(ctx.body.aksi);
  const targets = (await all('SELECT * FROM pengguna WHERE id = ANY(?::int[])', ids)).filter((t) => bolehKelola(ctx, t.peran, t.npsn));
  if (!targets.length) throw httpError(400, 'Tidak ada akun yang bisa diproses.');
  const nilai = str(ctx.body.nilai);
  const pwHash = aksi === 'reset-password' ? hashPassword(DEFAULT_PASSWORD) : null;
  await tx(async () => {
    for (const t of targets) {
      if (aksi === 'aktif' || aksi === 'nonaktif') await run('UPDATE pengguna SET aktif = ? WHERE id = ?', aksi === 'aktif' ? 1 : 0, t.id);
      else if (aksi === 'sesi') await run('UPDATE pengguna SET sesi = ? WHERE id = ?', nilai, t.id);
      else if (aksi === 'kelas') await run('UPDATE pengguna SET kelas = ? WHERE id = ?', nilai.toUpperCase(), t.id);
      else if (aksi === 'reset-password') await run('UPDATE pengguna SET password_hash = ?, password_awal = ?, sesi_login = NULL WHERE id = ?', pwHash, t.peran === 'siswa' ? DEFAULT_PASSWORD : null, t.id);
      else if (aksi === 'reset-login') await run('UPDATE pengguna SET sesi_login = NULL, terkunci = 0 WHERE id = ?', t.id);
      else if (aksi === 'hapus') await run('DELETE FROM pengguna WHERE id = ?', t.id);
      else throw httpError(400, 'Aksi tidak dikenal.');
    }
  });
  return { diproses: targets.length };
});

/** Impor massal dengan validasi; kirim cek=true untuk pratinjau saja. */
route('POST', '/api/pengguna/impor', async (ctx) => {
  const peran = str(ctx.body.peran) || 'siswa';
  const mode = ctx.body.mode === 'lewati' ? 'lewati' : 'perbarui';
  const cek = !!ctx.body.cek;
  const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows.slice(0, 5000) : [];
  const defaultNpsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(ctx.body.npsn) || null;
  const hasil = [];
  const seen = new Set();
  const sekolahAda = new Map();
  const cekSekolah = async (npsn) => {
    if (!sekolahAda.has(npsn)) sekolahAda.set(npsn, !!(await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)));
    return sekolahAda.get(npsn);
  };
  const lakukan = async () => {
    for (const [i, b] of rows.entries()) {
      const baris = int(b._baris, i + 1);
      const npsn = ctx.user.peran === 'admin' ? ctx.user.npsn : str(b.npsn) || defaultNpsn;
      try {
        if (!bolehKelola(ctx, peran, npsn)) throw new Error('Tidak berhak mengimpor akun ini');
        if (['admin', 'siswa'].includes(peran) && !npsn) throw new Error('NPSN sekolah kosong');
        if (npsn && !(await cekSekolah(npsn))) throw new Error(`NPSN ${npsn} tidak terdaftar`);
        const r = normalisasiPengguna(b, peran);
        const err = validasiPengguna(r, peran);
        if (err) throw new Error(err);
        const username = str(b.username);
        if (username && seen.has(username.toLowerCase())) throw new Error(`Username ${username} ganda di file`);
        if (username) seen.add(username.toLowerCase());
        const ada = username ? await one('SELECT * FROM pengguna WHERE username = ?', username) : null;
        if (ada) {
          if (ada.peran !== peran || ada.npsn !== npsn) throw new Error(`Username ${username} sudah dipakai akun lain`);
          if (mode === 'lewati') { hasil.push({ baris, status: 'lewati', pesan: `${username} sudah terdaftar` }); continue; }
          if (!cek) {
            await run(`UPDATE pengguna SET ${USER_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...USER_COLS.map((c) => r[c] || null), ada.id);
            if (b.password) await run('UPDATE pengguna SET password_hash = ?, password_awal = ? WHERE id = ?', hashPassword(b.password), peran === 'siswa' ? String(b.password) : null, ada.id);
          }
          hasil.push({ baris, status: 'perbarui', pesan: `${username} sudah terdaftar, data diperbarui` });
          continue;
        }
        if (!cek) await insertPengguna({ ...b, username: username || '' }, peran, npsn);
        hasil.push({ baris, status: 'baru', pesan: '' });
      } catch (e) {
        if (e.code) throw e; // galat basis data: batalkan seluruh impor
        hasil.push({ baris, status: 'error', pesan: e.message });
      }
    }
  };
  if (cek) await lakukan(); else await tx(lakukan);
  const hitung = (s) => hasil.filter((h) => h.status === s).length;
  return { cek, hasil, ringkasan: { baru: hitung('baru'), perbarui: hitung('perbarui'), lewati: hitung('lewati'), error: hitung('error') } };
});

// ---------- dashboard ----------
route('GET', '/api/dashboard', async (ctx) => {
  const u = ctx.user;
  const online = now() - ONLINE_MS;
  const c = async (sql, ...a) => (await one(sql, ...a)).n;
  if (u.peran === 'superadmin') {
    return {
      sekolah: await c(`SELECT COUNT(*) n FROM sekolah`),
      admin: await c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'admin'`),
      guru: await c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'guru'`),
      siswa: await c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'siswa'`),
      ujian_aktif: await c(`SELECT COUNT(*) n FROM ujian WHERE aktif = 1`),
      mengerjakan: await c(`SELECT COUNT(*) n FROM peserta_ujian WHERE status = 'mengerjakan' AND last_active > ?`, online),
      selesai: await c(`SELECT COUNT(*) n FROM peserta_ujian WHERE status = 'selesai'`),
      provinsi: await c(`SELECT COUNT(DISTINCT provinsi_kode) n FROM sekolah WHERE provinsi_kode IS NOT NULL AND provinsi_kode <> ''`),
      pengajuan: await c(`SELECT COUNT(*) n FROM pengajuan_akun WHERE status = 'menunggu'`),
      soal: await all(`SELECT m.kode, m.nama,
          SUM(CASE WHEN s.status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
          SUM(CASE WHEN s.status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
          SUM(CASE WHEN s.status = 'revisi' THEN 1 ELSE 0 END) AS revisi,
          COUNT(s.id) AS total
        FROM mapel m LEFT JOIN soal s ON s.mapel = m.kode GROUP BY m.kode ORDER BY m.urutan, m.nama`),
      telaah_menunggu: await c(`SELECT COUNT(*) n FROM soal WHERE status = 'menunggu'`),
      feedback_baru: await c(`SELECT COUNT(*) n FROM feedback WHERE dibaca = 0`),
    };
  }
  if (u.peran === 'admin' || u.peran === 'guru') {
    const npsn = u.npsn;
    const res = {};
    if (npsn) {
      res.siswa = await c(`SELECT COUNT(*) n FROM pengguna WHERE npsn = ? AND peran = 'siswa'`, npsn);
      res.guru = await c(`SELECT COUNT(*) n FROM pengguna WHERE npsn = ? AND peran = 'guru'`, npsn);
      res.kelas = await c(`SELECT COUNT(DISTINCT kelas) n FROM pengguna WHERE npsn = ? AND peran = 'siswa' AND kelas IS NOT NULL AND kelas <> ''`, npsn);
      res.ujian_total = await c(`SELECT COUNT(*) n FROM ujian WHERE npsn = ?`, npsn);
      res.ujian_aktif = await c(`SELECT COUNT(*) n FROM ujian WHERE npsn = ? AND aktif = 1`, npsn);
      res.selesai = await c(`SELECT COUNT(*) n FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id WHERE uj.npsn = ? AND pu.status = 'selesai'`, npsn);
      res.terkunci = await c(`SELECT COUNT(*) n FROM pengguna WHERE npsn = ? AND peran = 'siswa' AND terkunci = 1`, npsn);
      res.mengerjakan = await c(`SELECT COUNT(*) n FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id
        WHERE uj.npsn = ? AND pu.status = 'mengerjakan' AND pu.last_active > ?`, npsn, online);
      res.perlu_koreksi = await c(`SELECT COALESCE(SUM(pu.perlu_koreksi), 0) n FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id WHERE uj.npsn = ?`, npsn);
      const rata = await one(`SELECT AVG(pu.nilai) AS r FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id WHERE uj.npsn = ? AND pu.nilai IS NOT NULL`, npsn);
      res.rata = rata?.r == null ? null : Math.round(rata.r * 10) / 10;
      res.ujian = await all(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama,
          (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'selesai') AS selesai,
          (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'mengerjakan') AS mengerjakan
        FROM ujian uj JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori
        WHERE uj.npsn = ? ORDER BY uj.aktif DESC, uj.tanggal DESC NULLS LAST, uj.jam_mulai, uj.id DESC LIMIT 8`, npsn);
      for (const x of res.ujian) {
        x.sasaran = await c(`SELECT COUNT(*) n FROM pengguna WHERE peran = 'siswa' AND aktif = 1 AND npsn = ? AND (? = 'SEMUA' OR sesi = ?) AND (? = 'SEMUA' OR kelas = ?)`,
          npsn, x.sesi, x.sesi, x.kelas, x.kelas);
      }
      res.aktivitas = await all(`SELECT p.nama, p.username, p.kelas, p.terkunci, pu.status, pu.aktif_sejak, pu.last_active, pu.keluar_layar, uj.mapel,
          json_array_length(pu.urutan::json) AS total,
          (SELECT COUNT(*) FROM jawaban j WHERE j.peserta_id = pu.id AND j.jawaban IS NOT NULL) AS dijawab
        FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id
        WHERE uj.npsn = ? AND pu.status <> 'absen' ORDER BY pu.last_active DESC NULLS LAST LIMIT 6`, npsn);
    }
    if (u.peran === 'guru') {
      res.soal = await one(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
          SUM(CASE WHEN status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
          SUM(CASE WHEN status = 'revisi' THEN 1 ELSE 0 END) AS revisi,
          SUM(CASE WHEN status = 'draf' THEN 1 ELSE 0 END) AS draf
        FROM soal WHERE penulis_id = ?`, u.id);
      res.feedback_baru = await c(`SELECT COUNT(*) n FROM feedback f JOIN soal s ON s.id = f.soal_id WHERE s.penulis_id = ? AND f.dibaca = 0`, u.id);
    }
    return res;
  }
  return {};
});
