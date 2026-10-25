import { html, useState, useEffect, useRef, useCallback, cls } from './lib.js';
import { Icon } from './icons.js';

// ---------- host global untuk toast & dialog ----------
let hostSet = null;
const state = { toasts: [], dialog: null };
const refresh = () => hostSet && hostSet({ ...state });

export function toast(msg, type = 'ok', ms = 3500) {
  const id = Math.random();
  state.toasts = [...state.toasts, { id, msg, type }];
  refresh();
  setTimeout(() => { state.toasts = state.toasts.filter((t) => t.id !== id); refresh(); }, ms);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err', 5000);

/** Dialog konfirmasi → Promise<boolean> */
export function confirmDialog(message, { title = 'Konfirmasi', ok = 'Ya, lanjutkan', batal = 'Batal', danger = false, detail } = {}) {
  return new Promise((resolve) => {
    state.dialog = { kind: 'confirm', title, message, ok, batal, danger, detail, resolve };
    refresh();
  });
}
/** Dialog isian satu nilai → Promise<string|null> */
export function promptDialog(message, { title = 'Isi data', ok = 'Simpan', value = '', type = 'text', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    state.dialog = { kind: 'prompt', title, message, ok, value, type, placeholder, resolve };
    refresh();
  });
}
function closeDialog(v) {
  const d = state.dialog;
  state.dialog = null;
  refresh();
  d?.resolve(v);
}

export function Host() {
  const [s, set] = useState({ ...state });
  useEffect(() => { hostSet = set; return () => { hostSet = null; }; }, []);
  const d = s.dialog;
  return html`
    <div class="toasts" role="status" aria-live="polite">
      ${s.toasts.map((t) => html`<div key=${t.id} class=${cls('toast', t.type)}><${Icon} n=${t.type === 'err' ? 'alert' : 'check-circle'} s=${18} />${t.msg}</div>`)}
    </div>
    ${d && html`<${Modal} title=${d.title} onClose=${() => closeDialog(d.kind === 'confirm' ? false : null)}
      foot=${html`
        <button class="btn btn-o" onClick=${() => closeDialog(d.kind === 'confirm' ? false : null)}>${d.batal || 'Batal'}</button>
        <button class=${cls('btn', d.danger ? 'btn-d' : 'btn-p')} onClick=${() => closeDialog(d.kind === 'confirm' ? true : document.getElementById('dlg-in').value)}>${d.ok}</button>`}>
      <div style="font-size:15px;line-height:1.6;color:var(--text-2)">${d.message}</div>
      ${d.detail && html`<div class="small muted">${d.detail}</div>`}
      ${d.kind === 'prompt' && html`<input id="dlg-in" class="input" type=${d.type} value=${d.value} placeholder=${d.placeholder}
        onKeyDown=${(e) => e.key === 'Enter' && closeDialog(e.target.value)} ref=${(el) => el && setTimeout(() => el.focus(), 30)} />`}
    <//>`}
  `;
}

// ---------- komponen dasar ----------
export function Modal({ title, sub, onClose, children, foot, size }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="modal-bg" onMouseDown=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class=${cls('modal', size)} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head">
        <div class="grow col gap-4"><h2>${title}</h2>${sub && html`<span class="small muted">${sub}</span>`}</div>
        ${onClose && html`<button class="icon-btn sm" aria-label="Tutup" onClick=${onClose}><${Icon} n="x" /></button>`}
      </div>
      <div class="modal-body">${children}</div>
      ${foot && html`<div class="modal-foot">${foot}</div>`}
    </div>
  </div>`;
}

/** Label di atas, kontrol di tengah, keterangan di bawah. Dalam .form-grid ketiganya sejajar antar-kolom (subgrid). */
export function Field({ label, hint, children, style }) {
  return html`<label class="field" style=${style}><span class="field-label">${label}</span><span class="field-ctl">${children}</span>${hint ? html`<span class="hint">${hint}</span>` : html`<span class="hint" aria-hidden="true"></span>`}</label>`;
}

export function Switch({ checked, onChange, label, disabled }) {
  return html`<label class="switch">
    <input type="checkbox" checked=${!!checked} disabled=${disabled} onChange=${(e) => onChange?.(e.target.checked)} aria-label=${label} />
    <span class="track"><span class="knob"></span></span>${label && html`<span class="sr-only">${label}</span>`}
  </label>`;
}

export const Chip = ({ c = '', children, icon }) => html`<span class=${cls('chip', c)}>${icon && html`<${Icon} n=${icon} s=${12} />`}${children}</span>`;

export function Stat({ icon, tone = 'sky', value, label, sub }) {
  return html`<div class="card stat"><span class=${cls('tile', `t-${tone}`)}><${Icon} n=${icon} s=${22} /></span>
    <span class="col gap-4" style="gap:0"><strong class="num">${value}</strong><span>${label}</span>${sub && html`<span class="tiny">${sub}</span>`}</span></div>`;
}

export const Loading = ({ text = 'Memuat…' }) => html`<div class="loading"><span class="spinner"></span>${text}</div>`;

export function Empty({ icon = 'info', title, children }) {
  return html`<div class="empty"><span class="tile t-sky"><${Icon} n=${icon} s=${26} /></span><strong style="color:var(--ink)">${title}</strong>${children && html`<div class="small">${children}</div>`}</div>`;
}

export function ErrorBox({ error, retry }) {
  return html`<div class="card pad row" style="background:var(--red-50);border-color:var(--red-100)">
    <span class="tile t-red"><${Icon} n="alert" /></span><span class="grow">${error?.message || String(error)}</span>
    ${retry && html`<button class="btn btn-o btn-sm" onClick=${retry}>Coba lagi</button>`}</div>`;
}

export function PageHead({ title, sub, children, back }) {
  return html`<header class="page-head">
    ${back && html`<a href=${back} class="icon-btn" aria-label="Kembali"><${Icon} n="chev-l" /></a>`}
    <div class="title"><h1>${title}</h1>${sub && html`<span>${sub}</span>`}</div>
    ${children}
  </header>`;
}

export function Seg({ items, value, onChange, soft }) {
  return html`<div class=${cls('seg', soft && 'soft')} role="tablist">
    ${items.map((it) => html`<button role="tab" aria-selected=${value === it.value} class=${value === it.value ? 'on' : ''} onClick=${() => onChange(it.value)}>
      ${it.icon && html`<${Icon} n=${it.icon} s=${16} />`}${it.label}${it.count != null && html` <span class="tiny" style="opacity:.75">· ${it.count}</span>`}</button>`)}
  </div>`;
}

export function Pager({ halaman, per, total, onChange }) {
  const maks = Math.max(1, Math.ceil(total / per));
  if (total <= per) return html`<span class="small muted">${total} data</span>`;
  const pages = [];
  for (let i = Math.max(1, halaman - 2); i <= Math.min(maks, halaman + 2); i++) pages.push(i);
  return html`<div class="row wrap" style="justify-content:space-between;width:100%">
    <span class="small muted">Menampilkan ${(halaman - 1) * per + 1}–${Math.min(total, halaman * per)} dari ${total}</span>
    <span class="row gap-4">
      <button class="icon-btn" style="width:38px;height:38px" aria-label="Sebelumnya" disabled=${halaman <= 1} onClick=${() => onChange(halaman - 1)}><${Icon} n="chev-l" s=${18} /></button>
      ${pages.map((p) => html`<button class=${cls('icon-btn', p === halaman && 'on')} style=${`width:38px;height:38px;font-weight:800;${p === halaman ? 'background:var(--tombol);border:0;color:#fff' : ''}`} onClick=${() => onChange(p)}>${p}</button>`)}
      <button class="icon-btn" style="width:38px;height:38px" aria-label="Berikutnya" disabled=${halaman >= maks} onClick=${() => onChange(halaman + 1)}><${Icon} n="chev-r" s=${18} /></button>
    </span>
  </div>`;
}

/** Input + daftar saran; bisa memilih dari daftar atau mengetik nilai baru. */
export function Combobox({ value, options = [], onChange, placeholder, disabled, allowNew = true, id }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || '');
  const [hi, setHi] = useState(0);
  const ref = useRef();
  useEffect(() => setQ(value || ''), [value]);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); if (q !== (value || '')) onChange(q.trim()); } };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [q, value]);
  const norm = (s) => s.toLowerCase();
  const list = options.filter((o) => norm(o).includes(norm(q.trim()))).slice(0, 50);
  const exact = options.some((o) => norm(o) === norm(q.trim()));
  const items = [...list.map((o) => ({ v: o })), ...(allowNew && q.trim() && !exact ? [{ v: q.trim(), baru: true }] : [])];
  const pick = (v) => { setQ(v); onChange(v); setOpen(false); };
  return html`<div class="combo" ref=${ref}>
    <input id=${id} class="input" value=${q} placeholder=${placeholder} disabled=${disabled} autocomplete="off" role="combobox" aria-expanded=${open}
      onFocus=${() => setOpen(true)} onInput=${(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
      onKeyDown=${(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(items.length - 1, hi + 1)); setOpen(true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, hi - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[hi]) pick(items[hi].v); else pick(q.trim()); }
        else if (e.key === 'Escape') setOpen(false);
        else if (e.key === 'Tab') { setOpen(false); if (q !== (value || '')) onChange(q.trim()); }
      }} />
    ${open && !disabled && items.length > 0 && html`<ul class="combo-list" role="listbox">
      ${items.map((it, i) => html`<li role="option" aria-selected=${i === hi} class=${it.baru ? 'new' : ''} onMouseDown=${(e) => { e.preventDefault(); pick(it.v); }}>
        ${it.baru ? html`+ Tambah “${it.v}”` : it.v}</li>`)}
    </ul>`}
  </div>`;
}

/** Ambil data async dengan status loading/error dan fungsi muat ulang. */
export function useAsync(fn, deps = []) {
  const [st, set] = useState({ loading: true, error: null, data: null });
  const tick = useRef(0);
  const load = useCallback(async (quiet) => {
    const my = ++tick.current;
    if (!quiet) set((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === tick.current) set({ loading: false, error: null, data });
    } catch (error) {
      if (my === tick.current) set((s) => ({ loading: false, error, data: quiet ? s.data : null }));
    }
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load, setData: (d) => set((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function Avatar({ nama, tone = 'sky', size = 38 }) {
  const ini = String(nama || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return html`<span class=${cls('tile round', `t-${tone}`)} style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px`}>${ini}</span>`;
}

export function Bar({ value, tone }) {
  return html`<div class=${cls('bar', tone)}><span style=${`width:${Math.max(0, Math.min(100, value || 0))}%`}></span></div>`;
}

/** Unggah satu berkas gambar ke server → URL. */
export async function unggahGambar(file, { maksMB = 3 } = {}) {
  if (!file) return null;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Pilih gambar PNG, JPG, GIF, atau WEBP.');
  if (file.size > maksMB * 1024 * 1024) throw new Error(`Ukuran gambar maksimal ${maksMB} MB.`);
  const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  const { post } = await import('./api.js');
  return (await post('unggah', { dataUrl })).url;
}

/** Kotak pilih gambar dengan pratinjau. */
export function PilihGambar({ label, url, onChange, tinggi = 96, lebar = 160, latar = '#fff', kosong = 'Belum ada gambar', extra }) {
  const [busy, setBusy] = useState(false);
  const pilih = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    setBusy(true);
    try { onChange(await unggahGambar(f)); } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  return html`<div class="col" style="gap:8px">
    <span class="label">${label}</span>
    <div class="row wrap" style="gap:12px;align-items:center">
      <span style=${`width:${lebar}px;height:${tinggi}px;border-radius:14px;border:1px dashed var(--line-2);background:${latar};display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none`}>
        ${url ? html`<img src=${url} alt=${label} style="max-width:100%;max-height:100%;object-fit:contain" />` : html`<span class="tiny muted" style="padding:8px;text-align:center">${kosong}</span>`}</span>
      <div class="col" style="gap:6px">
        <label class="btn btn-s btn-sm" style="cursor:pointer"><${Icon} n="upload" s=${16} />${busy ? 'Mengunggah…' : url ? 'Ganti' : 'Unggah'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange=${pilih} /></label>
        ${extra}
        ${url && html`<button class="btn btn-g btn-sm" style="color:var(--red-700)" onClick=${() => onChange(null)}><${Icon} n="trash" s=${16} />Hapus</button>`}
      </div>
    </div>
  </div>`;
}
