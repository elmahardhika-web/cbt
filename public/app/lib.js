export { html, render, h, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, createContext, useContext } from '/vendor/preact-htm.js';

/** Muat skrip klasik sekali saja (ExcelJS, KaTeX, QR). */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => { loaded.delete(src); rej(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

export const fmt = {
  angka: (n, d = 1) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d })),
  bulat: (n) => (n == null ? '–' : Number(n).toLocaleString('id-ID')),
  persen: (n) => (n == null ? '–' : `${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`),
  jam: (t) => (t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–'),
  tanggal: (t) => (t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '–'),
  tglPendek: (t) => (t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '–'),
  hari: (t) => (t ? new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '–'),
  waktu: (t) => (t ? `${fmt.tglPendek(t)} · ${fmt.jam(t)}` : '–'),
  durasi: (ms) => {
    if (ms == null) return '–';
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), d = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : `${String(m).padStart(2, '0')}`) + `:${String(d).padStart(2, '0')}`;
  },
  relatif: (t) => {
    if (!t) return '–';
    const d = (Date.now() - t) / 1000;
    if (d < 60) return 'baru saja';
    if (d < 3600) return `${Math.floor(d / 60)} mnt lalu`;
    if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
    return fmt.tglPendek(t);
  },
};

export const inisial = (nama) => String(nama || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const cls = (...a) => a.filter(Boolean).join(' ');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function unduhBlob(blob, nama) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const TIPE_LABEL = {
  pilihan_ganda: 'Pilihan Ganda', pilihan_ganda_kompleks: 'PG Kompleks', benar_salah: 'Benar / Salah',
  pg_kategori: 'PG Kategori', menjodohkan: 'Menjodohkan', isian: 'Isian Singkat', uraian: 'Uraian',
};
export const TIPE_WARNA = {
  pilihan_ganda: 'sky', pilihan_ganda_kompleks: 'violet', benar_salah: 'green', pg_kategori: 'amber', menjodohkan: 'pink', isian: 'violet', uraian: 'orange',
};
export const STATUS_SOAL = {
  draf: ['Draf', ''], menunggu: ['Menunggu telaah', 'amber'], disetujui: ['Disetujui', 'green'], revisi: ['Perlu revisi', 'red'],
};
export const PERAN_LABEL = { superadmin: 'Superadmin', supervisor: 'Supervisor', admin: 'Admin Sekolah', guru: 'Guru', siswa: 'Siswa' };
export const MAPEL_WARNA = ['sky', 'orange', 'green', 'violet', 'pink', 'amber'];
export const singkat = (kode) => (kode === 'MAT' ? 'MTK' : String(kode || '').slice(0, 3));
