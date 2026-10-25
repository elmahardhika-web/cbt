import { html, useState, useEffect, fmt, cls, singkat } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, put, del } from '../api.js';
import { openPrint } from '../router.js';
import { Loading, ErrorBox, Empty, Chip, Switch, Modal, Field, toast, toastErr, confirmDialog, promptDialog, useAsync, PageHead, Seg, Bar } from '../ui.js';
import { useMaster } from './soal.js';

const TONE = ['t-sky', 't-orange', 't-green', 't-violet', 't-pink', 't-amber'];
export const toneMapel = (kode) => TONE[[...String(kode)].reduce((a, c) => a + c.charCodeAt(0), 0) % TONE.length];

/** Halaman Ujian & Monitor (admin sekolah, juga guru dengan izin monitor). */
export function UjianMonitor({ npsn, bolehAtur = true }) {
  const { data, error, loading, reload } = useAsync(() => get('ujian', { npsn }), [npsn]);
  const [form, setForm] = useState(null);
  const [pilih, setPilih] = useState(null);
  useEffect(() => {
    if (data && !data.find((u) => u.id === pilih)) setPilih((data.find((u) => u.aktif) || data[0])?.id ?? null);
  }, [data]);
  const hidup = useLive(npsn || session.user.npsn, () => reload(true));
  useEffect(() => { const t = setInterval(() => reload(true), hidup ? 60e3 : 20e3); return () => clearInterval(t); }, [reload, hidup]);

  const toggle = async (u, v) => {
    try { await put(`ujian/${u.id}/aktif`, { aktif: v }); toast(v ? 'Ujian dibuka. Bagikan token ke siswa.' : 'Ujian ditutup.'); reload(true); } catch (e) { toastErr(e); }
  };
  const tokenBaru = async (u) => {
    try { const r = await post(`ujian/${u.id}/token`); toast(`Token baru: ${r.token}`); reload(true); } catch (e) { toastErr(e); }
  };
  const hapus = async (u) => {
    const ada = u.selesai + u.mengerjakan > 0;
    if (!(await confirmDialog(ada ? 'Ujian ini sudah punya hasil. Menghapusnya akan menghapus nilai siswa untuk jadwal ini.' : 'Hapus jadwal ujian ini?', { danger: true, ok: 'Hapus' }))) return;
    try { await del(`ujian/${u.id}`, { paksa: ada }); toast('Jadwal dihapus.'); reload(); } catch (e) { toastErr(e); }
  };
  return html`
    <${PageHead} title=${bolehAtur ? 'Ujian & Monitor' : 'Monitor Ujian'} sub="Atur jadwal, token, dan pantau peserta secara langsung">
      ${bolehAtur && html`<button class="btn btn-p" onClick=${() => setForm({})}><${Icon} n="plus" s=${18} />Buat Jadwal Ujian</button>`}
    <//>
    ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : data.length === 0 ? html`<div class="card"><${Empty} icon="calendar" title="Belum ada jadwal ujian">${bolehAtur ? 'Buat jadwal pertama untuk membuka ujian bagi siswa.' : 'Admin sekolah belum membuat jadwal.'}<//></div>` : html`
      <section class="grid-auto" style="--min:300px">
        ${data.map((u) => {
          const siap = u.paket.siap > 0 && u.paket.belum_ditelaah === 0;
          const sel = u.id === pilih;
          return html`<article class="card col" style=${`padding:18px;gap:14px;cursor:pointer;${sel ? 'border:2px solid var(--sky-400)' : ''}${!u.aktif ? ';background:#FBFDFF' : ''}`} onClick=${() => setPilih(u.id)}>
            <div class="row"><span class=${cls('tile', u.aktif ? toneMapel(u.mapel) : 't-slate')}>${singkat(u.mapel)}</span>
              <span class="col grow" style="gap:0;min-width:0"><strong class="ellipsis">${u.mapel_nama} · ${u.kategori_nama}</strong><span class="tiny muted">Paket ${u.mapel}-${u.kategori} · ${u.paket.siap} soal siap</span></span>
              ${bolehAtur && !u.massal_id && html`<span onClick=${(e) => e.stopPropagation()}><${Switch} checked=${!!u.aktif} label="Ujian dibuka" onChange=${(v) => toggle(u, v)} /></span>`}</div>
            ${u.massal_id && html`<span class="chip violet" style="align-self:flex-start"><${Icon} n="layers" s=${12} />Ujian massal dari pusat${u.massal_nama ? ` · ${u.massal_nama}` : ''}</span>`}
            <div class="row wrap gap-8">
              ${u.aktif ? html`<${Chip} c="green"><span class="dot live" style="width:7px;height:7px"></span>Dibuka<//>` : html`<${Chip}>Ditutup<//>`}
              <${Chip} icon="clock">${u.durasi} menit<//>
              <${Chip}>${u.sesi === 'SEMUA' ? 'Semua sesi' : u.sesi} · ${u.kelas === 'SEMUA' ? 'Semua kelas' : `Kelas ${u.kelas}`}<//>
              ${u.tanggal && html`<${Chip} icon="calendar">${fmt.tglPendek(u.tanggal)}${u.jam_mulai ? ` ${u.jam_mulai}` : ''}<//>`}
              ${u.paket.belum_ditelaah > 0 && html`<${Chip} c="amber" icon="alert">${u.paket.belum_ditelaah} soal belum ditelaah<//>`}
              ${u.paket.siap === 0 && html`<${Chip} c="red" icon="alert">Paket kosong<//>`}
            </div>
            <div class="row" style="padding:12px 14px;border-radius:16px;background:var(--sky-50);gap:8px" onClick=${(e) => e.stopPropagation()}>
              <span class="col grow" style="gap:0"><span class="tiny" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Token</span>
                <strong style="font-size:24px;letter-spacing:.16em">${u.token || '—'}</strong></span>
              <button class="icon-btn" style="width:40px;height:40px" aria-label="Salin token" onClick=${() => navigator.clipboard?.writeText(u.token).then(() => toast('Token disalin.'))}><${Icon} n="copy" s=${18} /></button>
              ${!u.massal_id && html`<button class="icon-btn" style="width:40px;height:40px;background:var(--tombol);border:0;color:#fff" aria-label="Buat token baru" onClick=${() => tokenBaru(u)}><${Icon} n="refresh" s=${18} /></button>`}
            </div>
            <div class="col gap-4" style="gap:6px"><div class="row tiny" style="justify-content:space-between;color:var(--text-2)"><span>${u.selesai} dari ${u.sasaran} selesai · ${u.mengerjakan} mengerjakan</span><strong>${u.sasaran ? Math.round((u.selesai / u.sasaran) * 100) : 0}%</strong></div>
              <${Bar} value=${u.sasaran ? (u.selesai / u.sasaran) * 100 : 0} /></div>
            ${u.massal_id ? html`<span class="tiny muted">Jadwal, token, dan buka/tutup ujian diatur superadmin. Sekolah memantau dan mencetak berita acara.</span>` : bolehAtur && html`<div class="row gap-8" onClick=${(e) => e.stopPropagation()}>
              <button class="btn btn-o btn-sm" onClick=${() => setForm(u)}><${Icon} n="edit" s=${16} />Ubah</button>
              <button class="btn btn-g btn-sm" style="color:var(--red-700)" onClick=${() => hapus(u)}><${Icon} n="trash" s=${16} />Hapus</button>
              ${!siap && !u.aktif && html`<span class="tiny muted right">${u.paket.siap === 0 ? 'Belum ada soal disetujui' : 'Menunggu telaah superadmin'}</span>`}
            </div>`}
          </article>`;
        })}
      </section>
      ${pilih && html`<${Monitor} key=${pilih} id=${pilih} onChange=${() => reload(true)} />`}
    `}
    ${form && html`<${FormUjian} awal=${form} npsn=${npsn} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); reload(); }} />`}
  `;
}

function FormUjian({ awal, npsn, onClose, onSaved }) {
  const master = useMaster();
  const [kelas, setKelas] = useState({ kelas: [], sesi: [] });
  const [f, setF] = useState({ mapel: '', kategori: '', durasi: 60, sesi: 'SEMUA', kelas: 'SEMUA', tanggal: '', jam_mulai: '', jam_selesai: '', acak: 1, ...awal });
  const [busy, setBusy] = useState(false);
  useEffect(() => { get('pengguna/kelas', { npsn }).then(setKelas).catch(() => {}); }, []);
  useEffect(() => { if (!f.mapel && master.mapel.length) setF((x) => ({ ...x, mapel: master.mapel.find((m) => m.aktif)?.kode || '', kategori: master.kategori.find((k) => k.aktif)?.kode || '' })); }, [master]);
  const set = (p) => setF({ ...f, ...p });
  const simpan = async () => {
    setBusy(true);
    try { if (awal.id) await put(`ujian/${awal.id}`, f); else await post('ujian', { ...f, npsn }); toast('Jadwal ujian disimpan.'); onSaved(); } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${awal.id ? 'Ubah jadwal ujian' : 'Buat jadwal ujian'} sub="Soal yang dipakai: semua soal aktif & disetujui pada paket mapel + kategori ini." onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-p" disabled=${busy} onClick=${simpan}>Simpan</button>`}>
    <div class="form-grid">
      <${Field} label="Mata pelajaran"><select class="select" value=${f.mapel} onChange=${(e) => set({ mapel: e.target.value })}>${master.mapel.filter((m) => m.aktif || m.kode === f.mapel).map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select><//>
      <${Field} label="Kategori"><select class="select" value=${f.kategori} onChange=${(e) => set({ kategori: e.target.value })}>${master.kategori.filter((k) => k.aktif || k.kode === f.kategori).map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select><//>
      <${Field} label="Durasi pengerjaan (menit)" hint="dijeda bila siswa terkendala"><input class="input" type="number" min="1" max="600" value=${f.durasi} onInput=${(e) => set({ durasi: e.target.value })} /><//>
      <${Field} label="Sesi"><select class="select" value=${f.sesi} onChange=${(e) => set({ sesi: e.target.value })}><option value="SEMUA">Semua sesi</option>${[...new Set([...kelas.sesi, 'Sesi 1', 'Sesi 2', 'Sesi 3'])].sort().map((s) => html`<option value=${s}>${s}</option>`)}</select><//>
      <${Field} label="Kelas"><select class="select" value=${f.kelas} onChange=${(e) => set({ kelas: e.target.value })}><option value="SEMUA">Semua kelas</option>${kelas.kelas.map((k) => html`<option value=${k}>${k}</option>`)}</select><//>
      <${Field} label="Tanggal" hint="opsional"><input class="input" type="date" value=${f.tanggal || ''} onInput=${(e) => set({ tanggal: e.target.value })} /><//>
      <${Field} label="Jam mulai" hint="opsional"><input class="input" type="time" value=${f.jam_mulai || ''} onInput=${(e) => set({ jam_mulai: e.target.value })} /><//>
      <${Field} label="Jam selesai sesi" hint="ujian otomatis dikumpulkan"><input class="input" type="time" value=${f.jam_selesai || ''} onInput=${(e) => set({ jam_selesai: e.target.value })} /><//>
    </div>
    <div class="row small" style="padding:12px 14px;border-radius:14px;background:var(--sky-50);color:#1B3358;align-items:flex-start"><${Icon} n="info" s=${18} />
      <span>Durasi dihitung per siswa dan berhenti saat siswa terlogout atau perangkatnya terputus lebih dari 3 menit, lalu berjalan lagi saat ia login. Bila tanggal dan jam selesai diisi, semua jawaban otomatis dikirim dan ujian dinyatakan selesai tepat pada jam tersebut.</span></div>
    <label class="check"><input type="checkbox" checked=${!!f.acak} onChange=${(e) => set({ acak: e.target.checked ? 1 : 0 })} />Acak urutan soal untuk tiap siswa</label>
  <//>`;
}

const STATUS = {
  belum: ['Belum mulai', ''], mengerjakan: ['Mengerjakan', 'sky'], jeda: ['Waktu dijeda', 'amber'], terkunci: ['Terkunci', 'red'],
  selesai: ['Selesai', 'green'], absen: ['Tidak hadir', 'outline'],
};
const KARENA = { siswa: 'oleh siswa', waktu: 'waktu habis', jam: 'jam sesi habis', proktor: 'oleh proktor' };

/** Berlangganan siaran langsung dari server; panggil onUpdate setiap ada perubahan. */
export function useLive(npsn, onUpdate) {
  const [hidup, setHidup] = useState(false);
  useEffect(() => {
    if (!window.EventSource || !npsn) return;
    const q = new URLSearchParams({ token: session.token || '', ...(npsn ? { npsn } : {}) });
    const es = new EventSource(`/api/stream/monitor?${q}`);
    const f = () => onUpdate();
    es.addEventListener('hello', () => setHidup(true));
    es.addEventListener('update', f);
    es.addEventListener('tick', f);
    es.onerror = () => setHidup(false);
    es.onopen = () => setHidup(true);
    return () => es.close();
  }, [npsn]);
  return hidup;
}

export function Monitor({ id, onChange }) {
  const { data, error, loading, reload } = useAsync(() => get(`ujian/${id}/monitor`).then((d) => ({ ...d, _diterima: Date.now() })), [id]);
  const [filter, setFilter] = useState('semua');
  const [ba, setBa] = useState(false);
  const [, tick] = useState(0);
  const hidup = useLive(data?.ujian?.npsn || session.user.npsn, () => reload(true));
  // cadangan bila siaran langsung terputus + hitung mundur sisa waktu tiap detik
  useEffect(() => { const t = setInterval(() => reload(true), hidup ? 60e3 : 8e3); return () => clearInterval(t); }, [reload, hidup]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (loading && !data) return html`<div class="card"><${Loading} /></div>`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const r = data.ringkasan;
  const umur = Date.now() - (data._diterima || Date.now());
  const rows = data.peserta.filter((p) => filter === 'semua' || (filter === 'perhatian' ? p.perhatian || p.status === 'terkunci'
    : filter === 'mengerjakan' ? ['mengerjakan', 'jeda', 'terkunci'].includes(p.status) : filter === 'online' ? p.online : p.status === filter));
  const aksi = async (p, jenis) => {
    const base = `ujian/${id}/peserta/${p.siswa_id}`;
    try {
      if (jenis === 'login') { await post(`pengguna/${p.siswa_id}/reset-login`); toast(`Login ${p.nama} direset. Siswa bisa masuk lagi dan waktunya dilanjutkan.`); }
      if (jenis === 'reset') { if (!(await confirmDialog(`Reset ujian ${p.nama}? Semua jawaban siswa ini untuk ujian ini akan dihapus.`, { danger: true, ok: 'Reset ujian' }))) return; await post(`${base}/reset`); toast('Ujian siswa direset.'); }
      if (jenis === 'selesai') { if (!(await confirmDialog(`Kumpulkan paksa jawaban ${p.nama} sekarang?`, { ok: 'Kumpulkan' }))) return; await post(`${base}/selesai`); toast('Jawaban dikumpulkan.'); }
      if (jenis === 'waktu') { const m = await promptDialog(`Tambah waktu untuk ${p.nama} (menit).`, { title: 'Tambah waktu', type: 'number', value: '5' }); if (!m) return; await post(`${base}/tambah-waktu`, { menit: +m }); toast(`Waktu ditambah ${m} menit.`); }
      if (jenis === 'absen') { await post(`${base}/absen`); toast(p.status === 'absen' ? 'Tanda tidak hadir dibatalkan.' : 'Ditandai tidak hadir.'); }
      reload(true); onChange?.();
    } catch (e) { toastErr(e); }
  };
  return html`<section class="card col" style="gap:0">
    <div class="card-head">
      <div class="col grow" style="gap:2px;min-width:240px"><h2>Monitor Peserta</h2>
        <span class="row gap-8 small muted"><span class=${hidup ? 'dot live' : 'dot'} style=${hidup ? '' : 'color:var(--amber-500)'}></span>${hidup ? 'Real-time' : 'Menyambungkan ulang…'} · ${data.ujian.mapel_nama} ${data.ujian.kategori_nama} · ${data.ujian.sesi === 'SEMUA' ? 'Semua sesi' : data.ujian.sesi}${data.ujian.batas_jam ? ` · sesi berakhir ${fmt.jam(data.ujian.batas_jam)}` : ''}</span></div>
      <button class="btn btn-o" onClick=${() => setBa(true)}><${Icon} n="printer" s=${18} />Cetak Berita Acara</button>
    </div>
    <div class="row wrap gap-8" style="padding:14px 20px;border-bottom:1px solid var(--line)">
      ${[['semua', `Semua · ${r.total}`], ['online', `Online · ${r.online}`], ['mengerjakan', `Mengerjakan · ${r.mengerjakan}`], ['selesai', `Selesai · ${r.selesai}`], ['belum', `Belum mulai · ${r.belum}`], ['absen', `Tidak hadir · ${r.absen}`]].map(([k, l]) =>
        html`<button class=${cls('btn btn-sm', filter === k ? '' : 'btn-o')} style=${filter === k ? 'background:var(--ink);color:#fff' : ''} onClick=${() => setFilter(k)}>${l}</button>`)}
      ${r.perhatian > 0 && html`<button class="btn btn-sm" style="background:var(--amber-100);color:var(--amber-800)" onClick=${() => setFilter('perhatian')}><${Icon} n="alert" s=${14} />Perlu perhatian · ${r.perhatian}</button>`}
      ${r.terkunci > 0 && html`<span class="chip red" style="align-self:center"><${Icon} n="lock" s=${12} />${r.terkunci} terkunci — perlu reset login</span>`}
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Peserta</th><th>Kelas</th><th>Koneksi</th><th>Status</th><th style="min-width:170px">Progres</th><th class="c">Ragu</th><th>Sisa / Selesai</th><th class="r">Aksi</th></tr></thead>
      <tbody>
        ${rows.length === 0 && html`<tr><td colspan="8"><${Empty} icon="users" title="Tidak ada peserta pada filter ini" /></td></tr>`}
        ${rows.map((p) => {
          const sisaLokal = p.sisa == null ? null : p.berjalan ? Math.max(0, p.sisa - umur) : p.sisa;
          return html`<tr class=${p.status === 'terkunci' || p.perhatian ? 'warn' : ''}>
          <td><span class="col" style="gap:0"><strong>${p.nama}</strong><span class="tiny muted">${p.username}</span></span></td>
          <td>${p.kelas}</td>
          <td>${p.online ? html`<${Chip} c="green"><span class="dot" style="background:var(--green-500)"></span>Online<//>`
            : html`<span class="col" style="gap:0"><${Chip}><span class="dot" style="background:#94A3B8"></span>Offline<//>${p.last_active ? html`<span class="tiny muted">${fmt.relatif(p.last_active)}</span>` : ''}</span>`}</td>
          <td>${p.status === 'terkunci' ? html`<${Chip} c="red" icon="lock">Terkunci · upaya keluar<//>`
            : p.perhatian ? html`<span class="col" style="gap:2px"><${Chip} c=${STATUS[p.status][1]}>${STATUS[p.status][0]}<//><span class="tiny" style="color:var(--amber-800)">keluar layar ${p.keluar_layar}×</span></span>`
            : html`<span class="col" style="gap:2px"><${Chip} c=${STATUS[p.status][1]}>${STATUS[p.status][0]}<//>${p.status === 'selesai' && p.selesai_karena ? html`<span class="tiny muted">${KARENA[p.selesai_karena]}</span>` : ''}</span>`}</td>
          <td><span class="row gap-8"><span class=${cls('bar grow', p.status === 'selesai' && 'green')}><span style=${`width:${p.total ? (p.dijawab / p.total) * 100 : 0}%`}></span></span><span class="tiny num" style="font-weight:700">${p.dijawab}/${p.total || '–'}</span></span></td>
          <td class="c">${p.ragu || '–'}</td>
          <td class="num">${['mengerjakan', 'jeda', 'terkunci'].includes(p.status) ? html`${fmt.durasi(sisaLokal)}${!p.berjalan ? html` <span class="tiny" style="color:var(--amber-800)">(dijeda)</span>` : ''}` : p.status === 'selesai' ? fmt.jam(p.selesai_at) : '–'}</td>
          <td class="r"><span class="row gap-4" style="justify-content:flex-end">
            ${(p.status === 'terkunci' || ((p.status === 'mengerjakan' || p.status === 'jeda' || p.status === 'belum') && p.online)) && html`<button class=${cls('btn btn-sm', p.status === 'terkunci' ? 'btn-p' : 'btn-s')} onClick=${() => aksi(p, 'login')}>Reset Login</button>`}
            ${['mengerjakan', 'jeda', 'terkunci'].includes(p.status) && html`
              <button class="icon-btn sm" title="Tambah waktu" aria-label="Tambah waktu" onClick=${() => aksi(p, 'waktu')}><${Icon} n="clock" s=${18} /></button>
              <button class="icon-btn sm" title="Kumpulkan paksa" aria-label="Kumpulkan paksa" onClick=${() => aksi(p, 'selesai')}><${Icon} n="check-circle" s=${18} /></button>`}
            ${p.status === 'belum' && html`<button class="btn btn-o btn-sm" onClick=${() => aksi(p, 'absen')}>Tandai Absen</button>`}
            ${p.status === 'absen' && html`<button class="btn btn-o btn-sm" onClick=${() => aksi(p, 'absen')}>Batalkan Absen</button>`}
            ${p.status !== 'belum' && p.status !== 'absen' && html`<button class="icon-btn sm danger" title="Reset ujian siswa" aria-label="Reset ujian siswa" onClick=${() => aksi(p, 'reset')}><${Icon} n="refresh" s=${18} /></button>`}
          </span></td>
                </tr>`; })}
      </tbody></table></div>
    ${ba && html`<${FormBeritaAcara} id=${id} onClose=${() => setBa(false)} />`}
  </section>`;
}

function FormBeritaAcara({ id, onClose }) {
  const [f, setF] = useState({ ruang: '', pengawas: '', nip_pengawas: '', proktor: session.user.peran === 'admin' ? '' : session.user.nama, nip_proktor: '', catatan: '' });
  const set = (p) => setF({ ...f, ...p });
  return html`<${Modal} title="Berita Acara Pelaksanaan" sub="Data kehadiran dan kejadian keluar layar diisi otomatis dari monitor." onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-p" onClick=${() => { openPrint(`/cetak/berita-acara/${id}`, f); onClose(); }}><${Icon} n="printer" s=${18} />Buka untuk dicetak</button>`}>
    <div class="form-grid">
      <${Field} label="Ruang"><input class="input" value=${f.ruang} onInput=${(e) => set({ ruang: e.target.value })} placeholder="Lab Komputer 1" /><//>
      <${Field} label="Nama pengawas"><input class="input" value=${f.pengawas} onInput=${(e) => set({ pengawas: e.target.value })} /><//>
      <${Field} label="NIP pengawas"><input class="input" value=${f.nip_pengawas} onInput=${(e) => set({ nip_pengawas: e.target.value })} /><//>
      <${Field} label="Nama proktor"><input class="input" value=${f.proktor} onInput=${(e) => set({ proktor: e.target.value })} /><//>
      <${Field} label="NIP proktor"><input class="input" value=${f.nip_proktor} onInput=${(e) => set({ nip_proktor: e.target.value })} /><//>
    </div>
    <${Field} label="Catatan tambahan" hint="opsional"><textarea class="textarea" rows="3" value=${f.catatan} onInput=${(e) => set({ catatan: e.target.value })}></textarea><//>
  <//>`;
}
