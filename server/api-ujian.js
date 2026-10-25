import crypto from 'node:crypto';
import { route } from './router.js';
import { all, one, run, tx, insertId } from './db.js';
import { httpError, requireRole } from './auth.js';
import { int, str, parseJSON, parseSoal, scopeNpsn, assertSekolahAccess, genToken, now, paketInfo, sasaranUjian, finalize, recompute, sisaWaktu, batasJam, jeda, lanjut, audit } from './util.js';
import { subscribe, notify } from './events.js';
import { score, isManual, isAnswered, isLengkap, butirWajib } from './scoring.js';

const ONLINE_MS = 45e3;

/** Tanggal hari ini (zona waktu server) dalam format YYYY-MM-DD. */
const hariIni = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function ambilUjian(ctx, id) {
  const u = await one(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama, s.nama AS sekolah_nama
    FROM ujian uj JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn WHERE uj.id = ?`, id);
  if (!u) throw httpError(404, 'Ujian tidak ditemukan.');
  assertSekolahAccess(ctx, u.npsn);
  return u;
}

function cekMassal(ctx, u) {
  if (u.massal_id && ctx.user.peran !== 'superadmin') throw httpError(403, 'Ujian ini diatur pusat (ujian massal). Hubungi superadmin untuk mengubahnya.');
}

function bolehMonitor(ctx) {
  const p = ctx.user.peran;
  if (p === 'guru' && !ctx.user.bisa_monitor) throw httpError(403, 'Akun guru ini belum diberi izin monitor.');
  if (!['admin', 'superadmin', 'guru'].includes(p)) throw httpError(403, 'Tidak ada akses.');
}

// ---------- jadwal ujian (admin sekolah) ----------
route('GET', '/api/ujian', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin', 'guru');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  const items = await all(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama, s.nama AS sekolah_nama, um.nama AS massal_nama,
      (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'selesai') AS selesai,
      (SELECT COUNT(*) FROM peserta_ujian pu WHERE pu.ujian_id = uj.id AND pu.status = 'mengerjakan') AS mengerjakan
    FROM ujian uj JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn
    LEFT JOIN ujian_massal um ON um.id = uj.massal_id
    WHERE (?::text IS NULL OR uj.npsn = ?) ORDER BY uj.aktif DESC, uj.tanggal DESC NULLS LAST, uj.jam_mulai, uj.id DESC`, npsn, npsn);
  const paket = new Map();
  for (const u of items) {
    const k = `${u.mapel}|${u.kategori}`;
    if (!paket.has(k)) paket.set(k, await paketInfo(u.mapel, u.kategori));
    u.paket = paket.get(k);
    u.sasaran = (await sasaranUjian(u)).length;
  }
  return items;
});

async function dataUjian(b, old = {}) {
  const v = (k, d) => (b[k] === undefined ? old[k] ?? d : b[k]);
  const r = {
    mapel: str(v('mapel')), kategori: str(v('kategori')),
    durasi: Math.max(1, Math.min(600, int(v('durasi', 60), 60))),
    sesi: str(v('sesi', 'SEMUA')) || 'SEMUA', kelas: str(v('kelas', 'SEMUA')) || 'SEMUA',
    tanggal: str(v('tanggal')) || null, jam_mulai: str(v('jam_mulai')) || null, jam_selesai: str(v('jam_selesai')) || null,
    acak: v('acak', 1) ? 1 : 0,
  };
  if (!(await one('SELECT 1 FROM mapel WHERE kode = ?', r.mapel))) throw httpError(400, 'Pilih mata pelajaran.');
  if (!(await one('SELECT 1 FROM kategori WHERE kode = ?', r.kategori))) throw httpError(400, 'Pilih kategori.');
  return r;
}

route('POST', '/api/ujian', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const npsn = scopeNpsn(ctx, ctx.body.npsn);
  if (!npsn || !(await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn))) throw httpError(400, 'Pilih sekolah.');
  const r = await dataUjian(ctx.body);
  const id = await insertId(`INSERT INTO ujian (npsn, mapel, kategori, durasi, sesi, kelas, tanggal, jam_mulai, jam_selesai, acak, aktif, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`, npsn, r.mapel, r.kategori, r.durasi, r.sesi, r.kelas, r.tanggal, r.jam_mulai, r.jam_selesai, r.acak, genToken());
  return ambilUjian(ctx, id);
});

route('PUT', '/api/ujian/:id', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const old = await ambilUjian(ctx, int(ctx.params.id));
  cekMassal(ctx, old);
  const r = await dataUjian(ctx.body, old);
  const dipakai = await one('SELECT 1 FROM peserta_ujian WHERE ujian_id = ? LIMIT 1', old.id);
  if (dipakai && (r.mapel !== old.mapel || r.kategori !== old.kategori)) throw httpError(400, 'Ujian sudah dikerjakan siswa; paket soal tidak bisa diganti.');
  await run(`UPDATE ujian SET mapel = ?, kategori = ?, durasi = ?, sesi = ?, kelas = ?, tanggal = ?, jam_mulai = ?, jam_selesai = ?, acak = ? WHERE id = ?`,
    r.mapel, r.kategori, r.durasi, r.sesi, r.kelas, r.tanggal, r.jam_mulai, r.jam_selesai, r.acak, old.id);
  return ambilUjian(ctx, old.id);
});

route('DELETE', '/api/ujian/:id', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const u = await ambilUjian(ctx, int(ctx.params.id));
  cekMassal(ctx, u);
  if (await one(`SELECT 1 FROM peserta_ujian WHERE ujian_id = ? AND status <> 'absen' LIMIT 1`, u.id) && !ctx.body.paksa) {
    throw httpError(400, 'Ujian ini sudah punya hasil. Hapus tetap akan menghapus nilai siswa.');
  }
  await run('DELETE FROM ujian WHERE id = ?', u.id);
  return true;
});

route('PUT', '/api/ujian/:id/aktif', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin');
  const u = await ambilUjian(ctx, int(ctx.params.id));
  cekMassal(ctx, u);
  const aktif = ctx.body.aktif ? 1 : 0;
  if (aktif) {
    const p = await paketInfo(u.mapel, u.kategori);
    if (!p.siap) throw httpError(400, 'Paket soal ini belum punya soal yang lolos telaah superadmin.');
    if (p.belum_ditelaah) throw httpError(400, `Masih ada ${p.belum_ditelaah} soal di paket ini yang belum selesai ditelaah.`);
  }
  await run('UPDATE ujian SET aktif = ?, token = COALESCE(token, ?) WHERE id = ?', aktif, genToken(), u.id);
  notify(u.npsn);
  return ambilUjian(ctx, u.id);
});

route('POST', '/api/ujian/:id/token', async (ctx) => {
  requireRole(ctx, 'admin', 'superadmin', 'guru');
  if (ctx.user.peran === 'guru') bolehMonitor(ctx);
  const u = await ambilUjian(ctx, int(ctx.params.id));
  cekMassal(ctx, u);
  const token = genToken();
  await run('UPDATE ujian SET token = ? WHERE id = ?', token, u.id);
  return { token };
});

route('GET', '/api/ujian/:id/monitor', async (ctx) => {
  bolehMonitor(ctx);
  const u = await ambilUjian(ctx, int(ctx.params.id));
  return dataMonitor(ctx, u);
});

/** Status peserta dihitung dari detak terakhir: online bila ada detak < 45 detik. */
async function dataMonitor(ctx, u) {
  const siswa = await sasaranUjian(u);
  const ps = new Map((await all(`SELECT pu.*, json_array_length(pu.urutan::json) AS total,
      (SELECT COUNT(*) FROM jawaban j WHERE j.peserta_id = pu.id AND j.jawaban IS NOT NULL) AS dijawab,
      (SELECT COUNT(*) FROM jawaban j WHERE j.peserta_id = pu.id AND j.ragu = 1) AS ragu
    FROM peserta_ujian pu WHERE pu.ujian_id = ?`, u.id)).map((p) => [p.siswa_id, p]));
  const t = now();
  const kelasGuru = ctx.user.peran === 'guru' && ctx.user.kelas ? ctx.user.kelas : null;
  const rows = siswa.filter((s) => !kelasGuru || s.kelas === kelasGuru).map((s) => {
    const p = ps.get(s.id);
    const detak = Math.max(p?.last_active || 0, s.last_active || 0);
    const online = !!(s.sesi_login && t - detak < ONLINE_MS);
    let status = 'belum';
    if (p) status = p.status === 'absen' ? 'absen' : p.status === 'selesai' ? 'selesai' : 'mengerjakan';
    if (status === 'mengerjakan' && s.terkunci) status = 'terkunci';
    else if (status === 'mengerjakan' && !p.aktif_sejak) status = 'jeda';
    const perhatian = status === 'mengerjakan' && p.keluar_layar > 0 ? 1 : 0;
    return {
      siswa_id: s.id, username: s.username, nama: s.nama, kelas: s.kelas, sesi: s.sesi, online, terkunci: !!s.terkunci, status,
      peserta_id: p?.id ?? null, total: p?.total ?? 0, dijawab: p?.dijawab ?? 0, ragu: p?.ragu ?? 0,
      keluar_layar: p?.keluar_layar ?? 0, perhatian, last_active: detak || null,
      mulai_at: p?.mulai_at ?? null, selesai_at: p?.selesai_at ?? null, selesai_karena: p?.selesai_karena ?? null,
      sisa: p && p.status === 'mengerjakan' ? Math.max(0, sisaWaktu(p, u, t)) : null, berjalan: !!p?.aktif_sejak,
      nilai: p?.nilai ?? null,
    };
  });
  const hitung = (...st) => rows.filter((r) => st.includes(r.status)).length;
  return {
    ujian: { ...u, paket: await paketInfo(u.mapel, u.kategori), batas_jam: batasJam(u) },
    ringkasan: {
      total: rows.length, belum: hitung('belum'), mengerjakan: hitung('mengerjakan', 'jeda', 'terkunci'), selesai: hitung('selesai'), absen: hitung('absen'),
      online: rows.filter((r) => r.online).length, terkunci: hitung('terkunci'), jeda: hitung('jeda'), perhatian: rows.filter((r) => r.perhatian || r.status === 'terkunci').length,
    },
    peserta: rows,
    waktu_server: t,
  };
}

/** Siaran langsung untuk layar monitor (Server-Sent Events). */
route('GET', '/api/stream/monitor', (ctx, res) => {
  bolehMonitor(ctx);
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${now()}\n\n`);
  const off = subscribe(npsn, res);
  ctx.req.on('close', off);
}, { raw: true });

async function pesertaDari(ctx) {
  bolehMonitor(ctx);
  const u = await ambilUjian(ctx, int(ctx.params.id));
  const s = await one(`SELECT * FROM pengguna WHERE id = ? AND npsn = ? AND peran = 'siswa'`, int(ctx.params.siswa), u.npsn);
  if (!s) throw httpError(404, 'Siswa tidak ditemukan.');
  return { u, s, p: await one('SELECT * FROM peserta_ujian WHERE ujian_id = ? AND siswa_id = ?', u.id, s.id) };
}

route('POST', '/api/ujian/:id/peserta/:siswa/reset', async (ctx) => {
  const { u, p } = await pesertaDari(ctx);
  if (p) await run('DELETE FROM peserta_ujian WHERE id = ?', p.id);
  notify(u.npsn);
  return true;
});
route('POST', '/api/ujian/:id/peserta/:siswa/selesai', async (ctx) => {
  const { u, p } = await pesertaDari(ctx);
  if (!p || p.status !== 'mengerjakan') throw httpError(400, 'Siswa tidak sedang mengerjakan.');
  await finalize(p.id, 'proktor');
  notify(u.npsn);
  return true;
});
route('POST', '/api/ujian/:id/peserta/:siswa/tambah-waktu', async (ctx) => {
  const { u, p } = await pesertaDari(ctx);
  if (!p || p.status !== 'mengerjakan') throw httpError(400, 'Siswa tidak sedang mengerjakan.');
  const menit = Math.max(1, Math.min(120, int(ctx.body.menit, 5)));
  await run('UPDATE peserta_ujian SET durasi_ms = durasi_ms + ? WHERE id = ?', menit * 60e3, p.id);
  notify(u.npsn);
  return true;
});
route('POST', '/api/ujian/:id/peserta/:siswa/absen', async (ctx) => {
  const { u, s, p } = await pesertaDari(ctx);
  if (p && p.status !== 'absen') throw httpError(400, 'Siswa sudah mulai mengerjakan.');
  if (p) await run('DELETE FROM peserta_ujian WHERE id = ?', p.id);
  else await run(`INSERT INTO peserta_ujian (ujian_id, siswa_id, status) VALUES (?, ?, 'absen')`, u.id, s.id);
  notify(u.npsn);
  return true;
});

// ---------- siswa mengerjakan ujian ----------
function siswaOnly(ctx) {
  requireRole(ctx, 'siswa');
  return ctx.user;
}

route('GET', '/api/siswa/ujian', async (ctx) => {
  const s = siswaOnly(ctx);
  const items = await all(`SELECT uj.id, uj.mapel, uj.kategori, uj.durasi, uj.sesi, uj.kelas, uj.tanggal, uj.jam_mulai, uj.jam_selesai, uj.aktif,
      m.nama AS mapel_nama, k.nama AS kategori_nama,
      pu.id AS peserta_id, pu.status AS status_peserta, pu.nilai, pu.perlu_koreksi
    FROM ujian uj JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori
    LEFT JOIN peserta_ujian pu ON pu.ujian_id = uj.id AND pu.siswa_id = ?
    WHERE uj.npsn = ? AND (uj.sesi = 'SEMUA' OR uj.sesi = ?) AND (uj.kelas = 'SEMUA' OR uj.kelas = ?)
      AND (uj.aktif = 1 OR pu.id IS NOT NULL OR uj.tanggal >= ?)
    ORDER BY uj.aktif DESC, uj.tanggal, uj.jam_mulai`, s.id, s.npsn, s.sesi || '', s.kelas || '', hariIni());
  for (const u of items) u.jumlah_soal = (await paketInfo(u.mapel, u.kategori)).siap;
  return items;
});

function ujianDari(p) {
  return one(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama FROM ujian uj
    JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori WHERE uj.id = ?`, p.ujian_id);
}

/** Baca sesi peserta; kumpulkan otomatis bila waktu/jam sesi sudah habis. */
async function bacaSesi(ctx, pid, { lanjutkan = false } = {}) {
  const s = siswaOnly(ctx);
  let p = await one('SELECT * FROM peserta_ujian WHERE id = ? AND siswa_id = ?', pid, s.id);
  if (!p) throw httpError(404, 'Sesi ujian tidak ditemukan.');
  const uj = await ujianDari(p);
  if (p.status === 'mengerjakan') {
    const bj = batasJam(uj);
    let ubah = lanjutkan;
    if (bj && now() >= bj) { await finalize(p.id, 'jam'); ubah = true; }
    else if (sisaWaktu(p, uj) < -5e3) { await finalize(p.id, 'waktu'); ubah = true; }
    else if (lanjutkan && !ctx.impersonator) await lanjut(p.id); // siswa kembali → waktu berjalan lagi
    if (ubah) notify(uj.npsn);
    if (ubah) p = await one('SELECT * FROM peserta_ujian WHERE id = ?', pid);
  }
  return { p, uj };
}

async function statePeserta(p, uj) {
  const ids = parseJSON(p.urutan, []);
  const byId = new Map((await all(`SELECT id, tipe, pertanyaan, opsi, kunci, skor_maks FROM soal WHERE id = ANY(?::int[])`, ids))
    .map((r) => [r.id, parseSoal(r)]));
  const soal = ids.map((id) => byId.get(id)).filter(Boolean).map((s) => {
    const o = { id: s.id, tipe: s.tipe, pertanyaan: s.pertanyaan, opsi: s.opsi, skor_maks: s.skor_maks };
    if (s.tipe === 'isian' || s.tipe === 'uraian') o.manual = isManual(s);
    return o; // kunci tidak pernah dikirim ke siswa
  });
  const jawaban = Object.fromEntries((await all('SELECT soal_id, jawaban, ragu FROM jawaban WHERE peserta_id = ?', p.id))
    .map((j) => [j.soal_id, { jawaban: parseJSON(j.jawaban), ragu: !!j.ragu }]));
  return {
    peserta: waktuPeserta(p, uj),
    ujian: { id: uj.id, mapel: uj.mapel, mapel_nama: uj.mapel_nama, kategori_nama: uj.kategori_nama, durasi: uj.durasi, sesi: uj.sesi, batas_jam: batasJam(uj) },
    soal, jawaban, waktu_server: now(),
  };
}

function waktuPeserta(p, uj) {
  return {
    id: p.id, status: p.status, mulai_at: p.mulai_at, selesai_at: p.selesai_at, selesai_karena: p.selesai_karena,
    nilai: p.nilai, perlu_koreksi: p.perlu_koreksi, skor: p.skor, skor_maks: p.skor_maks,
    sisa: p.status === 'mengerjakan' ? Math.max(0, sisaWaktu(p, uj)) : 0, berjalan: !!p.aktif_sejak,
  };
}

route('POST', '/api/siswa/ujian/:id/mulai', async (ctx) => {
  const s = siswaOnly(ctx);
  const uj = await one(`SELECT uj.*, m.nama AS mapel_nama, k.nama AS kategori_nama FROM ujian uj JOIN mapel m ON m.kode = uj.mapel
    JOIN kategori k ON k.kode = uj.kategori WHERE uj.id = ? AND uj.npsn = ?`, int(ctx.params.id), s.npsn);
  if (!uj) throw httpError(404, 'Ujian tidak ditemukan.');
  if ((uj.sesi !== 'SEMUA' && uj.sesi !== s.sesi) || (uj.kelas !== 'SEMUA' && uj.kelas !== s.kelas)) throw httpError(403, 'Ujian ini bukan untuk kelas/sesi kamu.');
  let p = await one('SELECT * FROM peserta_ujian WHERE ujian_id = ? AND siswa_id = ?', uj.id, s.id);
  if (p?.status === 'absen') throw httpError(403, 'Kamu ditandai tidak hadir. Hubungi proktor.');
  if (p?.status === 'selesai') throw httpError(400, 'Kamu sudah menyelesaikan ujian ini.');
  if (!uj.aktif) throw httpError(400, 'Ujian belum dibuka oleh proktor.');
  if (str(ctx.body.token).toUpperCase() !== String(uj.token || '').toUpperCase()) throw httpError(400, 'Token ujian salah. Periksa lagi dengan proktor.');
  const bj = batasJam(uj);
  if (bj && now() >= bj) throw httpError(400, 'Jam sesi ujian ini sudah berakhir.');
  if (!p) {
    const ids = (await all(`SELECT id FROM soal WHERE mapel = ? AND kategori = ? AND status = 'disetujui' AND aktif = 1 ORDER BY nomor, id`, uj.mapel, uj.kategori)).map((r) => r.id);
    if (!ids.length) throw httpError(400, 'Paket soal belum tersedia.');
    if (uj.acak) for (let i = ids.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const t = now();
    // dua klik "Mulai" bersamaan tidak membuat peserta ganda
    await run(`INSERT INTO peserta_ujian (ujian_id, siswa_id, status, urutan, mulai_at, durasi_ms, terpakai_ms, aktif_sejak, last_active)
      VALUES (?, ?, 'mengerjakan', ?, ?, ?, 0, ?, ?) ON CONFLICT (ujian_id, siswa_id) DO NOTHING`, uj.id, s.id, JSON.stringify(ids), t, uj.durasi * 60e3, t, t);
  }
  p = await one('SELECT * FROM peserta_ujian WHERE ujian_id = ? AND siswa_id = ?', uj.id, s.id);
  if (!ctx.impersonator) await lanjut(p.id);
  notify(uj.npsn);
  return statePeserta(await one('SELECT * FROM peserta_ujian WHERE id = ?', p.id), uj);
});

route('GET', '/api/siswa/sesi/:pid', async (ctx) => {
  const { p, uj } = await bacaSesi(ctx, int(ctx.params.pid), { lanjutkan: true });
  return statePeserta(p, uj);
});

const SUSULAN_MS = 15 * 60e3; // jawaban offline masih diterima sebentar setelah waktu habis

route('PUT', '/api/siswa/sesi/:pid/jawaban', async (ctx) => {
  const { p, uj } = await bacaSesi(ctx, int(ctx.params.pid));
  const susulan = p.status === 'selesai' && ['waktu', 'jam'].includes(p.selesai_karena) && now() - p.selesai_at < SUSULAN_MS && ctx.body.offline;
  if (p.status !== 'mengerjakan' && !susulan) throw httpError(409, 'Waktu ujian sudah habis. Jawaban terakhir sudah dikumpulkan.');
  const sid = int(ctx.body.soal_id);
  if (!parseJSON(p.urutan, []).includes(sid)) throw httpError(400, 'Soal bukan bagian dari ujian ini.');
  const soal = parseSoal(await one('SELECT id, tipe, kunci, skor_maks FROM soal WHERE id = ?', sid));
  const jw = ctx.body.jawaban;
  const answered = isAnswered(soal.tipe, jw);
  const sk = answered ? score(soal, jw) : isManual(soal) ? null : 0;
  await tx(async () => {
    await run(`INSERT INTO jawaban (peserta_id, soal_id, jawaban, ragu, skor, dikoreksi, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT (peserta_id, soal_id) DO UPDATE SET jawaban = excluded.jawaban, ragu = excluded.ragu, skor = excluded.skor, dikoreksi = 0, updated_at = excluded.updated_at`,
      p.id, sid, answered ? JSON.stringify(jw) : null, ctx.body.ragu ? 1 : 0, sk, now());
    if (susulan) await recompute(p.id);
    else await run('UPDATE peserta_ujian SET last_active = ? WHERE id = ?', now(), p.id);
  });
  notify(uj.npsn);
  return { tersimpan: now(), ...waktuPeserta(susulan ? await one('SELECT * FROM peserta_ujian WHERE id = ?', p.id) : p, uj), waktu_server: now() };
});

route('POST', '/api/siswa/sesi/:pid/ping', async (ctx) => {
  const { p, uj } = await bacaSesi(ctx, int(ctx.params.pid));
  if (p.status === 'mengerjakan') {
    if (!p.aktif_sejak && !ctx.impersonator) await lanjut(p.id); // kembali terhubung setelah terputus lama
    await run('UPDATE peserta_ujian SET last_active = ?, keluar_layar = keluar_layar + ? WHERE id = ?', now(), ctx.body.keluar ? 1 : 0, p.id);
  }
  notify(uj.npsn);
  return { ...waktuPeserta(await one('SELECT * FROM peserta_ujian WHERE id = ?', p.id), uj), waktu_server: now() };
});

/** Siswa berupaya keluar dari ujian → akun dikunci, waktu dijeda, harus direset admin. */
route('POST', '/api/siswa/sesi/:pid/kunci', async (ctx) => {
  const { p, uj } = await bacaSesi(ctx, int(ctx.params.pid));
  if (ctx.impersonator) return { dikunci: false };
  await tx(async () => {
    if (p.status === 'mengerjakan') {
      await jeda(p.id);
      await run('UPDATE peserta_ujian SET keluar_layar = keluar_layar + 1 WHERE id = ?', p.id);
    }
    await run('UPDATE pengguna SET terkunci = 1, sesi_login = NULL WHERE id = ?', ctx.user.id);
  });
  audit('kunci', ctx.user.username, 'upaya keluar ujian', uj.id);
  notify(uj.npsn);
  return { dikunci: true };
});

route('POST', '/api/siswa/sesi/:pid/selesai', async (ctx) => {
  const { p, uj } = await bacaSesi(ctx, int(ctx.params.pid));
  if (p.status === 'selesai') return waktuPeserta(p, uj);
  const waktuHabis = sisaWaktu(p, uj) <= 15e3;
  if (!waktuHabis) {
    const ids = parseJSON(p.urutan, []);
    const jw = await all('SELECT soal_id, jawaban, ragu FROM jawaban WHERE peserta_id = ?', p.id);
    const dijawab = jw.filter((j) => j.jawaban !== null).length;
    const ragu = jw.filter((j) => j.ragu).length;
    if (dijawab < ids.length) throw httpError(400, `Masih ada ${ids.length - dijawab} soal yang belum dijawab.`);
    if (ragu) throw httpError(400, `Masih ada ${ragu} soal bertanda ragu-ragu.`);
    // soal kategori / menjodohkan wajib terjawab di semua pernyataan
    const soalMap = new Map((await all(`SELECT id, tipe, opsi FROM soal WHERE id = ANY(?::int[])`, ids)).map((x) => [x.id, { ...x, opsi: parseJSON(x.opsi) }]));
    const kurang = ids.map((id, i) => [i + 1, soalMap.get(id), jw.find((j) => j.soal_id === id)])
      .filter(([, so, j]) => so && butirWajib(so).length && !isLengkap(so, parseJSON(j?.jawaban))).map(([no]) => no);
    if (kurang.length) throw httpError(400, `Soal nomor ${kurang.join(', ')} belum lengkap. Jawab semua pernyataan pada soal tersebut.`);
  }
  const bj = batasJam(uj);
  await finalize(p.id, waktuHabis ? (bj && now() >= bj - 15e3 ? 'jam' : 'waktu') : 'siswa');
  notify(uj.npsn);
  return waktuPeserta(await one('SELECT * FROM peserta_ujian WHERE id = ?', p.id), uj);
});

route('GET', '/api/siswa/nilai', (ctx) => {
  const s = siswaOnly(ctx);
  return all(`SELECT pu.id, pu.nilai, pu.perlu_koreksi, pu.selesai_at, pu.skor, pu.skor_maks, uj.mapel, m.nama AS mapel_nama, m.urutan AS mapel_urutan, uj.kategori, k.nama AS kategori_nama, k.urutan AS kategori_urutan
    FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori
    WHERE pu.siswa_id = ? AND pu.status = 'selesai' ORDER BY pu.selesai_at DESC`, s.id);
});

route('POST', '/api/siswa/feedback', async (ctx) => {
  const s = siswaOnly(ctx);
  const pesan = str(ctx.body.pesan).slice(0, 500);
  if (!pesan) throw httpError(400, 'Tulis pesanmu dulu.');
  const sid = int(ctx.body.soal_id);
  const ok = await one(`SELECT 1 FROM peserta_ujian WHERE siswa_id = ? AND urutan::jsonb @> to_jsonb(ARRAY[?::int])`, s.id, sid);
  if (!ok) throw httpError(400, 'Soal tidak ditemukan.');
  await run('INSERT INTO feedback (soal_id, siswa_id, pesan) VALUES (?, ?, ?)', sid, s.id, pesan);
  return true;
});

// ---------- koreksi manual ----------
function scopeKoreksi(ctx) {
  requireRole(ctx, 'admin', 'guru', 'superadmin');
  const npsn = scopeNpsn(ctx, ctx.query.npsn);
  if (npsn === '-') throw httpError(403, 'Guru penulis pusat tidak mengoreksi jawaban sekolah.');
  return { npsn, kelas: ctx.user.peran === 'guru' && ctx.user.kelas ? ctx.user.kelas : null };
}

route('GET', '/api/koreksi', (ctx) => {
  const { npsn, kelas } = scopeKoreksi(ctx);
  const q = ctx.query;
  return all(`SELECT pu.id AS peserta_id, pu.perlu_koreksi, pu.nilai, pu.skor, pu.skor_maks, p.id AS siswa_id, p.nama, p.username, p.kelas,
      uj.id AS ujian_id, uj.mapel, uj.kategori, m.nama AS mapel_nama, k.nama AS kategori_nama, s.nama AS sekolah,
      (SELECT COUNT(*) FROM jawaban j JOIN soal so ON so.id = j.soal_id WHERE j.peserta_id = pu.id AND j.jawaban IS NOT NULL AND j.dikoreksi = 1) AS dikoreksi
    FROM peserta_ujian pu JOIN ujian uj ON uj.id = pu.ujian_id JOIN pengguna p ON p.id = pu.siswa_id
    JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori JOIN sekolah s ON s.npsn = uj.npsn
    WHERE pu.status = 'selesai' AND (?::text IS NULL OR uj.npsn = ?) AND (?::text IS NULL OR p.kelas = ?)
      AND (? = '' OR uj.mapel = ?) AND (? = '' OR uj.kategori = ?)
      AND (pu.perlu_koreksi > 0 OR EXISTS (SELECT 1 FROM jawaban j WHERE j.peserta_id = pu.id AND j.dikoreksi = 1))
    ORDER BY pu.perlu_koreksi = 0, p.kelas, p.nama LIMIT 1000`,
    npsn, npsn, kelas, kelas, str(q.mapel), str(q.mapel), str(q.kategori), str(q.kategori));
});

route('GET', '/api/koreksi/:pid', async (ctx) => {
  const { npsn } = scopeKoreksi(ctx);
  const p = await one(`SELECT pu.*, p.nama, p.username, p.kelas, uj.npsn, uj.mapel, uj.kategori, m.nama AS mapel_nama, k.nama AS kategori_nama
    FROM peserta_ujian pu JOIN pengguna p ON p.id = pu.siswa_id JOIN ujian uj ON uj.id = pu.ujian_id
    JOIN mapel m ON m.kode = uj.mapel JOIN kategori k ON k.kode = uj.kategori WHERE pu.id = ?`, int(ctx.params.pid));
  if (!p || (npsn && p.npsn !== npsn)) throw httpError(404, 'Data tidak ditemukan.');
  const ids = parseJSON(p.urutan, []);
  const items = (await all(`SELECT j.id, j.soal_id, j.jawaban, j.skor, j.dikoreksi, j.catatan, s.tipe, s.pertanyaan, s.kunci, s.skor_maks
    FROM jawaban j JOIN soal s ON s.id = j.soal_id WHERE j.peserta_id = ? AND j.jawaban IS NOT NULL`, p.id))
    .map((r) => ({ ...r, jawaban: parseJSON(r.jawaban), kunci: parseJSON(r.kunci), nomor: ids.indexOf(r.soal_id) + 1 }))
    .filter((r) => isManual(r))
    .sort((a, b) => a.nomor - b.nomor);
  delete p.urutan;
  return { peserta: p, items };
});

route('PUT', '/api/koreksi/jawaban/:id', async (ctx) => {
  const { npsn } = scopeKoreksi(ctx);
  const j = await one(`SELECT j.*, s.skor_maks, uj.npsn FROM jawaban j JOIN soal s ON s.id = j.soal_id
    JOIN peserta_ujian pu ON pu.id = j.peserta_id JOIN ujian uj ON uj.id = pu.ujian_id WHERE j.id = ?`, int(ctx.params.id));
  if (!j || (npsn && j.npsn !== npsn)) throw httpError(404, 'Jawaban tidak ditemukan.');
  const skor = Number(ctx.body.skor);
  if (!(skor >= 0 && skor <= j.skor_maks)) throw httpError(400, `Skor harus antara 0 dan ${j.skor_maks}.`);
  await tx(async () => {
    await run('UPDATE jawaban SET skor = ?, dikoreksi = 1, catatan = ?, dikoreksi_oleh = ? WHERE id = ?', skor, str(ctx.body.catatan) || null, ctx.user.id, j.id);
    await recompute(j.peserta_id);
  });
  return one('SELECT perlu_koreksi, nilai FROM peserta_ujian WHERE id = ?', j.peserta_id);
});
