// Peta Indonesia (SVG) dari batas wilayah BIG via github.com/Alf-Anas/batas-administrasi-indonesia — lihat public/data/peta/.
import { html, useState, useEffect, useMemo } from './lib.js';

const cache = {};
export const muatJson = (url) => (cache[url] ||= fetch(url).then((r) => { if (!r.ok) throw new Error('Peta gagal dimuat.'); return r.json(); }));

// proyeksi sama dengan skrip pembangun peta
const K = 20, LNG0 = 94.8, LAT0 = 6.3;
export const proyeksi = (lat, lng) => [(lng - LNG0) * K, (LAT0 - lat) * K];

const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h >>> 0; };

/** Posisi titik sekolah: koordinat sekolah bila ada, selain itu pusat kab/kota (digeser sedikit agar tidak menumpuk). */
export function posisiSekolah(s, titik, pusatProv) {
  if (s.lat != null && s.lng != null) return proyeksi(s.lat, s.lng);
  const t = titik?.[s.kabkota_kode] || pusatProv?.[s.provinsi_kode];
  if (!t) return null;
  const h = hash(s.npsn);
  const geser = titik?.[s.kabkota_kode] ? 0.8 : 3; // kecil agar tetap di dalam kab/kota sempit (mis. Jakarta)
  return [t[0] + (((h & 255) / 255) - 0.5) * geser, t[1] + ((((h >> 8) & 255) / 255) - 0.5) * geser];
}

/** Data dasar peta: provinsi, titik pusat kab/kota, dan pusat provinsi. */
export function useDataPeta() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    Promise.all([muatJson('/data/peta/provinsi.json'), muatJson('/data/peta/titik.json')])
      .then(([p, t]) => setD({ ...p, titik: t, pusatProv: Object.fromEntries(p.provinsi.map((x) => [x.kode, [x.x, x.y]])) }))
      .catch(setErr);
  }, []);
  return { data: d, error: err };
}

/**
 * Peta Indonesia.
 * - warnaProv(kode) → warna isi provinsi (peta tematik); fokus = kode provinsi yang diperbesar (batas kab/kota ikut tampil)
 * - warnaKab(kode) → warna isi kab/kota saat fokus; titik = [{ id, x, y, warna, judul, r }]
 */
export function PetaIndonesia({ dasar, fokus, warnaProv, warnaKab, titik = [], onPilihProv, onPilihKab, judulProv, judulKab, tinggi = 'auto', label }) {
  const [kab, setKab] = useState(null);
  const [arah, setArah] = useState(null);
  useEffect(() => {
    setKab(null);
    if (fokus) muatJson(`/data/peta/kab-${fokus}.json`).then(setKab).catch(() => setKab({ kabkota: [] }));
  }, [fokus]);
  const vb = useMemo(() => {
    if (!dasar) return [0, 0, 926, 348];
    const p = fokus && dasar.provinsi.find((x) => x.kode === fokus);
    const b = p?.kotak; // kotak tampilan dihitung saat membangun data (tanpa pulau kecil yang jauh)
    if (!b) return [0, 0, dasar.lebar, dasar.tinggi];
    const w = Math.max(b[2] - b[0], 6), h = Math.max(b[3] - b[1], 4);
    const pad = Math.max(w, h) * 0.08;
    return [b[0] - pad, b[1] - pad, w + pad * 2, h + pad * 2];
  }, [dasar, fokus]);
  if (!dasar) return html`<div style="aspect-ratio:926/348;border-radius:16px;background:var(--sky-50)"></div>`;
  const skala = Math.max(vb[2] / 926, vb[3] / 348);
  const kabList = kab?.kabkota || [];
  return html`<div style="position:relative">
    <svg viewBox=${vb.join(' ')} role="img" aria-label=${label || 'Peta Indonesia'} style=${`width:100%;height:${tinggi};display:block;max-height:70vh`} preserveAspectRatio="xMidYMid meet">
      ${dasar.provinsi.map((p) => {
        const redup = fokus && p.kode !== fokus;
        // provinsi yang sedang diperbesar digambar dari kab/kotanya (lebih rinci) begitu datanya termuat
        const ganti = fokus && p.kode === fokus && kabList.length;
        return html`<path d=${p.d} fill=${ganti ? 'none' : redup ? '#E8EDF6' : (warnaProv?.(p.kode) || '#CFEAFF')} fill-rule="evenodd" stroke="#fff" stroke-width=${0.7 * skala} stroke-linejoin="round"
          style=${onPilihProv ? 'cursor:pointer' : ''} onClick=${() => onPilihProv?.(p.kode)}
          onMouseEnter=${() => setArah({ teks: judulProv ? judulProv(p) : p.nama })} onMouseLeave=${() => setArah(null)}><title>${judulProv ? judulProv(p) : p.nama}</title></path>`;
      })}
      ${fokus && kabList.map((k) => html`<path d=${k.d} fill=${warnaKab?.(k.kode) || '#CFEAFF'} fill-rule="evenodd" stroke="#fff" stroke-width=${0.5 * skala} stroke-linejoin="round"
        style=${onPilihKab ? 'cursor:pointer' : ''} onClick=${() => onPilihKab?.(k.kode)}
        onMouseEnter=${() => setArah({ teks: judulKab ? judulKab(k) : k.nama })} onMouseLeave=${() => setArah(null)}><title>${judulKab ? judulKab(k) : k.nama}</title></path>`)}
      ${titik.map((t) => html`<circle cx=${t.x} cy=${t.y} r=${(t.r || 3.4) * skala} fill=${t.warna || '#FF786F'} stroke="#fff" stroke-width=${1 * skala}
        onMouseEnter=${() => setArah({ teks: t.judul })} onMouseLeave=${() => setArah(null)}><title>${t.judul}</title></circle>`)}
    </svg>
    ${arah && html`<div class="peta-label" aria-hidden="true">${arah.teks}</div>`}
  </div>`;
}

/** Skala warna nilai (0–100) memakai palet: koral (rendah) → lavender → azure → navy (tinggi). */
export function warnaNilai(v, target) {
  if (v == null) return '#E3E8F2';
  if (v >= 85) return '#10284A';
  if (v >= (target ?? 75)) return '#1F6BE0';
  if (v >= 60) return '#8E9BEA';
  if (v >= 45) return '#C9C1F7';
  return '#FFB4AE';
}
export const LEGENDA_NILAI = (target) => [['≥ 85', '#10284A'], [`${target}–85`, '#1F6BE0'], [`60–${target}`, '#8E9BEA'], ['45–60', '#C9C1F7'], ['< 45', '#FFB4AE'], ['tidak ada data', '#E3E8F2']];
