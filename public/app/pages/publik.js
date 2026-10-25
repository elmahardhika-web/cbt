import { html, useState, useEffect, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { session, post, get, setSession, berandaPeran, api, loadInfo } from '../api.js';
import { Field, toastErr, Loading, ErrorBox } from '../ui.js';
import { Logo, GantiLayar } from '../layout.js';
import { urlLogin } from '../tampilan.js';
import { PetaIndonesia, useDataPeta, posisiSekolah } from '../peta.js';

const PERAN_KARTU = [
  ['Siswa', 'user', 't-sky', 'Kerjakan ujian dengan token, pantau sisa waktu, dan jawaban tersimpan otomatis.', '#/masuk?peran=siswa'],
  ['Guru', 'book', 't-orange', 'Susun bank soal tujuh tipe, koreksi jawaban uraian, dan pantau kelas.', '#/masuk?peran=guru'],
  ['Admin Sekolah', 'school', 't-violet', 'Kelola data siswa, jadwal dan token ujian, monitor langsung, serta laporan nilai.', '#/masuk?peran=admin'],
  ['Supervisor', 'shield', 't-green', 'Telaah soal dari guru penulis sebelum soal dipakai dalam ujian.', '#/masuk?peran=supervisor'],
];

export function Landing() {
  const [info, setInfo] = useState(session.info);
  useEffect(() => { loadInfo().then(setInfo).catch(() => {}); }, []);
  useEffect(() => { if (location.hash.startsWith('#/cek-nilai')) setTimeout(() => document.getElementById('nilai')?.scrollIntoView(), 50); }, []);
  const nama = info?.nama_aplikasi || 'TKA SD 2026';
  return html`<div>
    <header class="container pub-nav">
      <a href="#/" class="row" style="text-decoration:none"><${Logo} size=${44} /><span class="col" style="gap:0"><strong style="font-size:17px;color:var(--ink)">${nama}</strong><span class="tiny muted">${info?.nama_instansi || ''}</span></span></a>
      <nav aria-label="Navigasi utama">
        <a href="#peran" onClick=${(e) => { e.preventDefault(); document.getElementById('peran').scrollIntoView({ behavior: 'smooth' }); }}>Peran</a>
        <a href="#sebaran" onClick=${(e) => { e.preventDefault(); document.getElementById('sebaran').scrollIntoView({ behavior: 'smooth' }); }}>Sebaran Sekolah</a>
        <a href="#dokumen" onClick=${(e) => { e.preventDefault(); document.getElementById('dokumen').scrollIntoView({ behavior: 'smooth' }); }}>Dokumen</a>
        <a href="#nilai" onClick=${(e) => { e.preventDefault(); document.getElementById('nilai').scrollIntoView({ behavior: 'smooth' }); }}>Cek Nilai</a>
      </nav>
      <span class="row gap-8"><a class="btn btn-o" href="#/ajukan"><${Icon} n="school" s=${18} />Ajukan Akun Sekolah</a>
        <a class="btn btn-p" href="#/masuk">Masuk <${Icon} n="arrow-r" s=${18} /></a></span>
    </header>

    <section class="container" style="padding-top:32px;padding-bottom:80px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr));gap:48px;align-items:center">
      <div class="col" style="gap:24px">
        <span class="chip outline" style="align-self:flex-start;color:var(--sky-700);border-color:var(--sky-200);padding:6px 12px"><${Icon} n="shield" s=${14} />Platform simulasi terstandar</span>
        <h1 class="display">Tes Kemampuan <span style="color:var(--sky-700)">Akademik</span> SD 2026</h1>
        <p style="max-width:520px;font-size:18px;line-height:1.6;color:var(--text-2)">Ukur capaian akademik secara objektif, transparan, dan akuntabel. Kerjakan ujian dari laptop, tablet, maupun HP dengan aman.</p>
        <div class="row wrap">
          <a class="btn btn-p btn-lg" href="#/masuk?peran=siswa">Mulai Ujian <${Icon} n="arrow-r" s=${18} /></a>
          <a class="btn btn-o btn-lg" href="#nilai" onClick=${(e) => { e.preventDefault(); document.getElementById('nilai').scrollIntoView({ behavior: 'smooth' }); }}><${Icon} n="award" s=${18} />Cek Nilai</a>
        </div>
        <div class="row wrap" style="gap:12px;padding-top:8px">
          ${[['layers', 't-sky', '7 tipe soal', 'PG hingga uraian'], ['check-circle', 't-green', 'Simpan otomatis', 'jawaban tidak hilang'], ['monitor', 't-orange', 'Monitor langsung', 'untuk proktor']].map(([ic, t, a, b]) =>
            html`<div class="row" style="gap:10px;padding:8px 16px 8px 8px;border-radius:18px;background:rgba(255,255,255,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(16,40,74,.06)"><span class=${`tile ${t}`} style="width:40px;height:40px"><${Icon} n=${ic} /></span><span class="small" style="line-height:1.35;color:var(--text-2)"><strong style="color:var(--ink)">${a}</strong><br />${b}</span></div>`)}
        </div>
      </div>
      <div style="position:relative;min-height:480px;border-radius:36px;background:var(--sky-200);overflow:hidden" aria-hidden="true">
        <span style="position:absolute;width:340px;height:340px;border-radius:50%;background:var(--sky-300);right:-90px;top:-110px"></span>
        <span style="position:absolute;width:240px;height:240px;border-radius:50%;background:rgba(169,155,242,.4);left:-70px;bottom:-80px"></span>
        <div class="card" style="position:absolute;left:8%;right:8%;top:80px;border:0;padding:24px;display:flex;flex-direction:column;gap:18px">
          <div class="row"><span class="tile t-sky" style="width:52px;height:52px">BI</span><span class="col" style="gap:2px"><span class="tiny" style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Lanjutkan ujian</span><strong style="font-size:18px">Bahasa Indonesia · Try Out 1</strong></span></div>
          <div class="col gap-8"><div class="row small" style="justify-content:space-between;color:var(--text-2)"><span>18 dari 30 soal dijawab</span><strong style="color:var(--sky-700)">60%</strong></div><div class="bar" style="height:10px"><span style="width:60%"></span></div></div>
          <div class="row wrap gap-8"><span class="chip"><${Icon} n="clock" s=${14} />60 menit</span><span class="chip"><${Icon} n="calendar" s=${14} />Sesi 1</span><span class="chip amber"><${Icon} n="flag" s=${14} />2 ragu-ragu</span></div>
          <span class="btn btn-p">Lanjutkan Mengerjakan <${Icon} n="arrow-r" s=${18} /></span>
        </div>
        <div class="card row" style="position:absolute;left:6%;bottom:40px;border:0;padding:14px 16px"><span class="tile t-orange" style="width:40px;height:40px"><${Icon} n="clock" /></span><span class="col" style="gap:0"><span class="tiny muted">Sisa waktu</span><strong class="num" style="font-size:20px">24:18</strong></span></div>
        <div class="card row" style="position:absolute;right:6%;bottom:56px;border:0;padding:12px 16px;gap:10px"><span class="tile t-green round" style="width:32px;height:32px"><${Icon} n="check" s=${18} /></span><strong class="small">Jawaban tersimpan</strong></div>
      </div>
    </section>

    <section id="peran" class="band"><div class="container section col" style="gap:40px">
      <div class="col" style="align-items:center;text-align:center;gap:12px"><span class="chip sky">Akses terpadu</span><h2 class="h-xl">Pilih Peran Anda</h2>
        <p style="max-width:560px;color:var(--text-2)">Setiap pemangku kepentingan punya portal sendiri, dengan menu yang hanya berisi pekerjaannya.</p></div>
      <div class="grid-auto" style="--min:250px;gap:20px">
        ${PERAN_KARTU.map(([t, ic, tone, d, href]) => html`<article class="card pad col" style="gap:14px">
          <span class=${`tile lg ${tone}`}><${Icon} n=${ic} s=${26} /></span><h3 style="font-size:19px;font-weight:800">${t}</h3>
          <p class="small" style="line-height:1.6;color:var(--text-2)">${d}</p>
          <a href=${href} class="row gap-8" style="margin-top:auto;min-height:44px;font-weight:700;text-decoration:none">Masuk Portal <${Icon} n="arrow-r" s=${16} /></a></article>`)}
      </div></div></section>

    <${SebaranSekolah} />

    <section class="container" style="padding-bottom:56px"><div class="card row wrap" style="padding:28px;gap:20px;border-radius:28px;align-items:center">
      <span class="tile lg t-violet"><${Icon} n="school" s=${26} /></span>
      <div class="col grow" style="gap:6px;min-width:min(320px,100%)"><h2 style="font-size:22px">Sekolah Anda belum terdaftar?</h2>
        <p class="small" style="color:var(--text-2);max-width:620px;line-height:1.6">Ajukan akun admin sekolah. Setelah disetujui panitia pusat, sekolah Anda langsung bisa menambahkan guru dan siswa lalu menjadwalkan ujian.</p></div>
      <div class="row wrap gap-8"><a class="btn btn-p btn-lg" href="#/ajukan"><${Icon} n="send" s=${18} />Ajukan akun sekolah</a>
        <a class="btn btn-o btn-lg" href="#/ajukan/status"><${Icon} n="search" s=${18} />Cek status</a></div>
    </div></section>

    <section id="dokumen" class="band"><div class="container section col" style="gap:32px">
      <div class="row wrap" style="justify-content:space-between;align-items:flex-end;gap:16px">
        <div class="col" style="gap:10px"><span class="chip sky" style="align-self:flex-start">Pusat informasi</span><h2 class="h-xl">Dokumen Pendukung</h2>
          <p style="max-width:520px;color:var(--text-2)">Unduh panduan dan petunjuk teknis terbaru untuk kelancaran pelaksanaan ujian.</p></div>
        <div class="row wrap gap-8">${(info?.helpdesk || []).map((h) => html`<a class="btn btn-o" href=${/^\+?\d[\d\s-]+$/.test(h.kontak) ? `https://wa.me/${h.kontak.replace(/\D/g, '').replace(/^0/, '62')}` : h.kontak} target="_blank" rel="noopener"><${Icon} n="headset" s=${18} />${h.nama}</a>`)}</div>
      </div>
      ${(info?.dokumen || []).length ? html`<div class="grid-auto" style="--min:320px;gap:20px">
        ${info.dokumen.map((d) => html`<article class="card row" style="padding:20px;gap:16px"><span class="tile t-red" style="width:56px;height:64px"><${Icon} n="file-pdf" s=${26} /></span>
          <div class="col grow" style="gap:4px"><h3 style="font-size:16px">${d.nama}</h3><span class="small muted">${d.keterangan || 'Dokumen'}</span></div>
          <a href=${d.url} target="_blank" rel="noopener" class="icon-btn" style="background:var(--sky-100);border:0;color:var(--sky-700)" aria-label=${`Unduh ${d.nama}`}><${Icon} n="download" /></a></article>`)}
      </div>` : html`<div class="card pad small muted">Dokumen panduan akan ditampilkan di sini setelah diunggah oleh panitia pusat.</div>`}
    </div></section>

    <section id="nilai" class="container section"><${CekNilai} /></section>

    <footer class="band"><div class="container row wrap" style="justify-content:space-between;padding-top:28px;padding-bottom:28px">
      <div class="row"><${Logo} size=${36} /><span class="small" style="color:var(--text-2)"><strong style="color:var(--ink)">${nama}</strong> · ${info?.nama_instansi || ''}</span></div>
      <span class="row gap-8"><${GantiLayar} kecil /><span class="small muted">© 2026 · Tes Kemampuan Akademik</span></span></div></footer>
  </div>`;
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
  return html`<div style="border-radius:32px;background:var(--sky-100);padding:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));gap:32px;align-items:center">
    <div class="col">
      <span class="tile lg" style="background:#fff;color:var(--sky-700)"><${Icon} n="award" s=${28} /></span>
      <h2 class="h-xl" style="font-size:32px">Sudah selesai ujian?</h2>
      <p style="max-width:440px;color:var(--text-2)">Masuk dengan nomor peserta untuk melihat nilai per mata pelajaran. Nilai uraian muncul setelah guru selesai mengoreksi.</p>
    </div>
    ${hasil ? html`<div class="card pad col">
      <div class="row"><strong class="grow">${hasil.nama}</strong><span class="chip sky">${hasil.kelas}</span></div>
      ${hasil.nilai.length === 0 ? html`<p class="muted small">Belum ada ujian yang selesai.</p>` : hasil.nilai.map((n) => html`
        <div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><span class="col grow" style="gap:0"><strong class="small">${n.mapel_nama}</strong><span class="tiny muted">${n.kategori_nama} · ${fmt.tglPendek(n.selesai_at)}</span></span>
        ${n.nilai == null ? html`<span class="chip amber">Menunggu koreksi</span>` : html`<strong style="font-size:22px;color:var(--sky-700)">${fmt.angka(n.nilai)}</strong>`}</div>`)}
      <button class="btn btn-o" onClick=${() => { setHasil(null); setF({ username: '', password: '' }); }}>Tutup</button>
    </div>` : html`<form class="card pad col" style="border:0" onSubmit=${lihat}>
      <${Field} label="Nomor Peserta"><input class="input" value=${f.username} onInput=${(e) => setF((x) => ({ ...x, username: e.target.value }))} placeholder="Contoh: 010045001" autocomplete="username" required /><//>
      <${Field} label="Password"><input class="input" type="password" value=${f.password} onInput=${(e) => setF((x) => ({ ...x, password: e.target.value }))} placeholder="Password ujian" autocomplete="current-password" required /><//>
      <button class="btn btn-p btn-lg" disabled=${busy}>${busy ? 'Memeriksa…' : 'Lihat Nilai'} <${Icon} n="arrow-r" s=${18} /></button>
    </form>`}
  </div>`;
}

export function Login({ route }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [lihat, setLihat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const siswa = route.query.peran === 'siswa' || (route.query.next || '').startsWith('/ujian');
  const info = session.info;
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
    <aside class="login-visual" style=${`background-image:url('${urlLogin()}')`}>
      <a href="#/" class="row" style="text-decoration:none;color:#fff"><${Logo} size=${48} />
        <span class="col" style="gap:0"><strong style="font-size:18px">${info?.nama_aplikasi || 'TKA SD 2026'}</strong><span class="small" style="opacity:.85">${info?.nama_instansi || ''}</span></span></a>
      <div class="col sembunyi-hp" style="gap:16px;max-width:460px">
        <span class="chip" style="align-self:flex-start"><${Icon} n="shield" s=${14} />Tes Kemampuan Akademik</span>
        <h2>Ukur capaian belajar dengan tenang, adil, dan terukur.</h2>
        <div class="row wrap gap-8"><span class="chip"><${Icon} n="check-circle" s=${14} />Simpan otomatis</span><span class="chip"><${Icon} n="wifi" s=${14} />Tetap jalan saat offline</span><span class="chip"><${Icon} n="monitor" s=${14} />Pemantauan langsung</span></div>
      </div>
    </aside>
    <div class="login-panel">
      <div class="col" style="width:min(440px,100%);gap:16px">
        <form class="card" style="padding:28px;display:flex;flex-direction:column;gap:16px;border:0;box-shadow:0 30px 80px rgba(16,40,74,.18)" onSubmit=${masuk}>
          <div class="col" style="gap:6px"><span class="chip green" style="align-self:flex-start"><${Icon} n="wifi" s=${14} />Mode Online</span>
            <h1 style="font-size:26px">${siswa ? 'Login Peserta' : 'Masuk'}</h1>
            <p class="small muted">${siswa ? 'Masukkan nomor peserta dan password yang tertera di kartu ujian.' : 'Satu pintu masuk untuk siswa, guru, admin sekolah, supervisor, dan superadmin.'}</p></div>
          <label class="field"><span>${siswa ? 'Nomor Peserta' : 'Username / Nomor Peserta'}</span>
            <span class="input-icon"><${Icon} n="idcard" /><input value=${f.username} aria-label="Username" onInput=${(e) => setF((x) => ({ ...x, username: e.target.value }))} autocomplete="username" autocapitalize="off" required /></span></label>
          <label class="field"><span>Password</span>
            <span class="input-icon" style="padding-right:4px"><${Icon} n="lock" /><input type=${lihat ? 'text' : 'password'} aria-label="Password" value=${f.password} onInput=${(e) => setF((x) => ({ ...x, password: e.target.value }))} autocomplete="current-password" required />
            <button type="button" class="icon-btn sm" aria-label=${lihat ? 'Sembunyikan password' : 'Tampilkan password'} onClick=${() => setLihat(!lihat)}><${Icon} n=${lihat ? 'eye-off' : 'eye'} /></button></span></label>
          ${err && html`<div class="row small" style="padding:10px 12px;border-radius:12px;background:var(--red-50);color:var(--red-700)"><${Icon} n="alert" s=${18} /><span class="grow">${err}</span></div>`}
          <button class="btn btn-p btn-lg" disabled=${busy}>${busy ? 'Memeriksa…' : 'Masuk'} <${Icon} n="arrow-r" s=${18} /></button>
          <span class="row wrap" style="justify-content:center;gap:8px"><a href="#/" class="row gap-8 small" style="min-height:40px;font-weight:700;text-decoration:none"><${Icon} n="chev-l" s=${16} />Kembali ke beranda</a><${GantiLayar} kecil /></span>
        </form>
        <div class="card row small" style="padding:14px 16px;align-items:flex-start;box-shadow:none;background:rgba(255,255,255,.85)">
          <span class="tile t-amber sm"><${Icon} n="info" s=${18} /></span>
          <span style="line-height:1.5;color:var(--text-2)">Lupa password atau akun terkunci? Hubungi proktor atau admin sekolah. Satu akun siswa hanya bisa aktif di satu perangkat.</span>
        </div>
        ${!siswa && html`<div class="card row small" style="padding:14px 16px;align-items:flex-start;box-shadow:none;background:rgba(255,255,255,.85)">
          <span class="tile t-violet sm"><${Icon} n="school" s=${18} /></span>
          <span style="line-height:1.5;color:var(--text-2)">Sekolah belum terdaftar? <a href="#/ajukan" style="font-weight:700">Ajukan akun sekolah</a> · <a href="#/ajukan/status" style="font-weight:700">cek status pengajuan</a></span>
        </div>`}
      </div>
    </div>
  </div>`;
}

/** Peta sebaran sekolah pengguna + daftar daerah berisi sekolah. */
function SebaranSekolah() {
  const dasar = useDataPeta();
  const [d, setD] = useState(null);
  const [fokus, setFokus] = useState('');
  const [cari, setCari] = useState('');
  useEffect(() => { get('public/sebaran').then(setD).catch(() => setD({ sekolah: [], ringkasan: { sekolah: 0, provinsi: 0, kabkota: 0, siswa: 0 } })); }, []);
  const sekolah = d?.sekolah || [];
  const q = cari.trim().toLowerCase();
  const tersaring = sekolah.filter((x) => (!fokus || x.provinsi_kode === fokus) && (!q || [x.nama, x.npsn, x.kabkota, x.kecamatan, x.kelurahan, x.provinsi].some((v) => String(v || '').toLowerCase().includes(q))));
  const titik = dasar.data ? tersaring.map((x) => { const p = posisiSekolah(x, dasar.data.titik, dasar.data.pusatProv); return p && { id: x.npsn, x: p[0], y: p[1], r: 5, warna: x.demo ? '#A99BF2' : '#FF786F', judul: `${x.nama}${x.kabkota ? ` · ${x.kabkota}` : ''}` }; }).filter(Boolean) : [];
  const jmlProv = Object.fromEntries([...new Set(sekolah.map((x) => x.provinsi_kode))].map((k) => [k, sekolah.filter((x) => x.provinsi_kode === k).length]));
  // daftar daerah: provinsi → kab/kota → sekolah
  const grup = [];
  for (const x of tersaring) {
    let p = grup.find((g) => g.kode === (x.provinsi_kode || '-'));
    if (!p) grup.push(p = { kode: x.provinsi_kode || '-', nama: x.provinsi || 'Provinsi belum diisi', kab: [] });
    let k = p.kab.find((g) => g.kode === (x.kabkota_kode || '-'));
    if (!k) p.kab.push(k = { kode: x.kabkota_kode || '-', nama: x.kabkota || 'Kab/Kota belum diisi', sekolah: [] });
    k.sekolah.push(x);
  }
  const r = d?.ringkasan;
  const namaFokus = fokus && dasar.data?.provinsi.find((p) => p.kode === fokus)?.nama;
  return html`<section id="sebaran" class="container section col" style="gap:28px">
    <div class="row wrap" style="justify-content:space-between;align-items:flex-end;gap:16px">
      <div class="col" style="gap:10px"><span class="chip sky" style="align-self:flex-start"><${Icon} n="map" s=${14} />Sebaran pengguna</span>
        <h2 class="h-xl">Sekolah yang Menggunakan ${session.info?.nama_aplikasi || 'Aplikasi Ini'}</h2>
        <p style="max-width:560px;color:var(--text-2)">Setiap titik menunjukkan satu sekolah. Klik provinsi pada peta untuk memperbesar dan melihat daftar sekolahnya.</p></div>
      ${r && html`<div class="row wrap gap-8">${[[r.sekolah, 'sekolah'], [r.kabkota, 'kab/kota'], [r.provinsi, 'provinsi'], [r.siswa, 'siswa']].map(([v, l]) =>
        html`<span class="card col" style="padding:10px 16px;gap:0;box-shadow:none;align-items:center"><strong style="font-size:22px">${fmt.bulat(v)}</strong><span class="tiny muted">${l}</span></span>`)}</div>`}
    </div>
    <div class="sebaran-grid">
      <div class="card col" style="padding:18px;gap:12px;min-width:0">
        <div class="row wrap" style="justify-content:space-between;gap:8px">
          <strong>${namaFokus || 'Seluruh Indonesia'}</strong>
          <span class="row wrap tiny" style="gap:12px;color:var(--text-2)">
            <span class="row gap-4"><span style="width:10px;height:10px;border-radius:50%;background:#FF786F"></span>Sekolah</span>
            ${sekolah.some((x) => x.demo) && html`<span class="row gap-4"><span style="width:10px;height:10px;border-radius:50%;background:#A99BF2"></span>Sekolah contoh (demo)</span>`}
            ${fokus && html`<button class="btn btn-s btn-sm" onClick=${() => setFokus('')}><${Icon} n="chev-l" s=${14} />Seluruh Indonesia</button>`}</span>
        </div>
        ${dasar.error ? html`<${ErrorBox} error=${dasar.error} />` : html`<${PetaIndonesia} dasar=${dasar.data} fokus=${fokus} titik=${titik} label="Peta sebaran sekolah pengguna"
          warnaProv=${(k) => (jmlProv[k] ? '#9CC8F8' : '#DDE7F5')} warnaKab=${(k) => (sekolah.some((x) => x.kabkota_kode === k) ? '#9CC8F8' : '#CFEAFF')}
          judulProv=${(p) => `${p.nama}: ${jmlProv[p.kode] || 0} sekolah`} onPilihProv=${(k) => setFokus(fokus === k ? '' : k)} />`}
      </div>
      <div class="card col" style="padding:0;gap:0;min-width:0;overflow:hidden">
        <div style="padding:16px 18px;border-bottom:1px solid var(--line)" class="col gap-8">
          <strong>Daftar Daerah</strong>
          <label class="input-icon soft" style="min-height:42px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari sekolah atau daerah" value=${cari} onInput=${(e) => setCari(e.target.value)} aria-label="Cari sekolah atau daerah" /></label>
        </div>
        <div class="daftar-daerah">
          ${!d ? html`<${Loading} />` : grup.length === 0 ? html`<p class="small muted" style="padding:18px">Tidak ada sekolah yang cocok.</p>` : grup.map((p) => html`<details open=${!!fokus || !!q || grup.length === 1}>
            <summary><span class="grow">${p.nama}</span><span class="chip sky">${p.kab.reduce((a, k) => a + k.sekolah.length, 0)} sekolah</span></summary>
            ${p.kab.map((k) => html`<div class="daerah-kab"><div class="row tiny" style="justify-content:space-between;font-weight:700;color:var(--text-2)"><span>${k.nama}</span><span>${k.sekolah.length}</span></div>
              <ul>${k.sekolah.map((x) => html`<li><span class="dot" style=${`background:${x.demo ? '#A99BF2' : '#FF786F'}`}></span><span class="grow">${x.nama}${x.kecamatan ? html`<span class="muted"> · Kec. ${x.kecamatan}</span>` : ''}</span></li>`)}</ul></div>`)}
          </details>`)}
        </div>
      </div>
    </div>
  </section>`;
}

export function Verifikasi({ route }) {
  const kode = route.path.split('/')[2] || '';
  const [st, setSt] = useState({ loading: true });
  useEffect(() => { get(`public/verifikasi/${encodeURIComponent(kode)}`).then((d) => setSt({ d })).catch((e) => setSt({ e })); }, [kode]);
  return html`<div class="login-page"><div class="card pad col" style="width:min(520px,100%);gap:16px">
    <div class="row"><${Logo} /><strong class="grow">Verifikasi Sertifikat</strong></div>
    ${st.loading ? html`<${Loading} />` : st.e ? html`<${ErrorBox} error=${st.e} />` : html`
      <div class="row" style="padding:14px;border-radius:16px;background:var(--green-50)"><span class="tile t-green round"><${Icon} n="check" /></span><strong>Sertifikat asli dan terdaftar.</strong></div>
      ${[['Nama', st.d.nama], ['No. Peserta', st.d.username], ['Sekolah', `${st.d.sekolah} (${st.d.npsn})`], ['Ujian', `${st.d.mapel_nama} · ${st.d.kategori_nama}`],
        ['Nilai', `${fmt.angka(st.d.nilai)} · ${st.d.predikat}`], ['Tanggal', fmt.tanggal(st.d.selesai_at)]].map(([a, b]) =>
        html`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span class="muted small">${a}</span><strong class="small" style="text-align:right">${b}</strong></div>`)}`}
    <a class="btn btn-o" href="#/">Ke beranda</a>
  </div></div>`;
}
