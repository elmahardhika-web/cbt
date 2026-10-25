// Ujian massal: satu pengaturan dari pusat diterapkan ke banyak sekolah sekaligus.
import { route } from './router.js';
import { all, one, run, tx, insertId } from './db.js';
import { httpError, requireRole } from './auth.js';
import { int, str, genToken, now, paketInfo, sasaranUjian, batasJam, audit } from './util.js';
import { notify } from './events.js';

const ONLINE_MS = 45e3;

async function ambil(id) {
  const m = await one(`SELECT um.*, mp.nama AS mapel_nama, k.nama AS kategori_nama FROM ujian_massal um
    JOIN mapel mp ON mp.kode = um.mapel JOIN kategori k ON k.kode = um.kategori WHERE um.id = ?`, id);
  if (!m) throw httpError(404, 'Ujian massal tidak ditemukan.');
  return m;
}

async function data(b, old = {}) {
  const v = (k, d) => (b[k] === undefined ? old[k] ?? d : b[k]);
  const r = {
    nama: str(v('nama')) || null,
    mapel: str(v('mapel')), kategori: str(v('kategori')),
    durasi: Math.max(1, Math.min(600, int(v('durasi', 60), 60))),
    sesi: str(v('sesi', 'SEMUA')) || 'SEMUA', kelas: str(v('kelas', 'SEMUA')) || 'SEMUA',
    tanggal: str(v('tanggal')) || null, jam_mulai: str(v('jam_mulai')) || null, jam_selesai: str(v('jam_selesai')) || null,
    acak: v('acak', 1) ? 1 : 0, token_sama: v('token_sama', 1) ? 1 : 0,
  };
  if (!(await one('SELECT 1 FROM mapel WHERE kode = ?', r.mapel))) throw httpError(400, 'Pilih mata pelajaran.');
  if (!(await one('SELECT 1 FROM kategori WHERE kode = ?', r.kategori))) throw httpError(400, 'Pilih kategori.');
  return r;
}

/** Samakan ujian tiap sekolah dengan pengaturan massal dan daftar sekolah terpilih. */
async function terapkan(m, sekolah) {
  const ada = new Map((await all('SELECT * FROM ujian WHERE massal_id = ?', m.id)).map((u) => [u.npsn, u]));
  const target = new Set(sekolah);
  let tambah = 0, hapus = 0, tertahan = 0;
  for (const npsn of target) {
    if (!(await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn))) continue;
    const u = ada.get(npsn);
    if (u) {
      const dipakai = await one('SELECT 1 FROM peserta_ujian WHERE ujian_id = ? LIMIT 1', u.id);
      await run(`UPDATE ujian SET mapel = ?, kategori = ?, durasi = ?, sesi = ?, kelas = ?, tanggal = ?, jam_mulai = ?, jam_selesai = ?, acak = ?, aktif = ?,
        token = CASE WHEN ?::int = 1 THEN ? ELSE COALESCE(token, ?) END WHERE id = ?`,
        dipakai ? u.mapel : m.mapel, dipakai ? u.kategori : m.kategori, m.durasi, m.sesi, m.kelas, m.tanggal, m.jam_mulai, m.jam_selesai, m.acak, m.aktif,
        m.token_sama ? 1 : 0, m.token, genToken(), u.id);
    } else {
      await run(`INSERT INTO ujian (npsn, mapel, kategori, durasi, sesi, kelas, tanggal, jam_mulai, jam_selesai, acak, aktif, token, massal_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, npsn, m.mapel, m.kategori, m.durasi, m.sesi, m.kelas, m.tanggal, m.jam_mulai, m.jam_selesai,
        m.acak, m.aktif, m.token_sama ? m.token : genToken(), m.id);
      tambah++;
    }
    notify(npsn);
  }
  for (const [npsn, u] of ada) {
    if (target.has(npsn)) continue;
    if (await one(`SELECT 1 FROM peserta_ujian WHERE ujian_id = ? AND status <> 'absen' LIMIT 1`, u.id)) { tertahan++; continue; }
    await run('DELETE FROM ujian WHERE id = ?', u.id);
    hapus++;
    notify(npsn);
  }
  return { tambah, hapus, tertahan };
}

route('GET', '/api/massal', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const t = now() - ONLINE_MS;
  const rows = await all(`SELECT um.*, mp.nama AS mapel_nama, k.nama AS kategori_nama,
      (SELECT COUNT(*) FROM ujian u WHERE u.massal_id = um.id) AS jml_sekolah,
      (SELECT COUNT(*) FROM peserta_ujian pu JOIN ujian u ON u.id = pu.ujian_id WHERE u.massal_id = um.id AND pu.status = 'selesai') AS selesai,
      (SELECT COUNT(*) FROM peserta_ujian pu JOIN ujian u ON u.id = pu.ujian_id WHERE u.massal_id = um.id AND pu.status = 'mengerjakan') AS mengerjakan,
      (SELECT COUNT(*) FROM peserta_ujian pu JOIN ujian u ON u.id = pu.ujian_id WHERE u.massal_id = um.id AND pu.status = 'mengerjakan' AND pu.last_active > ?) AS online
    FROM ujian_massal um JOIN mapel mp ON mp.kode = um.mapel JOIN kategori k ON k.kode = um.kategori
    ORDER BY um.aktif DESC, um.tanggal DESC NULLS LAST, um.id DESC`, t);
  for (const m of rows) m.paket = await paketInfo(m.mapel, m.kategori);
  return rows;
});

route('GET', '/api/massal/:id', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const m = await ambil(int(ctx.params.id));
  const t = now();
  const daftar = await all(`SELECT u.id AS ujian_id, u.token, u.aktif, s.npsn, s.nama, s.provinsi, s.kabkota, s.kecamatan, s.kelurahan
    FROM ujian u JOIN sekolah s ON s.npsn = u.npsn WHERE u.massal_id = ? ORDER BY s.provinsi, s.kabkota, s.nama`, m.id);
  const sekolah = [];
  for (const s of daftar) {
    const sasaran = await sasaranUjian({ npsn: s.npsn, sesi: m.sesi, kelas: m.kelas });
    const ps = await all('SELECT status, last_active FROM peserta_ujian WHERE ujian_id = ?', s.ujian_id);
    const n = (st) => ps.filter((p) => p.status === st).length;
    sekolah.push({
      ...s, sasaran: sasaran.length, selesai: n('selesai'), mengerjakan: n('mengerjakan'), absen: n('absen'),
      belum: Math.max(0, sasaran.length - ps.length), online: ps.filter((p) => p.status === 'mengerjakan' && t - (p.last_active || 0) < ONLINE_MS).length,
      terkunci: sasaran.filter((x) => x.terkunci).length,
    });
  }
  const jml = (k) => sekolah.reduce((a, s) => a + s[k], 0);
  return {
    ...m, paket: await paketInfo(m.mapel, m.kategori), batas_jam: batasJam(m), sekolah,
    ringkasan: { sekolah: sekolah.length, sasaran: jml('sasaran'), selesai: jml('selesai'), mengerjakan: jml('mengerjakan'), belum: jml('belum'), online: jml('online'), terkunci: jml('terkunci') },
  };
});

route('POST', '/api/massal', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const r = await data(ctx.body);
  const sekolah = (ctx.body.sekolah || []).map(str).filter(Boolean);
  if (!sekolah.length) throw httpError(400, 'Pilih minimal satu sekolah.');
  return tx(async () => {
    const id = await insertId(`INSERT INTO ujian_massal (nama, mapel, kategori, durasi, sesi, kelas, tanggal, jam_mulai, jam_selesai, acak, token_sama, token, aktif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, r.nama, r.mapel, r.kategori, r.durasi, r.sesi, r.kelas, r.tanggal, r.jam_mulai, r.jam_selesai, r.acak, r.token_sama, genToken());
    const hasil = await terapkan(await one('SELECT * FROM ujian_massal WHERE id = ?', id), sekolah);
    audit('ujian massal dibuat', id, sekolah.length, 'sekolah');
    return { id, ...hasil };
  });
});

route('PUT', '/api/massal/:id', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const old = await ambil(int(ctx.params.id));
  const r = await data(ctx.body, old);
  return tx(async () => {
    await run(`UPDATE ujian_massal SET nama = ?, mapel = ?, kategori = ?, durasi = ?, sesi = ?, kelas = ?, tanggal = ?, jam_mulai = ?, jam_selesai = ?, acak = ?, token_sama = ? WHERE id = ?`,
      r.nama, r.mapel, r.kategori, r.durasi, r.sesi, r.kelas, r.tanggal, r.jam_mulai, r.jam_selesai, r.acak, r.token_sama, old.id);
    const sekolah = Array.isArray(ctx.body.sekolah) ? ctx.body.sekolah.map(str) : (await all('SELECT npsn FROM ujian WHERE massal_id = ?', old.id)).map((x) => x.npsn);
    return terapkan(await one('SELECT * FROM ujian_massal WHERE id = ?', old.id), sekolah);
  });
});

route('PUT', '/api/massal/:id/aktif', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const m = await ambil(int(ctx.params.id));
  const aktif = ctx.body.aktif ? 1 : 0;
  if (aktif) {
    const p = await paketInfo(m.mapel, m.kategori);
    if (!p.siap) throw httpError(400, 'Paket soal ini belum punya soal yang lolos telaah superadmin.');
    if (p.belum_ditelaah) throw httpError(400, `Masih ada ${p.belum_ditelaah} soal di paket ini yang belum selesai ditelaah.`);
  }
  await tx(async () => {
    await run('UPDATE ujian_massal SET aktif = ? WHERE id = ?', aktif, m.id);
    await run('UPDATE ujian SET aktif = ? WHERE massal_id = ?', aktif, m.id);
  });
  (await all('SELECT npsn FROM ujian WHERE massal_id = ?', m.id)).forEach((x) => notify(x.npsn));
  return ambil(m.id);
});

route('POST', '/api/massal/:id/token', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const m = await ambil(int(ctx.params.id));
  const token = genToken();
  await tx(async () => {
    await run('UPDATE ujian_massal SET token = ? WHERE id = ?', token, m.id);
    for (const u of await all('SELECT id FROM ujian WHERE massal_id = ?', m.id)) await run('UPDATE ujian SET token = ? WHERE id = ?', m.token_sama ? token : genToken(), u.id);
  });
  return { token: m.token_sama ? token : null };
});

route('DELETE', '/api/massal/:id', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const m = await ambil(int(ctx.params.id));
  const ada = await one(`SELECT 1 FROM peserta_ujian pu JOIN ujian u ON u.id = pu.ujian_id WHERE u.massal_id = ? AND pu.status <> 'absen' LIMIT 1`, m.id);
  if (ada && !ctx.body.paksa) throw httpError(400, 'Ujian massal ini sudah punya hasil di beberapa sekolah. Hapus tetap akan menghapus nilai siswa.');
  const npsn = (await all('SELECT npsn FROM ujian WHERE massal_id = ?', m.id)).map((x) => x.npsn);
  await tx(async () => { await run('DELETE FROM ujian WHERE massal_id = ?', m.id); await run('DELETE FROM ujian_massal WHERE id = ?', m.id); });
  npsn.forEach(notify);
  return true;
});
