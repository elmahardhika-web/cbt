// Tombol "Bantuan" melayang di pojok kanan bawah: daftar kontak helpdesk dari Pengaturan pusat.
import { html, useState, useEffect, useRef } from './lib.js';
import { Icon } from './icons.js';
import { session } from './api.js';

const IKON = { whatsapp: 'chat', telepon: 'phone', email: 'mail', telegram: 'send', tautan: 'external' };
const LABEL = { whatsapp: 'WhatsApp', telepon: 'Telepon', email: 'Email', telegram: 'Telegram', tautan: 'Tautan' };

/** Jenis kontak: dari pengaturan, atau ditebak dari isi kontak untuk data lama. */
export function jenisKontak(h) {
  if (h.jenis) return h.jenis;
  const k = String(h.kontak || '');
  if (/@/.test(k) && !/^https?:/i.test(k)) return 'email';
  if (/^https?:\/\/(t\.me|telegram)/i.test(k)) return 'telegram';
  if (/^https?:/i.test(k)) return 'tautan';
  return /^(\+?62|0)8/.test(k.replace(/[\s-]/g, '')) ? 'whatsapp' : 'telepon';
}

export function tautanKontak(h) {
  const k = String(h.kontak || '').trim();
  const angka = k.replace(/\D/g, '');
  switch (jenisKontak(h)) {
    case 'whatsapp': return `https://wa.me/${angka.replace(/^0/, '62')}`;
    case 'telepon': return `tel:${k.replace(/[^\d+]/g, '')}`;
    case 'email': return `mailto:${k}`;
    case 'telegram': return /^https?:/i.test(k) ? k : `https://t.me/${k.replace(/^@/, '')}`;
    default: return /^https?:/i.test(k) ? k : `https://${k}`;
  }
}

export function KontakHelpdesk({ h }) {
  const j = jenisKontak(h);
  return html`<a href=${tautanKontak(h)} target=${j === 'telepon' || j === 'email' ? undefined : '_blank'} rel="noopener">
    <span class=${`kanal ${j}`}><${Icon} n=${IKON[j]} s=${18} /></span>
    <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${h.nama}</strong>
      <span class="tiny muted ellipsis">${LABEL[j]} · ${h.kontak}${h.jam ? ` · ${h.jam}` : ''}</span></span>
    <${Icon} n="chev-r" s=${16} /></a>`;
}

export function HelpdeskFab() {
  const [buka, setBuka] = useState(false);
  const ref = useRef();
  const list = session.info?.helpdesk || [];
  useEffect(() => {
    if (!buka) return undefined;
    const tutup = (e) => { if (ref.current && !ref.current.contains(e.target)) setBuka(false); };
    const esc = (e) => e.key === 'Escape' && setBuka(false);
    document.addEventListener('mousedown', tutup);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', tutup); document.removeEventListener('keydown', esc); };
  }, [buka]);
  if (!list.length) return null;
  return html`<div class="helpdesk-fab no-print" ref=${ref}>
    ${buka && html`<div class="helpdesk-panel" role="dialog" aria-label="Hubungi helpdesk">
      <header><span class="col grow" style="gap:2px"><strong>Butuh bantuan?</strong><span class="tiny muted">Hubungi tim helpdesk ${session.info?.nama_instansi || 'pusat'}.</span></span>
        <button class="icon-btn sm" aria-label="Tutup" onClick=${() => setBuka(false)}><${Icon} n="x" s=${18} /></button></header>
      ${list.map((h) => html`<${KontakHelpdesk} h=${h} />`)}
    </div>`}
    <button class="pemicu" aria-expanded=${buka} onClick=${() => setBuka(!buka)}>
      <${Icon} n="headset" s=${20} /><span class="label">Helpdesk</span><span class="titik" aria-hidden="true"></span></button>
  </div>`;
}
