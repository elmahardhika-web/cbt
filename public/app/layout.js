import { html, useState, useEffect, cls, PERAN_LABEL } from './lib.js';
import { Icon } from './icons.js';
import { session, post, get, setSession, clearSession, berandaPeran } from './api.js';
import { Modal, Field, Avatar, toast, toastErr, useDebounced, Loading, Empty } from './ui.js';
import { urlLogo } from './tampilan.js';
import { HelpdeskFab } from './helpdesk.js';

export function navFor(u) {
  if (!u) return [];
  const p = u.peran;
  if (p === 'admin') return [
    ['Utama', [['#/admin', 'home', 'Dashboard'], ['#/admin/siswa', 'users', 'Data Siswa'], ['#/admin/guru', 'user', 'Data Guru']]],
    ['Ujian', [['#/admin/ujian', 'monitor', 'Ujian & Monitor'], ['#/admin/koreksi', 'check-circle', 'Koreksi Jawaban'], ['#/admin/soal', 'book', 'Bank Soal']]],
    ['Laporan', [['#/admin/profil360', 'award', 'Profil 360 Sekolah'], ['#/admin/hasil', 'chart', 'Hasil & Legger'], ['#/admin/analisis', 'pie', 'Analisis']]],
    ['Pengaturan', [['#/admin/sekolah', 'school', 'Profil Sekolah'], ['#/admin/backup', 'database', 'Backup & Restore'], ['#/akun', 'key', 'Akun Saya']]],
  ];
  if (p === 'guru') return [
    ['Soal', [['#/guru', 'home', 'Beranda'], ['#/guru/soal', 'book', 'Bank Soal'], ['#/guru/soal/baru', 'plus', 'Input Soal']]],
    ...(u.npsn ? [['Penilaian', [
      ['#/guru/koreksi', 'check-circle', 'Koreksi Jawaban'],
      ...(u.bisa_monitor ? [['#/guru/monitor', 'monitor', 'Monitor Ujian']] : []),
      ['#/guru/analisis', 'pie', 'Analisis Kelas'],
    ]]] : []),
    ['Lainnya', [['#/guru/feedback', 'message', 'Feedback Soal'], ['#/guru/backup', 'database', 'Backup & Impor'], ['#/akun', 'key', 'Akun Saya']]],
  ];
  if (p === 'superadmin') return [
    ['Utama', [['#/pusat', 'home', 'Dashboard'], ['#/pusat/sekolah', 'school', 'Sekolah'], ['#/pusat/pengajuan', 'send', 'Pengajuan Akun'], ['#/pusat/pengguna', 'users', 'Pengguna']]],
    ['Ujian', [['#/pusat/ujian', 'calendar', 'Ujian Massal']]],
    ['Soal & Telaah', [['#/pusat/soal', 'book', 'Bank Soal'], ['#/pusat/telaah', 'shield', 'Antrean Telaah'], ['#/pusat/telaah-ringkasan', 'clipboard', 'Ringkasan Telaah'],
      ['#/pusat/feedback', 'message', 'Feedback Siswa'], ['#/pusat/master', 'layers', 'Mapel & Kategori']]],
    ['Laporan', [['#/pusat/dasbor', 'map', 'Dasbor Wilayah'], ['#/pusat/analisis', 'pie', 'Analisis Rinci']]],
    ['Sistem', [['#/pusat/pengaturan', 'settings', 'Pengaturan'], ['#/pusat/backup', 'database', 'Backup & Restore'], ['#/akun', 'key', 'Akun Saya']]],
  ];
  return [];
}

function Logo({ size = 40, src }) {
  const url = src === undefined ? urlLogo() : src;
  if (url) return html`<span class="logo" style=${`width:${size}px;height:${size}px;background:#fff;border:1px solid var(--line)`}><img src=${url} alt="Logo" onError=${gagalLogo} /></span>`;
  return html`<span class="logo" style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.33)}px`}>TKA</span>`;
}
// gambar logo hilang/rusak → kembali ke logo teks bawaan
function gagalLogo(e) {
  const box = e.currentTarget.parentElement;
  if (!box) return;
  box.textContent = 'TKA';
  box.style.background = 'var(--navy)';
  box.style.color = '#fff';
  box.style.border = '0';
}
export { Logo };

export async function keluar() {
  try { await post('logout'); } catch { /* abaikan */ }
  clearSession();
  location.hash = '#/masuk';
}

export async function selesaiSamaran() {
  try {
    const d = await post('samaran/selesai');
    setSession(d);
    location.hash = '#/pusat';
    toast('Kembali sebagai superadmin.');
  } catch (e) { toastErr(e); }
}

/** HP saja: pindah antara tampilan HP (menyesuaikan layar) dan tampilan desktop penuh. */
export const layarDesktop = () => { try { return localStorage.getItem('tka2026.layar') === 'desktop'; } catch { return false; } };
export function GantiLayar({ kecil }) {
  const desktop = layarDesktop();
  const ganti = () => { try { localStorage.setItem('tka2026.layar', desktop ? 'hp' : 'desktop'); } catch { /* abaikan */ } location.reload(); };
  return html`<button type="button" class=${cls('btn ganti-layar', kecil ? 'btn-s btn-sm' : 'btn-o')} onClick=${ganti}
    title=${desktop ? 'Kembali ke tampilan yang menyesuaikan layar HP' : 'Tampilkan versi desktop lengkap di HP ini'}>
    <${Icon} n=${desktop ? 'idcard' : 'monitor'} s=${kecil ? 16 : 18} />${kecil ? (desktop ? 'Versi HP' : 'Desktop') : desktop ? 'Tampilan HP' : 'Tampilan desktop'}</button>`;
}

export function Shell({ route, children, badges = {} }) {
  const u = session.user;
  const [open, setOpen] = useState(false);
  const [pindah, setPindah] = useState(false);
  useEffect(() => setOpen(false), [route.path]);
  const nav = navFor(u);
  const active = (href) => {
    const p = href.slice(1);
    if (p === route.path) return true;
    const all = nav.flatMap(([, items]) => items.map((i) => i[0].slice(1)));
    const best = all.filter((x) => route.path.startsWith(x + '/')).sort((a, b) => b.length - a.length)[0];
    return best === p && !all.includes(route.path);
  };
  const bisaPindah = (session.impersonator || u?.peran === 'superadmin');
  const sub = u?.peran === 'siswa' ? `${u.kelas} · ${u.sesi}` : session.sekolah?.nama || session.info?.nama_instansi || '';
  return html`
    <div class="shell">
      <div class="mobile-bar">
        <button class="icon-btn" aria-label="Buka menu" onClick=${() => setOpen(true)}><${Icon} n="menu" /></button>
        <${Logo} size=${32} /><strong class="grow ellipsis">${PERAN_LABEL[u?.peran]}</strong>
        ${bisaPindah && html`<button class="icon-btn" aria-label="Pindah peran" title="Pindah peran" onClick=${() => setPindah(true)}><${Icon} n="swap" s=${18} /></button>`}
        <${GantiLayar} kecil />
      </div>
      ${open && html`<div class="scrim" onClick=${() => setOpen(false)}></div>`}
      <aside class=${cls('side', open && 'open')}>
        <a class="brand" href=${berandaPeran(u?.peran)}><${Logo} />
          <span class="col" style="gap:0;min-width:0"><strong class="ellipsis" style="font-size:14.5px;color:var(--ink)">${session.info?.nama_aplikasi || 'TKA SD 2026'}</strong>
          <span class="tiny muted ellipsis">${PERAN_LABEL[u?.peran]}${sub ? ` · ${sub}` : ''}</span></span></a>
        <nav class="nav" aria-label="Menu utama">
          ${nav.map(([g, items]) => html`<div class="nav-group"><span>${g}</span>
            ${items.map(([href, ic, label]) => html`<a href=${href} class=${active(href) ? 'on' : ''} aria-current=${active(href) ? 'page' : undefined}>
              <span class="tile"><${Icon} n=${ic} s=${18} /></span>${label}${badges[href] ? html`<span class="chip orange">${badges[href]}</span>` : ''}</a>`)}
          </div>`)}
        </nav>
        <div class="side-foot">
          ${bisaPindah && html`<button class="btn btn-o btn-sm" style="justify-content:flex-start" onClick=${() => setPindah(true)}><${Icon} n="swap" s=${16} />Pindah peran</button>`}
          <${GantiLayar} />
          <div class="side-user">
            <${Avatar} nama=${u?.nama} tone="slate" size=${32} />
            <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${u?.nama}</strong><span class="tiny muted ellipsis">${u?.username}</span></span>
            <button class="icon-btn sm" title=${session.impersonator ? 'Kembali ke superadmin' : 'Keluar'} aria-label=${session.impersonator ? 'Kembali ke superadmin' : 'Keluar'}
              onClick=${session.impersonator ? selesaiSamaran : keluar}><${Icon} n="logout" s=${18} /></button>
          </div>
        </div>
      </aside>
      <main class="main">
        ${session.impersonator && html`<${BannerSamaran} />`}
        ${children}
      </main>
    </div>
    ${u?.peran !== 'superadmin' && html`<${HelpdeskFab} />`}
    ${pindah && html`<${PindahPeran} onClose=${() => setPindah(false)} />`}
  `;
}

export function BannerSamaran() {
  const u = session.user;
  return html`<div class="samaran no-print" role="status">
    <${Icon} n="eye" s=${20} />
    <span class="grow">Mode pratinjau: Anda masuk sebagai <strong>${u.nama}</strong> (${PERAN_LABEL[u.peran]}). Semua aksi tercatat atas nama akun ini.</span>
    <button class="btn btn-o btn-sm" onClick=${selesaiSamaran}><${Icon} n="swap" s=${16} />Kembali ke superadmin</button>
  </div>`;
}

const PILIHAN_PERAN = [
  ['admin', 'school', 'Admin Sekolah', 't-violet'],
  ['guru', 'book', 'Guru', 't-orange'],
  ['siswa', 'user', 'Siswa', 't-sky'],
];

/** Superadmin berpindah ke peran lain tanpa keluar-masuk. */
export function PindahPeran({ onClose }) {
  const [peran, setPeran] = useState('admin');
  const [npsn, setNpsn] = useState('');
  const [q, setQ] = useState('');
  const [sekolah, setSekolah] = useState([]);
  const [list, setList] = useState(null);
  const dq = useDebounced(q, 250);
  useEffect(() => { get('sekolah').then(setSekolah).catch(() => {}); }, []);
  useEffect(() => {
    setList(null);
    get('samaran/kandidat', { peran, npsn, q: dq }).then(setList).catch((e) => { toastErr(e); setList([]); });
  }, [peran, npsn, dq]);
  const masuk = async (id) => {
    try {
      const d = await post('samaran', { user_id: id });
      setSession(d);
      onClose();
      location.hash = berandaPeran(d.user.peran);
      toast(`Sekarang sebagai ${d.user.nama}`);
    } catch (e) { toastErr(e); }
  };
  return html`<${Modal} title="Pindah peran" sub="Masuk sebagai pengguna lain tanpa logout. Kembali kapan saja lewat tombol di atas." onClose=${onClose} size="wide">
    ${session.impersonator && html`<button class="btn btn-o" onClick=${() => { onClose(); selesaiSamaran(); }}><${Icon} n="shield" s=${18} />Kembali sebagai superadmin</button>`}
    <div class="seg" role="tablist" aria-label="Peran">
      ${PILIHAN_PERAN.map(([k, ic, label]) => html`<button role="tab" class=${peran === k ? 'on' : ''} aria-selected=${peran === k} onClick=${() => setPeran(k)}><${Icon} n=${ic} s=${16} />${label}</button>`)}
    </div>
    <div class="form-grid">
      ${html`<${Field} label="Sekolah"><select class="select" value=${npsn} onChange=${(e) => setNpsn(e.target.value)}>
        <option value="">Semua sekolah</option>${sekolah.map((s) => html`<option value=${s.npsn}>${s.nama} (${s.npsn})</option>`)}</select><//>`}
      <${Field} label="Cari nama / username"><input class="input" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder="Ketik untuk mencari" /><//>
    </div>
    <div class="card" style="max-height:340px;overflow:auto">
      ${list === null ? html`<${Loading} />` : list.length === 0 ? html`<${Empty} icon="search" title="Tidak ada akun yang cocok" />` : list.map((x) => html`
        <div class="row" style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <${Avatar} nama=${x.nama} size=${36} />
          <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${x.nama}</strong>
            <span class="tiny muted ellipsis">${x.username}${x.kelas ? ` · ${x.kelas}` : ''}${x.sekolah ? ` · ${x.sekolah}` : ''}</span></span>
          <button class="btn btn-p btn-sm" onClick=${() => masuk(x.id)}>Masuk <${Icon} n="arrow-r" s=${16} /></button>
        </div>`)}
    </div>
  <//>`;
}
