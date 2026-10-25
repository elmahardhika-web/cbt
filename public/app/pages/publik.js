import { html, useState, useEffect, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { session, post, get, setSession, berandaPeran, loadInfo } from '../api.js';
import { Field, toastErr, Loading, ErrorBox } from '../ui.js';
import { Logo, GantiLayar } from '../layout.js';
import { urlLogin } from '../tampilan.js';
import { PetaIndonesia, useDataPeta, posisiSekolah } from '../peta.js';
import { KontakHelpdesk, HelpdeskFab } from '../helpdesk.js';

const gulir = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

const FITUR = [
  ['layers', 'Tujuh tipe soal', 'Pilihan ganda, PG kompleks, benar/salah, PG kategori, menjodohkan, isian singkat, dan uraian — lengkap dengan gambar dan rumus.'],
  ['wifi', 'Tetap jalan saat sinyal putus', 'Jawaban tersimpan di perangkat dan terkirim otomatis begitu tersambung. Waktu siswa dijeda saat terkendala.'],
  ['lock', 'Layar penuh terkunci', 'Upaya keluar dari ujian langsung mengunci akun; satu akun hanya aktif di satu perangkat.'],
  ['monitor', 'Monitor proktor langsung', 'Status tiap peserta terlihat seketika: mengerjakan, dijeda, terkunci, selesai. Token dan tambah waktu dari satu layar.'],
  ['calendar', 'Ujian massal dari pusat', 'Satu jadwal untuk ratusan sekolah sekaligus, dengan token seragam atau per sekolah.'],
  ['pie', 'Analisis butir & wilayah', 'Tingkat kesukaran, daya beda, sebaran nilai, hingga peringkat per kecamatan, kab/kota, dan provinsi.'],
  ['award', 'Sertifikat ber-QR & legger', 'Sertifikat dengan logo, tanda tangan, dan stempel sekolah; keasliannya bisa dicek siapa pun lewat kode QR.'],
  ['database', 'Siap skala nasional', 'PostgreSQL dengan PgBouncer, cache dan pembatas laju Redis, serta cadangan harian otomatis.'],
];

const LANGKAH = [
  ['Ajukan akun sekolah', 'Isi formulir pengajuan. Panitia pusat memeriksa NPSN lalu mengaktifkan akun admin sekolah.'],
  ['Siapkan peserta', 'Admin sekolah mengimpor siswa dari Excel, mengunggah logo dan tanda tangan kepala sekolah, lalu mencetak kartu peserta.'],
  ['Laksanakan ujian', 'Buka jadwal, bagikan token di ruang ujian, dan pantau peserta dari layar monitor.'],
  ['Terima hasil', 'Nilai, legger, analisis, berita acara, dan sertifikat siap diunduh begitu ujian selesai.'],
];

const PORTAL = [
  ['user', 'Siswa', 'Masuk dengan nomor peserta di kartu ujian.', '#/masuk?peran=siswa'],
  ['book', 'Guru', 'Tulis soal, koreksi uraian, pantau kelas.', '#/masuk?peran=sekolah'],
  ['school', 'Admin sekolah', 'Data siswa, jadwal, monitor, dan laporan.', '#/masuk?peran=sekolah'],
  ['shield', 'Panitia pusat', 'Sekolah, telaah soal, ujian massal, dasbor wilayah.', '#/masuk?peran=sekolah'],
];

export function Landing() {
  const [info, setInfo] = useState(session.info);
  const [stat, setStat] = useState(null);
  useEffect(() => { loadInfo().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { get('public/statistik').then(setStat).catch(() => setStat(null)); }, []);
  useEffect(() => { if (location.hash.startsWith('#/cek-nilai')) setTimeout(() => document.getElementById('nilai')?.scrollIntoView(), 50); }, []);
  const nama = info?.nama_aplikasi || 'TKA SD 2026';
  return html`<div style="background:var(--bg)">
    <header class="pub-top"><div class="container pub-nav">
      <a href="#/" class="row" style="text-decoration:none;gap:10px"><${Logo} size=${38} /><span class="col" style="gap:0"><strong style="font-size:15.5px;color:var(--ink)">${nama}</strong><span class="tiny muted">${info?.nama_instansi || ''}</span></span></a>
      <nav aria-label="Navigasi utama">
        <a href="#fitur" onClick=${gulir('fitur')}>Fitur</a>
        <a href="#wilayah" onClick=${gulir('wilayah')}>Wilayah</a>
        <a href="#alur" onClick=${gulir('alur')}>Alur</a>
        <a href="#dokumen" onClick=${gulir('dokumen')}>Dokumen</a>
        <a href="#nilai" onClick=${gulir('nilai')}>Cek nilai</a>
      </nav>
      <span class="row gap-8"><a class="btn btn-o" href="#/ajukan">Ajukan akun sekolah</a>
        <a class="btn btn-p" href="#/masuk">Masuk</a></span>
    </div></header>

    <section class="pub-hero">
      <div class="container" style="padding-top:64px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:40px;align-items:end">
        <div class="col" style="gap:20px;padding-bottom:40px">
          <span class="eyebrow">Computer Based Test · Tahun ajaran ${info?.tahun_ajaran || ''}</span>
          <h1 class="display">Tes Kemampuan Akademik SD, dari sekolah hingga tingkat nasional.</h1>
          <p class="lead">Ujian berbasis komputer yang adil dan terukur: siswa mengerjakan dari HP atau laptop, sekolah memantau langsung, dan hasilnya langsung menjadi bahan analisis per wilayah.</p>
          <div class="row wrap gap-8">
            <a class="btn btn-lg btn-inv" href="#/masuk?peran=siswa">Masuk sebagai peserta</a>
            <a class="btn btn-lg btn-inv-o" href="#/masuk?peran=sekolah">Masuk sekolah & guru</a>
          </div>
        </div>
        <div class="col" style="gap:0;padding-bottom:40px">
          <span class="small" style="color:rgba(255,255,255,.7);margin-bottom:10px">Sebaran peserta saat ini</span>
          <${PetaMini} stat=${stat} />
        </div>
      </div>
      <div class="container"><div class="angka-strip">
        ${[[stat?.sekolah, 'sekolah terdaftar'], [stat?.siswa, 'siswa peserta'], [stat?.provinsi, 'provinsi'], [stat?.kabkota, 'kabupaten/kota'], [stat?.ujian_selesai, 'ujian diselesaikan'], [stat?.soal, 'soal siap pakai']].map(([v, l]) =>
          html`<div><strong>${stat ? fmt.bulat(v || 0) : '–'}</strong><span>${l}</span></div>`)}
      </div></div>
    </section>

    <section id="fitur" class="container section col" style="gap:28px">
      <div class="col" style="gap:8px;max-width:640px"><span class="eyebrow">Fitur CBT V3</span><h2 class="h-xl">Semua yang dibutuhkan untuk ujian yang tertib</h2>
        <p style="color:var(--text-2);font-size:16px">Dirancang untuk sekolah dasar: mudah bagi siswa, ringan bagi proktor, dan lengkap bagi panitia.</p></div>
      <div class="fitur-grid">${FITUR.map(([ic, t, d]) => html`<article><span class="ic"><${Icon} n=${ic} s=${22} /></span><h3>${t}</h3><p>${d}</p></article>`)}</div>
    </section>

    <${WilayahPeserta} stat=${stat} />

    <section id="alur" class="container section col" style="gap:28px">
      <div class="col" style="gap:8px;max-width:640px"><span class="eyebrow">Alur pelaksanaan</span><h2 class="h-xl">Empat langkah dari pendaftaran sampai sertifikat</h2></div>
      <div class="langkah">${LANGKAH.map(([t, d]) => html`<div><h3 style="font-size:16px">${t}</h3><p class="small" style="color:var(--text-2);line-height:1.6">${d}</p></div>`)}</div>
      <div class="card row wrap" style="padding:20px 24px;gap:16px;align-items:center">
        <div class="col grow" style="gap:4px;min-width:min(320px,100%)"><strong style="font-size:16px">Sekolah Anda belum terdaftar?</strong>
          <span class="small" style="color:var(--text-2)">Ajukan akun admin sekolah. Setelah disetujui, sekolah langsung bisa menambah guru dan siswa lalu menjadwalkan ujian.</span></div>
        <span class="row wrap gap-8"><a class="btn btn-p" href="#/ajukan">Ajukan akun sekolah</a><a class="btn btn-o" href="#/ajukan/status">Cek status pengajuan</a></span>
      </div>
    </section>

    <section class="band"><div class="container section col" style="gap:24px">
      <div class="col" style="gap:8px"><span class="eyebrow">Portal</span><h2 class="h-xl">Satu sistem, empat pintu kerja</h2></div>
      <div class="fitur-grid">${PORTAL.map(([ic, t, d, href]) => html`<article><span class="ic"><${Icon} n=${ic} s=${22} /></span><h3>${t}</h3><p>${d}</p>
        <a href=${href} class="small" style="margin-top:auto;font-weight:600;text-decoration:none">Masuk →</a></article>`)}</div>
    </div></section>

    <section id="dokumen" class="container section">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:28px;align-items:start">
        <div class="col" style="gap:16px">
          <div class="col" style="gap:8px"><span class="eyebrow">Pusat informasi</span><h2 class="h-xl">Dokumen pendukung</h2>
            <p style="color:var(--text-2)">Panduan dan petunjuk teknis terbaru untuk pelaksanaan ujian.</p></div>
          ${(info?.dokumen || []).length ? html`<div class="card col" style="gap:0">
            ${info.dokumen.map((d, i) => html`<a href=${d.url} target="_blank" rel="noopener" class="row" style=${`padding:14px 18px;gap:14px;text-decoration:none;color:var(--ink);${i ? 'border-top:1px solid var(--line)' : ''}`}>
              <${Icon} n="file-pdf" s=${22} /><span class="col grow" style="gap:0"><strong class="small">${d.nama}</strong><span class="tiny muted">${d.keterangan || 'Dokumen'}</span></span><${Icon} n="download" s=${18} /></a>`)}
          </div>` : html`<div class="card pad small muted">Dokumen panduan akan tampil di sini setelah diunggah panitia pusat.</div>`}
        </div>
        <div class="col" style="gap:16px">
          <div class="col" style="gap:8px"><span class="eyebrow">Helpdesk</span><h2 class="h-xl">Butuh bantuan?</h2>
            <p style="color:var(--text-2)">Tim helpdesk siap membantu kendala akun, jadwal, maupun teknis ujian.</p></div>
          ${(info?.helpdesk || []).length ? html`<div class="card helpdesk-panel" style="width:auto;box-shadow:var(--shadow)">${info.helpdesk.map((h) => html`<${KontakHelpdesk} h=${h} />`)}</div>`
            : html`<div class="card pad small muted">Kontak helpdesk belum diatur.</div>`}
        </div>
      </div>
    </section>

    <section id="nilai" class="band"><div class="container section"><${CekNilai} /></div></section>

    <footer><div class="container row wrap" style="justify-content:space-between;padding-top:24px;padding-bottom:24px">
      <div class="row"><${Logo} size=${32} /><span class="small" style="color:var(--text-2)"><strong style="color:var(--ink)">${nama}</strong> · ${info?.nama_instansi || ''}</span></div>
      <span class="row gap-8"><${GantiLayar} kecil /><span class="small muted">© ${new Date().getFullYear()} · Tes Kemampuan Akademik</span></span></div></footer>
    <${HelpdeskFab} />
  </div>`;
}

/** Skala warna jumlah sekolah per provinsi (biru berurutan). */
const SKALA = ['#DCE8FA', '#B5CDF2', '#82A9E6', '#4F82D6', '#1F5FD1', '#0F2A4F'];
function warnaJumlah(n, maks) {
  if (!n) return '#EEF2F6';
  const i = Math.min(SKALA.length - 1, Math.ceil((n / Math.max(1, maks)) * (SKALA.length - 1)));
  return SKALA[Math.max(1, i)];
}

function PetaMini({ stat }) {
  const dasar = useDataPeta();
  const per = Object.fromEntries((stat?.per_provinsi || []).map((p) => [p.kode, p]));
  const maks = Math.max(1, ...Object.values(per).map((p) => p.sekolah));
  if (dasar.error) return null;
  return html`<div style="border:1px solid rgba(255,255,255,.14);border-radius:var(--radius);padding:12px;background:rgba(255,255,255,.03)">
    <${PetaIndonesia} dasar=${dasar.data} label="Peta jumlah sekolah peserta per provinsi"
      warnaProv=${(k) => (per[k] ? warnaJumlah(per[k].sekolah, maks) : '#20406B')}
      judulProv=${(p) => `${p.nama}: ${per[p.kode]?.sekolah || 0} sekolah`} /></div>`;
}

function CekNilai() {
  const [f, setF] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState(null);
  const lihat = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await post('login', f);
      if (d.user.peran !== 'siswa') throw new Error('Gunakan akun siswa untuk melihat nilai.');
      const old = session.token;
      session.token = d.token;
      try {
        const nilai = await get('siswa/nilai');
        setHasil({ nama: d.user.nama, kelas: d.user.kelas, nilai });
        await post('logout');
      } finally { session.token = old; }
    } catch (err) { toastErr(err); } finally { setBusy(false); }
  };
  return html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:32px;align-items:center">
    <div class="col" style="gap:10px">
      <span class="eyebrow">Hasil ujian</span>
      <h2 class="h-xl">Sudah selesai ujian?</h2>
      <p style="max-width:440px;color:var(--text-2)">Masukkan nomor peserta dan password dari kartu ujian untuk melihat nilai per mata pelajaran. Nilai uraian muncul setelah guru selesai mengoreksi.</p>
    </div>
    ${hasil ? html`<div class="card pad col">
      <div class="row"><strong class="grow">${hasil.nama}</strong><span class="small muted">Kelas ${hasil.kelas}</span></div>
      ${hasil.nilai.length === 0 ? html`<p class="muted small">Belum ada ujian yang selesai.</p>` : hasil.nilai.map((n) => html`
        <div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><span class="col grow" style="gap:0"><strong class="small">${n.mapel_nama}</strong><span class="tiny muted">${n.kategori_nama} · ${fmt.tglPendek(n.selesai_at)}</span></span>
        ${n.nilai == null ? html`<span class="chip amber">Menunggu koreksi</span>` : html`<strong class="num" style="font-size:22px;color:var(--sky-700)">${fmt.angka(n.nilai)}</strong>`}</div>`)}
      <button class="btn btn-o" onClick=${() => { setHasil(null); setF({ username: '', password: '' }); }}>Tutup</button>
    </div>` : html`<form class="card pad col" onSubmit=${lihat}>
      <${Field} label="Nomor peserta"><input class="input" value=${f.username} onInput=${(e) => setF((x) => ({ ...x, username: e.target.value }))} placeholder="Contoh: 010045001" autocomplete="username" required /><//>
      <${Field} label="Password"><input class="input" type="password" value=${f.password} onInput=${(e) => setF((x) => ({ ...x, password: e.target.value }))} autocomplete="current-password" required /><//>
      <button class="btn btn-p btn-lg" disabled=${busy}>${busy ? 'Memeriksa…' : 'Lihat nilai'}</button>
    </form>`}
  </div>`;
}

/** Halaman masuk. Peserta: gambar sambutan. Sekolah & guru: ringkasan capaian hasil ujian sekolah. */
export function Login({ route }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [lihat, setLihat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const siswa = route.query.peran === 'siswa' || (route.query.next || '').startsWith('/ujian');
  const info = session.info;
  const gantiPeran = (p) => { location.hash = `#/masuk?peran=${p}${route.query.next ? `&next=${encodeURIComponent(route.query.next)}` : ''}`; };
  const masuk = async (e, paksa = false) => {
    e?.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const d = await post('login', { ...f, paksa });
      setSession(d);
      const next = route.query.next;
      location.hash = next && next !== '/' ? `#${next}` : berandaPeran(d.user.peran);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return html`<div class="login-split">
    ${siswa ? html`<aside class="login-visual" style=${`background-image:url('${urlLogin()}')`}>
      <a href="#/" class="row" style="text-decoration:none;color:#fff"><${Logo} size=${44} />
        <span class="col" style="gap:0"><strong style="font-size:17px">${info?.nama_aplikasi || 'TKA SD 2026'}</strong><span class="small" style="opacity:.85">${info?.nama_instansi || ''}</span></span></a>
      <div class="col sembunyi-hp" style="gap:14px;max-width:460px">
        <h2>Kerjakan dengan tenang. Jawabanmu tersimpan otomatis.</h2>
        <ul class="small" style="margin:0;padding-left:18px;line-height:1.8;color:rgba(255,255,255,.88)">
          <li>Gunakan nomor peserta dan password dari kartu ujian.</li><li>Minta token ke pengawas di ruang ujian.</li><li>Jangan keluar dari layar penuh selama ujian.</li></ul>
      </div>
    </aside>` : html`<aside class="login-visual data"><${PanelCapaian} info=${info} /></aside>`}
    <div class="login-panel">
      <div class="col" style="width:min(420px,100%);gap:14px">
        <div class="seg" role="tablist" aria-label="Jenis akun" style="align-self:stretch;display:grid;grid-template-columns:1fr 1fr">
          <button role="tab" class=${siswa ? 'on' : ''} aria-selected=${siswa} onClick=${() => gantiPeran('siswa')} style="justify-content:center">Peserta ujian</button>
          <button role="tab" class=${!siswa ? 'on' : ''} aria-selected=${!siswa} onClick=${() => gantiPeran('sekolah')} style="justify-content:center">Sekolah, guru & pusat</button>
        </div>
        <form class="card" style="padding:24px;display:flex;flex-direction:column;gap:16px" onSubmit=${masuk}>
          <div class="col" style="gap:4px">
            <h1 style="font-size:22px">${siswa ? 'Masuk peserta' : 'Masuk ke dashboard'}</h1>
            <p class="small muted">${siswa ? 'Nomor peserta dan password tertera di kartu ujian.' : 'Untuk admin sekolah, guru, dan panitia pusat.'}</p></div>
          <label class="field"><span>${siswa ? 'Nomor peserta' : 'Username'}</span>
            <input class="input" value=${f.username} onInput=${(e) => setF((x) => ({ ...x, username: e.target.value }))} autocomplete="username" autocapitalize="off" required /></label>
          <label class="field"><span>Password</span>
            <span class="input-icon" style="padding-right:4px"><input type=${lihat ? 'text' : 'password'} aria-label="Password" value=${f.password} onInput=${(e) => setF((x) => ({ ...x, password: e.target.value }))} autocomplete="current-password" required />
            <button type="button" class="icon-btn sm" aria-label=${lihat ? 'Sembunyikan password' : 'Tampilkan password'} onClick=${() => setLihat(!lihat)}><${Icon} n=${lihat ? 'eye-off' : 'eye'} s=${18} /></button></span></label>
          ${err && html`<div class="row small" role="alert" style="padding:10px 12px;border-radius:8px;background:var(--red-50);color:var(--red-700);border:1px solid #EDC3BF"><${Icon} n="alert" s=${18} /><span class="grow">${err}</span></div>`}
          <button class="btn btn-p btn-lg" disabled=${busy}>${busy ? 'Memeriksa…' : 'Masuk'}</button>
          <span class="row wrap" style="justify-content:space-between;gap:8px"><a href="#/" class="small" style="font-weight:600;text-decoration:none">← Beranda</a><${GantiLayar} kecil /></span>
        </form>
        <p class="small" style="color:var(--text-2);line-height:1.55;padding:0 4px">${siswa
          ? 'Lupa password atau akun terkunci? Hubungi proktor atau admin sekolah. Satu akun siswa hanya bisa aktif di satu perangkat.'
          : html`Sekolah belum terdaftar? <a href="#/ajukan" style="font-weight:600">Ajukan akun sekolah</a> · <a href="#/ajukan/status" style="font-weight:600">cek status pengajuan</a>`}</p>
      </div>
    </div>
    <${HelpdeskFab} />
  </div>`;
}

/** Ringkasan capaian hasil ujian seluruh sekolah untuk sisi kiri halaman masuk sekolah. */
function PanelCapaian({ info }) {
  const [c, setC] = useState(null);
  const [st, setSt] = useState(null);
  useEffect(() => {
    get('public/capaian').then(setC).catch(() => setC({ tampil: false }));
    get('public/statistik').then(setSt).catch(() => {});
  }, []);
  const r = c?.ringkasan;
  return html`<div class="capaian-panel">
    <a href="#/" class="row" style="text-decoration:none;color:#fff"><${Logo} size=${44} />
      <span class="col" style="gap:0"><strong style="font-size:17px">${info?.nama_aplikasi || 'TKA SD 2026'}</strong><span class="small" style="opacity:.8">${info?.nama_instansi || ''}</span></span></a>
    <div class="col" style="gap:8px">
      <span class="eyebrow" style="color:#9DBDEB">Capaian sekolah peserta CBT</span>
      <h2>${r?.peserta ? `Rata-rata nilai ${fmt.angka(r.rata)} dari ${fmt.bulat(r.peserta)} hasil ujian` : 'Sistem CBT untuk sekolah dasar di seluruh Indonesia'}</h2>
      <p class="muted-inv small" style="line-height:1.6">${r?.peserta
        ? `${fmt.persen(r.persen_capai)} hasil mencapai target ${c.target}. Data dari ${fmt.bulat(r.sekolah)} sekolah, diperbarui ${fmt.waktu(c.diperbarui)}.`
        : `${fmt.bulat(st?.sekolah || 0)} sekolah dari ${fmt.bulat(st?.provinsi || 0)} provinsi sudah terdaftar. Hasil ujian akan tampil di sini setelah ujian pertama dinilai.`}</p>
    </div>
    ${r?.peserta ? html`
      <div class="sembunyi-hp" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        <div class="kartu-gelap col" style="gap:10px"><strong style="font-size:13px">Rata-rata per mata pelajaran</strong>
          ${c.per_mapel.map((m) => html`<div class="col" style="gap:4px"><span class="row small" style="justify-content:space-between"><span>${m.nama}</span><strong class="num">${fmt.angka(m.rata)}</strong></span>
            <span class="meter"><span style=${`width:${Math.max(2, m.rata || 0)}%`}></span></span></div>`)}</div>
        <div class="kartu-gelap col" style="gap:10px"><strong style="font-size:13px">Per kategori ujian</strong>
          ${c.per_kategori.slice(0, 6).map((k) => html`<div class="row small" style="justify-content:space-between"><span>${k.nama}</span><span class="num"><strong>${fmt.angka(k.rata)}</strong> <span class="muted-inv">· ${fmt.bulat(k.n)}</span></span></div>`)}</div>
      </div>
      ${c.sekolah.length > 0 && html`<div class="kartu-gelap sembunyi-hp"><strong style="font-size:13px">Sekolah dengan rata-rata tertinggi</strong>
        <table><tbody>${c.sekolah.map((s, i) => html`<tr><td class="num muted-inv" style="width:28px">${i + 1}</td><td><strong>${s.nama}</strong><br /><span class="tiny muted-inv">${s.kabkota || ''}${s.provinsi ? `, ${s.provinsi}` : ''}</span></td>
          <td class="num" style="text-align:right"><strong>${fmt.angka(s.rata)}</strong><br /><span class="tiny muted-inv">${fmt.persen(s.persen_capai)} capai target</span></td></tr>`)}</tbody></table></div>`}`
    : html`<div class="kartu-gelap sembunyi-hp" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${[[st?.sekolah, 'sekolah'], [st?.siswa, 'siswa'], [st?.soal, 'soal siap']].map(([v, l]) => html`<div class="col" style="gap:0"><strong class="num" style="font-size:24px">${fmt.bulat(v || 0)}</strong><span class="tiny muted-inv">${l}</span></div>`)}</div>`}
    <ul class="small sembunyi-hp muted-inv" style="margin:0;padding-left:18px;line-height:1.8">
      <li>Monitor ujian langsung, koreksi uraian, dan analisis butir soal.</li>
      <li>Cetak kartu peserta, berita acara, legger, dan sertifikat ber-QR dengan logo & tanda tangan sekolah.</li>
    </ul>
  </div>`;
}

/** Wilayah peserta: peta 38 provinsi (jumlah sekolah) + tabel provinsi + daftar sekolah per daerah. */
function WilayahPeserta({ stat }) {
  const dasar = useDataPeta();
  const [d, setD] = useState(null);
  const [fokus, setFokus] = useState('');
  const [cari, setCari] = useState('');
  useEffect(() => { get('public/sebaran').then(setD).catch(() => setD({ sekolah: [], ringkasan: { sekolah: 0, provinsi: 0, kabkota: 0, siswa: 0 } })); }, []);
  const sekolah = d?.sekolah || [];
  const per = Object.fromEntries((stat?.per_provinsi || []).map((p) => [p.kode, p]));
  const maks = Math.max(1, ...Object.values(per).map((p) => p.sekolah));
  const q = cari.trim().toLowerCase();
  const tersaring = sekolah.filter((x) => (!fokus || x.provinsi_kode === fokus) && (!q || [x.nama, x.npsn, x.kabkota, x.kecamatan, x.kelurahan, x.provinsi].some((v) => String(v || '').toLowerCase().includes(q))));
  const titik = dasar.data && fokus ? tersaring.map((x) => { const p = posisiSekolah(x, dasar.data.titik, dasar.data.pusatProv); return p && { id: x.npsn, x: p[0], y: p[1], r: 4, warna: x.demo ? '#8B7FD6' : '#E5544B', judul: `${x.nama}${x.kabkota ? ` · ${x.kabkota}` : ''}` }; }).filter(Boolean) : [];
  const grup = [];
  for (const x of tersaring) {
    let p = grup.find((g) => g.kode === (x.provinsi_kode || '-'));
    if (!p) grup.push(p = { kode: x.provinsi_kode || '-', nama: x.provinsi || 'Provinsi belum diisi', kab: [] });
    let k = p.kab.find((g) => g.kode === (x.kabkota_kode || '-'));
    if (!k) p.kab.push(k = { kode: x.kabkota_kode || '-', nama: x.kabkota || 'Kab/Kota belum diisi', sekolah: [] });
    k.sekolah.push(x);
  }
  const namaFokus = fokus && dasar.data?.provinsi.find((p) => p.kode === fokus)?.nama;
  const daftarProv = (stat?.per_provinsi || []).slice().sort((a, b) => b.sekolah - a.sekolah);
  return html`<section id="wilayah" class="band"><div class="container section col" style="gap:24px">
    <div class="row wrap" style="justify-content:space-between;align-items:flex-end;gap:16px">
      <div class="col" style="gap:8px;max-width:640px"><span class="eyebrow">Wilayah peserta</span>
        <h2 class="h-xl">Daerah yang mengikuti CBT</h2>
        <p style="color:var(--text-2)">Peta 38 provinsi Indonesia. Warna lebih gelap berarti lebih banyak sekolah peserta. Klik provinsi untuk melihat kab/kota dan sekolahnya.</p></div>
      <div class="peta-legenda" aria-label="Legenda jumlah sekolah"><span><i style="background:#EEF2F6"></i>belum ada</span>${SKALA.slice(1).map((w, i) => html`<span><i style=${`background:${w}`}></i>${i === 0 ? 'sedikit' : i === SKALA.length - 2 ? 'terbanyak' : ''}</span>`)}</div>
    </div>
    <div class="sebaran-grid">
      <div class="card col" style="padding:16px;gap:12px;min-width:0">
        <div class="row wrap" style="justify-content:space-between;gap:8px">
          <strong>${namaFokus || 'Seluruh Indonesia · 38 provinsi'}</strong>
          ${fokus && html`<button class="btn btn-o btn-sm" onClick=${() => setFokus('')}><${Icon} n="chev-l" s=${14} />Seluruh Indonesia</button>`}
        </div>
        ${dasar.error ? html`<${ErrorBox} error=${dasar.error} />` : html`<${PetaIndonesia} dasar=${dasar.data} fokus=${fokus} titik=${titik} label="Peta sebaran sekolah peserta"
          warnaProv=${(k) => warnaJumlah(per[k]?.sekolah || 0, maks)} warnaKab=${(k) => (sekolah.some((x) => x.kabkota_kode === k) ? '#82A9E6' : '#DCE8FA')}
          judulProv=${(p) => `${p.nama}${p.ibukota ? ` (${p.ibukota})` : ''}: ${per[p.kode]?.sekolah || 0} sekolah`} onPilihProv=${(k) => setFokus(fokus === k ? '' : k)} />`}
      </div>
      <div class="card col" style="padding:0;gap:0;min-width:0;overflow:hidden">
        <div style="padding:14px 16px;border-bottom:1px solid var(--line)" class="col gap-8">
          <strong>${fokus ? 'Daftar sekolah' : 'Provinsi peserta'}</strong>
          <label class="input-icon soft"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari sekolah atau daerah" value=${cari} onInput=${(e) => setCari(e.target.value)} aria-label="Cari sekolah atau daerah" /></label>
        </div>
        ${!fokus && !q ? html`<div class="table-wrap" style="max-height:460px;overflow:auto"><table class="tbl prov-tbl">
          <thead><tr><th class="no">No</th><th>Provinsi</th><th class="r">Kab/kota</th><th class="r">Sekolah</th><th class="r">Siswa</th></tr></thead>
          <tbody>${!stat ? html`<tr><td colspan="5"><${Loading} /></td></tr>` : daftarProv.length === 0 ? html`<tr><td colspan="5" class="small muted">Belum ada sekolah terdaftar.</td></tr>`
            : daftarProv.map((p, i) => html`<tr style="cursor:pointer" onClick=${() => setFokus(p.kode)}><td class="no">${i + 1}</td><td class="strong">${p.nama}</td>
              <td class="r num">${p.kabkota}</td><td class="r num">${fmt.bulat(p.sekolah)}</td><td class="r num">${fmt.bulat(p.siswa)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="daftar-daerah">
          ${!d ? html`<${Loading} />` : grup.length === 0 ? html`<p class="small muted" style="padding:16px">Tidak ada sekolah yang cocok.</p>` : grup.map((p) => html`<details open=${!!fokus || !!q || grup.length === 1}>
            <summary><span class="grow">${p.nama}</span><span class="small muted num">${p.kab.reduce((a, k) => a + k.sekolah.length, 0)} sekolah</span></summary>
            ${p.kab.map((k) => html`<div class="daerah-kab"><div class="row tiny" style="justify-content:space-between;font-weight:600;color:var(--text-2)"><span>${k.nama}</span><span>${k.sekolah.length}</span></div>
              <ul>${k.sekolah.map((x) => html`<li><span class="dot" style=${`background:${x.demo ? '#8B7FD6' : '#E5544B'}`}></span><span class="grow">${x.nama}${x.kecamatan ? html`<span class="muted"> · Kec. ${x.kecamatan}</span>` : ''}</span></li>`)}</ul></div>`)}
          </details>`)}
        </div>`}
      </div>
    </div>
  </div></section>`;
}

export function Verifikasi({ route }) {
  const kode = route.path.split('/')[2] || '';
  const [st, setSt] = useState({ loading: true });
  useEffect(() => { get(`public/verifikasi/${encodeURIComponent(kode)}`).then((d) => setSt({ d })).catch((e) => setSt({ e })); }, [kode]);
  return html`<div class="login-page"><div class="card pad col" style="width:min(520px,100%);gap:16px">
    <div class="row"><${Logo} /><strong class="grow">Verifikasi Sertifikat</strong></div>
    ${st.loading ? html`<${Loading} />` : st.e ? html`<${ErrorBox} error=${st.e} />` : html`
      <div class="row" style="padding:12px 14px;border-radius:8px;background:var(--green-50);border:1px solid var(--green-100);color:var(--green-700)"><${Icon} n="check-circle" /><strong>Sertifikat asli dan terdaftar.</strong></div>
      ${[['Nama', st.d.nama], ['No. Peserta', st.d.username], ['Sekolah', `${st.d.sekolah} (${st.d.npsn})`], ['Ujian', `${st.d.mapel_nama} · ${st.d.kategori_nama}`],
        ['Nilai', `${fmt.angka(st.d.nilai)} · ${st.d.predikat}`], ['Tanggal', fmt.tanggal(st.d.selesai_at)]].map(([a, b]) =>
        html`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span class="muted small">${a}</span><strong class="small" style="text-align:right">${b}</strong></div>`)}`}
    <a class="btn btn-o" href="#/">Ke beranda</a>
  </div></div>`;
}
