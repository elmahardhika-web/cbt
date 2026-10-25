// Cadangan (backup) & pemulihan (restore).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { route } from './router.js';
import { db, all, one, run, tx, DATA_DIR } from './db.js';
import { httpError, requireRole } from './auth.js';
import { str, int, now, scopeNpsn, audit, parseJSON } from './util.js';
import { notify } from './events.js';

const DIR = path.join(DATA_DIR, 'backup');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const RESTORE_FILE = path.join(DATA_DIR, 'restore.db');
const AMAN = /^[\w.-]+\.db$/;
const SIMPAN_OTOMATIS = 7; // jumlah cadangan harian yang disimpan

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Buat salinan database utuh + gambar unggahan dalam satu berkas .db */
export function buatCadangan(awalan = 'manual') {
  const nama = `${awalan}-${stamp()}.db`;
  const file = path.join(DIR, nama);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const b = new DatabaseSync(file);
  try {
    b.exec('CREATE TABLE _berkas (nama TEXT PRIMARY KEY, isi BLOB)');
    const ins = b.prepare('INSERT INTO _berkas (nama, isi) VALUES (?, ?)');
    for (const f of fs.readdirSync(UPLOADS)) {
      const p = path.join(UPLOADS, f);
      if (fs.statSync(p).isFile()) ins.run(f, fs.readFileSync(p));
    }
  } finally { b.close(); }
  return nama;
}

function daftar() {
  return fs.readdirSync(DIR).filter((f) => AMAN.test(f)).map((f) => {
    const st = fs.statSync(path.join(DIR, f));
    return { nama: f, ukuran: st.size, dibuat: st.mtimeMs, jenis: f.startsWith('otomatis') ? 'otomatis' : f.startsWith('sebelum') ? 'sebelum pemulihan' : 'manual' };
  }).sort((a, b) => b.dibuat - a.dibuat);
}

/** Periksa berkas cadangan sebelum dipakai. */
function periksa(file) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head.toString('latin1', 0, 15) !== 'SQLite format 3') throw httpError(400, 'Berkas bukan cadangan TKA yang valid.');
  const t = new DatabaseSync(file, { readOnly: true });
  try {
    for (const tbl of ['pengguna', 'sekolah', 'soal', 'ujian']) {
      if (!t.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tbl)) throw httpError(400, 'Berkas cadangan tidak lengkap.');
    }
    if (!t.prepare(`SELECT 1 FROM pengguna WHERE peran = 'superadmin' LIMIT 1`).get()) throw httpError(400, 'Cadangan tidak memuat akun superadmin.');
    const ok = t.prepare('PRAGMA integrity_check').get();
    if (Object.values(ok)[0] !== 'ok') throw httpError(400, 'Berkas cadangan rusak.');
  } finally { t.close(); }
}

/** Siapkan pemulihan lalu mulai ulang aplikasi (Docker otomatis menyalakannya kembali). */
function jadwalkanPulih(sumber, salin = true) {
  periksa(sumber);
  buatCadangan('sebelum-pulihkan');
  if (salin) fs.copyFileSync(sumber, RESTORE_FILE); else fs.renameSync(sumber, RESTORE_FILE);
  audit('pemulihan dijadwalkan dari', path.basename(sumber));
  setTimeout(() => process.exit(0), 800);
}

route('GET', '/api/backup', (ctx) => { requireRole(ctx, 'superadmin'); return daftar(); });
route('POST', '/api/backup', (ctx) => { requireRole(ctx, 'superadmin'); return { nama: buatCadangan('manual') }; });
route('DELETE', '/api/backup/:nama', (ctx) => {
  requireRole(ctx, 'superadmin');
  if (!AMAN.test(ctx.params.nama)) throw httpError(400, 'Nama berkas tidak valid.');
  fs.rmSync(path.join(DIR, ctx.params.nama), { force: true });
  return true;
});

route('GET', '/api/backup/unduh/:nama', (ctx, res) => {
  requireRole(ctx, 'superadmin');
  const nama = ctx.params.nama;
  const file = path.join(DIR, nama);
  if (!AMAN.test(nama) || !fs.existsSync(file)) throw httpError(404, 'Berkas tidak ditemukan.');
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Content-Disposition': `attachment; filename="TKA2026-${nama}"` });
  fs.createReadStream(file).pipe(res);
}, { raw: true });

route('POST', '/api/backup/pulihkan/:nama', (ctx) => {
  requireRole(ctx, 'superadmin');
  if (ctx.impersonator) throw httpError(400, 'Tidak bisa saat mode pratinjau.');
  const file = path.join(DIR, ctx.params.nama);
  if (!AMAN.test(ctx.params.nama) || !fs.existsSync(file)) throw httpError(404, 'Berkas tidak ditemukan.');
  jadwalkanPulih(file, true);
  return { mulai_ulang: true };
});

// unggah berkas cadangan (.db) dari komputer → dipulihkan
route('POST', '/api/backup/unggah', async (ctx, res) => {
  requireRole(ctx, 'superadmin');
  const tmp = path.join(DIR, `unggahan-${Date.now()}.tmp`);
  try {
    let size = 0;
    const out = fs.createWriteStream(tmp);
    for await (const c of ctx.req) {
      size += c.length;
      if (size > 1024 * 1024 * 1024) throw httpError(413, 'Berkas terlalu besar (maks 1 GB).');
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r) => out.end(r));
    jadwalkanPulih(tmp, false);
    const body = JSON.stringify({ ok: true, data: { mulai_ulang: true } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.status ? e.message : 'Gagal memproses berkas.' }));
  }
}, { raw: true, bodyRaw: true });

// ---------- cadangan otomatis harian ----------
export function cadanganOtomatis() {
  const hari = stamp().slice(0, 10);
  const ada = daftar().filter((b) => b.jenis === 'otomatis');
  if (ada.some((b) => b.nama.startsWith(`otomatis-${hari}`))) return;
  buatCadangan('otomatis');
  for (const b of daftar().filter((x) => x.jenis === 'otomatis').slice(SIMPAN_OTOMATIS)) fs.rmSync(path.join(DIR, b.nama), { force: true });
  console.log('Cadangan otomatis harian dibuat.');
}

// ---------- cadangan per sekolah (admin sekolah) ----------
const COLS = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

route('GET', '/api/sekolah-backup', (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (!npsn) throw httpError(400, 'Pilih sekolah.');
  const sekolah = one('SELECT * FROM sekolah WHERE npsn = ?', npsn);
  if (!sekolah) throw httpError(404, 'Sekolah tidak ditemukan.');
  const pengguna = all(`SELECT * FROM pengguna WHERE npsn = ? AND peran IN ('siswa','guru')`, npsn).map(({ sesi_login, ...p }) => p);
  const ujian = all('SELECT * FROM ujian WHERE npsn = ?', npsn);
  const ids = ujian.map((u) => u.id);
  const peserta = ids.length ? all(`SELECT * FROM peserta_ujian WHERE ujian_id IN (${ids.join(',')})`) : [];
  const pids = peserta.map((p) => p.id);
  const jawaban = pids.length ? all(`SELECT * FROM jawaban WHERE peserta_id IN (${pids.join(',')})`) : [];
  return { format: 'tka-2026-sekolah', versi: 1, dibuat: new Date().toISOString(), sekolah, pengguna, ujian, peserta, jawaban };
});

route('POST', '/api/sekolah-backup/pulihkan', (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const d = ctx.body?.data;
  if (d?.format !== 'tka-2026-sekolah') throw httpError(400, 'Berkas bukan cadangan sekolah TKA 2026.');
  const npsn = scopeNpsn(ctx, d.sekolah?.npsn);
  if (!npsn || d.sekolah.npsn !== npsn) throw httpError(400, `Cadangan ini milik NPSN ${d.sekolah?.npsn}, bukan sekolah Anda.`);
  if (!one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw httpError(404, 'Sekolah tidak ditemukan.');
  const insert = (t, row, skip = ['id']) => {
    const cols = COLS(t).filter((c) => !skip.includes(c) && row[c] !== undefined);
    return Number(run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => row[c])).lastInsertRowid);
  };
  const hasil = tx(() => {
    // profil sekolah
    const sc = COLS('sekolah').filter((c) => c !== 'npsn' && c !== 'is_demo' && d.sekolah[c] !== undefined);
    run(`UPDATE sekolah SET ${sc.map((c) => `${c} = ?`).join(', ')} WHERE npsn = ?`, ...sc.map((c) => d.sekolah[c]), npsn);
    // ganti data siswa/guru & ujian sekolah (ujian massal pusat dipertahankan)
    run(`DELETE FROM pengguna WHERE npsn = ? AND peran IN ('siswa','guru')`, npsn);
    run('DELETE FROM ujian WHERE npsn = ? AND massal_id IS NULL', npsn);
    const mapUser = new Map(), mapUjian = new Map(), mapPeserta = new Map();
    for (const p of d.pengguna || []) {
      if (one('SELECT 1 FROM pengguna WHERE username = ?', p.username)) throw httpError(400, `Username ${p.username} sudah dipakai sekolah lain.`);
      mapUser.set(p.id, insert('pengguna', { ...p, npsn, sesi_login: null }));
    }
    for (const u of d.ujian || []) {
      if (u.massal_id) {
        const ada = one('SELECT id FROM ujian WHERE npsn = ? AND massal_id = ?', npsn, u.massal_id);
        if (ada) mapUjian.set(u.id, ada.id);
        continue;
      }
      if (!one('SELECT 1 FROM mapel WHERE kode = ?', u.mapel) || !one('SELECT 1 FROM kategori WHERE kode = ?', u.kategori)) continue;
      mapUjian.set(u.id, insert('ujian', { ...u, npsn }));
    }
    for (const p of d.peserta || []) {
      const uj = mapUjian.get(p.ujian_id), sw = mapUser.get(p.siswa_id);
      if (!uj || !sw) continue;
      mapPeserta.set(p.id, insert('peserta_ujian', { ...p, ujian_id: uj, siswa_id: sw }));
    }
    let nj = 0;
    for (const j of d.jawaban || []) {
      const pid = mapPeserta.get(j.peserta_id);
      if (!pid || !one('SELECT 1 FROM soal WHERE id = ?', j.soal_id)) continue;
      insert('jawaban', { ...j, peserta_id: pid, dikoreksi_oleh: null });
      nj++;
    }
    return { pengguna: mapUser.size, ujian: mapUjian.size, peserta: mapPeserta.size, jawaban: nj };
  });
  audit('pulihkan sekolah', npsn, JSON.stringify(hasil));
  notify(npsn);
  return hasil;
}, { limit: 300 * 1024 * 1024 });
