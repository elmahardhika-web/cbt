import { html, useState, useEffect, useRef, useMemo, useCallback, fmt, cls, singkat, inisial, sleep } from '../lib.js';

// sebagian browser tidak pernah menyelesaikan permintaan layar penuh; jangan sampai ujian tertahan
const layarPenuh = () => (document.fullscreenEnabled && !document.fullscreenElement && !session.impersonator
  ? Promise.race([document.documentElement.requestFullscreen().catch(() => {}), sleep(1500)]) : Promise.resolve());
import { Icon } from '../icons.js';
import { session, get, post, put, setSession, clearSession } from '../api.js';
import { match, go } from '../router.js';
import { Loading, ErrorBox, Empty, toast, toastErr, confirmDialog, promptDialog, Modal, Field, useAsync } from '../ui.js';
import { Rich, pisahSoal } from '../rich.js';
import { SoalView } from './soalview.js';
import { GrafikTren, Tren, WARNA_SERI, WARNA_GABUNGAN } from './rekap.js';
import { keluar, BannerSamaran, selesaiSamaran } from '../layout.js';

const TONE = ['t-sky', 't-orange', 't-green', 't-violet', 't-pink', 't-amber'];
const toneMapel = (kode) => TONE[[...String(kode)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONE.length];

export function App({ route }) {
  const p = route.path;
  let m;
  if ((m = match("/ujian/sesi/:pid", p))) return html`<${Mengerjakan} key=${m.pid} pid=${+m.pid} />`;
  if ((m = match('/ujian/selesai/:pid', p))) return html`<${Selesai} pid=${+m.pid} />`;
  if ((m = match('/ujian/:id/mulai', p))) return html`<${Konfirmasi} id=${+m.id} />`;
  if (p === '/ujian/nilai') return html`<${Frame} tab="nilai"><${Nilai} /><//>`;
  if (p === '/ujian/akun') return html`<${Frame} tab="akun"><${AkunSiswa} /><//>`;
  return html`<${Frame} tab="ujian"><${Beranda} /><//>`;
}

function Frame({ tab, children }) {
  return html`<div style="max-width:560px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column">
    ${session.impersonator && html`<div style="padding:12px 12px 0"><${BannerSamaran} /></div>`}
    <div style="flex:1;padding:24px 20px 0;display:flex;flex-direction:column;gap:20px">${children}</div>
    <nav aria-label="Menu siswa" style="position:sticky;bottom:0;margin:12px 16px 16px;padding:8px;border-radius:24px;background:#fff;border:1px solid var(--line);box-shadow:0 10px 30px rgba(16,40,74,.08);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px">
      ${[['ujian', '#/ujian', 'home', 'Ujian'], ['nilai', '#/ujian/nilai', 'award', 'Nilai'], ['akun', '#/ujian/akun', 'user', 'Akun']].map(([k, href, ic, l]) =>
        html`<a href=${href} aria-current=${tab === k ? 'page' : undefined} style=${`display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;border-radius:16px;font-size:12px;font-weight:${tab === k ? 700 : 600};text-decoration:none;${tab === k ? 'background:var(--sky-100);color:var(--sky-700)' : 'color:var(--muted)'}`}>
          <${Icon} n=${ic} s=${22} />${l}</a>`)}
    </nav>
  </div>`;
}

function statusUjian(u) {
  if (u.status_peserta === 'selesai') return ['selesai', html`<span class="chip green"><${Icon} n="check" s=${12} />Selesai</span>`];
  if (u.status_peserta === 'absen') return ['absen', html`<span class="chip">Tidak hadir</span>`];
  if (u.status_peserta === 'mengerjakan') return ['lanjut', html`<span class="chip amber">Sedang dikerjakan</span>`];
  if (u.aktif) return ['buka', html`<span class="chip sky">Tersedia</span>`];
  return ['tutup', html`<span class="chip"><${Icon} n="lock" s=${12} />Belum dibuka</span>`];
}

function Beranda() {
  const u = session.user;
  const { data, error, loading, reload } = useAsync(() => get('siswa/ujian'), []);
  useEffect(() => { const t = setInterval(() => reload(true), 30e3); return () => clearInterval(t); }, [reload]);
  const utama = (data || []).find((x) => x.status_peserta === 'mengerjakan') || (data || []).find((x) => x.aktif && !x.status_peserta);
  const buka = (x) => (x.status_peserta === 'mengerjakan' ? `#/ujian/sesi/${x.peserta_id}` : `#/ujian/${x.id}/mulai`);
  return html`
    <div class="row">
      <span class="tile round" style="width:48px;height:48px;background:var(--sky-200);color:var(--navy)">${inisial(u.nama)}</span>
      <div class="col grow" style="gap:2px"><strong style="font-size:20px">Halo, ${u.nama.split(' ')[0]}!</strong><span class="small muted">No. ${u.username} · Kelas ${u.kelas || '-'}</span></div>
    </div>
    ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : html`
      ${utama ? html`<div class="hero col" style="gap:14px;padding:22px">
        <span class="deco" style="width:180px;height:180px;background:rgba(255,255,255,.22);right:-50px;top:-60px"></span>
        <span class="deco" style="width:90px;height:90px;background:rgba(169,155,242,.45);right:24px;bottom:-30px"></span>
        <span class="chip white" style="align-self:flex-start"><${Icon} n="calendar" s=${14} />${utama.sesi === 'SEMUA' ? 'Semua sesi' : utama.sesi} · Hari ini</span>
        <div class="col" style="gap:4px"><span class="small" style="font-weight:600">${utama.status_peserta === 'mengerjakan' ? 'Lanjutkan ujianmu' : 'Ujian siap dikerjakan'}</span>
          <strong style="font-size:22px;line-height:1.2">${utama.mapel_nama}<br />${utama.kategori_nama}</strong></div>
        <div class="row small" style="font-weight:600;gap:16px"><span class="row gap-4"><${Icon} n="clipboard" s=${16} />${utama.jumlah_soal} soal</span><span class="row gap-4"><${Icon} n="clock" s=${16} />${utama.durasi} menit</span></div>
        <a href=${buka(utama)} class="btn" style="align-self:flex-start;background:#fff;color:var(--sky-700)">${utama.status_peserta === 'mengerjakan' ? 'Lanjutkan' : 'Kerjakan Sekarang'} <${Icon} n="arrow-r" s=${18} /></a>
      </div>` : html`<div class="card pad row"><span class="tile t-sky"><${Icon} n="calendar" /></span><span class="grow small" style="color:var(--text-2)">Belum ada ujian yang dibuka untuk sesimu. Halaman ini diperbarui otomatis.</span></div>`}
      <div class="row" style="justify-content:space-between"><h2>Jadwal Ujian Kamu</h2><span class="small muted">${data.length} jadwal</span></div>
      <div class="col">
        ${data.length === 0 && html`<${Empty} icon="calendar" title="Belum ada jadwal ujian" />`}
        ${data.map((x) => {
          const [st, chip] = statusUjian(x);
          const bisa = st === 'buka' || st === 'lanjut';
          const isi = html`<span class=${cls('tile', bisa || st === 'selesai' ? toneMapel(x.mapel) : 't-slate')}>${singkat(x.mapel)}</span>
            <span class="col grow" style="gap:6px;min-width:0"><strong style="color:var(--ink)">${x.mapel_nama}</strong>
              <span class="row wrap gap-8"><span class="tiny muted">${x.kategori_nama} · ${x.jumlah_soal} soal${x.tanggal && !x.aktif ? ` · ${fmt.tglPendek(x.tanggal)}${x.jam_mulai ? ` ${x.jam_mulai}` : ''}` : ''}</span>${chip}</span></span>
            ${bisa && html`<${Icon} n="chev-r" />`}`;
          return bisa ? html`<a href=${buka(x)} class="card row" style="padding:14px;text-decoration:none">${isi}</a>` : html`<div class="card row" style="padding:14px">${isi}</div>`;
        })}
      </div>
      <div class="row" style="padding:14px 16px;border-radius:18px;background:var(--amber-100);align-items:flex-start;color:var(--amber-900)">
        <${Icon} n="maximize" /><span class="small" style="line-height:1.5">Ujian berjalan di layar penuh. Keluar dari layar penuh akan dicatat dan menghentikan sementara pengerjaan.</span></div>
    `}`;
}

function Konfirmasi({ id }) {
  const u = session.user;
  const { data, error, loading } = useAsync(() => get('siswa/ujian'), []);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const ujian = data?.find((x) => x.id === id);
  const mulai = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await layarPenuh();
      const d = await post(`siswa/ujian/${id}/mulai`, { token: token.trim() });
      go(`/ujian/sesi/${d.peserta.id}`);
    } catch (x) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      toastErr(x);
    } finally { setBusy(false); }
  };
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:20px"><${ErrorBox} error=${error} /></div>`;
  if (!ujian) return html`<div style="padding:20px"><${Empty} title="Ujian tidak ditemukan"><a href="#/ujian">Kembali</a><//></div>`;
  if (ujian.status_peserta === 'mengerjakan') { go(`/ujian/sesi/${ujian.peserta_id}`); return null; }
  const baris = (a, b) => html`<div style="padding:10px 12px;border-radius:14px;background:var(--surface-2);display:flex;flex-direction:column;gap:2px">
    <span class="tiny" style="font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">${a}</span><strong class="small">${b}</strong></div>`;
  return html`<div style="max-width:560px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column">
    <div class="row" style="padding:16px 16px 0"><a href="#/ujian" class="icon-btn" aria-label="Kembali"><${Icon} n="chev-l" /></a>
      <strong class="grow" style="text-align:center">Konfirmasi Data</strong><span style="width:44px"></span></div>
    <form class="col" style="flex:1;padding:16px 20px 0;gap:14px" onSubmit=${mulai}>
      <section class="card pad col">
        <div class="row"><span class="tile round" style="background:var(--sky-200);color:var(--navy)">${inisial(u.nama)}</span>
          <div class="col" style="gap:2px"><strong>${u.nama}</strong><span class="tiny muted">No. Peserta ${u.username}</span></div></div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
          ${baris('Jenis kelamin', u.jk === 'P' ? 'Perempuan' : u.jk === 'L' ? 'Laki-laki' : '-')}${baris('Kelas · Sesi', `${u.kelas || '-'} · ${u.sesi || '-'}`)}
          ${baris('Mapel', ujian.mapel_nama)}${baris('Kategori', ujian.kategori_nama)}
          ${baris('Jumlah soal', `${ujian.jumlah_soal} soal`)}${baris('Durasi', `${ujian.durasi} menit`)}
        </div>
      </section>
      <section class="card pad col">
        <div class="row" style="justify-content:space-between"><h2 style="font-size:15px">Token Ujian</h2><span class="tiny muted">dari proktor</span></div>
        <input class="input" value=${token} onInput=${(e) => setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxlength="10" required
          aria-label="Token ujian" autocomplete="off" autocapitalize="characters" placeholder="••••••"
          style="min-height:58px;font-size:26px;font-weight:800;letter-spacing:.35em;text-align:center;background:var(--sky-50);border-color:var(--sky-200)" />
        <span class="row gap-8 tiny muted"><${Icon} n="key" s=${14} />Minta token kepada proktor di ruang ujian.</span>
      </section>
      <section class="card pad col">
        <h2 style="font-size:15px">Panduan Singkat</h2>
        <div class="row wrap gap-8"><span class="chip sky-solid">Aktif</span><span class="chip navy">Sudah dijawab</span><span class="chip" style="background:var(--amber-300);color:var(--amber-900)">Ragu-ragu</span><span class="chip outline">Belum</span></div>
        <ul class="col small" style="margin:0;padding:0;list-style:none;gap:8px;color:var(--text-2)">
          ${['Jawaban benar bernilai sesuai bobot, jawaban salah bernilai 0.', 'Jawaban tersimpan otomatis setiap kamu memilih.', 'Selesai bila semua dijawab dan tidak ada yang ragu-ragu.', 'Jika waktu habis, jawaban terakhir dikumpulkan otomatis.']
            .map((t) => html`<li class="row gap-8" style="align-items:flex-start"><span style="color:var(--sky-700);flex:none"><${Icon} n="check" s=${16} /></span>${t}</li>`)}
        </ul>
      </section>
      <div style="position:sticky;bottom:0;margin:0 -20px;padding:14px 20px 20px;background:#fff;border-top:1px solid var(--line)">
        <button class="btn btn-p btn-lg btn-block" disabled=${busy || !ujian.aktif || token.length < 4}><${Icon} n="maximize" s=${18} />${busy ? 'Menyiapkan soal…' : ujian.aktif ? 'Mulai Ujian · Layar Penuh' : 'Ujian belum dibuka'}</button>
      </div>
    </form>
  </div>`;
}

// ---------- mengerjakan ujian ----------
const PEND_KEY = (pid) => `tka2026.pending.${pid}`;
const readPending = (pid) => { try { return JSON.parse(localStorage.getItem(PEND_KEY(pid)) || '{}'); } catch { return {}; } };
const writePending = (pid, o) => { try { localStorage.setItem(PEND_KEY(pid), JSON.stringify(o)); } catch { /* abaikan */ } };
const TAHAN_MS = 5000;      // tahan Esc / layar selama ini untuk keluar
const KEMBALI_MS = 10000;   // waktu untuk kembali ke layar penuh bila browser memaksa keluar

function dijawab(j) {
  const v = j?.jawaban;
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return String(v).trim() !== '';
}

/** Pernyataan/pasangan yang wajib dijawab (soal kategori & menjodohkan). */
function butirWajib(s) {
  if (s.tipe === 'pg_kategori') return (s.opsi?.items || []).map((x) => String(x.id));
  if (s.tipe === 'menjodohkan') return (s.opsi?.premis || []).map((x) => String(x.id));
  return [];
}
/** 'isi' = lengkap · 'kurang' = baru sebagian pernyataan terjawab · '' = belum dijawab */
function statusJawab(s, j) {
  if (!dijawab(j)) return '';
  const w = butirWajib(s);
  if (!w.length) return 'isi';
  const v = j.jawaban || {};
  return w.every((id) => v[id] !== undefined && v[id] !== null && v[id] !== '') ? 'isi' : 'kurang';
}
const terjawabButir = (s, j) => butirWajib(s).filter((id) => { const v = j?.jawaban?.[id]; return v !== undefined && v !== null && v !== ''; }).length;

// pemisahan bacaan & pertanyaan cukup dihitung sekali per soal
const bagianSoal = new Map();
const pisahCache = (s) => { if (!bagianSoal.has(s.id)) bagianSoal.set(s.id, pisahSoal(s.pertanyaan)); return bagianSoal.get(s.id); };

function Mengerjakan({ pid }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [jw, setJw] = useState({});
  const [idx, setIdx] = useState(() => +(sessionStorage.getItem(`tka2026.idx.${pid}`) || 0));
  const [, tick] = useState(0);
  const [simpan, setSimpan] = useState({ s: 'ok', t: null });
  const [online, setOnline] = useState(navigator.onLine);
  const [antre, setAntre] = useState(0);
  const [daftar, setDaftar] = useState(false);
  const [layar, setLayar] = useState(null);   // null | 'awal' | {kembali: deadline}
  const [tahan, setTahan] = useState(null);   // {mulai, cara}
  const [diusir, setDiusir] = useState(false);
  const [habis, setHabis] = useState(false);  // waktu habis tapi belum terkirim (offline)
  const [ukuran, setUkuran] = useState(() => +(localStorage.getItem('tka2026.font') || 16));
  const waktu = useRef({ sisa: null, berjalan: false, at: 0 });
  const pending = useRef(readPending(pid));
  const timers = useRef({});
  const selesaiRef = useRef(false);
  const keluarRef = useRef(false);
  const pergiRef = useRef(false);
  const terkunciRef = useRef(false); // setelah dikunci: hentikan semua permintaan agar peringatan tetap tampil
  const jwRef = useRef({});
  jwRef.current = jw;
  const pratinjau = !!session.impersonator;
  const fsSupported = typeof document !== 'undefined' && document.fullscreenEnabled && !pratinjau;

  const sinkron = (r) => {
    if (r && r.sisa !== undefined) waktu.current = { sisa: r.sisa, berjalan: r.berjalan, at: Date.now() };
  };
  const sisaSekarang = () => {
    const w = waktu.current;
    if (w.sisa == null) return null;
    return w.berjalan ? w.sisa - (Date.now() - w.at) : w.sisa;
  };
  const tandaiKoneksi = (ok) => setOnline(ok && navigator.onLine);
  const hitungAntre = () => setAntre(Object.keys(pending.current).length);

  const muat = useCallback(async () => {
    try {
      const d = await get(`siswa/sesi/${pid}`);
      tandaiKoneksi(true);
      if (d.peserta.status !== 'mengerjakan') { selesaiRef.current = true; go(`/ujian/selesai/${pid}`); return; }
      sinkron(d.peserta);
      const merged = { ...d.jawaban };
      for (const [sid, v] of Object.entries(pending.current)) merged[sid] = { jawaban: v.jawaban, ragu: v.ragu };
      setJw(merged);
      setSt(d);
      hitungAntre();
      if (fsSupported && !document.fullscreenElement) setLayar('awal');
    } catch (e) { if (e.status === 0) tandaiKoneksi(false); setErr(e); }
  }, [pid]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => {
    sessionStorage.setItem(`tka2026.idx.${pid}`, String(idx));
    document.querySelectorAll('.exam-kiri, .exam-kanan').forEach((el) => { el.scrollTop = 0; });
  }, [idx]);
  useEffect(() => { localStorage.setItem('tka2026.font', String(ukuran)); }, [ukuran]);

  // ---- antrean jawaban: disimpan di perangkat dulu, dikirim ke server; gagal → dicoba lagi ----
  const kirim = useCallback(async (sid) => {
    const p = pending.current[sid];
    if (!p || terkunciRef.current) return;
    setSimpan({ s: 'proses', t: null });
    try {
      const r = await put(`siswa/sesi/${pid}/jawaban`, { soal_id: +sid, jawaban: p.jawaban, ragu: p.ragu, offline: !!p.offline });
      tandaiKoneksi(true);
      sinkron(r);
      if (pending.current[sid] === p) { delete pending.current[sid]; writePending(pid, pending.current); }
      hitungAntre();
      setSimpan({ s: Object.keys(pending.current).length ? 'proses' : 'ok', t: Date.now() });
    } catch (e) {
      if (e.status === 409) { delete pending.current[sid]; writePending(pid, pending.current); hitungAntre(); selesaiRef.current = true; go(`/ujian/selesai/${pid}`); return; }
      if (e.status === 401) return;
      if (e.status === 0) { tandaiKoneksi(false); p.offline = true; writePending(pid, pending.current); }
      setSimpan({ s: 'gagal', t: null });
    }
  }, [pid]);

  const flushSemua = async () => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    for (const sid of Object.keys(pending.current)) await kirim(sid);
  };

  useEffect(() => {
    const t = setInterval(() => { Object.keys(pending.current).forEach((sid) => !timers.current[sid] && kirim(sid)); }, 5000);
    const naik = () => { tandaiKoneksi(true); flushSemua(); ping(); };
    const turun = () => tandaiKoneksi(false);
    window.addEventListener('online', naik);
    window.addEventListener('offline', turun);
    return () => { clearInterval(t); window.removeEventListener('online', naik); window.removeEventListener('offline', turun); };
  }, [kirim]);

  const ubah = (soal, patch, segera) => {
    const sid = soal.id;
    const prev = jwRef.current[sid] || { jawaban: null, ragu: false };
    if (typeof patch.jawaban === 'function') patch = { ...patch, jawaban: patch.jawaban(prev.jawaban) };
    const cur = { ...prev, ...patch };
    jwRef.current = { ...jwRef.current, [sid]: cur };
    setJw(jwRef.current);
    pending.current[sid] = { jawaban: cur.jawaban, ragu: !!cur.ragu, offline: !online || !!pending.current[sid]?.offline };
    writePending(pid, pending.current);
    hitungAntre();
    clearTimeout(timers.current[sid]);
    timers.current[sid] = setTimeout(() => { delete timers.current[sid]; kirim(sid); }, segera ? 0 : 700);
  };

  const keHasil = () => {
    selesaiRef.current = true;
    localStorage.removeItem(PEND_KEY(pid));
    if (document.fullscreenElement) { pergiRef.current = true; document.exitFullscreen().catch(() => {}); }
    go(`/ujian/selesai/${pid}`);
  };

  const kumpulkan = async (otomatis = false) => {
    if (selesaiRef.current) return;
    await flushSemua();
    if (Object.keys(pending.current).length) {
      if (otomatis) setHabis(true); else toast('Ada jawaban yang belum terkirim. Periksa koneksi lalu coba lagi.', 'err');
      return;
    }
    try {
      await post(`siswa/sesi/${pid}/selesai`);
      keHasil();
    } catch (e) {
      if (e.status === 0) { tandaiKoneksi(false); if (otomatis) setHabis(true); return; }
      if (!otomatis) toastErr(e);
    }
  };

  async function ping(keluar = false) {
    if (terkunciRef.current) return;
    try {
      const r = await post(`siswa/sesi/${pid}/ping`, keluar ? { keluar: true } : {});
      tandaiKoneksi(true);
      sinkron(r);
      if (r.status !== 'mengerjakan' && !selesaiRef.current) { await flushSemua(); keHasil(); }
    } catch (e) { if (e.status === 0) tandaiKoneksi(false); }
  }

  // timer layar + detak ke server tiap 10 detik
  useEffect(() => {
    if (!st) return;
    const t = setInterval(() => {
      tick((x) => x + 1);
      const s = sisaSekarang();
      if (s != null && s <= 0 && !selesaiRef.current && !keluarRef.current) kumpulkan(true);
    }, 1000);
    const hb = setInterval(() => ping(), 10e3);
    return () => { clearInterval(t); clearInterval(hb); };
  }, [st]);

  // waktu habis saat offline: terus coba kirim begitu terhubung
  useEffect(() => { if (habis && online) kumpulkan(true); }, [habis, online]);

  // ---- keamanan: layar penuh, tahan 5 detik untuk keluar ----
  const upayaKeluar = async () => {
    if (keluarRef.current || selesaiRef.current) return;
    keluarRef.current = true;
    setTahan(null);
    setLayar(null);
    setDiusir(true);
    await flushSemua().catch(() => {});
    try { await post(`siswa/sesi/${pid}/kunci`); } catch { /* tetap dikeluarkan di perangkat */ }
    terkunciRef.current = true;
  };
  const selesaiDiusir = () => {
    pergiRef.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (pratinjau) { selesaiSamaran(); return; }
    clearSession();
    location.hash = '#/masuk?peran=siswa';
  };
  useEffect(() => { if (diusir) { const t = setTimeout(selesaiDiusir, 15000); return () => clearTimeout(t); } }, [diusir]);

  const kunciTombol = () => { try { navigator.keyboard?.lock?.(['Escape'])?.catch?.(() => {}); } catch { /* tidak didukung */ } };
  const masukLayarPenuh = () => layarPenuh().then(() => { kunciTombol(); setLayar(null); });

  useEffect(() => {
    if (!st || pratinjau) return;
    let timer = null, mulaiXY = null;
    const mulai = (cara) => {
      if (timer || keluarRef.current || selesaiRef.current) return;
      setTahan({ mulai: Date.now(), cara });
      timer = setTimeout(() => { timer = null; upayaKeluar(); }, TAHAN_MS);
    };
    const batal = () => { if (timer) { clearTimeout(timer); timer = null; } setTahan(null); };
    const kd = (e) => { if (e.key === 'Escape') { e.preventDefault(); if (!e.repeat) mulai('esc'); } };
    const ku = (e) => { if (e.key === 'Escape') batal(); };
    const ts = (e) => { if (e.touches.length !== 1) return batal(); mulaiXY = [e.touches[0].clientX, e.touches[0].clientY]; mulai('layar'); };
    const tm = (e) => { if (!mulaiXY) return; const d = Math.hypot(e.touches[0].clientX - mulaiXY[0], e.touches[0].clientY - mulaiXY[1]); if (d > 12) { mulaiXY = null; batal(); } };
    const te = () => { mulaiXY = null; batal(); };
    const cm = (e) => e.preventDefault();
    const onFs = () => {
      if (document.fullscreenElement) { kunciTombol(); return; }
      if (selesaiRef.current || keluarRef.current || pergiRef.current) return;
      ping(true); // tercatat di monitor
      setLayar({ kembali: Date.now() + KEMBALI_MS });
    };
    const onVis = () => { if (document.visibilityState === 'hidden' && !selesaiRef.current && !keluarRef.current) ping(true); };
    const unload = () => { pergiRef.current = true; };
    document.addEventListener('keydown', kd, true);
    document.addEventListener('keyup', ku, true);
    document.addEventListener('touchstart', ts, { passive: true });
    document.addEventListener('touchmove', tm, { passive: true });
    document.addEventListener('touchend', te);
    document.addEventListener('touchcancel', te);
    document.addEventListener('contextmenu', cm);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', unload);
    if (document.fullscreenElement) kunciTombol();
    return () => {
      batal();
      document.removeEventListener('keydown', kd, true);
      document.removeEventListener('keyup', ku, true);
      document.removeEventListener('touchstart', ts);
      document.removeEventListener('touchmove', tm);
      document.removeEventListener('touchend', te);
      document.removeEventListener('touchcancel', te);
      document.removeEventListener('contextmenu', cm);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', unload);
    };
  }, [st]);

  // browser memaksa keluar layar penuh: beri kesempatan kembali, bila tidak → dianggap upaya keluar
  useEffect(() => {
    if (!layar || layar === 'awal') return;
    const t = setInterval(() => { if (Date.now() >= layar.kembali) { clearInterval(t); upayaKeluar(); } }, 250);
    return () => clearInterval(t);
  }, [layar]);

  useEffect(() => {
    const f = (e) => { if (Object.keys(pending.current).length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  if (err) return html`<div style="padding:24px;max-width:560px;margin:0 auto"><${ErrorBox} error=${err} retry=${() => { setErr(null); muat(); }} /><a class="btn btn-o" style="margin-top:12px" href="#/ujian">Kembali</a></div>`;
  if (!st) return html`<${Loading} text="Menyiapkan soal…" />`;
  const soal = st.soal;
  const n = soal.length;
  const i = Math.min(idx, n - 1);
  const s = soal[i];
  const j = jw[s.id] || {};
  const status = soal.map((x) => statusJawab(x, jw[x.id]));
  const jmlJawab = status.filter((x) => x === 'isi').length;
  const jmlKurang = status.filter((x) => x === 'kurang').length;
  const jmlBelum = n - jmlJawab - jmlKurang;
  const jmlRagu = soal.filter((x) => jw[x.id]?.ragu).length;
  const nomorKurang = status.map((x, k) => (x === 'kurang' ? k + 1 : null)).filter(Boolean);
  const bisaSelesai = jmlJawab === n && jmlRagu === 0;
  const { stimulus, pertanyaan } = pisahCache(s);
  const kepala = html`<div class="row wrap gap-8">
          <span class="chip sky-solid">Soal ${i + 1}</span>
          <span class="chip outline">${{ pilihan_ganda: 'Pilihan Ganda', pilihan_ganda_kompleks: 'PG Kompleks', benar_salah: 'Benar/Salah', pg_kategori: 'Benar/Salah per pernyataan', menjodohkan: 'Menjodohkan', isian: 'Isian Singkat', uraian: 'Uraian' }[s.tipe]}</span>
          <span class="row gap-4 right">
            <button class="icon-btn" style="width:38px;height:38px;font-weight:800;font-size:13px" aria-label="Perkecil huruf" onClick=${() => setUkuran(Math.max(13, ukuran - 1))}>A-</button>
            <button class="icon-btn" style="width:38px;height:38px;font-weight:800;font-size:15px" aria-label="Perbesar huruf" onClick=${() => setUkuran(Math.min(24, ukuran + 1))}>A+</button>
          </span>
        </div>`;
  const wajib = butirWajib(s).length;
  const sudahButir = terjawabButir(s, j);
  // tombol selesai: bila belum boleh, beri tahu apa yang kurang lalu antar ke soal pertama yang bermasalah
  const cobaSelesai = async () => {
    if (bisaSelesai) {
      if (await confirmDialog('Akhiri ujian? Jawaban akan disimpan permanen dan tidak bisa diubah lagi.', { title: 'Konfirmasi selesai', ok: 'Ya, selesai' })) kumpulkan();
      return;
    }
    const masalah = status.findIndex((x, k) => x !== 'isi' || jw[soal[k].id]?.ragu);
    const daftarMasalah = [
      jmlKurang && `${jmlKurang} soal belum lengkap (nomor ${nomorKurang.join(', ')}) — semua pernyataan wajib dijawab`,
      jmlBelum && `${jmlBelum} soal belum dijawab`,
      jmlRagu && `${jmlRagu} soal masih bertanda ragu-ragu`,
    ].filter(Boolean);
    if (await confirmDialog(html`<span>Ujian belum bisa diselesaikan:</span><ul style="margin:8px 0 0;padding-left:20px;line-height:1.6">${daftarMasalah.map((t) => html`<li>${t}</li>`)}</ul>`,
      { title: 'Jawaban belum lengkap', ok: `Ke soal nomor ${masalah + 1}`, batal: 'Tutup' })) { setIdx(masalah); setDaftar(false); }
  };
  const sisa = sisaSekarang();
  const kritis = sisa != null && sisa < 5 * 60e3;
  const tahanSisa = tahan ? Math.max(0, Math.ceil((TAHAN_MS - (Date.now() - tahan.mulai)) / 1000)) : 0;

  return html`<div class="exam" style=${`--soal-size:${ukuran}px;-webkit-touch-callout:none`}>
    ${pratinjau && html`<div style="padding:12px 16px 0"><${BannerSamaran} /></div>`}
    <div class="exam-top"><div class="exam-in col" style="gap:12px">
      <div class="row" style="gap:10px">
        <span class=${cls('tile sm', toneMapel(st.ujian.mapel))} style="width:40px;height:40px">${singkat(st.ujian.mapel)}</span>
        <div class="col grow" style="gap:0;min-width:0"><strong class="ellipsis">${st.ujian.mapel_nama}</strong><span class="tiny muted ellipsis">${st.ujian.kategori_nama} · ${session.user.nama}</span></div>
        <span class=${cls('timer', kritis && 'kritis')} role="timer" aria-label="Sisa waktu"><${Icon} n="clock" s=${18} />${fmt.durasi(sisa)}</span>
      </div>
      <div class="row" style="gap:10px">
        <span class=${cls('chip', online ? 'green' : 'red')} role="status" aria-live="polite" title=${online ? 'Terhubung ke server' : 'Koneksi terputus'}>
          <span class="dot" style=${online ? 'background:var(--green-500)' : 'background:var(--red-500)'}></span>${online ? 'Online' : `Offline${antre ? ` · ${antre} jawaban di perangkat` : ''}`}</span>
        <div class="bar grow"><span style=${`width:${(jmlJawab / n) * 100}%`}></span></div><span class="tiny" style="font-weight:700;color:var(--text-2)">${jmlJawab}/${n}</span>
      </div>
    </div></div>

    ${!online && html`<div class="row small" style="margin:12px auto 0;max-width:920px;width:calc(100% - 32px);padding:10px 14px;border-radius:14px;background:var(--red-50);color:var(--red-700)">
      <${Icon} n="wifi-off" s=${18} /><span>Koneksi terputus. Tetap kerjakan — jawabanmu disimpan di perangkat ini dan dikirim otomatis saat tersambung lagi. Jangan tutup halaman.</span></div>`}

    <div class="exam-body"><div class=${cls('exam-in exam-grid', !stimulus && 'tunggal')}>
      ${stimulus && html`<section class="exam-kiri" aria-label="Bacaan">
        ${kepala}
        <article class="card pad"><${Rich} key=${`b${s.id}`} html=${stimulus} /></article>
      </section>`}
      <section class="exam-kanan" aria-label="Pertanyaan dan jawaban">
        ${!stimulus && kepala}
        <article class="card soal-tanya" aria-label="Pertanyaan"><span class="soal-tanya-label"><${Icon} n="message" s=${14} />Pertanyaan</span><${Rich} key=${`q${s.id}`} html=${pertanyaan} /></article>
        <span class="label">Pilih jawaban</span>
        <${SoalView} key=${s.id} soal=${s} jawaban=${j.jawaban ?? null} onChange=${(v) => ubah(s, { jawaban: v }, !['isian', 'uraian'].includes(s.tipe))} />
        ${wajib > 0 && sudahButir < wajib && html`<div class=${cls('row small', sudahButir ? 'peringatan-kurang' : 'info-kurang')} role="status">
          <${Icon} n=${sudahButir ? 'alert' : 'info'} s=${18} /><span>${sudahButir ? html`<strong>Jawaban belum lengkap</strong> — baru ${sudahButir} dari ${wajib} ${s.tipe === 'menjodohkan' ? 'pasangan' : 'pernyataan'} terjawab. Soal ini dihitung benar hanya bila semuanya dijawab dengan tepat.` : `Jawab semua ${wajib} ${s.tipe === 'menjodohkan' ? 'pasangan' : 'pernyataan'} pada soal ini.`}</span></div>`}
        <label class="ragu-toggle"><input type="checkbox" checked=${!!j.ragu} onChange=${(e) => ubah(s, { ragu: e.target.checked }, true)} /><${Icon} n="flag" s=${18} />Tandai ragu-ragu</label>
        <div class="row wrap" style="justify-content:space-between">
          <span class="row gap-4 tiny" style=${`color:${simpan.s === 'gagal' ? 'var(--red-700)' : simpan.s === 'proses' ? 'var(--muted)' : 'var(--green-700)'}`} aria-live="polite">
            <${Icon} n=${simpan.s === 'gagal' ? 'wifi-off' : 'check-circle'} s=${14} />
            ${simpan.s === 'gagal' ? 'Tersimpan di perangkat — dikirim saat terhubung' : simpan.s === 'proses' ? 'Menyimpan…' : simpan.t ? `Tersimpan di server · ${fmt.jam(simpan.t)}` : 'Jawaban tersimpan otomatis'}</span>
          <button class="btn btn-g btn-sm" onClick=${async () => {
            const pesan = await promptDialog('Ceritakan masalah pada soal ini (misalnya gambar tidak muncul atau kalimat membingungkan).', { title: `Laporkan soal ${i + 1}`, ok: 'Kirim laporan', placeholder: 'Tulis singkat' });
            if (pesan) post('siswa/feedback', { soal_id: s.id, pesan }).then(() => toast('Laporan terkirim ke guru. Terima kasih!')).catch(toastErr);
          }}><${Icon} n="message" s=${16} />Laporkan soal</button>
        </div>
      </section>
    </div></div>

    <div class="exam-foot"><div class="exam-in row" style="gap:10px">
      <button class="btn btn-o grow" disabled=${i === 0} onClick=${() => setIdx(i - 1)}><${Icon} n="chev-l" s=${18} />Sebelumnya</button>
      <button class="icon-btn" style="width:52px;height:48px;background:var(--sky-100);border:0;color:var(--sky-700)" aria-label="Daftar soal" onClick=${() => setDaftar(true)}><${Icon} n="grid" s=${22} /></button>
      ${i < n - 1 ? html`<button class="btn btn-p grow" onClick=${() => setIdx(i + 1)}>Selanjutnya <${Icon} n="chev-r" s=${18} /></button>`
        : html`<button class="btn btn-p grow" onClick=${() => setDaftar(true)}>Selesai <${Icon} n="check" s=${18} /></button>`}
    </div></div>

    ${daftar && html`<div class="sheet-bg" onMouseDown=${(e) => e.target === e.currentTarget && setDaftar(false)}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Daftar soal">
        <span class="handle"></span>
        <div class="row"><h2 class="grow" style="font-size:20px">Daftar Soal</h2><button class="icon-btn" aria-label="Tutup" onClick=${() => setDaftar(false)}><${Icon} n="x" /></button></div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
          <div class="card col" style="padding:10px;align-items:center;gap:0;box-shadow:none"><strong style="font-size:20px">${jmlJawab}</strong><span class="tiny muted">Dijawab</span></div>
          <div class="card col" style="padding:10px;align-items:center;gap:0;box-shadow:none;background:var(--kurang-bg);border-color:var(--kurang-garis)"><strong style="font-size:20px;color:var(--kurang-teks)">${jmlKurang}</strong><span class="tiny" style="color:var(--kurang-teks)">Belum lengkap</span></div>
          <div class="card col" style="padding:10px;align-items:center;gap:0;box-shadow:none;background:var(--amber-50)"><strong style="font-size:20px;color:var(--amber-800)">${jmlRagu}</strong><span class="tiny" style="color:var(--amber-900)">Ragu-ragu</span></div>
          <div class="card col" style="padding:10px;align-items:center;gap:0;box-shadow:none"><strong style="font-size:20px">${jmlBelum}</strong><span class="tiny muted">Belum</span></div>
        </div>
        <div class="qgrid">${soal.map((x, k) => {
          const jj = jw[x.id];
          const c = jj?.ragu ? 'ragu' : status[k];
          return html`<button class=${cls('qbtn', c, k === i && 'aktif')} aria-label=${`Soal ${k + 1}${c === 'ragu' ? ', ragu-ragu' : c === 'isi' ? ', sudah dijawab' : c === 'kurang' ? ', belum lengkap' : ', belum dijawab'}`} onClick=${() => { setIdx(k); setDaftar(false); }}>${k + 1}</button>`;
        })}</div>
        <div class="row wrap tiny" style="gap:12px;color:var(--text-2)">
          <span class="row gap-4"><span style="width:12px;height:12px;border-radius:4px;background:var(--sky-400)"></span>Aktif</span>
          <span class="row gap-4"><span style="width:12px;height:12px;border-radius:4px;background:var(--ink)"></span>Sudah dijawab</span>
          <span class="row gap-4"><span style="width:12px;height:12px;border-radius:4px;background:var(--kurang-bg);border:1.5px dashed var(--kurang-garis)"></span>Belum lengkap</span>
          <span class="row gap-4"><span style="width:12px;height:12px;border-radius:4px;background:var(--amber-300)"></span>Ragu-ragu</span>
          <span class="row gap-4"><span style="width:12px;height:12px;border-radius:4px;border:1px solid #A9B6CC"></span>Belum</span>
        </div>
        ${!bisaSelesai && html`<div class="row small" style="padding:12px 14px;border-radius:16px;background:var(--amber-50);color:var(--amber-900);align-items:flex-start">
          <${Icon} n="alert" s=${18} /><span>Selesaikan ${[jmlKurang && `${jmlKurang} soal yang belum lengkap (nomor ${nomorKurang.join(', ')})`, jmlBelum && `${jmlBelum} soal yang belum dijawab`, jmlRagu && `${jmlRagu} soal ragu-ragu`].filter(Boolean).join(', ')} sebelum mengakhiri ujian.</span></div>`}
        <div class="row" style="gap:10px">
          <button class="btn btn-o grow" onClick=${() => setDaftar(false)}>Kembali ke Soal ${i + 1}</button>
          <button class=${cls('btn grow', bisaSelesai ? 'btn-p' : 'btn-o')} aria-disabled=${!bisaSelesai} onClick=${cobaSelesai}>${!bisaSelesai ? html`<${Icon} n="lock" s=${16} />` : ''}Selesai Ujian</button>
        </div>
      </section>
    </div>`}

    ${tahan && !diusir && html`<div style="position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:95;padding:12px 18px;border-radius:16px;background:var(--ink);color:#fff;font-weight:700;display:flex;align-items:center;gap:10px;box-shadow:0 12px 30px rgba(16,40,74,.35)" role="alert">
      <${Icon} n="alert" s=${18} />${tahan.cara === 'esc' ? 'Tombol Esc ditahan' : 'Layar ditahan'} — ujian akan dikunci dalam ${tahanSisa} detik. Lepaskan untuk membatalkan.</div>`}

    ${layar && !diusir && html`<div class="lock-screen" role="alertdialog" aria-modal="true">
      <div class="col" style="align-items:center;max-width:440px;gap:16px">
        <span class="tile lg" style=${layar === 'awal' ? 'background:var(--sky-400);color:#fff' : 'background:var(--red-500);color:#fff'}><${Icon} n=${layar === 'awal' ? 'maximize' : 'alert'} s=${28} /></span>
        <h2>${layar === 'awal' ? 'Masuk ke mode layar penuh' : 'Kamu keluar dari layar penuh!'}</h2>
        <p style="color:#E3F2FF;line-height:1.6">${layar === 'awal' ? 'Ujian harus dikerjakan dalam mode layar penuh.'
          : html`Kembali dalam <strong style="color:#fff;font-size:20px">${Math.max(0, Math.ceil((layar.kembali - Date.now()) / 1000))}</strong> detik, atau ujian akan dikunci dan kamu harus meminta admin sekolah mereset login.`}</p>
        <button class="btn btn-p btn-lg" onClick=${masukLayarPenuh}><${Icon} n="maximize" s=${18} />${layar === 'awal' ? 'Lanjutkan' : 'Kembali ke Ujian'}</button>
      </div>
    </div>`}

    ${diusir && html`<div class="lock-screen" style="background:rgba(127,29,29,.94)" role="alertdialog" aria-modal="true" aria-label="Peringatan">
      <div class="col" style="align-items:center;max-width:460px;gap:16px">
        <span class="tile lg" style="background:#fff;color:var(--red-700)"><${Icon} n="alert" s=${30} /></span>
        <span class="chip" style="background:#fff;color:var(--red-700)">PERINGATAN</span>
        <h2>Ada upaya untuk keluar dari Ujian</h2>
        <p style="color:#FEE2E2;line-height:1.6">${pratinjau ? 'Mode pratinjau: akun siswa tidak dikunci.' : 'Akun kamu dikeluarkan dan dikunci. Jawaban yang sudah masuk tetap aman dan waktu ujian dihentikan sementara. Untuk melanjutkan, minta admin sekolah mereset login, lalu masuk kembali.'}</p>
        <button class="btn btn-lg" style="background:#fff;color:var(--red-700)" onClick=${selesaiDiusir}><${Icon} n="logout" s=${18} />Keluar</button>
      </div>
    </div>`}

    ${habis && html`<div class="lock-screen" role="alertdialog" aria-modal="true">
      <div class="col" style="align-items:center;max-width:440px;gap:16px">
        <span class="spinner" style="width:40px;height:40px"></span>
        <h2>Waktu habis</h2>
        <p style="color:#E3F2FF;line-height:1.6">Jawabanmu tersimpan di perangkat dan akan dikirim otomatis begitu koneksi tersambung. Jangan tutup halaman ini.</p>
      </div>
    </div>`}
  </div>`;
}

function Selesai({ pid }) {
  const { data, error, loading } = useAsync(() => get(`siswa/sesi/${pid}`), [pid]);
  useEffect(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); try { navigator.keyboard?.unlock?.(); } catch { /* */ } }, []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const p = data.peserta;
  const dijawabN = Object.values(data.jawaban).filter(dijawab).length;
  const otomatis = p.selesai_karena === 'waktu' || p.selesai_karena === 'jam';
  return html`<div style="max-width:560px;margin:0 auto;min-height:100vh;display:flex;flex-direction:column;padding-bottom:20px">
    <div style="position:relative;height:240px;display:flex;align-items:center;justify-content:center">
      <span style="position:absolute;width:12px;height:12px;border-radius:50%;background:var(--sky-400);left:20%;top:70px"></span>
      <span style="position:absolute;width:8px;height:8px;border-radius:50%;background:var(--amber-500);right:24%;top:50px"></span>
      <span style="width:170px;height:170px;border-radius:50%;background:var(--sky-100);display:flex;align-items:center;justify-content:center">
        <span style="width:116px;height:116px;border-radius:50%;background:var(--sky-400);color:#fff;display:flex;align-items:center;justify-content:center"><${Icon} n=${otomatis ? 'clock' : 'check'} s=${60} w=${2.4} /></span></span>
    </div>
    <div class="col" style="padding:0 24px;align-items:center;text-align:center;gap:8px">
      <h1 style="font-size:28px">${otomatis ? 'Waktu Ujian Habis' : 'Ujian Selesai!'}</h1>
      <p style="color:var(--text-2)">${otomatis ? (p.selesai_karena === 'jam' ? 'Jam sesi ujian sudah berakhir. ' : 'Durasi pengerjaan sudah habis. ') + 'Jawabanmu otomatis disimpan dan dikirim ke server.' : 'Jawaban kamu berhasil disimpan ke server. Terima kasih sudah mengerjakan dengan jujur.'}</p>
    </div>
    <section class="card col" style="margin:20px 20px 0;padding:18px;align-items:center;gap:4px;background:var(--sky-50);border-color:var(--sky-200)">
      <span class="small muted">Hasil Ujian</span>
      ${p.nilai != null ? html`<strong style="font-size:48px;line-height:1.1;color:var(--sky-700)">${fmt.angka(p.nilai)}</strong>
        <span class="small" style="color:var(--text-2)">Skor ${fmt.angka(p.skor)} dari ${fmt.angka(p.skor_maks, 0)}</span>`
        : html`<strong style="font-size:20px;color:var(--amber-800)">Menunggu koreksi guru</strong><span class="small muted">Nilai muncul setelah soal uraian/isian dikoreksi.</span>`}
    </section>
    <section class="card" style="margin:14px 20px 0;padding:6px 16px">
      ${[['Mata pelajaran', `${data.ujian.mapel_nama} · ${data.ujian.kategori_nama}`], ['Soal dijawab', `${dijawabN} / ${data.soal.length}`], ['Dikumpulkan', fmt.waktu(p.selesai_at)]]
        .map(([a, b], k) => html`<div class="row small" style=${`justify-content:space-between;padding:12px 0;${k < 2 ? 'border-bottom:1px solid var(--line)' : ''}`}><span class="muted">${a}</span><strong>${b}</strong></div>`)}
    </section>
    <div class="col" style="margin-top:auto;padding:20px;gap:10px">
      <button class="btn btn-p btn-lg" onClick=${session.impersonator ? selesaiSamaran : keluar}><${Icon} n="logout" s=${18} />Logout</button>
      <a class="btn btn-o btn-lg" href="#/ujian">Kembali ke Beranda</a>
    </div>
  </div>`;
}

function Nilai() {
  const { data, error, loading } = useAsync(() => get('siswa/nilai'), []);
  return html`<h1>Nilai Saya</h1>
    ${loading ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} />` : data.length === 0 ? html`<${Empty} icon="award" title="Belum ada nilai">Nilai muncul setelah kamu menyelesaikan ujian.<//>` : html`
    <${PerkembanganSaya} data=${data} />
    <h2 style="font-size:16px">Semua nilai</h2>
    <div class="col">
      ${data.map((n) => html`<div class="card row" style="padding:14px">
        <span class=${cls('tile', toneMapel(n.mapel))}>${singkat(n.mapel)}</span>
        <span class="col grow" style="gap:2px"><strong>${n.mapel_nama}</strong><span class="tiny muted">${n.kategori_nama} · ${fmt.tglPendek(n.selesai_at)}</span></span>
        ${n.nilai == null ? html`<span class="chip amber">Menunggu koreksi</span>` : html`<strong style="font-size:24px;color:var(--sky-700)">${fmt.angka(n.nilai)}</strong>`}
      </div>`)}</div>`}`;
}

/** Rekap nilai semua try out yang diikuti siswa: rata-rata per try out dan grafik perkembangannya. */
function PerkembanganSaya({ data }) {
  const target = session.sekolah?.target_capaian ?? session.info?.target_capaian ?? 70;
  const kat = [...new Map([...data].sort((a, b) => (a.kategori_urutan ?? 0) - (b.kategori_urutan ?? 0)).map((n) => [n.kategori, n.kategori_nama])).entries()];
  const mapel = [...new Map([...data].sort((a, b) => (a.mapel_urutan ?? 0) - (b.mapel_urutan ?? 0)).map((n) => [n.mapel, n.mapel_nama])).entries()];
  // nilai terakhir per try out + mapel
  const nilai = {};
  for (const n of [...data].sort((a, b) => (a.selesai_at || 0) - (b.selesai_at || 0))) (nilai[n.kategori] ||= {})[n.mapel] = n.nilai;
  const rata = (vals) => { const v = vals.filter((x) => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const perTo = kat.map(([k]) => rata(mapel.map(([m]) => nilai[k]?.[m])));
  const ada = perTo.filter((v) => v != null);
  const tren = ada.length >= 2 ? Math.round((ada[ada.length - 1] - ada[0]) * 10) / 10 : null;
  const semua = rata(perTo);
  return html`<section class="card pad col" style="gap:14px">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div class="col" style="gap:2px"><h2 style="font-size:16px">Perkembangan Try Out</h2>
      <span class="tiny muted">${kat.length} try out · rata-rata semua mapel</span></div><${Tren} v=${tren} besar /></div>
    <div class="row" style="gap:10px">
      <div class="card col grow" style="padding:12px;gap:2px;box-shadow:none"><span class="tiny muted">Rata-rata semua try out</span><strong style=${`font-size:24px;color:${semua != null && semua < target ? 'var(--orange-700)' : 'var(--sky-700)'}`}>${fmt.angka(semua)}</strong></div>
      <div class="card col grow" style="padding:12px;gap:2px;box-shadow:none"><span class="tiny muted">Target capaian</span><strong style="font-size:24px">${target}</strong></div>
    </div>
    ${kat.length > 1 && html`<${GrafikTren} label=${kat.map(([, n]) => n)} target=${target} tinggi=${260} ringkas=${mapel.length === 1}
      seri=${[{ nama: 'Rata-rata', warna: WARNA_GABUNGAN, tebal: true, nilai: perTo }, ...(mapel.length > 1 ? mapel.map(([m, nm], i) => ({ nama: nm, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: kat.map(([k]) => nilai[k]?.[m] ?? null) })) : [])]} />`}
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Try out</th>${mapel.map(([, nm]) => html`<th class="r">${nm}</th>`)}<th class="r">Rata-rata</th></tr></thead>
      <tbody>${kat.map(([k, nm], i) => html`<tr><td><strong>${nm}</strong></td>
        ${mapel.map(([m]) => { const v = nilai[k]?.[m]; return html`<td class="r num">${v === undefined ? html`<span class="tiny muted">–</span>` : v == null ? html`<span class="chip amber">koreksi</span>` : fmt.angka(v)}</td>`; })}
        <td class="r num" style=${`font-weight:800;color:${perTo[i] != null && perTo[i] < target ? 'var(--orange-700)' : 'var(--ink)'}`}>${fmt.angka(perTo[i])}</td></tr>`)}</tbody></table></div>
  </section>`;
}

function AkunSiswa() {
  const u = session.user;
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  const ganti = async (e) => {
    e.preventDefault();
    if (f.baru !== f.ulang) return toast('Konfirmasi password tidak sama.', 'err');
    try { await put('akun/password', { lama: f.lama, baru: f.baru }); toast('Password berhasil diganti.'); setF({ lama: '', baru: '', ulang: '' }); } catch (x) { toastErr(x); }
  };
  return html`<h1>Akun</h1>
    <div class="card pad col">
      <div class="row"><span class="tile round" style="background:var(--sky-200);color:var(--navy)">${inisial(u.nama)}</span><div class="col" style="gap:0"><strong>${u.nama}</strong><span class="tiny muted">${u.username} · ${session.sekolah?.nama || ''}</span></div></div>
    </div>
    ${!session.impersonator && html`<form class="card pad col" onSubmit=${ganti}>
      <h2 style="font-size:16px">Ganti password</h2>
      <${Field} label="Password lama"><input class="input" type="password" value=${f.lama} onInput=${(e) => setF((x) => ({ ...x, lama: e.target.value }))} required /><//>
      <${Field} label="Password baru" hint="min. 6 karakter"><input class="input" type="password" value=${f.baru} onInput=${(e) => setF((x) => ({ ...x, baru: e.target.value }))} minlength="6" required /><//>
      <${Field} label="Ulangi password baru"><input class="input" type="password" value=${f.ulang} onInput=${(e) => setF((x) => ({ ...x, ulang: e.target.value }))} required /><//>
      <button class="btn btn-p">Simpan</button>
    </form>`}
    <button class="btn btn-d" onClick=${session.impersonator ? selesaiSamaran : keluar}><${Icon} n="logout" s=${18} />${session.impersonator ? 'Kembali ke superadmin' : 'Keluar'}</button>`;
}
