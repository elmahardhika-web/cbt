# TKA SD 2026 · CBT V3

Aplikasi Tes Kemampuan Akademik berbasis web: ujian siswa (HP/laptop), bank soal 7 tipe dengan telaah oleh superadmin,
monitor proktor real-time, koreksi uraian, hasil & legger, analisis per wilayah (peta 38 provinsi), serta dokumen cetak
(kartu peserta, berita acara, rekap nilai, sertifikat ber-QR) dengan logo, tanda tangan, dan stempel tiap sekolah.

## Arsitektur V3

| Komponen | Fungsi |
|---|---|
| **tka2026** (Node.js 24) | Aplikasi web + API. Bisa dijalankan lebih dari satu instans di belakang load balancer. |
| **PostgreSQL 16** | Basis data utama (menggantikan SQLite). |
| **PgBouncer** | Kolam koneksi mode *transaction*: ribuan koneksi aplikasi dilayani ±40 koneksi database. |
| **Redis 7** | Cache data publik, siaran perubahan monitor & pengaturan antar-instans, dan pembatas laju (rate limiter). |

Pembatas laju (jendela geser, dibagi semua instans lewat Redis):

- umum: `RL_USER` permintaan/menit per akun yang masuk (bawaan 240) dan `RL_IP` per IP tanpa login (bawaan 600 — satu lab sekolah sering berbagi IP);
- login: `RL_LOGIN` percobaan per 5 menit per IP + username (bawaan 10);
- pengajuan akun sekolah & cek status: per IP.

Bila Redis tidak tersedia, aplikasi tetap berjalan dengan cache & pembatas di memori (cocok untuk satu instans).

## Menjalankan

```bash
cp .env.example .env      # isi POSTGRES_PASSWORD, APP_SECRET, SUPERADMIN_PASSWORD
docker compose up -d --build
```

Buka `http://<alamat-server>:3026`. Tanpa Docker: siapkan PostgreSQL (dan opsional Redis), lalu

```bash
npm ci
DATABASE_URL=postgres://tka:pw@localhost:5432/tka REDIS_URL=redis://localhost:6379 node server/index.js
```

Skema tabel dibuat otomatis saat aplikasi pertama kali menyala.

### Variabel lingkungan

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL (lewat PgBouncer di Docker Compose). |
| `REDIS_URL` | Koneksi Redis; kosong = tanpa Redis. |
| `APP_SECRET` | Kunci penanda token login. **Wajib sama** di semua instans; kosong = dibuat di `data/secret.key`. |
| `SUPERADMIN_PASSWORD` | Password awal superadmin (hanya saat database pertama kali dibuat). |
| `PG_POOL_MAX` | Jumlah koneksi per instans ke PgBouncer (bawaan 20/30). |
| `RL_USER`, `RL_IP`, `RL_LOGIN` | Batas laju (lihat di atas). |
| `TRUST_PROXY` | `0` bila aplikasi tidak berada di belakang reverse proxy (abaikan `X-Forwarded-For`). |
| `BACKUP_OTOMATIS` | `0` untuk mematikan cadangan harian otomatis. |
| `SEED_DEMO` | `1` untuk membuat sekolah contoh `[DEMO]` saat database baru dibuat. |

## Memindahkan data dari versi lama (SQLite)

1. Hentikan versi lama, salin folder `data/` lama (berisi `tka.db`, `uploads/`, `secret.key`) ke folder aplikasi V3.
2. Jalankan `docker compose up -d --build`. Saat database PostgreSQL masih kosong dan `data/tka.db` ada,
   **seluruh isinya dipindahkan otomatis**; berkas lama diganti nama menjadi `tka-v2-sudah-dimigrasi-….db`.
3. Alternatif manual: `node --disable-warning=ExperimentalWarning alat/migrasi-sqlite.mjs data/tka.db`
   atau unggah berkas `.db` lama di **Superadmin → Backup & Restore → Pulihkan dari berkas**.

Akun supervisor versi lama tidak bisa masuk lagi: fungsi telaah soal sekarang ada di menu superadmin
(**Antrean Telaah**, **Ringkasan Telaah**, **Feedback Siswa**), termasuk persetujuan banyak soal sekaligus.

## Akun bawaan

Master ini **kosong**: saat database pertama kali dibuat hanya ada akun **superadmin**
(password dari `SUPERADMIN_PASSWORD`). Langkah awal:

1. **Pengaturan** — nama instansi, tahun ajaran, target capaian, kontak helpdesk (tampil sebagai tombol *Helpdesk* di dashboard sekolah & guru), dokumen panduan, dan tampil/tidaknya capaian sekolah di halaman masuk.
2. **Mapel & Kategori**, lalu **Sekolah** (atau biarkan sekolah mengajukan akun lewat halaman depan).
3. **Bank Soal** → **Antrean Telaah**; admin sekolah menambah guru & siswa, mengisi **Profil Sekolah** (logo, tanda tangan, stempel kepala sekolah) lalu membuat jadwal ujian.

Akun baru tanpa password otomatis memakai `123456`. Segera ganti lewat menu **Akun Saya**.

## Data & cadangan

- Database ada di `data/postgres/` (volume PostgreSQL), Redis di `data/redis/`, gambar unggahan di `data/uploads/`.
- **Superadmin → Backup & Restore**: cadangan otomatis harian (7 terakhir), buat/unduh/pulihkan cadangan.
  Format `.tka.gz` berisi seluruh tabel + gambar unggahan. Pemulihan berjalan dalam satu transaksi tanpa
  menyalakan ulang aplikasi; data saat ini dicadangkan dulu secara otomatis.
- **Admin sekolah → Backup & Restore**: unduh/pulihkan data sekolahnya (JSON).
- Peta: `public/data/peta/` — batas 38 provinsi & 514 kab/kota dari github.com/Alf-Anas/batas-administrasi-indonesia (BIG),
  dibangun ulang dengan `alat/bangun-peta.mjs`. Wilayah administratif: `public/data/wilayah.json` (github.com/cahyadsn/wilayah, Kepmendagri 2025).

## Aturan ujian

- Waktu pengerjaan dihitung per siswa dan **dijeda** saat siswa terlogout / dikunci / terputus > 3 menit.
- Bila jadwal punya tanggal + jam selesai, semua jawaban otomatis dikumpulkan tepat pada jam tersebut.
- Saat offline, jawaban disimpan di perangkat dan dikirim otomatis saat tersambung (diterima hingga 15 menit setelah waktu habis).
- Ujian berjalan di layar penuh; upaya keluar mengunci akun hingga admin sekolah **Reset Login**.

## Pengujian

```bash
node alat/uji-asap.mjs http://localhost:3026 '<password superadmin>'
```

Menjalankan alur lengkap lewat API (sekolah, impor siswa, soal, telaah, ujian, jawaban, koreksi, laporan, cetak, ujian massal)
lalu menghapus data ujinya kembali.

## Memperbarui aplikasi

Kode (`server/`, `public/`, `seed/`) dibaca langsung dari folder ini. Setelah menyalin berkas baru, buat berkas kosong
`data/.muat-ulang` — aplikasi memuat ulang dirinya dalam ±5 detik. Perubahan dependensi (`package.json`), `Dockerfile`,
atau `docker-compose.yml` perlu `docker compose up -d --build` (atau `jalankan.sh` sebagai root).
