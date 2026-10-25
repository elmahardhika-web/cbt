// Cadangan (backup) & pemulihan (restore) untuk PostgreSQL.
// Format berkas: .tka.gz = gzip berisi baris-baris JSON (NDJSON): kepala, baris tabel {t, r}, dan berkas unggahan {f, d}.
// Pemulihan juga menerima berkas .db dari TKA versi lama (SQLite) sehingga data V2 bisa dipindahkan langsung.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { route } from './router.js';
import { all, one, run, tx, query, insertId, kolomTabel, sisipkanBanyak, setelUrutanId, muatPengaturan, TABEL, DATA_DIR } from './db.js';
import { httpError, requireRole } from './auth.js';
import { scopeNpsn, audit } from './util.js';
import { notify } from './events.js';
import { siarkan } from './redis.js';

const DIR = path.join(DATA_DIR, 'backup');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const AMAN = /^[\w.-]+\.(tka\.gz|db)$/;
const SIMPAN_OTOMATIS = 7; // jumlah cadangan harian yang disimpan
const FORMAT = 'tka-2026-cadangan';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Tulis seluruh isi database + gambar unggahan ke satu berkas .tka.gz (snapshot konsisten). */
export async function buatCadangan(awalan = 'manual', { eksklusif = false } = {}) {
  const nama = `${awalan}-${stamp()}.tka.gz`;
  const file = path.join(DIR, nama);
  const tmp = `${file}.tmp`;
  const gz = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(tmp);
  const selesai = pipeline(gz, out);
  selesai.catch(() => {}); // galat ditangani di bawah; cegah penolakan tak tertangani saat dibatalkan
  const tulis = (obj) => new Promise((res) => { if (gz.write(JSON.stringify(obj) + '\n')) res(); else gz.once('drain', res); });
  let dilewati = false;
  try {
    await tx(async () => {
      await query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      // beberapa instans aplikasi: hanya satu yang membuat cadangan otomatis
      if (eksklusif && !(await one('SELECT pg_try_advisory_xact_lock(20262029) AS dapat')).dapat) { dilewati = true; return; }
      await tulis({ format: FORMAT, versi: 3, dibuat: new Date().toISOString(), tabel: TABEL });
      for (const t of TABEL) {
        for (let off = 0; ; off += 5000) {
          const rows = await all(`SELECT * FROM ${t} ORDER BY 1 LIMIT 5000 OFFSET ?`, off);
          for (const r of rows) await tulis({ t, r });
          if (rows.length < 5000) break;
        }
      }
    });
    if (dilewati) { gz.destroy(); fs.rmSync(tmp, { force: true }); return null; }
    for (const f of fs.readdirSync(UPLOADS)) {
      const p = path.join(UPLOADS, f);
      if (fs.statSync(p).isFile()) await tulis({ f, d: fs.readFileSync(p).toString('base64') });
    }
    gz.end();
    await selesai;
    fs.renameSync(tmp, file);
  } catch (e) {
    gz.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return nama;
}

function daftar() {
  return fs.readdirSync(DIR).filter((f) => AMAN.test(f)).map((f) => {
    const st = fs.statSync(path.join(DIR, f));
    return {
      nama: f, ukuran: st.size, dibuat: st.mtimeMs, format: f.endsWith('.db') ? 'sqlite (versi lama)' : 'postgresql',
      jenis: f.startsWith('otomatis') ? 'otomatis' : f.startsWith('sebelum') ? 'sebelum pemulihan' : 'manual',
    };
  }).sort((a, b) => b.dibuat - a.dibuat);
}

function jenisBerkas(file) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head[0] === 0x1f && head[1] === 0x8b) return 'gzip';
  if (head.toString('latin1', 0, 15) === 'SQLite format 3') return 'sqlite';
  throw httpError(400, 'Berkas bukan cadangan TKA yang valid.');
}

/** Baca sumber cadangan sebagai rangkaian {t, r} / {f, d}. */
async function* bacaGzip(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let kepala = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const x = JSON.parse(line);
    if (!kepala) {
      if (x.format !== FORMAT) throw httpError(400, 'Berkas bukan cadangan TKA 2026.');
      kepala = x;
      continue;
    }
    yield x;
  }
  if (!kepala) throw httpError(400, 'Berkas cadangan kosong.');
}

async function* bacaSqlite(file) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { throw httpError(400, 'Server ini tidak bisa membaca berkas .db versi lama (butuh Node.js 22.5+).'); }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const ada = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name));
    for (const t of ['pengguna', 'sekolah', 'soal', 'ujian']) if (!ada.has(t)) throw httpError(400, 'Berkas cadangan tidak lengkap.');
    for (const t of TABEL) {
      if (!ada.has(t)) continue;
      for (const r of db.prepare(`SELECT * FROM ${t}`).iterate()) yield { t, r };
    }
    if (ada.has('_berkas')) for (const b of db.prepare('SELECT nama, isi FROM _berkas').iterate()) yield { f: b.nama, d: Buffer.from(b.isi).toString('base64') };
  } finally { db.close(); }
}

/**
 * Ganti seluruh isi database dengan isi berkas cadangan (dalam satu transaksi: gagal = tidak ada yang berubah).
 * Tidak perlu memulai ulang aplikasi.
 */
export async function pulihkanDari(file, { cadangkanDulu = true } = {}) {
  const jenis = jenisBerkas(file);
  if (cadangkanDulu) await buatCadangan('sebelum-pulihkan');
  const sumber = jenis === 'gzip' ? bacaGzip(file) : bacaSqlite(file);
  const kolom = {};
  for (const t of TABEL) kolom[t] = new Set(await kolomTabel(t));
  const jumlah = {};
  let berkas = 0;
  await tx(async () => {
    await query(`TRUNCATE ${TABEL.join(', ')} RESTART IDENTITY CASCADE`);
    let tabel = null, buf = [];
    const kuras = async () => {
      if (!buf.length) return;
      const cols = [...new Set(buf.flatMap((r) => Object.keys(r)))].filter((c) => kolom[tabel].has(c));
      await sisipkanBanyak(tabel, cols, buf);
      jumlah[tabel] = (jumlah[tabel] || 0) + buf.length;
      buf = [];
    };
    for await (const x of sumber) {
      if (x.f) {
        fs.writeFileSync(path.join(UPLOADS, path.basename(x.f)), Buffer.from(x.d, 'base64'));
        berkas++;
        continue;
      }
      if (!kolom[x.t]) continue;
      if (x.t !== tabel) { await kuras(); tabel = x.t; }
      buf.push(normalBaris(x.t, x.r));
      if (buf.length >= 1000) await kuras();
    }
    await kuras();
    if (!(await one(`SELECT 1 FROM pengguna WHERE peran = 'superadmin' AND aktif = 1 LIMIT 1`))) throw httpError(400, 'Cadangan tidak memuat akun superadmin aktif.');
    await setelUrutanId();
  });
  await muatPengaturan();
  siarkan('pengaturan', 'muat');
  audit('database dipulihkan dari', path.basename(file), JSON.stringify(jumlah));
  return { tabel: jumlah, berkas };
}

/** Sesuaikan baris dari SQLite (BLOB, boolean) agar diterima PostgreSQL. */
function normalBaris(t, r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k] = v instanceof Uint8Array ? Buffer.from(v).toString('utf8') : typeof v === 'boolean' ? (v ? 1 : 0) : v;
  return o;
}

route('GET', '/api/backup', (ctx) => { requireRole(ctx, 'superadmin'); return daftar(); });
route('POST', '/api/backup', async (ctx) => { requireRole(ctx, 'superadmin'); return { nama: await buatCadangan('manual') }; });
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

route('POST', '/api/backup/pulihkan/:nama', async (ctx) => {
  requireRole(ctx, 'superadmin');
  if (ctx.impersonator) throw httpError(400, 'Tidak bisa saat mode pratinjau.');
  const file = path.join(DIR, ctx.params.nama);
  if (!AMAN.test(ctx.params.nama) || !fs.existsSync(file)) throw httpError(404, 'Berkas tidak ditemukan.');
  return { ...(await pulihkanDari(file)), mulai_ulang: true };
});

// unggah berkas cadangan (.tka.gz atau .db versi lama) dari komputer → dipulihkan
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
    const hasil = await pulihkanDari(tmp);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: { ...hasil, mulai_ulang: true } }));
  } catch (e) {
    if (!e.status) console.error('Pemulihan gagal:', e);
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.status ? e.message : `Gagal memulihkan: ${e.message}` }));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}, { raw: true, bodyRaw: true });

// ---------- cadangan otomatis harian ----------
export async function cadanganOtomatis() {
  const hari = stamp().slice(0, 10);
  if (daftar().some((b) => b.jenis === 'otomatis' && b.nama.startsWith(`otomatis-${hari}`))) return;
  if (!(await buatCadangan('otomatis', { eksklusif: true }))) return;
  for (const b of daftar().filter((x) => x.jenis === 'otomatis').slice(SIMPAN_OTOMATIS)) fs.rmSync(path.join(DIR, b.nama), { force: true });
  console.log('Cadangan otomatis harian dibuat.');
}

// ---------- cadangan per sekolah (admin sekolah) ----------
route('GET', '/api/sekolah-backup', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (!npsn) throw httpError(400, 'Pilih sekolah.');
  const sekolah = await one('SELECT * FROM sekolah WHERE npsn = ?', npsn);
  if (!sekolah) throw httpError(404, 'Sekolah tidak ditemukan.');
  const pengguna = (await all(`SELECT * FROM pengguna WHERE npsn = ? AND peran IN ('siswa','guru')`, npsn)).map(({ sesi_login, ...p }) => p);
  const ujian = await all('SELECT * FROM ujian WHERE npsn = ?', npsn);
  const ids = ujian.map((u) => u.id);
  const peserta = ids.length ? await all(`SELECT * FROM peserta_ujian WHERE ujian_id = ANY(?::int[])`, ids) : [];
  const pids = peserta.map((p) => p.id);
  const jawaban = pids.length ? await all(`SELECT * FROM jawaban WHERE peserta_id = ANY(?::int[])`, pids) : [];
  return { format: 'tka-2026-sekolah', versi: 1, dibuat: new Date().toISOString(), sekolah, pengguna, ujian, peserta, jawaban };
});

route('POST', '/api/sekolah-backup/pulihkan', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const d = ctx.body?.data;
  if (d?.format !== 'tka-2026-sekolah') throw httpError(400, 'Berkas bukan cadangan sekolah TKA 2026.');
  const npsn = scopeNpsn(ctx, d.sekolah?.npsn);
  if (!npsn || d.sekolah.npsn !== npsn) throw httpError(400, `Cadangan ini milik NPSN ${d.sekolah?.npsn}, bukan sekolah Anda.`);
  if (!(await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn))) throw httpError(404, 'Sekolah tidak ditemukan.');
  const COLS = {};
  for (const t of ['sekolah', 'pengguna', 'ujian', 'peserta_ujian', 'jawaban']) COLS[t] = await kolomTabel(t);
  const insert = (t, row, skip = ['id']) => {
    const cols = COLS[t].filter((c) => !skip.includes(c) && row[c] !== undefined);
    return insertId(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => row[c]));
  };
  const mapelAda = new Set((await all('SELECT kode FROM mapel')).map((r) => r.kode));
  const kategoriAda = new Set((await all('SELECT kode FROM kategori')).map((r) => r.kode));
  const hasil = await tx(async () => {
    // profil sekolah
    const sc = COLS.sekolah.filter((c) => c !== 'npsn' && c !== 'is_demo' && d.sekolah[c] !== undefined);
    await run(`UPDATE sekolah SET ${sc.map((c) => `${c} = ?`).join(', ')} WHERE npsn = ?`, ...sc.map((c) => d.sekolah[c]), npsn);
    // ganti data siswa/guru & ujian sekolah (ujian massal pusat dipertahankan)
    await run(`DELETE FROM pengguna WHERE npsn = ? AND peran IN ('siswa','guru')`, npsn);
    await run('DELETE FROM ujian WHERE npsn = ? AND massal_id IS NULL', npsn);
    const mapUser = new Map(), mapUjian = new Map(), mapPeserta = new Map();
    for (const p of d.pengguna || []) {
      if (await one('SELECT 1 FROM pengguna WHERE username = ?', p.username)) throw httpError(400, `Username ${p.username} sudah dipakai sekolah lain.`);
      mapUser.set(p.id, await insert('pengguna', { ...p, npsn, sesi_login: null }));
    }
    for (const u of d.ujian || []) {
      if (u.massal_id) {
        const ada = await one('SELECT id FROM ujian WHERE npsn = ? AND massal_id = ?', npsn, u.massal_id);
        if (ada) mapUjian.set(u.id, ada.id);
        continue;
      }
      if (!mapelAda.has(u.mapel) || !kategoriAda.has(u.kategori)) continue;
      mapUjian.set(u.id, await insert('ujian', { ...u, npsn }));
    }
    for (const p of d.peserta || []) {
      const uj = mapUjian.get(p.ujian_id), sw = mapUser.get(p.siswa_id);
      if (!uj || !sw) continue;
      mapPeserta.set(p.id, await insert('peserta_ujian', { ...p, ujian_id: uj, siswa_id: sw }));
    }
    const soalAda = new Set((await all('SELECT id FROM soal WHERE id = ANY(?::int[])', [...new Set((d.jawaban || []).map((j) => j.soal_id))])).map((r) => r.id));
    let nj = 0;
    for (const j of d.jawaban || []) {
      const pid = mapPeserta.get(j.peserta_id);
      if (!pid || !soalAda.has(j.soal_id)) continue;
      await insert('jawaban', { ...j, peserta_id: pid, dikoreksi_oleh: null });
      nj++;
    }
    return { pengguna: mapUser.size, ujian: mapUjian.size, peserta: mapPeserta.size, jawaban: nj };
  });
  audit('pulihkan sekolah', npsn, JSON.stringify(hasil));
  notify(npsn);
  return hasil;
}, { limit: 300 * 1024 * 1024 });

/**
 * Migrasi otomatis dari TKA versi lama: bila database PostgreSQL masih kosong dan berkas data/tka.db (SQLite) ada,
 * isinya dipindahkan sekali lalu berkas lama diganti nama agar tidak diimpor ulang.
 */
export async function migrasiDariSqlite() {
  const lama = path.join(DATA_DIR, 'tka.db');
  if (!fs.existsSync(lama)) return null;
  if (await one('SELECT 1 FROM pengguna LIMIT 1')) return null;
  console.log('Memindahkan data dari database lama (SQLite) ke PostgreSQL…');
  const hasil = await pulihkanDari(lama, { cadangkanDulu: false });
  // berkas WAL ikut dipindah agar salinan lama tetap utuh bila suatu saat dibutuhkan
  const tujuan = path.join(DATA_DIR, `tka-v2-sudah-dimigrasi-${stamp()}.db`);
  fs.renameSync(lama, tujuan);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(lama + ext)) fs.renameSync(lama + ext, tujuan + ext);
  return hasil;
}

