import { html, useState, useEffect } from './lib.js';
import { get } from './api.js';
import { Field, Combobox } from './ui.js';

let cache = null;
export async function dataWilayah() {
  if (!cache) cache = fetch('/data/wilayah.json').then((r) => r.json()).then((d) => d.provinsi);
  return cache;
}

/**
 * Pilihan wilayah bertingkat: provinsi → kab/kota (data resmi) → kecamatan → kelurahan (diketik sekolah, disarankan dari isian sebelumnya).
 * value: { provinsi_kode, provinsi, kabkota_kode, kabkota, kecamatan, kelurahan }
 */
export function WilayahFields({ value, onChange, disabled }) {
  const [prov, setProv] = useState([]);
  const [kec, setKec] = useState([]);
  const [kel, setKel] = useState([]);
  const v = value || {};
  useEffect(() => { dataWilayah().then(setProv); }, []);
  useEffect(() => {
    setKec([]);
    if (v.kabkota_kode) get('wilayah/kecamatan', { kabkota: v.kabkota_kode }).then(setKec).catch(() => {});
  }, [v.kabkota_kode]);
  useEffect(() => {
    setKel([]);
    if (v.kabkota_kode && v.kecamatan) get('wilayah/kelurahan', { kabkota: v.kabkota_kode, kecamatan: v.kecamatan }).then(setKel).catch(() => {});
  }, [v.kabkota_kode, v.kecamatan]);
  const p = prov.find((x) => x.kode === v.provinsi_kode);
  const set = (patch) => onChange({ ...v, ...patch });
  return html`<div class="form-grid">
    <${Field} label="Provinsi">
      <select class="select" value=${v.provinsi_kode || ''} disabled=${disabled} onChange=${(e) => {
        const x = prov.find((q) => q.kode === e.target.value);
        set({ provinsi_kode: x?.kode || '', provinsi: x?.nama || '', kabkota_kode: '', kabkota: '', kecamatan: '', kelurahan: '' });
      }}>
        <option value="">— Pilih provinsi —</option>
        ${prov.map((x) => html`<option value=${x.kode}>${x.nama}</option>`)}
      </select>
    <//>
    <${Field} label="Kabupaten / Kota">
      <select class="select" value=${v.kabkota_kode || ''} disabled=${disabled || !p} onChange=${(e) => {
        const x = p?.kabkota.find((q) => q.kode === e.target.value);
        set({ kabkota_kode: x?.kode || '', kabkota: x?.nama || '', kecamatan: '', kelurahan: '' });
      }}>
        <option value="">${p ? '— Pilih kabupaten/kota —' : 'Pilih provinsi dulu'}</option>
        ${(p?.kabkota || []).map((x) => html`<option value=${x.kode}>${x.nama}</option>`)}
      </select>
    <//>
    <${Field} label="Kecamatan" hint="pilih atau ketik baru">
      <${Combobox} value=${v.kecamatan || ''} options=${kec} disabled=${disabled || !v.kabkota_kode}
        placeholder=${v.kabkota_kode ? 'Ketik nama kecamatan' : 'Pilih kab/kota dulu'}
        onChange=${(x) => x !== (v.kecamatan || '') && set({ kecamatan: x, kelurahan: '' })} />
    <//>
    <${Field} label="Kelurahan / Desa" hint="pilih atau ketik baru">
      <${Combobox} value=${v.kelurahan || ''} options=${kel} disabled=${disabled || !v.kecamatan}
        placeholder=${v.kecamatan ? 'Ketik nama kelurahan' : 'Isi kecamatan dulu'} onChange=${(x) => set({ kelurahan: x })} />
    <//>
  </div>`;
}

export const labelWilayah = (s) => [s?.kelurahan, s?.kecamatan, s?.kabkota, s?.provinsi].filter(Boolean).join(', ');
