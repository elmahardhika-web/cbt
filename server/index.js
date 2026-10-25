import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import './log.js';
import { DATA_DIR, siapkanSkema, muatPengaturan, saatPengaturanBerubah, pool } from './db.js';
import { dengarkan, siarkan, tutupRedis } from './redis.js';
import { handleApi } from './router.js';
import { seedAwal, buatDataDemo, lengkapiTryoutDemo } from './seed.js';
import { sweepExpired, nilaiUlangKategori } from './util.js';
import { notify } from './events.js';
import './api-umum.js';
import './api-soal.js';
import './api-ujian.js';
import './api-laporan.js';
import './api-massal.js';
import './api-pengajuan.js';
import { cadanganOtomatis, migrasiDariSqlite } from './backup.js';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(import.meta.dirname, '..', 'public');
const UPLOADS = path.join(DATA_DIR, 'uploads');

// tunggu PostgreSQL siap (container database bisa menyala belakangan)
for (let i = 1; ; i++) {
  try { await pool.query('SELECT 1'); break; } catch (e) {
    if (i >= 30) { console.error('PostgreSQL tidak bisa dihubungi:', e.message); process.exit(1); }
    console.log(`Menunggu PostgreSQL… (${e.message})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
await siapkanSkema();

// pengaturan disimpan di memori tiap instans; perubahan di satu instans disiarkan ke yang lain
saatPengaturanBerubah(() => siarkan('pengaturan', 'muat'));
dengarkan('pengaturan', () => muatPengaturan().catch((e) => console.error('Gagal memuat pengaturan:', e)));

try {
  const m = await migrasiDariSqlite();
  if (m) console.log('Migrasi data lama selesai:', JSON.stringify(m.tabel), `${m.berkas} berkas`);
} catch (e) { console.error('Migrasi dari SQLite gagal:', e); }

if (await seedAwal()) {
  console.log('Database baru dibuat dengan akun bawaan.');
  if (process.env.SEED_DEMO === '1') console.log('Data demo:', await buatDataDemo());
} else if (process.env.SEED_DEMO === '1') {
  try { const n = await lengkapiTryoutDemo(); if (n) console.log(`Data demo: ${n} jadwal try out ditambahkan`); } catch (e) { console.error('Gagal melengkapi data demo:', e); }
}
try { const n = await nilaiUlangKategori(); if (n) console.log(`Skor soal kategori dinilai ulang: ${n} peserta`); } catch (e) { console.error('Gagal menilai ulang soal kategori:', e); }

let menyapu = false;
setInterval(async () => {
  if (menyapu) return;
  menyapu = true;
  try { const n = await sweepExpired(notify); if (n) console.log(`${n} ujian dikumpulkan otomatis (waktu/jam sesi habis)`); } catch (e) { console.error(e); } finally { menyapu = false; }
}, 10e3);

// cadangan otomatis harian (diperiksa tiap jam, dibuat sekali sehari); BACKUP_OTOMATIS=0 mematikannya
const cadangan = () => cadanganOtomatis().catch((e) => console.error('Cadangan otomatis gagal:', e));
if (process.env.BACKUP_OTOMATIS !== '0') {
  setTimeout(cadangan, 60e3);
  setInterval(cadangan, 3600e3);
}

// pembaruan aplikasi: berkas data/.muat-ulang memicu restart (Docker menyalakan kembali dengan kode terbaru)
setInterval(() => {
  const f = path.join(DATA_DIR, '.muat-ulang');
  if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); console.log('Memuat ulang aplikasi…'); setTimeout(() => process.exit(0), 300); }
}, 5e3);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function serveFile(res, base, rel, cache) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return false;
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': cache,
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let p = decodeURIComponent(url.pathname);
  if (p.startsWith('/uploads/') && serveFile(res, UPLOADS, p.slice(9), 'public, max-age=31536000, immutable')) return;
  if (p === '/') p = '/index.html';
  const cache = p.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache';
  if (serveFile(res, PUBLIC, p, cache)) return;
  // aplikasi satu halaman: rute lain kembali ke index.html
  if (!path.extname(p) && serveFile(res, PUBLIC, '/index.html', 'no-cache')) return;
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Tidak ditemukan');
});

server.listen(PORT, () => console.log(`TKA 2026 berjalan di http://localhost:${PORT} (data: ${DATA_DIR})`));

// berhenti dengan rapi saat container dihentikan
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`Menerima ${sig}, menutup koneksi…`);
    server.close();
    setTimeout(async () => { await pool.end().catch(() => {}); await tutupRedis(); process.exit(0); }, 500);
  });
}
