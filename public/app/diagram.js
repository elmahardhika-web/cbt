// Diagram sederhana (SVG/HTML, tanpa pustaka) dengan palet aplikasi.
import { html, fmt, cls } from './lib.js';

export const PALET = { navy: '#10284A', azure: '#1F6BE0', azureMuda: '#2475EC', es: '#CFEAFF', lavender: '#A99BF2', lavenderTua: '#7D6BE0', merahMuda: '#F6D5E3', koral: '#FF786F', koralTua: '#E85A50' };
export const PREDIKAT = [
  { label: 'Sangat Baik (≥ 90)', warna: '#10284A', min: 90 },
  { label: 'Baik (80–89)', warna: '#1F6BE0', min: 80 },
  { label: 'Cukup (70–79)', warna: '#A99BF2', min: 70 },
  { label: 'Perlu Bimbingan (< 70)', warna: '#FF786F', min: -Infinity },
];
export const predikatKe = (v) => PREDIKAT.findIndex((p) => v >= p.min);

// ---------- statistik ----------
export function ringkas(vals, target) {
  const v = vals.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0 };
  const q = (p) => { const i = (n - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const rata = v.reduce((a, b) => a + b, 0) / n;
  const capai = v.filter((x) => x >= target).length;
  return { n, rata, min: v[0], q1: q(0.25), median: q(0.5), q3: q(0.75), maks: v[n - 1], capai, persen: (capai / n) * 100,
    predikat: PREDIKAT.map((p, i) => v.filter((x) => predikatKe(x) === i).length) };
}

// ---------- batang mendatar (peringkat) ----------
export function BatangH({ items, target, onPilih, kosong = 'Belum ada data.' }) {
  if (!items.length) return html`<p class="small muted">${kosong}</p>`;
  return html`<div class="col" style="gap:8px;position:relative">
    ${items.map((it, i) => html`<div class=${cls('dg-baris', onPilih && it.bisaPilih !== false && 'klik')} role=${onPilih ? 'button' : undefined} tabindex=${onPilih ? 0 : undefined}
      onClick=${() => onPilih && it.bisaPilih !== false && onPilih(it)} onKeyDown=${(e) => e.key === 'Enter' && onPilih?.(it)}>
      <span class="dg-no">${i + 1}</span>
      <span class="dg-nama"><strong class="ellipsis">${it.label}</strong>${it.sub && html`<span class="tiny muted ellipsis">${it.sub}</span>`}</span>
      <span class="dg-trek">
        <span class="dg-isi" style=${`width:${Math.max(0, Math.min(100, it.nilai || 0))}%;background:${it.warna || (it.nilai < target ? PALET.lavender : PALET.azure)}`}></span>
        ${target != null && html`<span class="dg-target" style=${`left:${target}%`} title=${`Target ${target}`}></span>`}
      </span>
      <strong class="num small" style="width:44px;text-align:right">${fmt.angka(it.nilai)}</strong>
    </div>`)}
  </div>`;
}

// ---------- donat ----------
export function Donat({ bagian, tengah, sub, ukuran = 180 }) {
  const total = bagian.reduce((a, b) => a + b.nilai, 0) || 1;
  const R = 70, L = 22, C = 2 * Math.PI * R;
  let jalan = 0;
  return html`<div class="row wrap" style="gap:18px;align-items:center">
    <svg viewBox="0 0 180 180" width=${ukuran} height=${ukuran} role="img" aria-label=${bagian.map((b) => `${b.label} ${b.nilai}`).join(', ')} style="flex:none">
      <circle cx="90" cy="90" r=${R} fill="none" stroke="#EEF1F7" stroke-width=${L} />
      ${bagian.map((b) => { const p = (b.nilai / total) * C; const el = html`<circle cx="90" cy="90" r=${R} fill="none" stroke=${b.warna} stroke-width=${L}
        stroke-dasharray=${`${p} ${C - p}`} stroke-dashoffset=${-jalan} transform="rotate(-90 90 90)"><title>${b.label}: ${b.nilai}</title></circle>`; jalan += p; return el; })}
      <text x="90" y="88" text-anchor="middle" font-size="26" font-weight="800" fill="#10284A">${tengah}</text>
      ${sub && html`<text x="90" y="110" text-anchor="middle" font-size="11.5" fill="#5C6A85">${sub}</text>`}
    </svg>
    <div class="col" style="gap:8px;min-width:150px;flex:1">
      ${bagian.map((b) => html`<div class="row small" style="gap:8px"><span style=${`width:12px;height:12px;border-radius:4px;background:${b.warna};flex:none`}></span>
        <span class="grow">${b.label}</span><strong class="num">${fmt.bulat(b.nilai)}</strong><span class="tiny muted num" style="width:44px;text-align:right">${fmt.persen((b.nilai / total) * 100)}</span></div>`)}
    </div>
  </div>`;
}

// ---------- batang bertumpuk 100% ----------
export function BatangTumpuk({ items, seri }) {
  if (!items.length) return html`<p class="small muted">Belum ada data.</p>`;
  return html`<div class="col" style="gap:10px">
    ${items.map((it) => { const tot = it.bagian.reduce((a, b) => a + b, 0) || 1; return html`<div class="dg-tumpuk">
      <span class="dg-nama"><strong class="ellipsis small">${it.label}</strong><span class="tiny muted">${tot} siswa</span></span>
      <span class="dg-trek tumpuk">${it.bagian.map((n, i) => n > 0 && html`<span style=${`width:${(n / tot) * 100}%;background:${seri[i].warna}`} title=${`${seri[i].label}: ${n} (${fmt.persen((n / tot) * 100)})`}>${n / tot >= 0.12 ? fmt.persen((n / tot) * 100) : ''}</span>`)}</span>
    </div>`; })}
    <div class="row wrap tiny" style="gap:12px;color:var(--text-2)">${seri.map((s) => html`<span class="row gap-4"><span style=${`width:10px;height:10px;border-radius:3px;background:${s.warna}`}></span>${s.label}</span>`)}</div>
  </div>`;
}

// ---------- diagram kotak-garis (rentang nilai) ----------
export function KotakGaris({ items, target }) {
  if (!items.length) return html`<p class="small muted">Belum ada data.</p>`;
  const W = 640, kiri = 150, kanan = 14, baris = 34, atas = 10, H = atas + items.length * baris + 26;
  const x = (v) => kiri + ((W - kiri - kanan) * v) / 100;
  return html`<svg viewBox=${`0 0 ${W} ${H}`} style="width:100%;height:auto" role="img" aria-label="Rentang nilai per kelompok">
    ${[0, 25, 50, 75, 100].map((v) => html`<g><line x1=${x(v)} x2=${x(v)} y1=${atas} y2=${H - 22} stroke="#E3E8F2" /><text x=${x(v)} y=${H - 6} font-size="11" text-anchor="middle" fill="#5C6A85">${v}</text></g>`)}
    ${target != null && html`<line x1=${x(target)} x2=${x(target)} y1=${atas} y2=${H - 22} stroke=${PALET.koralTua} stroke-width="1.5" stroke-dasharray="5 4" />`}
    ${items.map((it, i) => { const y = atas + i * baris + baris / 2; return html`<g>
      <text x=${kiri - 10} y=${y + 4} font-size="12" text-anchor="end" fill="#10284A" font-weight="700">${it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label}</text>
      <line x1=${x(it.min)} x2=${x(it.maks)} y1=${y} y2=${y} stroke="#5C6A85" stroke-width="1.5" />
      <line x1=${x(it.min)} x2=${x(it.min)} y1=${y - 6} y2=${y + 6} stroke="#5C6A85" stroke-width="1.5" />
      <line x1=${x(it.maks)} x2=${x(it.maks)} y1=${y - 6} y2=${y + 6} stroke="#5C6A85" stroke-width="1.5" />
      <rect x=${x(it.q1)} y=${y - 10} width=${Math.max(2, x(it.q3) - x(it.q1))} height="20" rx="4" fill=${PALET.es} stroke=${PALET.azure} stroke-width="1.5" />
      <line x1=${x(it.median)} x2=${x(it.median)} y1=${y - 10} y2=${y + 10} stroke=${PALET.navy} stroke-width="2.5" />
      <circle cx=${x(it.rata)} cy=${y} r="3.5" fill=${PALET.koral} stroke="#fff" />
      <title>${it.label}: min ${fmt.angka(it.min)} · Q1 ${fmt.angka(it.q1)} · median ${fmt.angka(it.median)} · Q3 ${fmt.angka(it.q3)} · maks ${fmt.angka(it.maks)} · rata-rata ${fmt.angka(it.rata)}</title>
    </g>`; })}
  </svg>
  <div class="row wrap tiny" style="gap:14px;color:var(--text-2)">
    <span class="row gap-4"><span style=${`width:16px;height:10px;border-radius:3px;background:${PALET.es};border:1.5px solid ${PALET.azure}`}></span>50% siswa di tengah (Q1–Q3)</span>
    <span class="row gap-4"><span style=${`width:3px;height:12px;background:${PALET.navy}`}></span>Median</span>
    <span class="row gap-4"><span style=${`width:9px;height:9px;border-radius:50%;background:${PALET.koral}`}></span>Rata-rata</span>
    <span class="row gap-4"><span style="width:16px;height:2px;background:#5C6A85"></span>Terendah–tertinggi</span>
  </div>`;
}

// ---------- batang tegak berkelompok ----------
export function BatangKelompok({ kategori, seri, target, tinggi = 230 }) {
  if (!kategori.length) return html`<p class="small muted">Belum ada data.</p>`;
  const W = 640, H = tinggi, kiri = 36, bawah = 42, atas = 18;
  const lebarK = (W - kiri - 10) / kategori.length;
  const lebarB = Math.min(34, (lebarK * 0.78) / seri.length);
  const y = (v) => atas + (H - atas - bawah) * (1 - v / 100);
  return html`<svg viewBox=${`0 0 ${W} ${H}`} style="width:100%;height:auto" role="img" aria-label="Diagram batang berkelompok">
    ${[0, 25, 50, 75, 100].map((v) => html`<g><line x1=${kiri} x2=${W - 10} y1=${y(v)} y2=${y(v)} stroke="#E3E8F2" /><text x=${kiri - 8} y=${y(v) + 4} font-size="11" text-anchor="end" fill="#5C6A85">${v}</text></g>`)}
    ${target != null && html`<line x1=${kiri} x2=${W - 10} y1=${y(target)} y2=${y(target)} stroke=${PALET.koralTua} stroke-width="1.5" stroke-dasharray="6 5" />`}
    ${kategori.map((k, i) => { const x0 = kiri + i * lebarK + (lebarK - lebarB * seri.length) / 2; return html`<g>
      ${seri.map((s, j) => { const v = s.nilai[i]; return v != null && html`<g><rect x=${x0 + j * lebarB + 1} y=${y(v)} width=${lebarB - 2} height=${y(0) - y(v)} rx="4" fill=${s.warna}><title>${k} · ${s.label}: ${fmt.angka(v)}</title></rect>
        ${lebarB >= 22 && html`<text x=${x0 + j * lebarB + lebarB / 2} y=${y(v) - 5} font-size="10.5" text-anchor="middle" font-weight="700" fill="#10284A">${fmt.angka(v)}</text>`}</g>`; })}
      <text x=${kiri + i * lebarK + lebarK / 2} y=${H - bawah + 18} font-size="11.5" text-anchor="middle" fill="#3D4F6E" font-weight="700">${k.length > 16 ? `${k.slice(0, 15)}…` : k}</text>
    </g>`; })}
  </svg>
  ${seri.length > 1 && html`<div class="row wrap tiny" style="gap:12px;color:var(--text-2)">${seri.map((s) => html`<span class="row gap-4"><span style=${`width:10px;height:10px;border-radius:3px;background:${s.warna}`}></span>${s.label}</span>`)}</div>`}`;
}

// ---------- histogram ----------
export function Histogram({ nilai, target }) {
  const bin = Array.from({ length: 10 }, (_, i) => ({ dari: i * 10, label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`, n: 0 }));
  nilai.forEach((v) => { if (v != null) bin[Math.min(9, Math.max(0, Math.floor(v / 10)))].n++; });
  const maks = Math.max(1, ...bin.map((b) => b.n));
  return html`<div class="hist" role="img" aria-label="Histogram sebaran nilai">
      ${bin.map((d) => html`<div class=${cls('b', d.dari >= target && 'tuntas')}><strong>${d.n || ''}</strong><span style=${`height:${(d.n / maks) * 100}%`}></span></div>`)}
    </div>
    <div class="hist-x">${bin.map((d) => html`<span>${d.label}</span>`)}</div>`;
}

// ---------- radar (profil per mapel) ----------
export function Radar({ sumbu, seri, target, ukuran = 300 }) {
  const n = sumbu.length;
  if (n < 3) return null;
  const C = 160, R = 110;
  const titik = (i, v, bebas) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; const r = (R * (bebas ? v : Math.max(0, Math.min(100, v ?? 0)))) / 100; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const poli = (vals) => vals.map((v, i) => titik(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  return html`<div class="col" style="gap:10px;align-items:center">
    <svg viewBox="-70 -4 460 328" width=${ukuran * 1.4} style="max-width:100%;height:auto" role="img" aria-label=${`Profil per mata pelajaran: ${seri.map((s) => `${s.label} ${s.nilai.map((v, i) => `${sumbu[i]} ${fmt.angka(v)}`).join(', ')}`).join('; ')}`}>
      ${[25, 50, 75, 100].map((v) => html`<polygon points=${poli(sumbu.map(() => v))} fill="none" stroke="#E3E8F2" />`)}
      ${sumbu.map((_, i) => { const [x, y] = titik(i, 100); return html`<line x1=${C} y1=${C} x2=${x} y2=${y} stroke="#E3E8F2" />`; })}
      ${target != null && html`<polygon points=${poli(sumbu.map(() => target))} fill="none" stroke=${PALET.koralTua} stroke-width="1.4" stroke-dasharray="5 4" />`}
      ${seri.map((s) => html`<g><polygon points=${poli(s.nilai)} fill=${s.isi ? s.warna : 'none'} fill-opacity=".18" stroke=${s.warna} stroke-width=${s.tebal ? 2.6 : 1.8} stroke-dasharray=${s.putus ? '5 4' : ''} />
        ${s.nilai.map((v, i) => v != null && html`<circle cx=${titik(i, v)[0]} cy=${titik(i, v)[1]} r=${s.tebal ? 4 : 3} fill="#fff" stroke=${s.warna} stroke-width="2"><title>${sumbu[i]} · ${s.label}: ${fmt.angka(v)}</title></circle>`)}</g>`)}
      ${sumbu.map((l, i) => { const [x, y] = titik(i, 112, true); const a = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end'; return html`<text x=${x} y=${y + 4} font-size="11.5" font-weight="700" fill="#3D4F6E" text-anchor=${a}>${l.length > 20 ? `${l.slice(0, 19)}…` : l}</text>`; })}
    </svg>
    <div class="row wrap tiny" style="gap:12px;color:var(--text-2);justify-content:center">${seri.map((s) => html`<span class="row gap-4"><span style=${`width:14px;height:3px;border-radius:2px;background:${s.warna}`}></span>${s.label}</span>`)}
      ${target != null && html`<span class="row gap-4"><span style=${`width:14px;height:0;border-top:2px dashed ${PALET.koralTua}`}></span>Target ${target}</span>`}</div>
  </div>`;
}
