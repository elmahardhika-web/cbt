// Superadmin: tinjau pengajuan akun sekolah — setujui (sekolah + admin dibuat otomatis) atau tolak dengan alasan.
import { html, useState, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { get, post, del } from '../api.js';
import { Loading, ErrorBox, Empty, Chip, Modal, Field, toast, toastErr, confirmDialog, useAsync, PageHead, Seg } from '../ui.js';
import { labelWilayah } from '../wilayah.js';

const STATUS = { menunggu: ['Menunggu', 'amber'], disetujui: ['Disetujui', 'green'], ditolak: ['Ditolak', 'red'] };
const wa = (hp) => `https://wa.me/${String(hp).replace(/\D/g, '').replace(/^0/, '62')}`;

export function PengajuanAkun() {
  const [status, setStatus] = useState('menunggu');
  const r = useAsync(() => get('pengajuan/ringkasan'), []);
  const a = useAsync(() => get('pengajuan', { status: status === 'semua' ? '' : status }), [status]);
  const [tolak, setTolak] = useState(null);
  const muatUlang = () => { a.reload(true); r.reload(true); };
  const n = r.data || {};

  const setujui = async (p) => {
    const ok = await confirmDialog(`Setujui pengajuan ${p.nama}?`, {
      title: 'Setujui pengajuan', ok: 'Setujui & aktifkan',
      detail: `Sekolah (NPSN ${p.npsn}) dan akun admin "${p.admin_username}" akan dibuat. Pemohon langsung bisa masuk memakai password yang dibuatnya.`,
    });
    if (!ok) return;
    try { await post(`pengajuan/${p.id}/setujui`); toast(`${p.nama} disetujui. Akun admin ${p.admin_username} aktif.`); muatUlang(); } catch (e) { toastErr(e); }
  };
  const hapus = async (p) => {
    if (!(await confirmDialog(`Hapus catatan pengajuan ${p.nama}?`, { danger: true, ok: 'Hapus', detail: 'Hanya catatan pengajuan yang dihapus. Sekolah yang sudah disetujui tetap ada.' }))) return;
    try { await del(`pengajuan/${p.id}`); toast('Catatan pengajuan dihapus.'); muatUlang(); } catch (e) { toastErr(e); }
  };
  const salin = () => { const u = `${location.origin}/#/ajukan`; navigator.clipboard?.writeText(u).then(() => toast('Tautan formulir disalin.')); };

  return html`
    <${PageHead} title="Pengajuan Akun Sekolah" sub="Sekolah mengajukan akun dari halaman depan; periksa datanya lalu setujui atau tolak.">
      <button class="btn btn-o" onClick=${salin}><${Icon} n="copy" s=${18} />Salin tautan formulir</button>
    <//>
    <${Seg} soft items=${[['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['semua', 'Semua']].map(([v, l]) =>
      ({ value: v, label: l, count: v === 'semua' ? (n.menunggu || 0) + (n.disetujui || 0) + (n.ditolak || 0) : n[v] || 0 }))} value=${status} onChange=${setStatus} />
    ${a.loading && !a.data ? html`<${Loading} />` : a.error ? html`<${ErrorBox} error=${a.error} retry=${a.reload} />`
      : !a.data.length ? html`<div class="card"><${Empty} icon="check-circle" title=${status === 'menunggu' ? 'Tidak ada pengajuan yang menunggu' : 'Belum ada pengajuan'}>
          Bagikan tautan formulir <strong>${location.origin}/#/ajukan</strong> kepada sekolah yang ingin bergabung.<//></div>`
      : html`<div class="col" style="gap:14px">${a.data.map((p) => html`<${Kartu} p=${p} onSetujui=${setujui} onTolak=${setTolak} onHapus=${hapus} />`)}</div>`}
    ${tolak && html`<${ModalTolak} p=${tolak} onClose=${() => setTolak(null)} onDone=${() => { setTolak(null); muatUlang(); }} />`}`;
}

function Kartu({ p, onSetujui, onTolak, onHapus }) {
  const [label, warna] = STATUS[p.status];
  const bentrok = p.status === 'menunggu' && !!(p.npsn_terdaftar || p.username_terpakai);
  return html`<article class="card pad col" style="gap:12px">
    <div class="row wrap" style="justify-content:space-between;gap:10px;align-items:flex-start">
      <div class="col" style="gap:4px;min-width:0">
        <div class="row wrap" style="gap:8px"><strong style="font-size:17px">${p.nama}</strong><${Chip} c=${warna}>${label}<//></div>
        <span class="small muted">NPSN ${p.npsn} · ${labelWilayah(p) || '-'}${p.alamat ? ` · ${p.alamat}` : ''}</span>
      </div>
      <span class="tiny muted" style="white-space:nowrap">${p.kode} · ${fmt.relatif(p.dibuat_at)}</span>
    </div>
    <div class="grid-auto" style="--min:220px;gap:10px">
      <div class="col small" style="gap:2px;padding:10px 12px;border-radius:12px;background:var(--surface-2)"><span class="tiny muted">Pemohon</span>
        <strong>${p.pemohon_nama}${p.pemohon_jabatan ? html` <span class="muted" style="font-weight:600">· ${p.pemohon_jabatan}</span>` : ''}</strong>
        <span class="row wrap" style="gap:10px"><a href=${`mailto:${p.pemohon_email}`}>${p.pemohon_email}</a><a href=${wa(p.pemohon_hp)} target="_blank" rel="noopener">${p.pemohon_hp}</a></span></div>
      <div class="col small" style="gap:2px;padding:10px 12px;border-radius:12px;background:var(--surface-2)"><span class="tiny muted">Akun admin yang diminta</span>
        <strong class="num">${p.admin_username}</strong><span class="tiny muted">password dibuat sendiri oleh pemohon</span></div>
    </div>
    ${p.catatan && html`<div class="small" style="padding:10px 12px;border-radius:12px;background:var(--sky-50)"><strong>Catatan:</strong> ${p.catatan}</div>`}
    ${p.alasan && html`<div class="small" style="padding:10px 12px;border-radius:12px;background:var(--red-50)"><strong>Alasan ditolak:</strong> ${p.alasan}</div>`}
    ${bentrok && html`<div class="row small" style="padding:10px 12px;border-radius:12px;background:var(--amber-50);gap:8px"><${Icon} n="alert" s=${18} />
      <span>${p.npsn_terdaftar ? `NPSN ${p.npsn} sudah terdaftar sebagai sekolah. ` : ''}${p.username_terpakai ? `Username ${p.admin_username} sudah dipakai akun lain. ` : ''}Pengajuan ini tidak bisa disetujui — tolak dan minta pemohon memperbaiki datanya.</span></div>`}
    ${p.diputus_at && html`<span class="tiny muted">Diputuskan ${fmt.tanggal(p.diputus_at)} oleh ${p.diputus_oleh || '-'}</span>`}
    <div class="row wrap" style="gap:8px;justify-content:flex-end">
      ${p.status === 'menunggu' && html`
        <button class="btn btn-o" onClick=${() => onTolak(p)}><${Icon} n="x" s=${18} />Tolak</button>
        <button class="btn btn-p" disabled=${bentrok} onClick=${() => onSetujui(p)}><${Icon} n="check" s=${18} />Setujui</button>`}
      ${p.status === 'disetujui' && html`<a class="btn btn-o btn-sm" href=${`#/pusat/sekolah/${p.npsn}/profil`}><${Icon} n="award" s=${16} />Lihat sekolah</a>`}
      ${p.status !== 'menunggu' && html`<button class="btn btn-g btn-sm" onClick=${() => onHapus(p)}><${Icon} n="trash" s=${16} />Hapus catatan</button>`}
    </div>
  </article>`;
}

function ModalTolak({ p, onClose, onDone }) {
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const kirim = async () => {
    if (!alasan.trim()) return toast('Tuliskan alasan penolakan.', 'err');
    setBusy(true);
    try { await post(`pengajuan/${p.id}/tolak`, { alasan }); toast('Pengajuan ditolak.'); onDone(); } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${Modal} title="Tolak pengajuan" sub=${`${p.nama} — alasan ini terlihat oleh pemohon saat mengecek status.`} onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-d" disabled=${busy} onClick=${kirim}>Tolak pengajuan</button>`}>
    <${Field} label="Alasan penolakan"><textarea class="input" rows="3" maxlength="500" value=${alasan} placeholder="mis. NPSN tidak cocok dengan nama sekolah. Silakan ajukan ulang dengan data yang benar." onInput=${(e) => setAlasan(e.target.value)}></textarea><//>
  <//>`;
}
