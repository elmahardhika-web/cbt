// Pindahkan isi database TKA versi lama (SQLite, berkas tka.db atau cadangan .db) ke PostgreSQL.
// PERINGATAN: isi database PostgreSQL tujuan DIGANTI seluruhnya.
// Pemakaian: DATABASE_URL=postgres://tka:pw@localhost:5432/tka node --disable-warning=ExperimentalWarning alat/migrasi-sqlite.mjs data/tka.db
// (Biasanya tidak perlu: aplikasi memindahkan data/tka.db otomatis saat database PostgreSQL masih kosong.)
import path from 'node:path';
import { siapkanSkema, pool } from '../server/db.js';
import { pulihkanDari } from '../server/backup.js';
import { tutupRedis } from '../server/redis.js';

const file = process.argv[2];
if (!file) { console.error('Sebutkan berkas .db yang akan dipindahkan.'); process.exit(1); }
await siapkanSkema();
const hasil = await pulihkanDari(path.resolve(file), { cadangkanDulu: false });
console.log('Selesai:', JSON.stringify(hasil.tabel), `${hasil.berkas} berkas gambar`);
await pool.end();
await tutupRedis();
process.exit(0);
