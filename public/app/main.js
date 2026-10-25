import { html, render, useState, useEffect } from './lib.js';
import { useRoute, go } from './router.js';
import { session, onSession, get, setSession, loadInfo, berandaPeran } from './api.js';
import { Host, Loading, ErrorBox } from './ui.js';
import { urlLatar } from './tampilan.js';

// modul halaman dimuat saat dibutuhkan
const MODUL = {
  publik: () => import('./pages/publik.js'),
  ajukan: () => import('./pages/ajukan.js'),
  siswa: () => import('./pages/siswa.js'),
  admin: () => import('./pages/admin.js'),
  guru: () => import('./pages/guru.js'),
  supervisor: () => import('./pages/supervisor.js'),
  pusat: () => import('./pages/pusat.js'),
  akun: () => import('./pages/akun.js'),
  cetak: () => import('./pages/cetak.js'),
};
const cache = {};

function Lazy({ mod, name, ...props }) {
  // modul selalu dibaca dari cache sesuai `mod` saat ini (komponen ini dipakai ulang saat berpindah halaman)
  const [, setMuat] = useState(0);
  const [err, setErr] = useState(null);
  const m = cache[mod];
  useEffect(() => {
    setErr(null);
    if (!cache[mod]) MODUL[mod]().then((x) => { cache[mod] = x; setMuat((n) => n + 1); }).catch(setErr);
  }, [mod]);
  if (err) return html`<div style="padding:24px"><${ErrorBox} error=${err} retry=${() => location.reload()} /></div>`;
  if (!m) return html`<${Loading} />`;
  const C = m[name];
  return html`<${C} ...${props} />`;
}

const AREA = { pusat: 'superadmin', supervisor: 'supervisor', admin: 'admin', guru: 'guru', ujian: 'siswa' };

function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => onSession(() => tick((x) => x + 1)), []);
  useEffect(() => {
    (async () => {
      loadInfo().then(() => tick((x) => x + 1)).catch(() => {});
      if (session.token) {
        try { setSession({ ...(await get('me', null, { silent401: true })), token: session.token }); } catch { setSession({ token: null }); }
      }
      setReady(true);
    })();
  }, []);
  if (!ready) return html`<${Loading} text="Memuat aplikasi…" />`;

  const p = route.path;
  const seg = p.split('/')[1] || '';
  const u = session.user;

  if (p === '/' || seg === 'cek-nilai') return html`<${Lazy} mod="publik" name="Landing" route=${route} />`;
  if (seg === 'verifikasi') return html`<${Lazy} mod="publik" name="Verifikasi" route=${route} />`;
  if (seg === 'ajukan') return html`<${Lazy} mod="ajukan" name="Ajukan" route=${route} />`;
  if (seg === 'masuk') {
    if (u) { go(berandaPeran(u.peran).slice(1)); return null; }
    return html`<${Lazy} mod="publik" name="Login" route=${route} />`;
  }
  if (!u) { go('/masuk', { next: p }); return null; }
  if (seg === 'cetak') return html`<${Lazy} mod="cetak" name="Cetak" route=${route} />`;
  if (seg === 'akun') return html`<${Lazy} mod="akun" name="Akun" route=${route} />`;
  const need = AREA[seg];
  if (!need || need !== u.peran) { go(berandaPeran(u.peran).slice(1)); return null; }
  const mod = { superadmin: 'pusat', supervisor: 'supervisor', admin: 'admin', guru: 'guru', siswa: 'siswa' }[u.peran];
  return html`<${Lazy} mod=${mod} name="App" route=${route} />`;
}

/** Latar belakang bergaya gelombang; diredupkan di halaman kerja agar tulisan tetap mudah dibaca. */
function Latar() {
  const route = useRoute();
  const seg = route.path.split('/')[1] || '';
  if (seg === 'cetak' || seg === 'masuk' || route.path.startsWith('/ujian/sesi')) return null;
  const url = urlLatar();
  const publik = ['', 'masuk', 'cek-nilai', 'verifikasi', 'ajukan'].includes(seg);
  return html`<div class=${`latar ${publik ? 'publik' : 'kerja'}`} aria-hidden="true" style=${url ? `background-image:url('${url}')` : ''}></div>`;
}

function Root() {
  const [, tick] = useState(0);
  useEffect(() => onSession(() => tick((x) => x + 1)), []);
  useEffect(() => { loadInfo().then(() => tick((x) => x + 1)).catch(() => {}); }, []);
  return html`<${Latar} /><${App} /><${Host} />`;
}

document.getElementById('app').innerHTML = '';
render(html`<${Root} />`, document.getElementById('app'));
