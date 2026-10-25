import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'data'));
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

fs.mkdirSync(path.join(DATA_DIR, 'backup'), { recursive: true });

// Pemulihan cadangan: berkas restore.db yang disiapkan sebelum restart menggantikan database aktif.
const DB_FILE = path.join(DATA_DIR, 'tka.db');
const RESTORE_FILE = path.join(DATA_DIR, 'restore.db');
let dipulihkan = false;
if (fs.existsSync(RESTORE_FILE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (fs.existsSync(DB_FILE)) fs.renameSync(DB_FILE, path.join(DATA_DIR, 'backup', `sebelum-pulihkan-${stamp}.db`));
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_FILE + ext, { force: true });
  fs.renameSync(RESTORE_FILE, DB_FILE);
  dipulihkan = true;
}

export const db = new DatabaseSync(DB_FILE);
try {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
} catch (e) {
  // beberapa sistem berkas folder bersama tidak mendukung WAL
  console.error('Mode WAL tidak didukung, memakai mode jurnal biasa:', e.message);
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;');
}
db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS pengaturan (kunci TEXT PRIMARY KEY, nilai TEXT);

CREATE TABLE IF NOT EXISTS sekolah (
  npsn TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  provinsi_kode TEXT, provinsi TEXT,
  kabkota_kode TEXT, kabkota TEXT,
  kecamatan TEXT, kelurahan TEXT,
  alamat TEXT, kepala_sekolah TEXT, nip_kepsek TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- kecamatan/kelurahan yang diketik sekolah; baris dengan kelurahan '' = entri kecamatan
CREATE TABLE IF NOT EXISTS wilayah_lokal (
  id INTEGER PRIMARY KEY,
  kabkota_kode TEXT NOT NULL,
  kecamatan TEXT NOT NULL,
  kelurahan TEXT NOT NULL DEFAULT '',
  UNIQUE (kabkota_kode, kecamatan, kelurahan)
);

CREATE TABLE IF NOT EXISTS pengguna (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_awal TEXT, -- password awal siswa untuk kartu peserta; dihapus saat siswa menggantinya
  peran TEXT NOT NULL CHECK (peran IN ('superadmin','supervisor','admin','guru','siswa')),
  nama TEXT NOT NULL DEFAULT '',
  npsn TEXT REFERENCES sekolah(npsn) ON DELETE CASCADE ON UPDATE CASCADE,
  kelas TEXT, sesi TEXT, jk TEXT, nik TEXT, tgl_lahir TEXT, nip TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  bisa_monitor INTEGER NOT NULL DEFAULT 0,
  sesi_login TEXT,
  last_active INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_pengguna_npsn ON pengguna (npsn, peran);

CREATE TABLE IF NOT EXISTS mapel (kode TEXT PRIMARY KEY, nama TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1, urutan INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kategori (kode TEXT PRIMARY KEY, nama TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1, urutan INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS soal (
  id INTEGER PRIMARY KEY,
  penulis_id INTEGER REFERENCES pengguna(id) ON DELETE SET NULL,
  mapel TEXT NOT NULL REFERENCES mapel(kode) ON UPDATE CASCADE,
  kategori TEXT NOT NULL REFERENCES kategori(kode) ON UPDATE CASCADE,
  tipe TEXT NOT NULL CHECK (tipe IN ('pilihan_ganda','pilihan_ganda_kompleks','benar_salah','pg_kategori','menjodohkan','isian','uraian')),
  pertanyaan TEXT NOT NULL,
  opsi TEXT NOT NULL DEFAULT 'null',
  kunci TEXT NOT NULL DEFAULT 'null',
  skor_maks REAL NOT NULL DEFAULT 1,
  nomor INTEGER NOT NULL DEFAULT 0,
  aktif INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','menunggu','disetujui','revisi')),
  catatan_telaah TEXT,
  ditelaah_oleh INTEGER REFERENCES pengguna(id) ON DELETE SET NULL,
  ditelaah_at INTEGER,
  diajukan_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS idx_soal_paket ON soal (mapel, kategori, status, aktif);

CREATE TABLE IF NOT EXISTS ujian (
  id INTEGER PRIMARY KEY,
  npsn TEXT NOT NULL REFERENCES sekolah(npsn) ON DELETE CASCADE ON UPDATE CASCADE,
  mapel TEXT NOT NULL REFERENCES mapel(kode) ON UPDATE CASCADE,
  kategori TEXT NOT NULL REFERENCES kategori(kode) ON UPDATE CASCADE,
  durasi INTEGER NOT NULL DEFAULT 60,
  sesi TEXT NOT NULL DEFAULT 'SEMUA',
  kelas TEXT NOT NULL DEFAULT 'SEMUA',
  tanggal TEXT, jam_mulai TEXT, jam_selesai TEXT,
  token TEXT,
  aktif INTEGER NOT NULL DEFAULT 0,
  acak INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS peserta_ujian (
  id INTEGER PRIMARY KEY,
  ujian_id INTEGER NOT NULL REFERENCES ujian(id) ON DELETE CASCADE,
  siswa_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'mengerjakan' CHECK (status IN ('mengerjakan','selesai','absen')),
  urutan TEXT NOT NULL DEFAULT '[]',
  mulai_at INTEGER, batas_at INTEGER, selesai_at INTEGER, last_active INTEGER,
  keluar_layar INTEGER NOT NULL DEFAULT 0,
  skor REAL, skor_maks REAL, nilai REAL,
  perlu_koreksi INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ujian_id, siswa_id)
);
CREATE INDEX IF NOT EXISTS idx_peserta_siswa ON peserta_ujian (siswa_id);

CREATE TABLE IF NOT EXISTS jawaban (
  id INTEGER PRIMARY KEY,
  peserta_id INTEGER NOT NULL REFERENCES peserta_ujian(id) ON DELETE CASCADE,
  soal_id INTEGER NOT NULL REFERENCES soal(id) ON DELETE CASCADE,
  jawaban TEXT,
  ragu INTEGER NOT NULL DEFAULT 0,
  skor REAL,
  dikoreksi INTEGER NOT NULL DEFAULT 0,
  catatan TEXT,
  dikoreksi_oleh INTEGER REFERENCES pengguna(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE (peserta_id, soal_id)
);
CREATE INDEX IF NOT EXISTS idx_jawaban_soal ON jawaban (soal_id);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  soal_id INTEGER NOT NULL REFERENCES soal(id) ON DELETE CASCADE,
  siswa_id INTEGER REFERENCES pengguna(id) ON DELETE SET NULL,
  pesan TEXT NOT NULL,
  dibaca INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
`);

// migrasi ringan: tambah kolom bila belum ada
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('pengguna', 'terkunci', 'INTEGER NOT NULL DEFAULT 0'); // dikunci karena upaya keluar ujian
addColumn('peserta_ujian', 'durasi_ms', 'INTEGER');               // jatah waktu pengerjaan
addColumn('peserta_ujian', 'terpakai_ms', 'INTEGER NOT NULL DEFAULT 0');
addColumn('peserta_ujian', 'aktif_sejak', 'INTEGER');             // null = waktu sedang dijeda
addColumn('peserta_ujian', 'selesai_karena', 'TEXT');             // siswa | waktu | jam | proktor
addColumn('sekolah', 'logo_url', 'TEXT');
addColumn('sekolah', 'ttd_url', 'TEXT');                          // tanda tangan kepala sekolah
addColumn('sekolah', 'target_capaian', 'REAL');                   // kosong = ikut target pusat
addColumn('sekolah', 'lat', 'REAL');                              // koordinat opsional (peta sebaran)
addColumn('sekolah', 'lng', 'REAL');
addColumn('ujian', 'massal_id', 'INTEGER');                       // diisi bila ujian dibuat massal oleh pusat
db.exec(`CREATE TABLE IF NOT EXISTS ujian_massal (
  id INTEGER PRIMARY KEY,
  nama TEXT,
  mapel TEXT NOT NULL REFERENCES mapel(kode) ON UPDATE CASCADE,
  kategori TEXT NOT NULL REFERENCES kategori(kode) ON UPDATE CASCADE,
  durasi INTEGER NOT NULL DEFAULT 60,
  sesi TEXT NOT NULL DEFAULT 'SEMUA', kelas TEXT NOT NULL DEFAULT 'SEMUA',
  tanggal TEXT, jam_mulai TEXT, jam_selesai TEXT,
  acak INTEGER NOT NULL DEFAULT 1,
  token_sama INTEGER NOT NULL DEFAULT 1,
  token TEXT,
  aktif INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_ujian_massal ON ujian (massal_id)');
// pengajuan akun sekolah dari halaman publik; disetujui/ditolak superadmin
db.exec(`CREATE TABLE IF NOT EXISTS pengajuan_akun (
  id INTEGER PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  npsn TEXT NOT NULL, nama TEXT NOT NULL,
  provinsi_kode TEXT, provinsi TEXT, kabkota_kode TEXT, kabkota TEXT, kecamatan TEXT, kelurahan TEXT, alamat TEXT,
  pemohon_nama TEXT NOT NULL, pemohon_jabatan TEXT, pemohon_email TEXT, pemohon_hp TEXT,
  admin_username TEXT NOT NULL, admin_hash TEXT, catatan TEXT,
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak')),
  alasan TEXT, ip TEXT,
  dibuat_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  diputus_at INTEGER, diputus_oleh TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_pengajuan_status ON pengajuan_akun (status, dibuat_at)');

// berkas unggahan yang ikut di dalam cadangan dikembalikan ke folder uploads
if (dipulihkan) {
  try {
    const ada = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_berkas'`).get();
    if (ada) {
      for (const b of db.prepare('SELECT nama, isi FROM _berkas').all()) {
        const nama = path.basename(b.nama);
        fs.writeFileSync(path.join(DATA_DIR, 'uploads', nama), Buffer.from(b.isi));
      }
      db.exec('DROP TABLE _berkas');
    }
    console.log('Database dipulihkan dari cadangan.');
  } catch (e) { console.error('Gagal memulihkan berkas unggahan:', e); }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function setting(kunci, fallback = null) {
  const r = one('SELECT nilai FROM pengaturan WHERE kunci = ?', kunci);
  return r ? JSON.parse(r.nilai) : fallback;
}
export function setSetting(kunci, nilai) {
  run('INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON CONFLICT (kunci) DO UPDATE SET nilai = excluded.nilai', kunci, JSON.stringify(nilai));
}
