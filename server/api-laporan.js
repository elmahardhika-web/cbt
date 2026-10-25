import { route } from './router.js';
import { all, one } from './db.js';
import { httpError, requireRole } from './auth.js';
import { int, str, parseJSON, scopeNpsn, assertSekolahAccess, targetCapaian, kodeVerifikasi, cekKodeVerifikasi, sasaranUjian } from './util.js';
import { isManual, predikat } from './scoring.js';

const LEVEL = {
  provinsi: { kunci: (r) => r.provinsi_kode || '-', label: (r) => r.provinsi || 'Provinsi belum diisi' },
  kabkota: { kunci: (r) => r.kabkota_kode || '-', label: (r) => r.kabkota || 'Kab/Kota belum diisi', induk: (r) => r.provinsi },
  kecamatan: { kunci: (r) => `${r.kabkota_kode}|${r.kecamatan || '-'}`, label: (r) => r.kecamatan || 'Kecamatan belum diisi', induk: (r) => r.kabkota },
  kelurahan: { kunci: (r) => `${r.kabkota_kode}|${r.kecamatan}|${r.kelurahan || '-'}`, label: (r) => r.kelurahan || 'Kelurahan belum diisi', induk: (r) => [r.kecamatan, r.kabkota].filter(Boolean).join(', ') },
  sekolah: { kunci: (r) => r.npsn, label: (r) => r.sekolah, induk: (r) => [r.kelurahan, r.kecamatan, r.kabkota].filter(Boolean).join(', ') },
  kelas: { kunci: (r) => `${r.npsn}|${r.kelas}`, label: (r) => `Kelas ${r.kelas || '-'}`, induk: (r) => r.sekolah },
};

const r1 = (x) => (x == null || isNaN(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || isNaN(x) ? null : Math.round(x * 100) / 100);
const teks = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

function statistik(vals, batas) {
  const v = vals.filter((x) => x != null).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0, rata: null, median: null, maks: null, min: null, sd: null, tuntas: 0, persen_tuntas: null };
  const rata = v.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - rata) ** 2, 0) / n);
  const tuntas = v.filter((x) => x >= batas).length;
  return { n, rata: r1(rata), median: r1(median), maks: v[n - 1], min: v[0], sd: r1(sd), tuntas, persen_tuntas: r1((tuntas / n) * 100) };
}

/** Kumpulkan peserta selesai sesuai filter + rincian jawaban. */
function kumpulkan(ctx, q) {
  const npsn = scopeNpsn(ctx, q.npsn);
  if (npsn === '-') throw httpError(403, 'Akun ini tidak terhubung ke sekolah.');
  const where = [`pu.status = 'selesai'`];
  const args = [];
  const add = (cond, val) => { if (str(val)) { where.push(cond); args.push(str(val)); } };
  add('uj.mapel = ?', q.mapel);
  add('uj.kategori = ?', q.kategori);
  add('s.provinsi_kode = ?', q.provinsi);
  add('s.kabkota_kode = ?', q.kabkota);
  add('s.kecamatan = ?', q.kecamatan);
  add('s.kelurahan = ?', q.kelurahan);
  add('s.npsn = ?', npsn);
  add('p.kelas = ?', q.kelas);
  if (ctx.user.peran === 'guru' && ctx.user.kelas && !str(q.kelas)) add('p.kelas = ?', ctx.user.kelas);
  const w = where.join(' AND ');
  const rows = all(`SELECT pu.id, pu.nilai, pu.skor, pu.skor_maks, pu.urutan, pu.perlu_koreksi, pu.selesai_at, pu.mulai_at, pu.ujian_id,
      p.id AS siswa_id, p.nama, p.username, p.kelas, p.jk,
      s.npsn, s.nama AS sekolah, s.provinsi_kode, s.provinsi, s.kabkota_kode, s.kabkota, s.kecamatan, s.kelurahan,
      uj.mapel, uj.kategori
    FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id JOIN sekolah s ON s.npsn = uj.npsn
    WHERE ${w} ORDER BY pu.selesai_at`, ...args);
  // satu siswa satu hasil per paket (ambil yang terakhir)
  const map = new Map();
  for (const r of rows) map.set(`${r.siswa_id}|${r.mapel}|${r.kategori}`, r);
  const peserta = [...map.values()];
  const ids = new Set(peserta.map((p) => p.id));
  const jw = all(`SELECT j.peserta_id, j.soal_id, j.skor, j.jawaban FROM jawaban j JOIN peserta_ujian pu ON pu.id = j.peserta_id
    JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id JOIN sekolah s ON s.npsn = uj.npsn WHERE ${w}`, ...args)
    .filter((j) => ids.has(j.peserta_id));
  return { peserta, jw };
}

function analisis(ctx, q) {
  const batas = targetCapaian(scopeNpsn(ctx, q.npsn));
  const { peserta, jw } = kumpulkan(ctx, q);
  const soalIds = new Set();
  peserta.forEach((p) => { p.ids = parseJSON(p.urutan, []); delete p.urutan; p.ids.forEach((i) => soalIds.add(i)); });
  const soal = new Map(soalIds.size ? all(`SELECT id, nomor, tipe, pertanyaan, opsi, kunci, skor_maks, mapel, kategori FROM soal WHERE id IN (${[...soalIds].join(',')})`)
    .map((s) => [s.id, { ...s, opsi: parseJSON(s.opsi), kunci: parseJSON(s.kunci) }]) : []);
  const jmap = new Map();
  for (const j of jw) jmap.set(`${j.peserta_id}|${j.soal_id}`, j);

  // rincian skor per peserta (objektif vs manual)
  for (const p of peserta) {
    let os = 0, om = 0, ms = 0, mm = 0, adaManual = false;
    for (const id of p.ids) {
      const s = soal.get(id);
      if (!s) continue;
      const j = jmap.get(`${p.id}|${id}`);
      if (isManual(s)) { adaManual = true; ms += j?.skor ?? 0; mm += s.skor_maks; } else { os += j?.skor ?? 0; om += s.skor_maks; }
    }
    Object.assign(p, { skor_objektif: r2(os), maks_objektif: om, skor_manual: r2(ms), maks_manual: mm, ada_manual: adaManual });
  }

  const dinilai = peserta.filter((p) => p.nilai != null).sort((a, b) => b.nilai - a.nilai || a.nama.localeCompare(b.nama));
  let rank = 0;
  dinilai.forEach((p, i) => { if (i === 0 || p.nilai !== dinilai[i - 1].nilai) rank = i + 1; p.peringkat = rank; p.tuntas = p.nilai >= batas; });
  const menunggu = peserta.filter((p) => p.nilai == null).sort((a, b) => a.nama.localeCompare(b.nama));
  const ranking = [...dinilai, ...menunggu].map((p) => {
    const { ids, ...rest } = p;
    return rest;
  });

  // sebaran nilai (10 kelas interval)
  const distribusi = Array.from({ length: 10 }, (_, i) => ({ dari: i * 10, sampai: i === 9 ? 100 : i * 10 + 9.9, label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`, n: 0 }));
  dinilai.forEach((p) => { distribusi[Math.min(9, Math.floor(p.nilai / 10))].n++; });

  // analisis butir: tingkat kesukaran (p) & daya beda (kelompok atas–bawah 27%)
  const k = Math.max(1, Math.round(dinilai.length * 0.27));
  const atas = new Set(dinilai.slice(0, k).map((p) => p.id));
  const bawah = new Set(dinilai.slice(-k).map((p) => p.id));
  const butirMap = new Map();
  for (const p of peserta) {
    for (const id of p.ids) {
      const s = soal.get(id);
      if (!s) continue;
      const j = jmap.get(`${p.id}|${id}`);
      if (isManual(s) && j && j.skor == null) continue; // belum dikoreksi
      const b = butirMap.get(id) || { n: 0, skor: 0, atas: 0, nAtas: 0, bawah: 0, nBawah: 0, kosong: 0, opsi: {} };
      const fr = (j?.skor ?? 0) / (s.skor_maks || 1);
      b.n++; b.skor += fr;
      if (!j || j.jawaban == null) b.kosong++;
      if (atas.has(p.id)) { b.nAtas++; b.atas += fr; }
      if (bawah.has(p.id)) { b.nBawah++; b.bawah += fr; }
      if (s.tipe === 'pilihan_ganda' && j?.jawaban) { const o = parseJSON(j.jawaban); b.opsi[o] = (b.opsi[o] || 0) + 1; }
      butirMap.set(id, b);
    }
  }
  const butir = [...butirMap.entries()].map(([id, b]) => {
    const s = soal.get(id);
    const pv = b.n ? b.skor / b.n : null;
    const db = b.nAtas && b.nBawah ? b.atas / b.nAtas - b.bawah / b.nBawah : null;
    return {
      soal_id: id, nomor: s.nomor, tipe: s.tipe, mapel: s.mapel, kategori: s.kategori, cuplikan: teks(s.pertanyaan).slice(0, 160),
      kunci: s.tipe === 'pilihan_ganda' ? s.kunci : null, n: b.n, kosong: b.kosong,
      p: r2(pv), persen_benar: r1(pv * 100), kesukaran: pv == null ? '-' : pv < 0.3 ? 'Sulit' : pv <= 0.7 ? 'Sedang' : 'Mudah',
      daya_beda: r2(db), kualitas_daya_beda: db == null ? '-' : db >= 0.4 ? 'Sangat baik' : db >= 0.3 ? 'Baik' : db >= 0.2 ? 'Cukup' : 'Perlu revisi',
      sebaran_opsi: s.tipe === 'pilihan_ganda' ? (s.opsi || []).map((o) => ({ kode: o.kode, n: b.opsi[o.kode] || 0 })) : null,
    };
  }).sort((a, b) => (a.p ?? 2) - (b.p ?? 2) || a.nomor - b.nomor);

  // pengelompokan klasikal
  const level = LEVEL[q.grup] ? q.grup : 'sekolah';
  const g = new Map();
  for (const p of dinilai) {
    const L = LEVEL[level];
    const key = L.kunci(p);
    const x = g.get(key) || { kunci: key, nama: L.label(p), induk: L.induk ? L.induk(p) : '', nilai: [], sekolah: new Set() };
    x.nilai.push(p.nilai);
    x.sekolah.add(p.npsn);
    g.set(key, x);
  }
  const grup = [...g.values()].map((x) => ({ kunci: x.kunci, nama: x.nama, induk: x.induk, jml_sekolah: x.sekolah.size, ...statistik(x.nilai, batas) }))
    .sort((a, b) => b.rata - a.rata);
  grup.forEach((x, i) => { x.peringkat = i + 1; });

  return {
    target: batas,
    filter: q,
    ringkasan: { peserta: peserta.length, menunggu_koreksi: menunggu.length, sekolah: new Set(peserta.map((p) => p.npsn)).size, ...statistik(dinilai.map((p) => p.nilai), batas) },
    distribusi,
    ranking,
    butir,
    grup: { level, items: grup },
  };
}

route('GET', '/api/analisis', (ctx) => {
  requireRole(ctx, 'superadmin', 'supervisor', 'admin', 'guru');
  if (!str(ctx.query.mapel) || !str(ctx.query.kategori)) throw httpError(400, 'Pilih mata pelajaran dan kategori.');
  return analisis(ctx, ctx.query);
});

route('GET', '/api/analisis/opsi', (ctx) => {
  requireRole(ctx, 'superadmin', 'supervisor', 'admin', 'guru');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  return {
    paket: all(`SELECT uj.mapel, m.nama AS mapel_nama, uj.kategori, k.nama AS kategori_nama, COUNT(*) AS n
      FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori
      WHERE pu.status = 'selesai' AND (? IS NULL OR uj.npsn = ?) GROUP BY uj.mapel, uj.kategori ORDER BY k.urutan, m.urutan`, npsn, npsn),
    wilayah: all(`SELECT DISTINCT provinsi_kode, provinsi, kabkota_kode, kabkota, kecamatan, kelurahan, npsn, nama FROM sekolah
      WHERE (? IS NULL OR npsn = ?) ORDER BY provinsi, kabkota, kecamatan, kelurahan, nama`, npsn, npsn),
    kelas: all(`SELECT DISTINCT kelas FROM pengguna WHERE peran = 'siswa' AND kelas IS NOT NULL AND (? IS NULL OR npsn = ?) ORDER BY kelas`, npsn, npsn).map((r) => r.kelas),
  };
});

// ---------- legger ----------
route('GET', '/api/legger', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin', 'guru');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (!npsn || npsn === '-') throw httpError(400, 'Pilih sekolah.');
  const kategori = str(ctx.query.kategori);
  if (!kategori) throw httpError(400, 'Pilih kategori.');
  const kelas = str(ctx.query.kelas) || (ctx.user.peran === 'guru' ? ctx.user.kelas || '' : '');
  const batas = targetCapaian(npsn);
  const mapel = all(`SELECT DISTINCT m.kode, m.nama, m.urutan FROM ujian uj JOIN mapel m ON m.kode = uj.mapel
    WHERE uj.npsn = ? AND uj.kategori = ? ORDER BY m.urutan, m.nama`, npsn, kategori);
  const siswa = all(`SELECT id, username, nama, jk, kelas FROM pengguna WHERE peran = 'siswa' AND npsn = ? AND (? = '' OR kelas = ?) ORDER BY kelas, nama`, npsn, kelas, kelas);
  const hasil = new Map();
  for (const m of mapel) {
    const a = analisis(ctx, { npsn, mapel: m.kode, kategori, kelas });
    for (const p of a.ranking) hasil.set(`${p.siswa_id}|${m.kode}`, p);
  }
  const absen = new Set(all(`SELECT pu.siswa_id || '|' || uj.mapel AS k FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id
    WHERE uj.npsn = ? AND uj.kategori = ? AND pu.status = 'absen'`, npsn, kategori).map((r) => r.k));
  const rows = siswa.map((s) => {
    const nilai = {};
    let lengkap = mapel.length > 0, total = 0;
    for (const m of mapel) {
      const p = hasil.get(`${s.id}|${m.kode}`);
      nilai[m.kode] = p ? { objektif: p.skor_objektif, manual: p.ada_manual ? (p.nilai == null ? null : p.skor_manual) : null, ada_manual: p.ada_manual, nilai: p.nilai, status: p.nilai == null ? 'menunggu' : 'ok' }
        : { status: absen.has(`${s.id}|${m.kode}`) ? 'absen' : 'belum' };
      if (p?.nilai == null) lengkap = false; else total += p.nilai;
    }
    return { ...s, nilai, rata: lengkap ? r1(total / mapel.length) : null };
  });
  const urut = rows.filter((r) => r.rata != null).sort((a, b) => b.rata - a.rata);
  let rank = 0;
  urut.forEach((r, i) => { if (i === 0 || r.rata !== urut[i - 1].rata) rank = i + 1; r.peringkat = rank; });
  const ringkasan = Object.fromEntries(mapel.map((m) => [m.kode, statistik(rows.map((r) => r.nilai[m.kode].nilai ?? null), batas)]));
  return {
    sekolah: one('SELECT * FROM sekolah WHERE npsn = ?', npsn),
    kategori: one('SELECT * FROM kategori WHERE kode = ?', kategori),
    kelas, target: batas, mapel, siswa: rows, ringkasan,
  };
});

// ---------- data cetak ----------
route('GET', '/api/cetak/kartu', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (!npsn) throw httpError(400, 'Pilih sekolah.');
  const ids = str(ctx.query.ids).split(',').map((x) => int(x)).filter(Boolean);
  const kelas = str(ctx.query.kelas);
  const siswa = all(`SELECT id, username, nama, kelas, sesi, jk, password_awal FROM pengguna
    WHERE peran = 'siswa' AND npsn = ? AND (? = '' OR kelas = ?) ${ids.length ? `AND id IN (${ids.join(',')})` : ''} ORDER BY kelas, nama`, npsn, kelas, kelas);
  return { sekolah: one('SELECT * FROM sekolah WHERE npsn = ?', npsn), siswa };
});

route('GET', '/api/cetak/berita-acara/:id', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin', 'guru');
  const uj = one(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama FROM ujian uj JOIN mapel m ON m.kode = uj.mapel
    JOIN kategori k ON k.kode = uj.kategori WHERE uj.id = ?`, int(ctx.params.id));
  if (!uj) throw httpError(404, 'Ujian tidak ditemukan.');
  assertSekolahAccess(ctx, uj.npsn);
  const sasaran = sasaranUjian(uj);
  const ps = new Map(all('SELECT * FROM peserta_ujian WHERE ujian_id = ?', uj.id).map((p) => [p.siswa_id, p]));
  const hadir = sasaran.filter((s) => ps.get(s.id) && ps.get(s.id).status !== 'absen');
  const tidakHadir = sasaran.filter((s) => !ps.get(s.id) || ps.get(s.id).status === 'absen').map((s) => ({ username: s.username, nama: s.nama, kelas: s.kelas }));
  const insiden = hadir.filter((s) => ps.get(s.id).keluar_layar > 0).map((s) => ({ username: s.username, nama: s.nama, keluar_layar: ps.get(s.id).keluar_layar }));
  const mulai = Math.min(...hadir.map((s) => ps.get(s.id).mulai_at).filter(Boolean));
  const selesai = Math.max(...hadir.map((s) => ps.get(s.id).selesai_at || 0));
  return {
    ujian: uj, sekolah: one('SELECT * FROM sekolah WHERE npsn = ?', uj.npsn),
    terdaftar: sasaran.length, hadir: hadir.length, tidak_hadir: tidakHadir, insiden,
    mulai_at: isFinite(mulai) ? mulai : null, selesai_at: selesai > 0 ? selesai : null,
  };
});

route('GET', '/api/cetak/sertifikat', (ctx) => {
  requireRole(ctx, 'superadmin', 'admin', 'guru');
  const ids = str(ctx.query.peserta).split(',').map((x) => int(x)).filter(Boolean).slice(0, 500);
  if (!ids.length) throw httpError(400, 'Pilih peserta.');
  const rows = all(`SELECT pu.id, pu.nilai, pu.selesai_at, p.nama, p.username, p.kelas, uj.npsn, uj.mapel, uj.kategori, m.nama AS mapel_nama, k.nama AS kategori_nama, s.nama AS sekolah
    FROM peserta_ujian pu JOIN pengguna p ON p.id = pu.siswa_id JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel
    JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn WHERE pu.id IN (${ids.join(',')}) AND pu.nilai IS NOT NULL`);
  const cache = new Map();
  const out = rows.map((r) => {
    assertSekolahAccess(ctx, r.npsn);
    const key = `${r.npsn}|${r.mapel}|${r.kategori}`;
    if (!cache.has(key)) cache.set(key, analisis({ ...ctx, user: { ...ctx.user, peran: 'superadmin' } }, { npsn: r.npsn, mapel: r.mapel, kategori: r.kategori }).ranking);
    const rk = cache.get(key);
    const me = rk.find((x) => x.id === r.id);
    return { ...r, peringkat: me?.peringkat ?? null, dari: rk.filter((x) => x.nilai != null).length, predikat: predikat(r.nilai), kode: kodeVerifikasi(r.id) };
  });
  const sekolah = out.length ? one('SELECT * FROM sekolah WHERE npsn = ?', out[0].npsn) : null;
  return { sekolah, items: out.sort((a, b) => a.kelas?.localeCompare(b.kelas) || a.nama.localeCompare(b.nama)) };
});

route('GET', '/api/public/verifikasi/:kode', (ctx) => {
  const pid = cekKodeVerifikasi(ctx.params.kode);
  const r = pid && one(`SELECT pu.nilai, pu.selesai_at, p.nama, p.username, p.kelas, m.nama AS mapel_nama, k.nama AS kategori_nama, s.nama AS sekolah, s.npsn
    FROM peserta_ujian pu JOIN pengguna p ON p.id = pu.siswa_id JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel
    JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn WHERE pu.id = ? AND pu.nilai IS NOT NULL`, pid);
  if (!r) throw httpError(404, 'Kode verifikasi tidak dikenal.');
  return { ...r, predikat: predikat(r.nilai) };
}, { public: true });

// ---------- hasil akumulatif semua mata pelajaran ----------
/** Gabungkan nilai tiap siswa dari semua mapel pada satu kategori ujian. */
function akumulatif(ctx, q) {
  const kategori = str(q.kategori);
  const npsnScope = scopeNpsn(ctx, q.npsn);
  if (npsnScope === '-') throw httpError(403, 'Akun ini tidak terhubung ke sekolah.');
  const batas = targetCapaian(npsnScope);
  const mapel = all(`SELECT DISTINCT m.kode, m.nama, m.urutan FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel
    WHERE pu.status = 'selesai' AND uj.kategori = ? AND (? IS NULL OR uj.npsn = ?) ORDER BY m.urutan, m.nama`, kategori, npsnScope, npsnScope);
  const siswa = new Map();
  const perMapel = [];
  for (const m of mapel) {
    const a = analisis(ctx, { ...q, mapel: m.kode, kategori });
    perMapel.push({ kode: m.kode, nama: m.nama, ...a.ringkasan });
    for (const p of a.ranking) {
      const s = siswa.get(p.siswa_id) || {
        siswa_id: p.siswa_id, nama: p.nama, username: p.username, kelas: p.kelas, jk: p.jk, npsn: p.npsn, sekolah: p.sekolah,
        provinsi_kode: p.provinsi_kode, provinsi: p.provinsi, kabkota_kode: p.kabkota_kode, kabkota: p.kabkota, kecamatan: p.kecamatan, kelurahan: p.kelurahan,
        nilai: {}, peserta: {},
      };
      s.nilai[m.kode] = p.nilai;
      s.peserta[m.kode] = p.id;
      siswa.set(p.siswa_id, s);
    }
  }
  const rows = [...siswa.values()].map((s) => {
    const v = mapel.map((m) => s.nilai[m.kode]).filter((x) => x != null);
    const lengkap = v.length === mapel.length && mapel.length > 0;
    const jumlah = v.reduce((a, b) => a + b, 0);
    return { ...s, jumlah: r1(jumlah), rata: v.length ? r1(jumlah / v.length) : null, lengkap, jml_mapel: v.length };
  });
  const urut = rows.filter((r) => r.lengkap).sort((a, b) => b.rata - a.rata || a.nama.localeCompare(b.nama));
  let rank = 0;
  urut.forEach((r, i) => { if (i === 0 || r.rata !== urut[i - 1].rata) rank = i + 1; r.peringkat = rank; r.capai = r.rata >= batas; });
  const sisa = rows.filter((r) => !r.lengkap).sort((a, b) => (b.rata ?? -1) - (a.rata ?? -1));
  const distribusi = Array.from({ length: 10 }, (_, i) => ({ dari: i * 10, label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`, n: 0 }));
  urut.forEach((r) => { distribusi[Math.min(9, Math.floor(r.rata / 10))].n++; });
  const level = LEVEL[q.grup] ? q.grup : 'sekolah';
  const g = new Map();
  for (const r of urut) {
    const L = LEVEL[level];
    const key = L.kunci(r);
    const x = g.get(key) || { kunci: key, nama: L.label(r), induk: L.induk ? L.induk(r) : '', rata: [], sekolah: new Set(), mapel: {} };
    x.rata.push(r.rata);
    x.sekolah.add(r.npsn);
    for (const m of mapel) (x.mapel[m.kode] ||= []).push(r.nilai[m.kode]);
    g.set(key, x);
  }
  const avg = (a) => (a.length ? r1(a.reduce((p, c) => p + c, 0) / a.length) : null);
  const grup = [...g.values()].map((x) => ({
    kunci: x.kunci, nama: x.nama, induk: x.induk, jml_sekolah: x.sekolah.size, ...statistik(x.rata, batas),
    per_mapel: Object.fromEntries(mapel.map((m) => [m.kode, avg((x.mapel[m.kode] || []).filter((v) => v != null))])),
  })).sort((a, b) => b.rata - a.rata);
  grup.forEach((x, i) => { x.peringkat = i + 1; });
  return {
    akumulatif: true, target: batas, kategori: one('SELECT * FROM kategori WHERE kode = ?', kategori), mapel,
    per_mapel: perMapel,
    ringkasan: { peserta: rows.length, lengkap: urut.length, belum_lengkap: sisa.length, sekolah: new Set(rows.map((r) => r.npsn)).size, ...statistik(urut.map((r) => r.rata), batas) },
    distribusi, ranking: [...urut, ...sisa], grup: { level, items: grup },
  };
}

route('GET', '/api/akumulatif', (ctx) => {
  requireRole(ctx, 'superadmin', 'supervisor', 'admin', 'guru');
  if (!str(ctx.query.kategori)) throw httpError(400, 'Pilih kategori ujian.');
  return akumulatif(ctx, ctx.query);
});

// ---------- rekap & analisis semua try out ----------
/** Perkembangan nilai tiap siswa lintas kategori ujian (try out): rata-rata per try out, tren awal → akhir. */
function rekapTryout(ctx, q) {
  const npsn = scopeNpsn(ctx, q.npsn);
  if (npsn === '-') throw httpError(403, 'Akun ini tidak terhubung ke sekolah.');
  const batas = targetCapaian(npsn);
  const where = [`pu.status = 'selesai'`];
  const args = [];
  const add = (cond, val) => { if (str(val)) { where.push(cond); args.push(str(val)); } };
  add('s.provinsi_kode = ?', q.provinsi);
  add('s.kabkota_kode = ?', q.kabkota);
  add('s.kecamatan = ?', q.kecamatan);
  add('s.kelurahan = ?', q.kelurahan);
  add('s.npsn = ?', npsn);
  add('p.kelas = ?', q.kelas);
  add('p.id = ?', q.siswa);
  if (ctx.user.peran === 'guru' && ctx.user.kelas && !str(q.kelas)) add('p.kelas = ?', ctx.user.kelas);
  const rows = all(`SELECT pu.nilai, pu.selesai_at, uj.mapel, uj.kategori,
      p.id AS siswa_id, p.nama, p.username, p.kelas, p.jk,
      s.npsn, s.nama AS sekolah, s.provinsi_kode, s.provinsi, s.kabkota_kode, s.kabkota, s.kecamatan, s.kelurahan
    FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id JOIN sekolah s ON s.npsn = uj.npsn
    WHERE ${where.join(' AND ')} ORDER BY pu.selesai_at`, ...args);
  const terakhir = new Map();
  for (const r of rows) terakhir.set(`${r.siswa_id}|${r.mapel}|${r.kategori}`, r);
  const hasil = [...terakhir.values()];

  const katUrut = all('SELECT kode, nama, urutan FROM kategori ORDER BY urutan, nama');
  const tersedia = katUrut.filter((k) => hasil.some((r) => r.kategori === k.kode));
  const dipilih = str(q.kategori) ? str(q.kategori).split(',').filter(Boolean) : null;
  const kategori = dipilih ? tersedia.filter((k) => dipilih.includes(k.kode)) : tersedia;
  const kSet = new Set(kategori.map((k) => k.kode));
  const mapel = all('SELECT kode, nama FROM mapel ORDER BY urutan, nama').filter((m) => hasil.some((r) => r.mapel === m.kode && kSet.has(r.kategori)));

  // susun per siswa
  const siswa = new Map();
  for (const r of hasil) {
    if (!kSet.has(r.kategori)) continue;
    const s = siswa.get(r.siswa_id) || {
      siswa_id: r.siswa_id, nama: r.nama, username: r.username, kelas: r.kelas, jk: r.jk, npsn: r.npsn, sekolah: r.sekolah,
      provinsi_kode: r.provinsi_kode, provinsi: r.provinsi, kabkota_kode: r.kabkota_kode, kabkota: r.kabkota, kecamatan: r.kecamatan, kelurahan: r.kelurahan,
      tryout: {}, menunggu: 0,
    };
    const t = (s.tryout[r.kategori] ||= { nilai: {}, selesai_at: r.selesai_at });
    t.nilai[r.mapel] = r.nilai;
    if (r.nilai == null) s.menunggu++;
    t.selesai_at = Math.max(t.selesai_at || 0, r.selesai_at || 0);
    siswa.set(r.siswa_id, s);
  }
  const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? r1(v.reduce((p, c) => p + c, 0) / v.length) : null; };
  const daftar = [...siswa.values()].map((s) => {
    for (const k of kategori) {
      const t = s.tryout[k.kode];
      if (t) { t.rata = avg(mapel.map((m) => t.nilai[m.kode])); t.lengkap = mapel.every((m) => t.nilai[m.kode] != null); }
    }
    const ikut = kategori.filter((k) => s.tryout[k.kode]?.rata != null);
    const awal = ikut[0] ? s.tryout[ikut[0].kode].rata : null;
    const akhir = ikut.length ? s.tryout[ikut[ikut.length - 1].kode].rata : null;
    const terbaik = ikut.reduce((b, k) => (!b || s.tryout[k.kode].rata > s.tryout[b].rata ? k.kode : b), null);
    const rata = avg(ikut.map((k) => s.tryout[k.kode].rata));
    return { ...s, ikut: ikut.length, rata, awal, akhir, tren: ikut.length >= 2 ? r1(akhir - awal) : null, terbaik, capai: rata != null && rata >= batas,
      per_mapel: Object.fromEntries(mapel.map((m) => [m.kode, avg(kategori.map((k) => s.tryout[k.kode]?.nilai[m.kode]))])) };
  }).filter((s) => s.ikut > 0);
  daftar.sort((a, b) => b.rata - a.rata || b.ikut - a.ikut || a.nama.localeCompare(b.nama));
  let rank = 0;
  daftar.forEach((s, i) => { if (i === 0 || s.rata !== daftar[i - 1].rata) rank = i + 1; s.peringkat = rank; });

  // ringkasan per try out
  const perTryout = kategori.map((k) => {
    const ikut = daftar.filter((s) => s.tryout[k.kode]?.rata != null);
    const tgl = ikut.map((s) => s.tryout[k.kode].selesai_at).filter(Boolean);
    return { kode: k.kode, nama: k.nama, sekolah: new Set(ikut.map((s) => s.npsn)).size, ...statistik(ikut.map((s) => s.tryout[k.kode].rata), batas),
      per_mapel: Object.fromEntries(mapel.map((m) => [m.kode, avg(ikut.map((s) => s.tryout[k.kode].nilai[m.kode]))])),
      tanggal: tgl.length ? Math.min(...tgl) : null };
  });
  const tren = daftar.filter((s) => s.tren != null);
  const ringkasan = {
    siswa: daftar.length, sekolah: new Set(daftar.map((s) => s.npsn)).size, tryout: kategori.length,
    ikut_semua: daftar.filter((s) => s.ikut === kategori.length).length,
    naik: tren.filter((s) => s.tren > 0).length, turun: tren.filter((s) => s.tren < 0).length, tetap: tren.filter((s) => s.tren === 0).length,
    rata_tren: avg(tren.map((s) => s.tren)), menunggu_koreksi: daftar.reduce((a, s) => a + s.menunggu, 0),
    ...statistik(daftar.map((s) => s.rata), batas),
  };

  // pengelompokan klasikal
  const level = LEVEL[q.grup] ? q.grup : 'sekolah';
  const L = LEVEL[level];
  const g = new Map();
  for (const s of daftar) {
    const key = L.kunci(s);
    const x = g.get(key) || { kunci: key, nama: L.label(s), induk: L.induk ? L.induk(s) : '', siswa: [], sekolah: new Set() };
    x.siswa.push(s);
    x.sekolah.add(s.npsn);
    g.set(key, x);
  }
  const grup = [...g.values()].map((x) => ({
    kunci: x.kunci, nama: x.nama, induk: x.induk, jml_sekolah: x.sekolah.size, ...statistik(x.siswa.map((s) => s.rata), batas),
    per_tryout: Object.fromEntries(kategori.map((k) => [k.kode, avg(x.siswa.map((s) => s.tryout[k.kode]?.rata))])),
    tren: avg(x.siswa.map((s) => s.tren)),
  })).sort((a, b) => b.rata - a.rata);
  grup.forEach((x, i) => { x.peringkat = i + 1; });

  return { rekap: true, target: batas, kategori, tersedia, mapel, per_tryout: perTryout, ringkasan, siswa: daftar, grup: { level, items: grup } };
}

route('GET', '/api/rekap-tryout', (ctx) => {
  requireRole(ctx, 'superadmin', 'supervisor', 'admin', 'guru');
  return rekapTryout(ctx, ctx.query);
});

// ---------- profil 360 sekolah ----------
/**
 * Capaian CBT satu sekolah dibandingkan kab/kota, provinsi, dan nasional.
 * Data wilayah hanya dikirim sebagai angka gabungan (rata-rata, peringkat) — tanpa nama siswa/sekolah lain.
 */
function profil360(ctx, npsn) {
  const sekolah = one(`SELECT s.*,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'siswa') AS jml_siswa,
      (SELECT COUNT(*) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'guru') AS jml_guru,
      (SELECT COUNT(DISTINCT kelas) FROM pengguna p WHERE p.npsn = s.npsn AND p.peran = 'siswa' AND kelas IS NOT NULL) AS jml_kelas,
      (SELECT COUNT(*) FROM ujian u WHERE u.npsn = s.npsn) AS jml_ujian
    FROM sekolah s WHERE s.npsn = ?`, npsn);
  if (!sekolah) throw httpError(404, 'Sekolah tidak ditemukan.');
  const pusat = { ...ctx, user: { ...ctx.user, peran: 'superadmin' } };
  const sk = rekapTryout(pusat, { npsn, grup: 'kelas' });
  const target = sk.target;
  const terdaftar = all(`SELECT kelas, jk, COUNT(*) AS n FROM pengguna WHERE peran = 'siswa' AND npsn = ? GROUP BY kelas, jk`, npsn);
  const dasar = { sekolah, target, terdaftar, ada: sk.siswa.length > 0 };
  if (!dasar.ada) return dasar;

  const kodeKat = sk.kategori.map((k) => k.kode).join(',');
  const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? r1(v.reduce((p, c) => p + c, 0) / v.length) : null; };
  const perMapel = (daftar) => Object.fromEntries(sk.mapel.map((m) => [m.kode, avg(daftar.map((s) => s.per_mapel?.[m.kode]))]));
  // wilayah pembanding: hanya try out yang diikuti sekolah ini agar adil
  const wilayah = [
    ['kabkota', sekolah.kabkota_kode && { kabkota: sekolah.kabkota_kode }, sekolah.kabkota],
    ['provinsi', sekolah.provinsi_kode && { provinsi: sekolah.provinsi_kode }, sekolah.provinsi],
    ['nasional', {}, 'Nasional'],
  ].filter(([, q]) => q).map(([level, q, nama]) => {
    const w = rekapTryout(pusat, { ...q, kategori: kodeKat, grup: 'sekolah' });
    const urut = w.grup.items;
    const posisi = urut.findIndex((x) => x.kunci === npsn);
    return {
      level, nama, sekolah: urut.length, siswa: w.ringkasan.siswa, rata: w.ringkasan.rata, median: w.ringkasan.median, persen_tuntas: w.ringkasan.persen_tuntas,
      peringkat: posisi >= 0 ? posisi + 1 : null,
      per_tryout: Object.fromEntries(w.per_tryout.map((t) => [t.kode, t.rata])),
      per_mapel: perMapel(w.siswa),
    };
  });

  // butir tersulit pada try out terakhir yang diikuti, dibanding persentase benar nasional untuk soal yang sama
  const akhir = sk.kategori[sk.kategori.length - 1];
  const butir = sk.mapel.filter((m) => sk.siswa.some((s) => s.tryout[akhir.kode]?.nilai[m.kode] != null)).map((m) => {
    const a = analisis(pusat, { npsn, mapel: m.kode, kategori: akhir.kode });
    const nas = new Map(analisis(pusat, { mapel: m.kode, kategori: akhir.kode }).butir.map((b) => [b.soal_id, b.persen_benar]));
    const hitung = (k) => a.butir.filter((b) => b.kesukaran === k).length;
    return {
      kode: m.kode, nama: m.nama, rata: a.ringkasan.rata, jumlah: a.butir.length,
      tingkat: { sulit: hitung('Sulit'), sedang: hitung('Sedang'), mudah: hitung('Mudah') },
      tersulit: a.butir.filter((b) => b.p != null).slice(0, 5).map((b) => ({ nomor: b.nomor, tipe: b.tipe, cuplikan: b.cuplikan, persen_benar: b.persen_benar, nasional: nas.get(b.soal_id) ?? null })),
    };
  });

  return {
    ...dasar,
    kategori: sk.kategori, mapel: sk.mapel, akhir,
    ringkasan: sk.ringkasan,
    per_tryout: sk.per_tryout.map((t) => ({ kode: t.kode, nama: t.nama, rata: t.rata, n: t.n, persen_tuntas: t.persen_tuntas, per_mapel: t.per_mapel })),
    per_mapel: perMapel(sk.siswa),
    kelas: sk.grup.items.map((g) => ({ kelas: g.nama.replace(/^Kelas /, ''), n: g.n, rata: g.rata, median: g.median, persen_tuntas: g.persen_tuntas, tren: g.tren,
      per_mapel: perMapel(sk.siswa.filter((s) => `Kelas ${s.kelas || '-'}` === g.nama)) })),
    siswa: sk.siswa.map((s) => ({ siswa_id: s.siswa_id, nama: s.nama, username: s.username, kelas: s.kelas, jk: s.jk, rata: s.rata, ikut: s.ikut, tren: s.tren, peringkat: s.peringkat, per_mapel: s.per_mapel })),
    wilayah,
    butir,
  };
}

route('GET', '/api/profil360', (ctx) => {
  requireRole(ctx, 'superadmin', 'supervisor', 'admin');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (!npsn || npsn === '-') throw httpError(400, 'Pilih sekolah.');
  return profil360(ctx, npsn);
});
