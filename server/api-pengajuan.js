// Pengajuan akun sekolah: sekolah mengisi formulir di halaman publik → superadmin menyetujui (sekolah + admin dibuat) atau menolak.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { route } from './router.js';
import { all, one, run, tx } from './db.js';
import { hashPassword, httpError, requireRole } from './auth.js';
import { int, str, now, audit } from './util.js';
import { SEKOLAH_FIELDS, bersihkanSekolah, simpanWilayahLokal, segarkanPublik } from './api-umum.js';
import { catatLaju } from './redis.js';

// data resmi provinsi & kab/kota (sama dengan yang dipakai formulir)
let wilayah = null;
function kabkotaResmi(provKode, kabKode) {
  wilayah ||= JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'wilayah.json'), 'utf8')).provinsi;
  const p = wilayah.find((x) => x.kode === provKode);
  const k = p?.kabkota.find((x) => x.kode === kabKode);
  return k ? { provinsi_kode: p.kode, provinsi: p.nama, kabkota_kode: k.kode, kabkota: k.nama } : null;
}

// pembatas laju per IP (pengajuan & cek status), dibagi antar-instans lewat Redis
async function batasi(kunci, maks, menit) {
  const r = await catatLaju(kunci, maks, menit * 60);
  if (!r.izin) throw httpError(429, `Terlalu sering dari jaringan ini. Coba lagi dalam ${Math.max(1, Math.ceil(r.ulangDalam / 60))} menit.`);
}

const HURUF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const acak = (n) => [...crypto.randomBytes(n)].map((b) => HURUF[b % HURUF.length]).join('');
const kodeBaru = () => `TKA-${acak(4)}-${acak(4)}`;
const PUBLIK = 'id, kode, npsn, nama, provinsi_kode, provinsi, kabkota_kode, kabkota, kecamatan, kelurahan, alamat, pemohon_nama, pemohon_jabatan, pemohon_email, pemohon_hp, admin_username, catatan, status, alasan, dibuat_at, diputus_at, diputus_oleh';

route('POST', '/api/public/pengajuan', async (ctx) => {
  const b = ctx.body || {};
  if (b.situs) return { kode: kodeBaru() }; // jebakan bot: kolom tersembunyi terisi
  const npsn = str(b.npsn).replace(/\D/g, '');
  const nama = str(b.nama).replace(/\s+/g, ' ').slice(0, 150);
  const w = kabkotaResmi(str(b.provinsi_kode), str(b.kabkota_kode));
  const user = str(b.admin_username);
  const pass = String(b.admin_password ?? '');
  const salah = [];
  if (npsn.length !== 8) salah.push('NPSN 8 digit');
  if (nama.length < 5) salah.push('nama sekolah');
  if (!w) salah.push('provinsi dan kabupaten/kota');
  if (!str(b.pemohon_nama)) salah.push('nama pemohon');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(b.pemohon_email))) salah.push('email yang valid');
  if (!/^[0-9+\-\s]{8,20}$/.test(str(b.pemohon_hp))) salah.push('nomor HP/WhatsApp');
  if (!/^[A-Za-z0-9._-]{4,40}$/.test(user)) salah.push('username admin (4–40 huruf/angka, tanpa spasi)');
  if (pass.length < 8) salah.push('password admin minimal 8 karakter');
  if (salah.length) throw httpError(400, `Lengkapi: ${salah.join(', ')}.`);
  if (await one('SELECT 1 FROM sekolah WHERE npsn = ?', npsn)) throw httpError(409, 'Sekolah dengan NPSN ini sudah terdaftar. Hubungi admin sekolah Anda atau panitia pusat.');
  if (await one(`SELECT 1 FROM pengajuan_akun WHERE npsn = ? AND status = 'menunggu'`, npsn)) throw httpError(409, 'Pengajuan untuk NPSN ini sudah masuk dan sedang ditinjau. Cek statusnya memakai kode pengajuan.');
  if ((await one('SELECT 1 FROM pengguna WHERE username = ?', user)) || (await one(`SELECT 1 FROM pengajuan_akun WHERE admin_username = ? AND status = 'menunggu'`, user))) {
    throw httpError(409, `Username "${user}" sudah dipakai. Pilih username lain.`);
  }
  await batasi(`ajukan:${ctx.ip}`, 5, 60); // dihitung setelah data lolos pemeriksaan
  const kode = kodeBaru();
  await run(`INSERT INTO pengajuan_akun (kode, npsn, nama, provinsi_kode, provinsi, kabkota_kode, kabkota, kecamatan, kelurahan, alamat,
      pemohon_nama, pemohon_jabatan, pemohon_email, pemohon_hp, admin_username, admin_hash, catatan, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  kode, npsn, nama, w.provinsi_kode, w.provinsi, w.kabkota_kode, w.kabkota, str(b.kecamatan).slice(0, 80) || null, str(b.kelurahan).slice(0, 80) || null,
  str(b.alamat).slice(0, 300) || null, str(b.pemohon_nama).slice(0, 120), str(b.pemohon_jabatan).slice(0, 80) || null, str(b.pemohon_email).slice(0, 120),
  str(b.pemohon_hp).slice(0, 30), user, hashPassword(pass), str(b.catatan).slice(0, 600) || null, ctx.ip);
  audit('pengajuan akun baru', npsn, nama, kode);
  return { kode };
}, { public: true });

route('GET', '/api/public/pengajuan/:kode', async (ctx) => {
  await batasi(`lacak:${ctx.ip}`, 30, 15);
  const p = await one('SELECT nama, npsn, kabkota, status, alasan, admin_username, dibuat_at, diputus_at FROM pengajuan_akun WHERE kode = ?', str(ctx.params.kode).toUpperCase());
  if (!p) throw httpError(404, 'Kode pengajuan tidak ditemukan. Periksa kembali penulisannya.');
  return { ...p, alasan: p.status === 'ditolak' ? p.alasan : null, admin_username: p.status === 'disetujui' ? p.admin_username : null };
}, { public: true });

// ---------- superadmin ----------
route('GET', '/api/pengajuan', (ctx) => {
  requireRole(ctx, 'superadmin');
  const status = ['menunggu', 'disetujui', 'ditolak'].includes(ctx.query.status) ? ctx.query.status : null;
  return all(`SELECT ${PUBLIK}, EXISTS (SELECT 1 FROM sekolah s WHERE s.npsn = p.npsn) AS npsn_terdaftar,
      EXISTS (SELECT 1 FROM pengguna u WHERE u.username = p.admin_username) AS username_terpakai
    FROM pengajuan_akun p WHERE (?::text IS NULL OR status = ?)
    ORDER BY CASE status WHEN 'menunggu' THEN 0 WHEN 'disetujui' THEN 1 ELSE 2 END, dibuat_at DESC LIMIT 500`, status, status);
});

route('GET', '/api/pengajuan/ringkasan', async (ctx) => {
  requireRole(ctx, 'superadmin');
  return Object.fromEntries((await all('SELECT status, COUNT(*) AS n FROM pengajuan_akun GROUP BY status')).map((r) => [r.status, r.n]));
});

async function ambil(id) {
  const p = await one('SELECT * FROM pengajuan_akun WHERE id = ?', int(id));
  if (!p) throw httpError(404, 'Pengajuan tidak ditemukan.');
  return p;
}

route('POST', '/api/pengajuan/:id/setujui', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const p = await ambil(ctx.params.id);
  if (p.status !== 'menunggu') throw httpError(409, 'Pengajuan ini sudah diputuskan sebelumnya.');
  if (await one('SELECT 1 FROM sekolah WHERE npsn = ?', p.npsn)) throw httpError(409, `NPSN ${p.npsn} sudah terdaftar. Tolak pengajuan ini atau hapus sekolah lama lebih dulu.`);
  if (await one('SELECT 1 FROM pengguna WHERE username = ?', p.admin_username)) throw httpError(409, `Username ${p.admin_username} sudah dipakai akun lain. Tolak dan minta pemohon mengajukan ulang dengan username lain.`);
  const s = bersihkanSekolah(p);
  await tx(async () => {
    await run(`INSERT INTO sekolah (npsn, ${SEKOLAH_FIELDS.join(', ')}) VALUES (?, ${SEKOLAH_FIELDS.map(() => '?').join(', ')})`, p.npsn, ...SEKOLAH_FIELDS.map((f) => s[f]));
    await simpanWilayahLokal(s);
    await run(`INSERT INTO pengguna (username, password_hash, peran, nama, npsn) VALUES (?, ?, 'admin', ?, ?)`, p.admin_username, p.admin_hash, p.pemohon_nama || `Admin ${s.nama}`, p.npsn);
    await run(`UPDATE pengajuan_akun SET status = 'disetujui', diputus_at = ?, diputus_oleh = ?, admin_hash = NULL WHERE id = ?`, now(), ctx.user.username, p.id);
  });
  audit('pengajuan disetujui', p.npsn, p.nama, 'oleh', ctx.user.username);
  await segarkanPublik();
  return { npsn: p.npsn };
});

route('POST', '/api/pengajuan/:id/tolak', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const p = await ambil(ctx.params.id);
  if (p.status !== 'menunggu') throw httpError(409, 'Hanya pengajuan yang menunggu yang bisa ditolak.');
  const alasan = str(ctx.body.alasan).slice(0, 500);
  if (!alasan) throw httpError(400, 'Tuliskan alasan penolakan agar pemohon tahu yang perlu diperbaiki.');
  await run(`UPDATE pengajuan_akun SET status = 'ditolak', alasan = ?, diputus_at = ?, diputus_oleh = ?, admin_hash = NULL WHERE id = ?`, alasan, now(), ctx.user.username, p.id);
  audit('pengajuan ditolak', p.npsn, p.nama, alasan);
  return true;
});

route('DELETE', '/api/pengajuan/:id', async (ctx) => {
  requireRole(ctx, 'superadmin');
  const p = await ambil(ctx.params.id);
  if (p.status === 'menunggu') throw httpError(409, 'Putuskan pengajuan ini dulu (setujui atau tolak) sebelum dihapus.');
  await run('DELETE FROM pengajuan_akun WHERE id = ?', p.id);
  return true;
});
