# TKA SD 2026

Aplikasi Tes Kemampuan Akademik berbasis web: ujian siswa (HP/laptop), bank soal 7 tipe dengan telaah supervisor,
monitor proktor real-time, koreksi uraian, hasil & legger, analisis per wilayah, serta dokumen cetak (kartu peserta,
berita acara, rekap nilai, sertifikat ber-QR).

## Menjalankan

```bash
docker compose up -d --build
```

Buka `http://<alamat-server>:3026`. Tanpa Docker: `node server/index.js` (Node.js 24+, tanpa dependensi tambahan).

## Akun bawaan

Master ini **kosong**: saat database pertama kali dibuat hanya ada akun **superadmin**
(password khusus yang sudah ditentukan; bisa diganti lewat variabel `SUPERADMIN_PASSWORD` sebelum pertama kali dijalankan).
Tidak ada sekolah, guru, siswa, jadwal ujian, soal, maupun data demo.

Langkah awal setelah masuk sebagai superadmin:
1. **Pengaturan** — isi nama instansi, tahun ajaran, target capaian, helpdesk.
2. **Mapel & Kategori** — tersedia Bahasa Indonesia, Matematika, dan kategori Try Out/US/UKK/SAT; ubah sesuai kebutuhan.
3. **Sekolah** — tambah sekolah beserta akun admin sekolahnya, atau biarkan sekolah mengajukan akun lewat halaman depan (**Ajukan Akun Sekolah**).
4. **Pengguna** — buat akun supervisor (penelaah soal).
5. **Bank Soal** — masukkan soal; admin sekolah lalu menambah guru & siswa dan membuat jadwal ujian.

Akun baru tanpa password otomatis memakai `123456`. Segera ganti password lewat menu **Akun Saya**.

## Data

- Semua data ada di folder `data/` (database `tka.db`, gambar soal di `uploads/`, kunci rahasia `secret.key`).
  Cadangkan folder ini secara berkala; untuk memulihkan, salin kembali lalu jalankan ulang container.
- Data demo (sekolah contoh `[DEMO]` beserta hasil ujian simulasi) **tidak** dibuat. Bila ingin mencoba fitur analisis,
  pakai **Superadmin → Pengaturan → Buat data demo**, lalu **Hapus data demo** sebelum ujian sungguhan
  (atau isi `SEED_DEMO=1` di `docker-compose.yml` sebelum database pertama kali dibuat).
- Bank soal awal (opsional): taruh berkas JSON soal di folder `seed/` sebelum database pertama kali dibuat; semuanya diimpor sebagai soal disetujui.
- Wilayah provinsi & kab/kota: `public/data/wilayah.json` (github.com/cahyadsn/wilayah, Kepmendagri No 300.2.2-2138 Tahun 2025).
  Kecamatan & kelurahan diisi sekolah dan otomatis menjadi pilihan bagi sekolah lain.

## Aturan ujian

- Waktu pengerjaan dihitung per siswa dan **dijeda** saat siswa terlogout / dikunci / terputus > 3 menit; berjalan lagi saat login.
- Bila jadwal punya tanggal + jam selesai, semua jawaban otomatis dikumpulkan tepat pada jam tersebut.
- Saat offline, jawaban disimpan di perangkat dan dikirim otomatis saat tersambung (diterima hingga 15 menit setelah waktu habis).
- Ujian berjalan di layar penuh. Menahan **Esc** atau **layar** selama 5 detik dianggap upaya keluar: akun dikunci,
  waktu dijeda, dan siswa harus meminta admin sekolah **Reset Login**. Bila browser memaksa keluar layar penuh,
  siswa diberi 10 detik untuk kembali sebelum akun dikunci.

## Memperbarui aplikasi

Kode (`server/`, `public/`, `seed/`) dibaca langsung dari folder ini. Setelah menyalin berkas baru, buat berkas kosong
`data/.muat-ulang` — aplikasi memuat ulang dirinya dalam ±5 detik (Docker menyalakannya kembali otomatis).
Perubahan `Dockerfile`/`docker-compose.yml` tetap perlu menjalankan `jalankan.sh` sebagai root.

## Backup & restore

- Superadmin → **Backup & Restore**: cadangan otomatis harian (7 terakhir), buat/unduh/pulihkan cadangan, atau pulihkan dari berkas `.db`.
  Berkas cadangan memuat database dan gambar unggahan. Sebelum memulihkan, data saat ini otomatis dicadangkan.
- Admin sekolah → **Backup & Restore**: unduh/pulihkan data sekolahnya (JSON).
