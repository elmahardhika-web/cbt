// Siaran perubahan ke layar monitor (Server-Sent Events), per sekolah.
// Perubahan disiarkan lewat Redis agar monitor yang terhubung ke instans lain ikut diperbarui.
import { dengarkan, siarkan } from './redis.js';

const subs = new Map(); // npsn -> Set<res>
const dirty = new Set();

export function subscribe(npsn, res) {
  if (!subs.has(npsn)) subs.set(npsn, new Set());
  subs.get(npsn).add(res);
  return () => subs.get(npsn)?.delete(res);
}

// npsn null = monitor pusat (semua sekolah)
dengarkan('monitor', (npsn) => {
  if (subs.has(npsn)) dirty.add(npsn);
  if (subs.has(null)) dirty.add(null);
});

/** Tandai ada perubahan; dikirim bertahap tiap detik agar tidak membanjiri. */
const tertunda = new Set();
export function notify(npsn) {
  if (npsn) tertunda.add(npsn);
}
setInterval(() => {
  for (const npsn of tertunda) siarkan('monitor', npsn);
  tertunda.clear();
}, 500);

function kirim(npsn, event) {
  for (const res of subs.get(npsn) || []) {
    try { res.write(`event: ${event}\ndata: ${Date.now()}\n\n`); } catch { /* koneksi tertutup */ }
  }
}

setInterval(() => {
  for (const npsn of dirty) kirim(npsn, 'update');
  dirty.clear();
}, 1000);

// detak rutin: menjaga koneksi & memperbarui status online→offline walau tak ada aksi siswa
setInterval(() => { for (const npsn of subs.keys()) kirim(npsn, 'tick'); }, 10e3);
