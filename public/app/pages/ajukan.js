// Halaman publik: ajukan akun sekolah (admin sekolah) dan cek status pengajuan memakai kode.
import { html, useState, useEffect, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { session, post, get, loadInfo } from '../api.js';
import { Field, toast } from '../ui.js';
import { Logo } from '../layout.js';
import { WilayahFields } from '../wilayah.js';

const SIMPAN = 'tka2026.kodePengajuan';
const ambilKode = () => { try { return localStorage.getItem(SIMPAN) || ''; } catch { return ''; } };
const STATUS = {
  menunggu: ['Menunggu persetujuan', 'amber', 'clock'],
  disetujui: ['Disetujui — akun aktif', 'green', 'check-circle'],
  ditolak: ['Ditolak', 'red', 'alert'],
};
const KOSONG = { npsn: '', nama: '', provinsi_kode: '', provinsi: '', kabkota_kode: '', kabkota: '', kecamatan: '', kelurahan: '', alamat: '',
  pemohon_nama: '', pemohon_jabatan: '', pemohon_email: '', pemohon_hp: '', admin_username: '', admin_password: '', ulangi: '', catatan: '', situs: '' };

export function Ajukan({ route }) {
  const [info, setInfo] = useState(session.info);
  useEffect(() => { loadInfo().then(setInfo).catch(() => {}); }, []);
  const tab = route.path === '/ajukan/status' ? 'status' : 'ajukan';
  return html`<div class="ajukan-hal">
    <header class="container pub-nav">
      <a href="#/" class="row" style="text-decoration:none"><${Logo} size=${44} /><span class="col" style="gap:0"><strong style="font-size:17px;color:var(--ink)">${info?.nama_aplikasi || 'TKA SD 2026'}</strong><span class="tiny muted">${info?.nama_instansi || ''}</span></span></a>
      <a class="btn btn-o" style="margin-left:auto" href="#/masuk">Masuk <${Icon} n="arrow-r" s=${18} /></a>
    </header>
    <main class="container col" style="gap:20px;max-width:880px;padding-bottom:64px">
      <div class="col" style="gap:8px"><span class="chip sky" style="align-self:flex-start"><${Icon} n="school" s=${14} />Pengajuan akun</span>
        <h1 class="h-xl">${tab === 'status' ? 'Cek Status Pengajuan' : 'Ajukan Akun Sekolah'}</h1>
        <p style="color:var(--text-2);max-width:640px">${tab === 'status' ? 'Masukkan kode pengajuan yang Anda terima setelah mengirim formulir.'
          : 'Daftarkan sekolah Anda untuk memakai aplikasi ini. Setelah panitia pusat menyetujui, admin sekolah langsung bisa masuk, mengisi data siswa dan guru, lalu menjadwalkan ujian.'}</p></div>
      <div class="seg soft" role="tablist" style="align-self:flex-start">
        <a role="tab" aria-selected=${tab === 'ajukan'} class=${tab === 'ajukan' ? 'on' : ''} href="#/ajukan"><${Icon} n="send" s=${16} />Ajukan akun</a>
        <a role="tab" aria-selected=${tab === 'status'} class=${tab === 'status' ? 'on' : ''} href="#/ajukan/status"><${Icon} n="search" s=${16} />Cek status</a>
      </div>
      ${tab === 'status' ? html`<${CekStatus} />` : html`<${Formulir} />`}
    </main>
  </div>`;
}

function Formulir() {
  const [f, setF] = useState(KOSONG);
  const [lihat, setLihat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [kode, setKode] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const kirim = async (e) => {
    e.preventDefault();
    setErr('');
    if (f.npsn.length !== 8) return setErr('NPSN harus 8 digit angka.');
    if (!f.kabkota_kode) return setErr('Pilih provinsi dan kabupaten/kota sekolah.');
    if (f.admin_password.length < 8) return setErr('Password admin minimal 8 karakter.');
    if (f.admin_password !== f.ulangi) return setErr('Kedua password tidak sama.');
    setBusy(true);
    try {
      const { ulangi, ...isi } = f;
      const r = await post('public/pengajuan', isi);
      try { localStorage.setItem(SIMPAN, r.kode); } catch { /* abaikan */ }
      setKode(r.kode);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  if (kode) return html`<section class="card pad col" style="gap:16px;align-items:center;text-align:center;padding:36px 24px">
    <span class="tile lg t-green round"><${Icon} n="check" s=${28} /></span>
    <h2 style="font-size:22px">Pengajuan terkirim</h2>
    <p style="color:var(--text-2);max-width:520px">Simpan kode di bawah untuk mengecek status. Setelah disetujui, masuk memakai username <strong>${f.admin_username}</strong> dan password yang Anda buat.</p>
    <div class="row" style="gap:8px;padding:12px 18px;border-radius:16px;background:var(--sky-50);border:1.5px dashed var(--sky-300)">
      <strong class="num" style="font-size:24px;letter-spacing:.06em">${kode}</strong>
      <button class="icon-btn sm" aria-label="Salin kode" onClick=${() => navigator.clipboard?.writeText(kode).then(() => toast('Kode disalin.'))}><${Icon} n="copy" s=${18} /></button>
    </div>
    <div class="row wrap" style="justify-content:center"><a class="btn btn-p" href="#/ajukan/status">Cek status</a><a class="btn btn-o" href="#/">Ke beranda</a></div>
  </section>`;

  const bagian = (no, judul, ket, isi) => html`<section class="card pad col" style="gap:14px">
    <div class="row" style="gap:10px"><span class="tile sm t-sky round" style="font-weight:800">${no}</span><div class="col" style="gap:0"><h2 style="font-size:18px">${judul}</h2>${ket && html`<span class="small muted">${ket}</span>`}</div></div>${isi}</section>`;
  return html`<form class="col" style="gap:16px" onSubmit=${kirim} novalidate>
    ${bagian(1, 'Data sekolah', null, html`
      <div class="form-grid">
        <${Field} label="NPSN" hint="8 digit"><input class="input" required inputmode="numeric" maxlength="8" value=${f.npsn} onInput=${(e) => set({ npsn: e.target.value.replace(/\D/g, '') })} /><//>
        <${Field} label="Nama sekolah"><input class="input" required maxlength="150" value=${f.nama} placeholder="mis. SD Negeri Contoh 01" autocomplete="organization" onInput=${(e) => set({ nama: e.target.value })} /><//>
      </div>
      <${WilayahFields} value=${f} onChange=${(w) => set(w)} />
      <${Field} label="Alamat sekolah" hint="opsional"><input class="input" maxlength="300" value=${f.alamat} autocomplete="street-address" onInput=${(e) => set({ alamat: e.target.value })} /><//>`)}
    ${bagian(2, 'Pemohon', 'Panitia pusat akan menghubungi Anda bila ada data yang perlu dipastikan.', html`
      <div class="form-grid">
        <${Field} label="Nama lengkap"><input class="input" required maxlength="120" value=${f.pemohon_nama} autocomplete="name" onInput=${(e) => set({ pemohon_nama: e.target.value })} /><//>
        <${Field} label="Jabatan" hint="opsional"><input class="input" maxlength="80" value=${f.pemohon_jabatan} placeholder="mis. Operator sekolah" onInput=${(e) => set({ pemohon_jabatan: e.target.value })} /><//>
        <${Field} label="Email"><input class="input" type="email" required maxlength="120" value=${f.pemohon_email} autocomplete="email" onInput=${(e) => set({ pemohon_email: e.target.value })} /><//>
        <${Field} label="No. HP / WhatsApp"><input class="input" type="tel" required maxlength="20" value=${f.pemohon_hp} placeholder="08…" autocomplete="tel" onInput=${(e) => set({ pemohon_hp: e.target.value })} /><//>
      </div>`)}
    ${bagian(3, 'Akun admin sekolah', 'Dipakai untuk masuk pertama kali, melengkapi profil sekolah, dan membuat akun guru serta siswa.', html`
      <div class="form-grid">
        <${Field} label="Username" hint="4–40 huruf/angka, tanpa spasi"><input class="input" required maxlength="40" value=${f.admin_username} autocomplete="username" autocapitalize="off" spellcheck="false" onInput=${(e) => set({ admin_username: e.target.value.trim() })} /><//>
        <${Field} label="Password" hint="minimal 8 karakter"><span class="input-icon" style="padding-right:4px"><${Icon} n="lock" /><input type=${lihat ? 'text' : 'password'} required value=${f.admin_password} autocomplete="new-password" aria-label="Password" onInput=${(e) => set({ admin_password: e.target.value })} />
          <button type="button" class="icon-btn sm" aria-label=${lihat ? 'Sembunyikan password' : 'Tampilkan password'} onClick=${() => setLihat(!lihat)}><${Icon} n=${lihat ? 'eye-off' : 'eye'} /></button></span><//>
        <${Field} label="Ulangi password"><input class="input" type=${lihat ? 'text' : 'password'} required value=${f.ulangi} autocomplete="new-password" onInput=${(e) => set({ ulangi: e.target.value })} /><//>
      </div>
      <${Field} label="Catatan untuk panitia" hint="opsional"><textarea class="input" rows="2" maxlength="600" value=${f.catatan} onInput=${(e) => set({ catatan: e.target.value })}></textarea><//>
      <input type="text" name="situs" value=${f.situs} onInput=${(e) => set({ situs: e.target.value })} tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />`)}
    ${err && html`<div class="row small" role="alert" style="padding:12px 14px;border-radius:12px;background:var(--red-50);color:var(--red-700)"><${Icon} n="alert" s=${18} /><span class="grow">${err}</span></div>`}
    <div class="row wrap" style="justify-content:flex-end;gap:10px">
      <a class="btn btn-o" href="#/">Batal</a>
      <button class="btn btn-p btn-lg" disabled=${busy}><${Icon} n="send" s=${18} />${busy ? 'Mengirim…' : 'Kirim pengajuan'}</button>
    </div>
  </form>`;
}

function CekStatus() {
  const [kode, setKode] = useState(ambilKode());
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const cek = async (e) => {
    e?.preventDefault();
    const k = kode.trim().toUpperCase();
    if (!k) return;
    setBusy(true);
    try { setSt({ d: await get(`public/pengajuan/${encodeURIComponent(k)}`) }); } catch (x) { setSt({ e: x.message }); } finally { setBusy(false); }
  };
  useEffect(() => { if (kode) cek(); }, []);
  const d = st?.d;
  const [label, warna, ikon] = d ? STATUS[d.status] || [d.status, '', 'info'] : [];
  return html`<section class="card pad col" style="gap:16px;max-width:560px">
    <form class="row wrap" style="gap:10px;align-items:flex-end" onSubmit=${cek}>
      <${Field} label="Kode pengajuan"><input class="input" style="text-transform:uppercase;min-width:240px" value=${kode} placeholder="TKA-XXXX-XXXX" spellcheck="false" onInput=${(e) => setKode(e.target.value)} /><//>
      <button class="btn btn-p" style="margin-bottom:4px" disabled=${busy}><${Icon} n="search" s=${18} />${busy ? 'Memeriksa…' : 'Cek status'}</button>
    </form>
    ${st?.e && html`<div class="row small" role="alert" style="padding:12px 14px;border-radius:12px;background:var(--red-50);color:var(--red-700)"><${Icon} n="alert" s=${18} /><span class="grow">${st.e}</span></div>`}
    ${d && html`<div class="col" style="gap:10px;padding:16px;border-radius:16px;border:1px solid var(--line)" aria-live="polite">
      <span class=${`chip ${warna}`} style="align-self:flex-start"><${Icon} n=${ikon} s=${14} />${label}</span>
      <strong style="font-size:17px">${d.nama}</strong>
      <span class="small muted">NPSN ${d.npsn}${d.kabkota ? ` · ${d.kabkota}` : ''} · diajukan ${fmt.tanggal(d.dibuat_at)}</span>
      ${d.status === 'menunggu' && html`<span class="small">Pengajuan sedang ditinjau panitia pusat. Cek kembali halaman ini secara berkala.</span>`}
      ${d.status === 'ditolak' && html`<span class="small"><strong>Alasan:</strong> ${d.alasan}</span><a class="btn btn-o btn-sm" style="align-self:flex-start" href="#/ajukan">Ajukan ulang</a>`}
      ${d.status === 'disetujui' && html`<span class="small">Silakan masuk memakai username <strong>${d.admin_username}</strong> dan password yang Anda buat saat mengajukan.</span>
        <a class="btn btn-p btn-sm" style="align-self:flex-start" href="#/masuk?peran=admin">Masuk sekarang <${Icon} n="arrow-r" s=${16} /></a>`}
    </div>`}
  </section>`;
}
