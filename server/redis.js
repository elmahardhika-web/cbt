// Redis: cache data publik, siaran perubahan antar-instans, dan pembatas laju (rate limiter).
// Bila REDIS_URL kosong / Redis tidak terjangkau, semuanya jatuh ke memori lokal agar aplikasi tetap berjalan.
import Redis from 'ioredis';

const URL = process.env.REDIS_URL || '';
const PREFIX = process.env.REDIS_PREFIX || 'tka:';

let cmd = null;   // koneksi perintah
let sub = null;   // koneksi khusus berlangganan (pub/sub)
let siap = false;

function buat() {
  return new Redis(URL, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: (n) => Math.min(n * 500, 5000) });
}

if (URL) {
  cmd = buat();
  sub = buat();
  cmd.on('ready', () => { siap = true; console.log('Redis tersambung.'); });
  cmd.on('end', () => { siap = false; });
  cmd.on('error', (e) => { if (siap) console.error('Redis bermasalah:', e.message); siap = false; });
  sub.on('error', () => {});
}

export const redisAktif = () => siap;

// ---------- cache ----------
const lokal = new Map(); // kunci -> { nilai, sampai }

export async function cacheGet(kunci) {
  if (siap) {
    try { const v = await cmd.get(PREFIX + kunci); return v == null ? undefined : JSON.parse(v); } catch { /* jatuh ke lokal */ }
  }
  const x = lokal.get(kunci);
  if (x && x.sampai > Date.now()) return x.nilai;
  lokal.delete(kunci);
  return undefined;
}

export async function cacheSet(kunci, nilai, detik) {
  lokal.set(kunci, { nilai, sampai: Date.now() + detik * 1000 });
  if (lokal.size > 500) for (const [k, v] of lokal) if (v.sampai < Date.now()) lokal.delete(k);
  if (siap) { try { await cmd.set(PREFIX + kunci, JSON.stringify(nilai), 'EX', detik); } catch { /* abaikan */ } }
}

export async function cacheHapus(...kunci) {
  for (const k of kunci) lokal.delete(k);
  if (siap && kunci.length) { try { await cmd.del(...kunci.map((k) => PREFIX + k)); } catch { /* abaikan */ } }
}

/** Ambil dari cache; bila kosong hitung dengan fn lalu simpan selama `detik`. */
export async function cached(kunci, detik, fn) {
  const ada = await cacheGet(kunci);
  if (ada !== undefined) return ada;
  const v = await fn();
  await cacheSet(kunci, v, detik);
  return v;
}

// ---------- siaran antar-instans ----------
const pendengar = new Map(); // kanal -> Set<fn>

export function dengarkan(kanal, fn) {
  if (!pendengar.has(kanal)) {
    pendengar.set(kanal, new Set());
    if (sub) sub.subscribe(PREFIX + kanal).catch(() => {});
  }
  pendengar.get(kanal).add(fn);
}

if (sub) {
  sub.on('message', (kanal, pesan) => {
    const k = kanal.slice(PREFIX.length);
    let data = pesan;
    try { data = JSON.parse(pesan); } catch { /* teks biasa */ }
    for (const fn of pendengar.get(k) || []) { try { fn(data); } catch (e) { console.error(e); } }
  });
}

/** Kirim ke semua instans (termasuk diri sendiri). */
export function siarkan(kanal, data) {
  if (siap) {
    cmd.publish(PREFIX + kanal, JSON.stringify(data)).catch(() => lokalSiar(kanal, data));
    return;
  }
  lokalSiar(kanal, data);
}
function lokalSiar(kanal, data) {
  for (const fn of pendengar.get(kanal) || []) { try { fn(data); } catch (e) { console.error(e); } }
}

// ---------- pembatas laju (jendela geser) ----------
const jejak = new Map(); // kunci -> number[]

/**
 * Catat satu permintaan untuk `kunci`. Mengembalikan { izin, sisa, ulangDalam } dengan ulangDalam dalam detik.
 * Redis: sorted set per kunci (berlaku untuk semua instans). Tanpa Redis: memori lokal.
 */
export async function catatLaju(kunci, maks, detik) {
  const t = Date.now();
  const jendela = detik * 1000;
  if (siap) {
    try {
      const k = `${PREFIX}rl:${kunci}`;
      const r = await cmd.multi()
        .zremrangebyscore(k, 0, t - jendela)
        .zadd(k, t, `${t}-${Math.random().toString(36).slice(2, 8)}`)
        .zcard(k)
        .zrange(k, 0, 0, 'WITHSCORES')
        .pexpire(k, jendela)
        .exec();
      const n = r[2][1];
      const tertua = Number(r[3][1]?.[1] || t);
      return { izin: n <= maks, sisa: Math.max(0, maks - n), ulangDalam: Math.ceil((tertua + jendela - t) / 1000) };
    } catch { /* jatuh ke lokal */ }
  }
  const a = (jejak.get(kunci) || []).filter((x) => t - x < jendela);
  a.push(t);
  jejak.set(kunci, a);
  if (jejak.size > 20000) for (const [k, v] of jejak) if (!v.length || t - v[v.length - 1] > 3600e3) jejak.delete(k);
  return { izin: a.length <= maks, sisa: Math.max(0, maks - a.length), ulangDalam: Math.ceil((a[0] + jendela - t) / 1000) };
}

export async function hapusLaju(kunci) {
  jejak.delete(kunci);
  if (siap) { try { await cmd.del(`${PREFIX}rl:${kunci}`); } catch { /* abaikan */ } }
}

export async function tutupRedis() {
  try { await cmd?.quit(); await sub?.quit(); } catch { /* abaikan */ }
}
