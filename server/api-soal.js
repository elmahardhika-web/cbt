import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { route } from './router.js';
import { all, one, run, tx, DATA_DIR } from './db.js';
import { httpError, requireRole } from './auth.js';
import { int, str, parseSoal, now } from './util.js';
import { TIPE, DEFAULT_SKOR } from './scoring.js';

const PENULIS = ['guru', 'superadmin'];
const PENELAAH = ['supervisor', 'superadmin'];

function ambil(id) {
  const s = parseSoal(one(`SELECT s.*, p.nama AS penulis, t.nama AS penelaah FROM soal s
    LEFT JOIN pengguna p ON p.id = s.penulis_id LEFT JOIN pengguna t ON t.id = s.ditelaah_oleh WHERE s.id = ?`, id));
  if (!s) throw httpError(404, 'Soal tidak ditemukan.');
  return s;
}

function bolehUbah(ctx, s) {
  if (ctx.user.peran === 'superadmin') return true;
  return ctx.user.peran === 'guru' && s.penulis_id === ctx.user.id;
}

function bolehLihat(ctx, s) {
  const p = ctx.user.peran;
  if (p === 'superadmin' || p === 'supervisor') return true;
  if (p === 'guru') return s.penulis_id === ctx.user.id || s.status === 'disetujui';
  if (p === 'admin') return s.status === 'disetujui';
  return false;
}

/** Validasi & normalisasi isi soal per tipe. */
function bersihkan(b) {
  const tipe = str(b.tipe);
  if (!TIPE.includes(tipe)) throw httpError(400, 'Tipe soal tidak dikenal.');
  const pertanyaan = String(b.pertanyaan ?? '').trim();
  if (!pertanyaan || pertanyaan.replace(/<[^>]*>/g, '').trim() === '' && !/<img/i.test(pertanyaan)) throw httpError(400, 'Pertanyaan masih kosong.');
  let opsi = b.opsi ?? null;
  let kunci = b.kunci ?? null;
  const teks = (x) => String(x ?? '').trim();
  switch (tipe) {
    case 'pilihan_ganda':
      opsi = (opsi || []).map((o, i) => ({ kode: String.fromCharCode(65 + i), teks: teks(o.teks) })).filter((o) => o.teks);
      if (opsi.length < 2) throw httpError(400, 'Pilihan ganda butuh minimal 2 opsi.');
      if (!opsi.some((o) => o.kode === String(kunci))) throw httpError(400, 'Pilih satu kunci jawaban.');
      break;
    case 'pilihan_ganda_kompleks':
      opsi = (opsi || []).map((o, i) => ({ id: String(o.id ?? i + 1), teks: teks(o.teks) })).filter((o) => o.teks);
      kunci = (Array.isArray(kunci) ? kunci : []).map(String).filter((k) => opsi.some((o) => o.id === k));
      if (opsi.length < 3) throw httpError(400, 'PG kompleks butuh minimal 3 opsi.');
      if (kunci.length < 2) throw httpError(400, 'PG kompleks butuh minimal 2 kunci jawaban.');
      break;
    case 'benar_salah':
      opsi = null;
      kunci = /^s/i.test(String(kunci)) ? 'Salah' : 'Benar';
      break;
    case 'pg_kategori': {
      const labels = (opsi?.labels || ['Benar', 'Salah']).map(teks).filter(Boolean);
      const items = (opsi?.items || []).map((it, i) => ({ id: it.id ?? i + 1, pernyataan: teks(it.pernyataan) })).filter((it) => it.pernyataan);
      if (labels.length < 2) throw httpError(400, 'Butuh minimal 2 label kategori.');
      if (items.length < 2) throw httpError(400, 'Butuh minimal 2 pernyataan.');
      const k = {};
      for (const it of items) {
        const v = kunci?.[it.id];
        if (!labels.includes(v)) throw httpError(400, 'Setiap pernyataan harus punya kunci.');
        k[it.id] = v;
      }
      opsi = { items, labels };
      kunci = k;
      break;
    }
    case 'menjodohkan': {
      const premis = (opsi?.premis || []).map((p, i) => ({ id: String(p.id ?? `p${i + 1}`), teks: teks(p.teks) })).filter((p) => p.teks);
      const respon = (opsi?.respon || []).map((p, i) => ({ id: String(p.id ?? `r${i + 1}`), teks: teks(p.teks) })).filter((p) => p.teks);
      if (premis.length < 2 || respon.length < 2) throw httpError(400, 'Menjodohkan butuh minimal 2 premis dan 2 respon.');
      const k = {};
      for (const p of premis) {
        const v = String(kunci?.[p.id] ?? '');
        if (!respon.some((r) => r.id === v)) throw httpError(400, 'Setiap premis harus dipasangkan dengan respon.');
        k[p.id] = v;
      }
      opsi = { premis, respon };
      kunci = k;
      break;
    }
    case 'isian':
      opsi = null;
      kunci = (Array.isArray(kunci) ? kunci : String(kunci ?? '').split('|')).map(teks).filter(Boolean);
      break;
    case 'uraian':
      opsi = null;
      kunci = teks(kunci); // rubrik penilaian
      break;
  }
  const skor = Number(b.skor_maks);
  return {
    tipe, pertanyaan, opsi: JSON.stringify(opsi), kunci: JSON.stringify(kunci),
    skor_maks: skor > 0 ? Math.min(100, skor) : DEFAULT_SKOR[tipe] || 1,
  };
}

function cekPaket(mapel, kategori) {
  if (!one('SELECT 1 FROM mapel WHERE kode = ?', mapel)) throw httpError(400, 'Pilih mata pelajaran.');
  if (!one('SELECT 1 FROM kategori WHERE kode = ?', kategori)) throw httpError(400, 'Pilih kategori.');
}

route('GET', '/api/soal', (ctx) => {
  const q = ctx.query;
  const where = ['1=1'];
  const args = [];
  const p = ctx.user.peran;
  if (p === 'guru') {
    if (q.semua === '1') { where.push(`(s.penulis_id = ? OR s.status = 'disetujui')`); args.push(ctx.user.id); }
    else { where.push('s.penulis_id = ?'); args.push(ctx.user.id); }
  } else if (p === 'admin') where.push(`s.status = 'disetujui'`);
  else if (!['superadmin', 'supervisor'].includes(p)) throw httpError(403, 'Tidak ada akses.');
  for (const f of ['mapel', 'kategori']) if (str(q[f])) { where.push(`s.${f} = ?`); args.push(str(q[f])); }
  if (str(q.penulis)) { where.push('s.penulis_id = ?'); args.push(int(q.penulis)); }
  if (str(q.q)) { where.push('s.pertanyaan LIKE ?'); args.push(`%${str(q.q)}%`); }
  // hitungan per tipe/status memakai filter dasar saja, agar chip filter tetap menampilkan angka
  const wBase = where.join(' AND ');
  const argsBase = [...args];
  const hitung = (col) => Object.fromEntries(all(`SELECT s.${col} AS k, COUNT(*) AS n FROM soal s WHERE ${wBase} GROUP BY s.${col}`, ...argsBase).map((r) => [r.k, r.n]));
  for (const f of ['tipe', 'status']) if (str(q[f])) { where.push(`s.${f} = ?`); args.push(str(q[f])); }
  const w = where.join(' AND ');
  const items = all(`SELECT s.id, s.penulis_id, s.mapel, s.kategori, s.tipe, s.pertanyaan, s.opsi, s.kunci, s.skor_maks, s.nomor, s.aktif,
      s.status, s.catatan_telaah, s.diajukan_at, s.ditelaah_at, s.updated_at, p.nama AS penulis,
      (SELECT COUNT(*) FROM feedback f WHERE f.soal_id = s.id AND f.dibaca = 0) AS feedback_baru,
      (SELECT COUNT(*) FROM jawaban j WHERE j.soal_id = s.id) AS dipakai
    FROM soal s LEFT JOIN pengguna p ON p.id = s.penulis_id WHERE ${w}
    ORDER BY s.mapel, s.kategori, s.nomor, s.id LIMIT 2000`, ...args).map(parseSoal);
  return { items, per_tipe: hitung('tipe'), per_status: hitung('status') };
});

route('GET', '/api/soal/ekspor', (ctx) => {
  requireRole(ctx, 'guru', 'superadmin', 'supervisor');
  const mine = ctx.user.peran === 'guru';
  const items = all(`SELECT mapel, kategori, tipe, pertanyaan, opsi, kunci, skor_maks, nomor, aktif FROM soal
    WHERE (? = '' OR mapel = ?) AND (? = '' OR kategori = ?) AND (? = 0 OR penulis_id = ?) ORDER BY mapel, kategori, nomor, id`,
    str(ctx.query.mapel), str(ctx.query.mapel), str(ctx.query.kategori), str(ctx.query.kategori), mine ? 1 : 0, ctx.user.id).map(parseSoal);
  return { format: 'tka-2026-soal', versi: 1, diekspor: new Date().toISOString(), soal: items };
});

route('GET', '/api/soal/:id', (ctx) => {
  const s = ambil(int(ctx.params.id));
  if (!bolehLihat(ctx, s)) throw httpError(403, 'Tidak ada akses ke soal ini.');
  return s;
});

route('POST', '/api/soal', (ctx) => {
  requireRole(ctx, ...PENULIS);
  const b = ctx.body;
  cekPaket(str(b.mapel), str(b.kategori));
  const d = bersihkan(b);
  const nomor = one('SELECT COALESCE(MAX(nomor), 0) + 1 AS n FROM soal WHERE mapel = ? AND kategori = ?', b.mapel, b.kategori).n;
  const status = b.ajukan ? 'menunggu' : 'draf';
  const r = run(`INSERT INTO soal (penulis_id, mapel, kategori, tipe, pertanyaan, opsi, kunci, skor_maks, nomor, aktif, status, diajukan_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ctx.user.id, b.mapel, b.kategori, d.tipe, d.pertanyaan, d.opsi, d.kunci, d.skor_maks, nomor,
    b.aktif === false ? 0 : 1, status, status === 'menunggu' ? now() : null);
  return ambil(Number(r.lastInsertRowid));
});

route('PUT', '/api/soal/:id', (ctx) => {
  const s = ambil(int(ctx.params.id));
  if (!bolehUbah(ctx, s)) throw httpError(403, 'Anda tidak bisa mengubah soal ini.');
  const b = ctx.body;
  const mapel = str(b.mapel) || s.mapel;
  const kategori = str(b.kategori) || s.kategori;
  cekPaket(mapel, kategori);
  const d = bersihkan({ ...s, opsi: s.opsi, kunci: s.kunci, ...b });
  // guru mengubah soal → harus ditelaah ulang
  let status = s.status;
  if (ctx.user.peran === 'guru') status = b.ajukan ? 'menunggu' : s.status === 'disetujui' || s.status === 'menunggu' ? 'menunggu' : 'draf';
  run(`UPDATE soal SET mapel = ?, kategori = ?, tipe = ?, pertanyaan = ?, opsi = ?, kunci = ?, skor_maks = ?, status = ?,
      diajukan_at = CASE WHEN ? = 'menunggu' AND status <> 'menunggu' THEN ? ELSE diajukan_at END, updated_at = ? WHERE id = ?`,
    mapel, kategori, d.tipe, d.pertanyaan, d.opsi, d.kunci, d.skor_maks, status, status, now(), now(), s.id);
  return ambil(s.id);
});

route('DELETE', '/api/soal/:id', (ctx) => {
  const s = ambil(int(ctx.params.id));
  if (!bolehUbah(ctx, s)) throw httpError(403, 'Anda tidak bisa menghapus soal ini.');
  if (one('SELECT 1 FROM jawaban WHERE soal_id = ? LIMIT 1', s.id)) throw httpError(400, 'Soal sudah dijawab siswa. Nonaktifkan saja agar nilai tidak berubah.');
  run('DELETE FROM soal WHERE id = ?', s.id);
  return true;
});

route('PUT', '/api/soal/:id/aktif', (ctx) => {
  const s = ambil(int(ctx.params.id));
  if (!bolehUbah(ctx, s)) throw httpError(403, 'Anda tidak bisa mengubah soal ini.');
  run('UPDATE soal SET aktif = ? WHERE id = ?', ctx.body.aktif ? 1 : 0, s.id);
  return true;
});

route('POST', '/api/soal/:id/duplikat', (ctx) => {
  requireRole(ctx, ...PENULIS);
  const s = ambil(int(ctx.params.id));
  if (!bolehLihat(ctx, s)) throw httpError(403, 'Tidak ada akses ke soal ini.');
  const nomor = one('SELECT COALESCE(MAX(nomor), 0) + 1 AS n FROM soal WHERE mapel = ? AND kategori = ?', s.mapel, s.kategori).n;
  const r = run(`INSERT INTO soal (penulis_id, mapel, kategori, tipe, pertanyaan, opsi, kunci, skor_maks, nomor, aktif, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'draf')`, ctx.user.id, s.mapel, s.kategori, s.tipe, s.pertanyaan, JSON.stringify(s.opsi), JSON.stringify(s.kunci), s.skor_maks, nomor);
  return ambil(Number(r.lastInsertRowid));
});

route('POST', '/api/soal/ajukan', (ctx) => {
  requireRole(ctx, ...PENULIS);
  const ids = (ctx.body.ids || []).map((x) => int(x)).filter(Boolean);
  let n = 0;
  tx(() => {
    for (const id of ids) {
      const s = one('SELECT * FROM soal WHERE id = ?', id);
      if (s && bolehUbah(ctx, s) && (s.status === 'draf' || s.status === 'revisi')) {
        run(`UPDATE soal SET status = 'menunggu', diajukan_at = ? WHERE id = ?`, now(), id);
        n++;
      }
    }
  });
  return { diajukan: n };
});

route('PUT', '/api/soal-urutan', (ctx) => {
  requireRole(ctx, ...PENULIS);
  const ids = (ctx.body.ids || []).map((x) => int(x)).filter(Boolean);
  tx(() => ids.forEach((id, i) => {
    const s = one('SELECT * FROM soal WHERE id = ?', id);
    if (s && bolehUbah(ctx, s)) run('UPDATE soal SET nomor = ? WHERE id = ?', i + 1, id);
  }));
  return true;
});

route('POST', '/api/soal/:id/telaah', (ctx) => {
  requireRole(ctx, ...PENELAAH);
  const s = ambil(int(ctx.params.id));
  const keputusan = ctx.body.keputusan === 'disetujui' ? 'disetujui' : 'revisi';
  const catatan = str(ctx.body.catatan);
  if (keputusan === 'revisi' && !catatan) throw httpError(400, 'Tulis catatan untuk penulis.');
  run('UPDATE soal SET status = ?, catatan_telaah = ?, ditelaah_oleh = ?, ditelaah_at = ? WHERE id = ?',
    keputusan, catatan || null, ctx.impersonator?.id ?? ctx.user.id, now(), s.id);
  return ambil(s.id);
});

route('GET', '/api/telaah/ringkasan', (ctx) => {
  requireRole(ctx, ...PENELAAH);
  return {
    per_status: Object.fromEntries(all('SELECT status, COUNT(*) n FROM soal GROUP BY status').map((r) => [r.status, r.n])),
    per_mapel: all(`SELECT s.mapel, m.nama, s.kategori, k.nama AS kategori_nama,
        SUM(CASE WHEN s.status = 'disetujui' THEN 1 ELSE 0 END) AS disetujui,
        SUM(CASE WHEN s.status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
        SUM(CASE WHEN s.status = 'revisi' THEN 1 ELSE 0 END) AS revisi,
        SUM(CASE WHEN s.status = 'draf' THEN 1 ELSE 0 END) AS draf
      FROM soal s JOIN mapel m ON m.kode = s.mapel JOIN kategori k ON k.kode = s.kategori
      GROUP BY s.mapel, s.kategori ORDER BY m.urutan, k.urutan`),
    per_penulis: all(`SELECT p.id, p.nama, COUNT(s.id) AS total,
        SUM(CASE WHEN s.status = 'menunggu' THEN 1 ELSE 0 END) AS menunggu,
        SUM(CASE WHEN s.status = 'revisi' THEN 1 ELSE 0 END) AS revisi
      FROM soal s JOIN pengguna p ON p.id = s.penulis_id GROUP BY p.id ORDER BY menunggu DESC, total DESC`),
  };
});

/** Impor soal: menerima format ekspor TKA 2026 maupun format lama (konten_pertanyaan, opsi_jawaban, …). */
route('POST', '/api/soal/impor', (ctx) => {
  requireRole(ctx, ...PENULIS);
  const list = Array.isArray(ctx.body.soal) ? ctx.body.soal : Array.isArray(ctx.body) ? ctx.body : [];
  const mapelDefault = str(ctx.body.mapel);
  const kategoriDefault = str(ctx.body.kategori);
  const hasil = { berhasil: 0, gagal: [] };
  tx(() => list.forEach((x, i) => {
    try {
      const pj = (v) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v);
      const mapel = mapelDefault || str(x.mapel);
      const kategori = kategoriDefault || str(x.kategori);
      cekPaket(mapel, kategori);
      const tipe = str(x.tipe || x.tipe_soal);
      const d = bersihkan({
        tipe,
        pertanyaan: x.pertanyaan ?? x.konten_pertanyaan,
        opsi: pj(x.opsi ?? x.opsi_jawaban),
        kunci: pj(x.kunci ?? x.kunci_jawaban),
        skor_maks: x.skor_maks ?? x.skor_maksimum,
      });
      const nomor = one('SELECT COALESCE(MAX(nomor), 0) + 1 AS n FROM soal WHERE mapel = ? AND kategori = ?', mapel, kategori).n;
      run(`INSERT INTO soal (penulis_id, mapel, kategori, tipe, pertanyaan, opsi, kunci, skor_maks, nomor, aktif, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draf')`, ctx.user.id, mapel, kategori, d.tipe, d.pertanyaan, d.opsi, d.kunci, d.skor_maks, nomor,
        x.aktif === 0 || x.is_active === 0 || x.is_active === false ? 0 : 1);
      hasil.berhasil++;
    } catch (e) {
      hasil.gagal.push({ no: i + 1, pesan: e.message });
    }
  }));
  return hasil;
});

// ---------- unggah gambar ----------
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
route('POST', '/api/unggah', (ctx) => {
  requireRole(ctx, 'guru', 'superadmin', 'admin');
  const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(String(ctx.body.dataUrl || ''));
  if (!m || !MIME[m[1]]) throw httpError(400, 'Hanya gambar PNG, JPG, GIF, atau WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw httpError(400, 'Ukuran gambar maksimal 3 MB.');
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${MIME[m[1]]}`;
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', name), buf);
  return { url: `/uploads/${name}` };
});

// ---------- feedback siswa ----------
route('GET', '/api/feedback', (ctx) => {
  requireRole(ctx, 'guru', 'superadmin', 'supervisor');
  const mine = ctx.user.peran === 'guru';
  return all(`SELECT f.*, s.mapel, s.kategori, s.nomor, s.tipe, substr(s.pertanyaan, 1, 400) AS pertanyaan, p.nama AS siswa, sk.nama AS sekolah
    FROM feedback f JOIN soal s ON s.id = f.soal_id LEFT JOIN pengguna p ON p.id = f.siswa_id LEFT JOIN sekolah sk ON sk.npsn = p.npsn
    WHERE (? = 0 OR s.penulis_id = ?) ORDER BY f.dibaca, f.created_at DESC LIMIT 300`, mine ? 1 : 0, ctx.user.id);
});

route('PUT', '/api/feedback/:id/baca', (ctx) => {
  requireRole(ctx, 'guru', 'superadmin', 'supervisor');
  run('UPDATE feedback SET dibaca = 1 WHERE id = ?', int(ctx.params.id));
  return true;
});
