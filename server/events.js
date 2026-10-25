// Siaran perubahan ke layar monitor (Server-Sent Events), per sekolah.
const subs = new Map(); // npsn -> Set<res>
const dirty = new Set();

export function subscribe(npsn, res) {
  if (!subs.has(npsn)) subs.set(npsn, new Set());
  subs.get(npsn).add(res);
  return () => subs.get(npsn)?.delete(res);
}

/** Tandai ada perubahan; dikirim bertahap tiap detik agar tidak membanjiri. */
export function notify(npsn) {
  if (npsn && subs.has(npsn)) dirty.add(npsn);
}

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
