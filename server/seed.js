import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, one, run, tx, insertId, setting, setSetting } from './db.js';
import { hashPassword, DEFAULT_PASSWORD } from './auth.js';
import { genToken, finalize } from './util.js';
import { score, isManual } from './scoring.js';

const ROOT = path.join(import.meta.dirname, '..');
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Raisa6690*#';

const wilayah = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'wilayah.json'), 'utf8')).provinsi;
function namaWilayah(kodeKab) {
  const p = wilayah.find((x) => x.kode === kodeKab.slice(0, 2));
  const k = p?.kabkota.find((x) => x.kode === kodeKab);
  return { provinsi_kode: p?.kode, provinsi: p?.nama, kabkota_kode: k?.kode, kabkota: k?.nama };
}

async function tambahSekolah(npsn, nama, kodeKab, kecamatan, kelurahan, extra = {}) {
  const w = namaWilayah(kodeKab);
  await run(`INSERT INTO sekolah (npsn, nama, provinsi_kode, provinsi, kabkota_kode, kabkota, kecamatan, kelurahan, alamat, kepala_sekolah, nip_kepsek, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, npsn, nama, w.provinsi_kode, w.provinsi, w.kabkota_kode, w.kabkota, kecamatan, kelurahan,
    extra.alamat || null, extra.kepala_sekolah || null, extra.nip_kepsek || null, extra.is_demo ? 1 : 0);
  await run(`INSERT INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, '') ON CONFLICT DO NOTHING`, w.kabkota_kode, kecamatan);
  await run(`INSERT INTO wilayah_lokal (kabkota_kode, kecamatan, kelurahan) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`, w.kabkota_kode, kecamatan, kelurahan);
}

async function tambahPengguna(username, peran, nama, extra = {}, hash = null) {
  const pw = extra.password || DEFAULT_PASSWORD;
  return insertId(`INSERT INTO pengguna (username, password_hash, password_awal, peran, nama, npsn, kelas, sesi, jk, bisa_monitor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, username, hash || hashPassword(pw), peran === 'siswa' ? pw : null, peran, nama,
    extra.npsn || null, extra.kelas || null, extra.sesi || null, extra.jk || null, extra.bisa_monitor ? 1 : 0);
}

/** Data awal saat database masih kosong. */
export async function seedAwal() {
  if (!setting('verif_secret')) await setSetting('verif_secret', crypto.randomBytes(24).toString('hex'));
  if (await one('SELECT 1 FROM pengguna LIMIT 1')) return false;
  await tx(async () => {
    await run('SELECT pg_advisory_xact_lock(20262028)');
    if (await one('SELECT 1 FROM pengguna LIMIT 1')) return; // instans lain sudah mengisi
    await setSetting('nama_aplikasi', 'TKA SD 2026');
    await setSetting('nama_instansi', '[Nama Instansi]');
    await setSetting('tahun_ajaran', '2025/2026');
    await setSetting('target_capaian', 70);
    await setSetting('helpdesk', []);
    await setSetting('dokumen', []);

    for (const [k, n, u] of [['BI', 'Bahasa Indonesia', 1], ['MAT', 'Matematika', 2]]) await run('INSERT INTO mapel (kode, nama, urutan) VALUES (?, ?, ?)', k, n, u);
    for (const [i, [k, n]] of [['TO1', 'Try Out 1'], ['TO2', 'Try Out 2'], ['TO3', 'Try Out 3'], ['US', 'Ujian Sekolah'], ['UKK', 'Ujian Kenaikan Kelas'], ['SUM', 'Sumatif Akhir Tahun']].entries()) {
      await run('INSERT INTO kategori (kode, nama, urutan) VALUES (?, ?, ?)', k, n, i + 1);
    }

    // master kosong: hanya akun superadmin; sekolah, pengguna lain, dan jadwal ujian diisi sendiri lewat aplikasi
    const superadmin = await tambahPengguna('superadmin', 'superadmin', 'Superadmin', { password: SUPERADMIN_PASSWORD });

    // bank soal awal (opsional): berkas JSON yang ditaruh di folder seed/ diimpor saat database pertama kali dibuat
    for (const f of fs.readdirSync(path.join(ROOT, 'seed')).filter((x) => x.endsWith('.json'))) {
      const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', f), 'utf8'));
      for (const [i, x] of list.entries()) {
        const pj = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
        await run(`INSERT INTO soal (penulis_id, mapel, kategori, tipe, pertanyaan, opsi, kunci, skor_maks, nomor, aktif, status, ditelaah_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'disetujui', ?)`, superadmin, x.mapel, x.kategori, x.tipe_soal, x.konten_pertanyaan,
          JSON.stringify(pj(x.opsi_jawaban)), JSON.stringify(pj(x.kunci_jawaban)), x.skor_maksimum || 1, i + 1, Date.now());
      }
    }

  });
  return true;
}

// ---------- data demo untuk mencoba analisis ----------
const DEMO_SEKOLAH = [
  ['99000001', '[DEMO] SDN Bambu Apus 02', '31.75', 'Cipayung', 'Bambu Apus', 0.35],
  ['99000002', '[DEMO] SDN Cipete Selatan 01', '31.74', 'Cilandak', 'Cipete Selatan', 0.6],
  ['99000003', '[DEMO] SDN Dago 3', '32.73', 'Coblong', 'Dago', 0.2],
  ['99000004', '[DEMO] SDN Pakansari 1', '32.01', 'Cibinong', 'Pakansari', -0.3],
  ['99000005', '[DEMO] SDN Airlangga 1', '35.78', 'Gubeng', 'Airlangga', 0.1],
  ['99000006', '[DEMO] SDN Serua 2', '36.74', 'Ciputat', 'Serua', -0.15],
];
const NAMA_DEPAN = ['Aisyah', 'Bima', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hafiz', 'Indah', 'Joko', 'Kirana', 'Lutfi', 'Maya', 'Nanda', 'Oki', 'Putri', 'Raka', 'Salsa', 'Tegar', 'Uli', 'Vino', 'Wulan', 'Yoga', 'Zahra', 'Arif', 'Bunga', 'Cahya', 'Dewi', 'Elang', 'Farah'];
const NAMA_BELAKANG = ['Pratama', 'Lestari', 'Saputra', 'Wulandari', 'Nugroho', 'Ramadhani', 'Maulana', 'Permata', 'Susilo', 'Ayu', 'Hakim', 'Sari', 'Prasetyo', 'Firmansyah', 'Handayani', 'Kurniawan', 'Anggraini', 'Hidayat', 'Rahmawati', 'Siregar'];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// tiga try out berurutan; kemampuan siswa naik sedikit tiap try out agar rekap perkembangan terlihat
const PAKET_DEMO = [['BI', 'TO1', 0], ['MAT', 'TO1', 0], ['BI', 'TO2', 0.22], ['MAT', 'TO2', 0.22], ['BI', 'TO3', 0.42], ['MAT', 'TO3', 0.42]];
const JAM_DEMO = { TO1: '2026-10-05T02:00:00Z', TO2: '2026-10-05T04:00:00Z', TO3: '2026-10-05T06:00:00Z' };

function demoAcak(seed) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  return { rand, gauss };
}

/** Soal paket demo: pakai soal kategori itu, atau soal TO1 mapel yang sama bila belum ada. */
async function soalDemo(m, k, gauss) {
  let list = await all(`SELECT * FROM soal WHERE mapel = ? AND kategori = ? AND status = 'disetujui' AND aktif = 1 ORDER BY nomor, id`, m, k);
  if (!list.length) list = await all(`SELECT * FROM soal WHERE mapel = ? AND status = 'disetujui' AND aktif = 1 ORDER BY kategori, nomor, id LIMIT 30`, m);
  return list.map((x) => ({ ...x, opsi: JSON.parse(x.opsi), kunci: JSON.parse(x.kunci), b: gauss() * 0.9 }));
}

/** Satu jadwal ujian demo beserta jawaban simulasi seluruh siswa sekolah itu. */
async function isiUjianDemo(npsn, siswa, m, k, naik, soal, { rand, gauss }) {
  const ujianId = await insertId(`INSERT INTO ujian (npsn, mapel, kategori, durasi, sesi, kelas, aktif, token, tanggal) VALUES (?, ?, ?, 60, 'SEMUA', 'SEMUA', 0, ?, '2026-10-05')`,
    npsn, m, k, genToken());
  for (const s of siswa) {
    if (rand() < 0.04) { await run(`INSERT INTO peserta_ujian (ujian_id, siswa_id, status) VALUES (?, ?, 'absen')`, ujianId, s.id); continue; }
    const theta = s.theta + naik + (naik ? gauss() * 0.3 : 0);
    const mulai = Date.parse(JAM_DEMO[k] || JAM_DEMO.TO1) + Math.floor(rand() * 600e3);
    const pid = await insertId(`INSERT INTO peserta_ujian (ujian_id, siswa_id, status, urutan, mulai_at, durasi_ms, terpakai_ms, last_active, keluar_layar)
      VALUES (?, ?, 'mengerjakan', ?, ?, ?, ?, ?, ?)`, ujianId, s.id, JSON.stringify(soal.map((x) => x.id)), mulai, 3600e3, 2400e3, mulai + 2400e3, rand() < 0.05 ? 1 : 0);
    for (const so of soal) {
      const benar = rand() < 1 / (1 + Math.exp(-1.3 * (theta - so.b)));
      const j = jawabanSimulasi(so, benar, rand);
      const sk = isManual(so) ? null : score(so, j);
      await run(`INSERT INTO jawaban (peserta_id, soal_id, jawaban, skor) VALUES (?, ?, ?, ?)`, pid, so.id, JSON.stringify(j), sk);
    }
    await finalize(pid, 'siswa');
    await run('UPDATE peserta_ujian SET selesai_at = ? WHERE id = ?', mulai + 2400e3 + Math.floor(rand() * 900e3), pid);
  }
}

export async function buatDataDemo() {
  if (await one('SELECT 1 FROM sekolah WHERE is_demo = 1')) return { dibuat: false, pesan: 'Data demo sudah ada.' };
  const acak = demoAcak(20261005);
  const { rand, gauss } = acak;
  const soalPaket = {};
  for (const [m, k] of PAKET_DEMO) soalPaket[`${m}${k}`] = await soalDemo(m, k, gauss);
  const hash = hashPassword(DEFAULT_PASSWORD);
  let nSiswa = 0;
  await tx(async () => {
    for (const [npsn, nama, kab, kec, kel, mutu] of DEMO_SEKOLAH) {
      await tambahSekolah(npsn, nama, kab, kec, kel, { is_demo: 1, kepala_sekolah: '[Nama Kepala Sekolah]' });
      await tambahPengguna(`admin${npsn.slice(-2)}`, 'admin', `Admin ${nama}`, { npsn }, hash);
      const siswa = [];
      for (const kelas of ['6A', '6B']) {
        const jumlah = 14 + Math.floor(rand() * 6);
        for (let i = 0; i < jumlah; i++) {
          const nm = `${NAMA_DEPAN[Math.floor(rand() * NAMA_DEPAN.length)]} ${NAMA_BELAKANG[Math.floor(rand() * NAMA_BELAKANG.length)]}`;
          const id = await tambahPengguna(`${npsn.slice(-2)}${kelas}${String(i + 1).padStart(2, '0')}`.toLowerCase(), 'siswa', nm,
            { npsn, kelas, sesi: i % 2 ? 'Sesi 2' : 'Sesi 1', jk: rand() < 0.5 ? 'L' : 'P' }, hash);
          siswa.push({ id, theta: mutu + gauss() });
          nSiswa++;
        }
      }
      for (const [m, k, naik] of PAKET_DEMO) await isiUjianDemo(npsn, siswa, m, k, naik, soalPaket[`${m}${k}`], acak);
    }
  });
  return { dibuat: true, sekolah: DEMO_SEKOLAH.length, siswa: nSiswa };
}

/** Database lama berisi demo TO1 saja: tambahkan TO2 & TO3 agar rekap try out bisa dicoba. */
export async function lengkapiTryoutDemo() {
  const sekolah = await all('SELECT npsn FROM sekolah WHERE is_demo = 1');
  if (!sekolah.length) return 0;
  const acak = demoAcak(20261006);
  const mutu = Object.fromEntries(DEMO_SEKOLAH.map((d) => [d[0], d[5]]));
  let n = 0;
  await tx(async () => {
    for (const { npsn } of sekolah) {
      const kurang = [];
      for (const pk of PAKET_DEMO) if (!(await one('SELECT 1 FROM ujian WHERE npsn = ? AND mapel = ? AND kategori = ?', npsn, pk[0], pk[1]))) kurang.push(pk);
      if (!kurang.length) continue;
      // perkiraan kemampuan dari nilai yang sudah ada, agar perkembangannya masuk akal
      const siswa = (await all(`SELECT p.id, AVG(pu.nilai) AS nilai FROM pengguna p LEFT JOIN peserta_ujian pu ON pu.siswa_id = p.id AND pu.status = 'selesai'
        WHERE p.npsn = ? AND p.peran = 'siswa' GROUP BY p.id`, npsn)).map((s) => {
        const pr = Math.min(0.97, Math.max(0.03, (s.nilai ?? 50) / 100));
        return { id: s.id, theta: s.nilai == null ? (mutu[npsn] || 0) + acak.gauss() : Math.log(pr / (1 - pr)) / 1.3 + acak.gauss() * 0.2 };
      });
      for (const [m, k, naik] of kurang) { await isiUjianDemo(npsn, siswa, m, k, naik, await soalDemo(m, k, acak.gauss), acak); n++; }
    }
  });
  return n;
}

function jawabanSimulasi(s, benar, rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  switch (s.tipe) {
    case 'pilihan_ganda':
      return benar ? s.kunci : pick(s.opsi.map((o) => o.kode).filter((k) => k !== s.kunci));
    case 'pilihan_ganda_kompleks': {
      if (benar) return s.kunci;
      const ids = s.opsi.map((o) => o.id);
      const a = ids.filter(() => rand() < 0.5);
      return a.length ? a : [pick(ids)];
    }
    case 'pg_kategori': {
      const out = {};
      for (const it of s.opsi.items) out[it.id] = benar || rand() < 0.5 ? s.kunci[it.id] : pick(s.opsi.labels.filter((l) => l !== s.kunci[it.id]));
      return out;
    }
    default:
      return benar ? s.kunci : null;
  }
}

export async function hapusDataDemo() {
  const n = (await one('SELECT COUNT(*) n FROM sekolah WHERE is_demo = 1')).n;
  await run('DELETE FROM sekolah WHERE is_demo = 1');
  return { dihapus: n };
}
