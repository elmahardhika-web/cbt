// Uji asap end-to-end: menjalankan alur utama lewat API terhadap server yang sedang berjalan.
// Pemakaian: node alat/uji-asap.mjs http://localhost:3026 'PasswordSuperadmin'
// Membuat data uji bertanda [UJI] lalu menghapusnya kembali di akhir.
const BASE = process.argv[2] || 'http://localhost:3026';
const PASS = process.argv[3] || process.env.SUPERADMIN_PASSWORD || 'Raisa6690*#';

let gagal = 0;
async function api(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`${method} ${path} → ${r.status} ${j.error || ''}`);
  return j.data;
}
async function cek(nama, fn) {
  try { const r = await fn(); console.log(`  ✓ ${nama}`); return r; } catch (e) { gagal++; console.log(`  ✗ ${nama}: ${e.message}`); return null; }
}

console.log(`Uji asap ${BASE}`);
await cek('info publik', () => api('public/info'));
await cek('sebaran publik', () => api('public/sebaran'));
await cek('statistik publik', () => api('public/statistik'));
await cek('capaian publik', () => api('public/capaian'));
const su = await cek('login superadmin', () => api('login', { method: 'POST', body: { username: 'superadmin', password: PASS } }));
if (!su) process.exit(1);
const T = su.token;
const g = (p) => cek(`GET ${p}`, () => api(p, { token: T }));
for (const p of ['me', 'dashboard', 'sekolah', 'pengguna', 'pengguna/kelas', 'pengguna/ringkasan', 'mapel', 'kategori', 'soal', 'telaah/ringkasan', 'feedback',
  'ujian', 'massal', 'pengajuan', 'pengajuan/ringkasan', 'analisis/opsi', 'rekap-tryout', 'backup', 'pengaturan', 'demo', 'koreksi']) await g(p);

// sekolah + admin + siswa
const NPSN = '98765432';
await api(`sekolah/${NPSN}`, { method: 'DELETE', token: T }).catch(() => {});
await cek('buat sekolah', () => api('sekolah', { method: 'POST', token: T, body: { npsn: NPSN, nama: '[UJI] SD Uji Asap', provinsi_kode: '31', provinsi: 'DKI JAKARTA', kabkota_kode: '31.71', kabkota: 'KOTA ADM. JAKARTA PUSAT', kecamatan: 'gambir', admin_username: 'ujiasap_admin', admin_password: 'rahasia123' } }));
await cek('ubah sekolah (logo/ttd/kota)', () => api(`sekolah/${NPSN}`, { method: 'PUT', token: T, body: { kepala_sekolah: 'Budi', nip_kepsek: '1980', kota_ttd: 'Jakarta' } }));
const imp = await cek('impor siswa', () => api('pengguna/impor', { method: 'POST', token: T, body: { peran: 'siswa', npsn: NPSN, rows: [
  { nama: 'Ani Uji', jk: 'P', kelas: '6A' }, { nama: 'Budi Uji', jk: 'L', kelas: '6A' }, { nama: 'Cici Uji', jk: 'P', kelas: '6B', username: 'ujiasap_cici', password: 'pw1234' }] } }));
if (imp?.ringkasan?.baru !== 3) { gagal++; console.log('  ✗ impor siswa: ringkasan', JSON.stringify(imp?.ringkasan)); }
await cek('ringkasan siswa sekolah', () => api(`pengguna/ringkasan?npsn=${NPSN}`, { token: T }));
await cek('kartu peserta', () => api(`cetak/kartu?npsn=${NPSN}`, { token: T }));

// soal → telaah → ujian
const soal = await cek('buat soal PG', () => api('soal', { method: 'POST', token: T, body: { mapel: 'BI', kategori: 'TO1', tipe: 'pilihan_ganda', pertanyaan: '<p>[UJI] 1+1?</p>', opsi: [{ teks: '1' }, { teks: '2' }], kunci: 'B', ajukan: true } }));
const soal2 = await cek('buat soal uraian', () => api('soal', { method: 'POST', token: T, body: { mapel: 'BI', kategori: 'TO1', tipe: 'uraian', pertanyaan: '<p>[UJI] Jelaskan</p>', kunci: 'rubrik', ajukan: true } }));
await cek('telaah massal', () => api('telaah/massal', { method: 'POST', token: T, body: { ids: [soal?.id, soal2?.id] } }));
const uj = await cek('buat ujian', () => api('ujian', { method: 'POST', token: T, body: { npsn: NPSN, mapel: 'BI', kategori: 'TO1', durasi: 30 } }));
await cek('aktifkan ujian', () => api(`ujian/${uj?.id}/aktif`, { method: 'PUT', token: T, body: { aktif: true } }));
await cek('monitor ujian', () => api(`ujian/${uj?.id}/monitor`, { token: T }));

// siswa mengerjakan
const sw = await cek('login siswa', () => api('login', { method: 'POST', body: { username: 'ujiasap_cici', password: 'pw1234' } }));
const ST = sw?.token;
const daftar = await cek('daftar ujian siswa', () => api('siswa/ujian', { token: ST }));
const tok = (await api(`ujian/${uj?.id}/monitor`, { token: T }).catch(() => null))?.ujian?.token;
const sesi = await cek('mulai ujian', () => api(`siswa/ujian/${uj?.id}/mulai`, { method: 'POST', token: ST, body: { token: tok } }));
const pid = sesi?.peserta?.id;
for (const s of sesi?.soal || []) {
  await cek(`jawab soal ${s.tipe}`, () => api(`siswa/sesi/${pid}/jawaban`, { method: 'PUT', token: ST, body: { soal_id: s.id, jawaban: s.tipe === 'uraian' ? 'jawaban panjang' : 'B' } }));
}
await cek('ping', () => api(`siswa/sesi/${pid}/ping`, { method: 'POST', token: ST, body: {} }));
await cek('feedback siswa', () => api('siswa/feedback', { method: 'POST', token: ST, body: { soal_id: sesi?.soal?.[0]?.id, pesan: 'uji' } }));
await cek('selesai ujian', () => api(`siswa/sesi/${pid}/selesai`, { method: 'POST', token: ST, body: {} }));
const kor = await cek('daftar koreksi', () => api(`koreksi?npsn=${NPSN}`, { token: T }));
const det = await cek('detail koreksi', () => api(`koreksi/${pid}`, { token: T }));
if (det?.items?.[0]) await cek('beri skor uraian', () => api(`koreksi/jawaban/${det.items[0].id}`, { method: 'PUT', token: T, body: { skor: 4 } }));
await cek('nilai siswa', () => api('siswa/nilai', { token: ST }));
await cek('analisis', () => api(`analisis?mapel=BI&kategori=TO1&npsn=${NPSN}`, { token: T }));
await cek('legger', () => api(`legger?npsn=${NPSN}&kategori=TO1`, { token: T }));
await cek('akumulatif', () => api(`akumulatif?kategori=TO1`, { token: T }));
await cek('rekap try out', () => api(`rekap-tryout?npsn=${NPSN}`, { token: T }));
await cek('profil 360', () => api(`profil360?npsn=${NPSN}`, { token: T }));
await cek('berita acara', () => api(`cetak/berita-acara/${uj?.id}`, { token: T }));
await cek('sertifikat', () => api(`cetak/sertifikat?peserta=${pid}`, { token: T }));
await cek('cadangan sekolah', () => api(`sekolah-backup?npsn=${NPSN}`, { token: T }));
await cek('ujian massal', async () => {
  const m = await api('massal', { method: 'POST', token: T, body: { mapel: 'BI', kategori: 'TO1', sekolah: [NPSN] } });
  await api(`massal/${m.id}`, { token: T });
  await api(`massal/${m.id}/token`, { method: 'POST', token: T });
  await api(`massal/${m.id}`, { method: 'DELETE', token: T, body: { paksa: true } });
});

// pembersihan
await cek('hapus sekolah uji', () => api(`sekolah/${NPSN}`, { method: 'DELETE', token: T }));
for (const s of [soal, soal2]) if (s) await api(`soal/${s.id}`, { method: 'DELETE', token: T }).catch(() => {});
console.log(gagal ? `\n${gagal} pemeriksaan gagal.` : '\nSemua pemeriksaan lulus.');
process.exit(gagal ? 1 : 0);
