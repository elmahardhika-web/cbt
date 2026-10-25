import crypto from 'node:crypto';
import { all, one, run, tx, setting, setSetting } from './db.js';
import { httpError } from './auth.js';
import { isManual, score } from './scoring.js';

export const now = () => Date.now();
export const int = (v, d = null) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : Math.trunc(+v));
export const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** Target capaian: milik sekolah bila diatur, selain itu target pusat. */
export function targetCapaian(npsn) {
  if (npsn && npsn !== '-') {
    const r = one('SELECT target_capaian FROM sekolah WHERE npsn = ?', npsn);
    if (r?.target_capaian != null) return Number(r.target_capaian);
  }
  return Number(setting('target_capaian', setting('kkm', 70)));
}
export const kkm = () => targetCapaian(null);

export function parseJSON(s, d = null) {
  if (s === null || s === undefined) return d;
  try { return JSON.parse(s); } catch { return d; }
}

export function parseSoal(r) {
  if (!r) return r;
  return { ...r, opsi: parseJSON(r.opsi), kunci: parseJSON(r.kunci) };
}

/** Sekolah yang boleh diakses: admin/guru terkunci ke sekolahnya. */
export function scopeNpsn(ctx, requested) {
  const u = ctx.user;
  if (u.peran === 'admin' || u.peran === 'guru' || u.peran === 'siswa') {
    if (!u.npsn && u.peran === 'guru') return '-'; // guru penulis pusat: tidak punya data sekolah
    if (!u.npsn) throw httpError(403, 'Akun belum terhubung ke sekolah.');
    return u.npsn;
  }
  return str(requested) || null;
}

export function assertSekolahAccess(ctx, npsn) {
  const scoped = scopeNpsn(ctx, npsn);
  if (scoped && scoped !== npsn) throw httpError(403, 'Bukan data sekolah Anda.');
}

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genToken(n = 6) {
  const b = crypto.randomBytes(n);
  return [...b].map((x) => TOKEN_CHARS[x % TOKEN_CHARS.length]).join('');
}

const VERIF_SECRET = () => setting('verif_secret');
export function kodeVerifikasi(pid) {
  const h = crypto.createHmac('sha256', VERIF_SECRET()).update(String(pid)).digest('hex').slice(0, 6).toUpperCase();
  return `TKA-${pid}-${h}`;
}
export function cekKodeVerifikasi(kode) {
  const m = /^TKA-(\d+)-([0-9A-F]{6})$/i.exec(str(kode));
  if (!m) return null;
  return kodeVerifikasi(m[1]) === str(kode).toUpperCase() ? +m[1] : null;
}

/** Hitung ulang skor & nilai peserta dari tabel jawaban. */
/**
 * Sekali jalan: nilai ulang jawaban soal kategori dengan aturan "benar bila semua pernyataan sesuai kunci",
 * lalu hitung ulang nilai peserta yang terdampak.
 */
export function nilaiUlangKategori() {
  if (setting('skor_kategori_semua', null)) return 0;
  const rows = all(`SELECT j.peserta_id, j.soal_id, j.jawaban, j.skor, s.tipe, s.kunci, s.skor_maks FROM jawaban j JOIN soal s ON s.id = j.soal_id
    WHERE s.tipe = 'pg_kategori' AND j.jawaban IS NOT NULL AND COALESCE(j.dikoreksi, 0) = 0`);
  const peserta = new Set();
  tx(() => {
    for (const r of rows) {
      const baru = score({ ...r, kunci: parseJSON(r.kunci) }, parseJSON(r.jawaban));
      if (baru !== r.skor) { run('UPDATE jawaban SET skor = ? WHERE peserta_id = ? AND soal_id = ?', baru, r.peserta_id, r.soal_id); peserta.add(r.peserta_id); }
    }
    for (const pid of peserta) recompute(pid);
    setSetting('skor_kategori_semua', Date.now());
  });
  return peserta.size;
}

export function recompute(pid) {
  const p = one('SELECT * FROM peserta_ujian WHERE id = ?', pid);
  if (!p || p.status === 'absen') return;
  const ids = parseJSON(p.urutan, []);
  if (!ids.length) return;
  const soal = all(`SELECT id, tipe, kunci, skor_maks FROM soal WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const jw = new Map(all('SELECT soal_id, jawaban, skor, dikoreksi FROM jawaban WHERE peserta_id = ?', pid).map((j) => [j.soal_id, j]));
  let skor = 0, maks = 0, pending = 0;
  for (const s of soal) {
    maks += s.skor_maks;
    const j = jw.get(s.id);
    const manual = isManual({ ...s, kunci: parseJSON(s.kunci) });
    if (j && j.jawaban !== null && manual && !j.dikoreksi) pending++;
    skor += j?.skor ?? 0;
  }
  const nilai = p.status === 'selesai' && pending === 0 && maks > 0 ? Math.round((skor / maks) * 1000) / 10 : null;
  run('UPDATE peserta_ujian SET skor = ?, skor_maks = ?, perlu_koreksi = ?, nilai = ? WHERE id = ?', skor, maks, pending, nilai, pid);
}

// ---------- pengaturan waktu pengerjaan ----------
// Waktu siswa = jatah durasi (bisa dijeda saat terkendala) dan dibatasi jam selesai sesi (tidak bisa dijeda).
export const STALE_MS = 3 * 60e3; // tanpa detak selama ini → dianggap terkendala, waktu dijeda

/** Batas jam sesi ujian (tanggal + jam_selesai, zona waktu server). */
export function batasJam(uj) {
  if (!uj?.tanggal || !uj?.jam_selesai) return null;
  const t = new Date(`${uj.tanggal}T${uj.jam_selesai}:00`).getTime();
  return isNaN(t) ? null : t;
}

export function sisaWaktu(p, uj, t = now()) {
  const jalan = p.aktif_sejak ? Math.max(0, t - p.aktif_sejak) : 0;
  let s = (p.durasi_ms ?? 0) - (p.terpakai_ms ?? 0) - jalan;
  const bj = batasJam(uj);
  if (bj) s = Math.min(s, bj - t);
  return s;
}

/** Jeda waktu peserta (siswa terlogout / terputus). */
export function jeda(pid, at = now()) {
  run(`UPDATE peserta_ujian SET terpakai_ms = terpakai_ms + MAX(0, ? - aktif_sejak), aktif_sejak = NULL
    WHERE id = ? AND aktif_sejak IS NOT NULL`, at, pid);
}

/** Lanjutkan waktu saat siswa kembali. */
export function lanjut(pid) {
  run(`UPDATE peserta_ujian SET aktif_sejak = ?, last_active = ? WHERE id = ? AND aktif_sejak IS NULL AND status = 'mengerjakan'`, now(), now(), pid);
}

export function finalize(pid, karena = 'siswa') {
  jeda(pid);
  run(`UPDATE peserta_ujian SET status = 'selesai', selesai_at = COALESCE(selesai_at, ?), selesai_karena = ? WHERE id = ? AND status = 'mengerjakan'`, now(), karena, pid);
  recompute(pid);
}

/**
 * Pemeriksaan berkala: kumpulkan peserta yang waktunya habis atau jam sesinya lewat,
 * dan jeda waktu peserta yang tidak terhubung terlalu lama.
 */
export function sweepExpired(onChange) {
  const t = now();
  const rows = all(`SELECT pu.*, uj.tanggal, uj.jam_selesai, uj.npsn FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id WHERE pu.status = 'mengerjakan'`);
  let n = 0;
  tx(() => {
    for (const p of rows) {
      if (p.aktif_sejak && p.last_active && t - p.last_active > STALE_MS) {
        jeda(p.id, Math.max(p.aktif_sejak, p.last_active));
        p.terpakai_ms += Math.max(0, p.last_active - p.aktif_sejak);
        p.aktif_sejak = null;
        onChange?.(p.npsn);
      }
      const bj = batasJam(p);
      if (bj && t >= bj) { finalize(p.id, 'jam'); n++; onChange?.(p.npsn); continue; }
      if (sisaWaktu(p, p, t) < -5e3) { finalize(p.id, 'waktu'); n++; onChange?.(p.npsn); }
    }
  });
  return n;
}

/** Soal paket (mapel+kategori) yang siap diujikan. */
export function paketInfo(mapel, kategori) {
  const r = one(`SELECT
      SUM(CASE WHEN status = 'disetujui' AND aktif = 1 THEN 1 ELSE 0 END) AS siap,
      SUM(CASE WHEN status IN ('menunggu','revisi') AND aktif = 1 THEN 1 ELSE 0 END) AS belum,
      SUM(CASE WHEN status = 'disetujui' AND aktif = 1 THEN skor_maks ELSE 0 END) AS skor_maks
    FROM soal WHERE mapel = ? AND kategori = ?`, mapel, kategori);
  return { siap: r.siap || 0, belum_ditelaah: r.belum || 0, skor_maks: r.skor_maks || 0 };
}

/** Siswa sasaran sebuah ujian. */
export function sasaranUjian(u) {
  return all(`SELECT id, username, nama, kelas, sesi, jk, last_active, sesi_login, terkunci FROM pengguna
    WHERE peran = 'siswa' AND aktif = 1 AND npsn = ?
      AND (? = 'SEMUA' OR sesi = ?) AND (? = 'SEMUA' OR kelas = ?)
    ORDER BY kelas, nama`, u.npsn, u.sesi, u.sesi, u.kelas, u.kelas);
}

export function audit(...a) {
  console.log(new Date().toISOString(), ...a);
}
