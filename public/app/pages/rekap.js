import { html, useState, fmt, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { openPrint } from '../router.js';
import { Chip, Modal, Seg, Bar, Pager } from '../ui.js';

/** Warna garis per mata pelajaran; garis rata-rata gabungan selalu biru tua. */
export const WARNA_SERI = ['#2475EC', '#7D6BE0', '#E85A50', '#16A34A', '#C2417A', '#0891B2'];
export const WARNA_GABUNGAN = '#10284A';

const LEVEL = [
  ['provinsi', 'Provinsi'], ['kabkota', 'Kab/Kota'], ['kecamatan', 'Kecamatan'], ['kelurahan', 'Kelurahan'], ['sekolah', 'Sekolah'], ['kelas', 'Kelas'],
];

/** Grafik garis perkembangan nilai lintas try out (SVG, tanpa pustaka). seri: [{ nama, warna, nilai: [..], tebal }] */
export function GrafikTren({ label, seri, target, tinggi = 240, ringkas = false }) {
  const W = 640, H = tinggi, kiri = 52, kanan = 44, atas = 28, bawah = 30;
  const n = label.length;
  const x = (i) => (n <= 1 ? (kiri + W - kanan) / 2 : kiri + ((W - kiri - kanan) * i) / (n - 1));
  const y = (v) => atas + (H - atas - bawah) * (1 - v / 100);
  const garis = (vals) => {
    let d = '', putus = true;
    vals.forEach((v, i) => { if (v == null) { putus = true; return; } d += `${putus ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; putus = false; });
    return d;
  };
  return html`<div class="col" style="gap:10px">
    <svg viewBox=${`0 0 ${W} ${H}`} style="width:100%;height:auto;display:block" role="img" aria-label="Grafik perkembangan nilai per try out">
      ${[0, 25, 50, 75, 100].map((v) => html`<g><line x1=${kiri} x2=${W - kanan} y1=${y(v)} y2=${y(v)} stroke="#E3E8F2" stroke-width="1" />
        <text x=${kiri - 26} y=${y(v) + 4} text-anchor="end" font-size="11" fill="#5C6A85">${v}</text></g>`)}
      ${target != null && html`<g><line x1=${kiri} x2=${W - kanan} y1=${y(target)} y2=${y(target)} stroke="#E85A50" stroke-width="1.6" stroke-dasharray="6 5" />
        <text x=${kiri + 6} y=${y(target) + (target > 85 ? 14 : -6)} text-anchor="start" font-size="11" font-weight="700" fill="#A8322A">Target ${target}</text></g>`}
      ${label.map((l, i) => html`<text x=${x(i)} y=${H - 8} text-anchor="middle" font-size="12" font-weight="700" fill="#3D4F6E">${l}</text>`)}
      ${seri.map((s) => html`<g>
        <path d=${garis(s.nilai)} fill="none" stroke=${s.warna} stroke-width=${s.tebal ? 3.5 : 2.2} stroke-linejoin="round" stroke-linecap="round" stroke-dasharray=${s.putus ? '5 4' : ''} />
        ${s.nilai.map((v, i) => v != null && html`<g><circle cx=${x(i)} cy=${y(v)} r=${s.tebal ? 5.5 : 4} fill="#fff" stroke=${s.warna} stroke-width="2.5" />
          ${(s.tebal || ringkas) && html`<text x=${x(i)} y=${y(v) - 11} text-anchor="middle" font-size="12" font-weight="800" fill=${s.warna}>${fmt.angka(v)}</text>`}</g>`)}
      </g>`)}
    </svg>
    ${seri.length > 1 && html`<div class="row wrap tiny" style="gap:14px;color:var(--text-2)">${seri.map((s) => html`<span class="row gap-4">
      <span style=${`width:16px;height:${s.tebal ? 4 : 3}px;border-radius:2px;background:${s.warna}`}></span>${s.nama}</span>`)}</div>`}
  </div>`;
}

export function Tren({ v, besar }) {
  if (v == null) return html`<span class="muted">–</span>`;
  const naik = v > 0, turun = v < 0;
  return html`<span class=${cls('chip', naik ? 'green' : turun ? 'red' : '')} style=${besar ? 'font-size:13px;padding:5px 12px' : ''}>
    ${naik ? '▲' : turun ? '▼' : '='} ${naik ? '+' : ''}${fmt.angka(v)}</span>`;
}

const nilaiWarna = (v, target) => `font-weight:700;color:${v == null ? 'var(--muted)' : v < target ? 'var(--orange-700)' : 'var(--ink)'}`;

export function RekapRingkasan({ a, onTab }) {
  const r = a.ringkasan;
  const label = a.kategori.map((k) => k.nama);
  const seri = [
    { nama: 'Rata-rata gabungan', warna: WARNA_GABUNGAN, tebal: true, nilai: a.per_tryout.map((t) => t.rata) },
    ...a.mapel.map((m, i) => ({ nama: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: a.per_tryout.map((t) => t.per_mapel[m.kode]) })),
  ];
  const pertama = a.per_tryout[0], terakhir = a.per_tryout[a.per_tryout.length - 1];
  const naikRata = a.per_tryout.length > 1 && pertama.rata != null && terakhir.rata != null ? terakhir.rata - pertama.rata : null;
  const teratas = a.siswa.filter((s) => s.tren != null).sort((p, q) => q.tren - p.tren).slice(0, 5);
  return html`
    <section class="grid-auto" style="--min:170px">
      ${[['Siswa', fmt.bulat(r.siswa), `${r.ikut_semua} ikut semua ${r.tryout} try out`],
        ['Rata-rata semua try out', fmt.angka(r.rata), `median ${fmt.angka(r.median)} · SD ${fmt.angka(r.sd)}`],
        ['Perubahan rata-rata', naikRata == null ? '–' : `${naikRata > 0 ? '+' : ''}${fmt.angka(naikRata)}`, a.per_tryout.length > 1 ? `${pertama.nama} → ${terakhir.nama}` : 'butuh ≥ 2 try out'],
        ['Siswa naik / turun', `${fmt.bulat(r.naik)} / ${fmt.bulat(r.turun)}`, r.rata_tren == null ? '' : `rata-rata perubahan ${r.rata_tren > 0 ? '+' : ''}${fmt.angka(r.rata_tren)}`],
        [`Capai target (≥ ${a.target})`, fmt.persen(r.persen_tuntas), `${r.tuntas} dari ${r.n} siswa (rata-rata semua try out)`]].map(([l, v, sub]) =>
        html`<div class="card stat-v"><span class="small muted">${l}</span><strong class="num">${v}</strong><span class="tiny muted ellipsis">${sub}</span></div>`)}
    </section>
    <section class="row wrap" style="gap:20px;align-items:stretch">
      <div class="card pad col" style="flex:999 1 520px;gap:14px">
        <div class="row" style="justify-content:space-between"><h2>Perkembangan Rata-rata per Try Out</h2><span class="tiny muted">garis koral putus-putus = target capaian</span></div>
        <${GrafikTren} label=${label} seri=${seri} target=${a.target} />
      </div>
      <div class="card pad col" style="flex:1 1 300px;gap:12px">
        <div class="row" style="justify-content:space-between"><h2>Kenaikan Tertinggi</h2><button class="btn btn-g btn-sm" onClick=${() => onTab('ranking')}>Semua siswa</button></div>
        ${teratas.length === 0 ? html`<span class="small muted">Kenaikan dihitung untuk siswa yang mengikuti minimal 2 try out.</span>` : teratas.map((s) => html`<div class="row" style="gap:10px">
          <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${s.nama}</strong><span class="tiny muted ellipsis">${s.kelas} · ${s.sekolah}</span></span>
          <span class="tiny muted num">${fmt.angka(s.awal)} → ${fmt.angka(s.akhir)}</span><${Tren} v=${s.tren} /></div>`)}
      </div>
    </section>
    <section class="card col" style="gap:0">
      <div class="card-head"><h2 class="grow">Rekap Nilai per Try Out</h2><span class="small muted">rata-rata nilai siswa yang mengikuti</span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Try out</th><th class="r">Siswa</th>${a.mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th style="min-width:250px">Rata-rata gabungan</th><th class="r">Tertinggi</th><th class="r">Terendah</th><th class="r">Capai target</th></tr></thead>
        <tbody>${a.per_tryout.map((t, i) => html`<tr>
          <td style="white-space:nowrap"><span class="col" style="gap:0"><strong class="strong">${t.nama}</strong><span class="tiny muted">${t.tanggal ? fmt.tanggal(t.tanggal) : ''}</span></span></td>
          <td class="r num">${t.n}</td>
          ${a.mapel.map((m) => html`<td class="r num" style=${nilaiWarna(t.per_mapel[m.kode], a.target)}>${fmt.angka(t.per_mapel[m.kode])}</td>`)}
          <td><span class="hbar"><${Bar} value=${t.rata} tone=${t.rata < a.target ? 'amber' : ''} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(t.rata)}</strong>
            ${i > 0 && a.per_tryout[i - 1].rata != null && t.rata != null && html`<${Tren} v=${Math.round((t.rata - a.per_tryout[i - 1].rata) * 10) / 10} />`}</span></td>
          <td class="r num">${fmt.angka(t.maks)}</td><td class="r num">${fmt.angka(t.min)}</td><td class="r num">${fmt.persen(t.persen_tuntas)}</td>
        </tr>`)}</tbody></table></div>
    </section>`;
}

export function RekapSiswa({ a, sekolahSaja, lingkup }) {
  const [q, setQ] = useState('');
  const [arah, setArah] = useState('semua');
  const [hal, setHal] = useState(1);
  const [buka, setBuka] = useState(null);
  const per = 50;
  const cari = q.toLowerCase();
  const list = a.siswa.filter((p) => (!q || p.nama.toLowerCase().includes(cari) || p.username.includes(q) || (p.sekolah || '').toLowerCase().includes(cari))
    && (arah === 'semua' || (arah === 'naik' ? p.tren > 0 : arah === 'turun' ? p.tren < 0 : p.rata < a.target)));
  const medal = ['#F59E0B', '#94A3B8', '#C2410C'];
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Rekap Nilai Siswa Semua Try Out</h2><span class="small muted">Rata-rata gabungan semua mapel tiap try out. Klik baris untuk melihat rincian per mapel.</span></div>
      <${Seg} soft items=${[{ value: 'semua', label: 'Semua' }, { value: 'naik', label: 'Naik' }, { value: 'turun', label: 'Turun' }, { value: 'bawah', label: 'Di bawah target' }]} value=${arah} onChange=${(v) => { setArah(v); setHal(1); }} />
      <label class="input-icon soft" style="flex:0 1 260px;min-height:42px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari nama, nomor, sekolah" value=${q} onInput=${(e) => { setQ(e.target.value); setHal(1); }} aria-label="Cari siswa" /></label></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>Siswa</th><th>Kelas</th>${!sekolahSaja && html`<th>Sekolah</th>`}${a.kategori.map((k) => html`<th class="r">${k.nama}</th>`)}<th class="r">Rata-rata</th><th class="c">Tren</th></tr></thead>
      <tbody>${list.slice((hal - 1) * per, hal * per).map((p) => html`<tr style="cursor:pointer" onClick=${() => setBuka(p)}>
        <td class="c"><span class="tile sm" style=${`margin:auto;${p.peringkat <= 3 ? `background:${medal[p.peringkat - 1]};color:#fff` : 'background:var(--bg);color:var(--text-2)'}`}>${p.peringkat}</span></td>
        <td><span class="col" style="gap:0"><strong class="strong">${p.nama}</strong><span class="tiny muted">${p.username}${p.ikut < a.kategori.length ? ` · ikut ${p.ikut}/${a.kategori.length}` : ''}</span></span></td>
        <td>${p.kelas}</td>${!sekolahSaja && html`<td class="small">${p.sekolah}</td>`}
        ${a.kategori.map((k) => { const t = p.tryout[k.kode]; return html`<td class="r num" style=${nilaiWarna(t?.rata, a.target)} title=${t ? a.mapel.map((m) => `${m.nama}: ${fmt.angka(t.nilai[m.kode])}`).join(' · ') : 'Tidak ikut'}>${t ? fmt.angka(t.rata) : html`<span class="tiny muted">tidak ikut</span>`}</td>`; })}
        <td class="r num" style=${`font-weight:800;color:${p.rata < a.target ? 'var(--orange-700)' : 'var(--ink)'}`}>${fmt.angka(p.rata)}</td>
        <td class="c"><${Tren} v=${p.tren} /></td>
      </tr>`)}</tbody></table></div>
    <div class="tbl-foot"><${Pager} halaman=${hal} per=${per} total=${list.length} onChange=${setHal} /></div>
    ${buka && html`<${DetailSiswa} s=${buka} a=${a} lingkup=${lingkup} onClose=${() => setBuka(null)} />`}
  </section>`;
}

function DetailSiswa({ s, a, onClose }) {
  const seri = [
    { nama: 'Rata-rata', warna: WARNA_GABUNGAN, tebal: true, nilai: a.kategori.map((k) => s.tryout[k.kode]?.rata ?? null) },
    ...a.mapel.map((m, i) => ({ nama: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: a.kategori.map((k) => s.tryout[k.kode]?.nilai[m.kode] ?? null) })),
    { nama: 'Rata-rata semua siswa', warna: '#94A3B8', putus: true, nilai: a.per_tryout.map((t) => t.rata) },
  ];
  return html`<${Modal} size="wide" title=${s.nama} sub=${`${s.username} · Kelas ${s.kelas} · ${s.sekolah}`} onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${() => openPrint('/cetak/rekap-tryout', { siswa: s.siswa_id, npsn: s.npsn, kategori: a.kategori.map((k) => k.kode).join(',') })}><${Icon} n="printer" s=${18} />Cetak laporan siswa</button>
      <button class="btn btn-p" onClick=${onClose}>Tutup</button>`}>
    <div class="grid-auto" style="--min:140px;gap:10px">
      ${[['Peringkat', `${s.peringkat} dari ${a.siswa.length}`], ['Rata-rata', fmt.angka(s.rata)], ['Try out diikuti', `${s.ikut} dari ${a.kategori.length}`]].map(([l, v]) =>
        html`<div class="card" style="padding:12px 14px;box-shadow:none"><span class="tiny muted">${l}</span><br /><strong style="font-size:20px">${v}</strong></div>`)}
      <div class="card" style="padding:12px 14px;box-shadow:none"><span class="tiny muted">Perubahan awal → akhir</span><br /><span style="display:inline-block;margin-top:4px"><${Tren} v=${s.tren} besar /></span></div>
    </div>
    <${GrafikTren} label=${a.kategori.map((k) => k.nama)} seri=${seri} target=${a.target} tinggi=${220} />
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Try out</th>${a.mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th class="r">Rata-rata</th><th class="r">Rata-rata semua siswa</th></tr></thead>
      <tbody>${a.kategori.map((k, i) => { const t = s.tryout[k.kode]; return html`<tr>
        <td><strong>${k.nama}</strong>${t?.selesai_at && html`<br /><span class="tiny muted">${fmt.tanggal(t.selesai_at)}</span>`}</td>
        ${a.mapel.map((m) => html`<td class="r num" style=${nilaiWarna(t?.nilai[m.kode], a.target)}>${t ? fmt.angka(t.nilai[m.kode]) : '–'}</td>`)}
        <td class="r num" style=${`font-weight:800;${nilaiWarna(t?.rata, a.target)}`}>${t ? fmt.angka(t.rata) : html`<span class="tiny muted">tidak ikut</span>`}</td>
        <td class="r num muted">${fmt.angka(a.per_tryout[i].rata)}</td></tr>`; })}
        <tr style="background:var(--surface-2)"><td><strong>Rata-rata</strong></td>${a.mapel.map((m) => html`<td class="r num" style="font-weight:800">${fmt.angka(s.per_mapel[m.kode])}</td>`)}
          <td class="r num" style="font-weight:800">${fmt.angka(s.rata)}</td><td class="r num muted">${fmt.angka(a.ringkasan.rata)}</td></tr>
      </tbody></table></div>
  <//>`;
}

export function RekapGrup({ a, level, onLevel, sekolahSaja }) {
  const levels = sekolahSaja ? LEVEL.filter(([k]) => k === 'kelas') : LEVEL;
  const nama = LEVEL.find(([k]) => k === level)?.[1] || '';
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Perkembangan per ${nama}</h2><span class="small muted">Rata-rata gabungan tiap try out per ${nama.toLowerCase()}, diurutkan dari rata-rata tertinggi.</span></div>
      ${levels.length > 1 && html`<${Seg} soft items=${levels.map(([value, label]) => ({ value, label }))} value=${level} onChange=${onLevel} />`}</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>${nama}</th><th class="r">Siswa</th>${a.kategori.map((k) => html`<th class="r">${k.nama}</th>`)}<th style="min-width:170px">Rata-rata</th><th class="c">Tren</th><th class="r">Capai target</th></tr></thead>
      <tbody>${a.grup.items.map((g) => html`<tr>
        <td class="c"><strong>${g.peringkat}</strong></td>
        <td><span class="col" style="gap:0"><strong class="strong">${g.nama}</strong><span class="tiny muted">${g.induk}</span></span></td>
        <td class="r num">${g.n}</td>
        ${a.kategori.map((k) => html`<td class="r num" style=${nilaiWarna(g.per_tryout[k.kode], a.target)}>${fmt.angka(g.per_tryout[k.kode])}</td>`)}
        <td><span class="hbar"><${Bar} value=${g.rata} tone=${g.rata < a.target ? 'amber' : ''} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(g.rata)}</strong></span></td>
        <td class="c"><${Tren} v=${g.tren} /></td>
        <td class="r num">${fmt.persen(g.persen_tuntas)}</td>
      </tr>`)}</tbody></table></div>
  </section>`;
}

/** Pilih try out yang ikut dihitung. */
export function PilihTryout({ a, value, onChange }) {
  const aktif = value ? value.split(',') : a.tersedia.map((k) => k.kode);
  const ubah = (kode) => {
    const baru = aktif.includes(kode) ? aktif.filter((k) => k !== kode) : [...aktif, kode];
    if (!baru.length) return;
    onChange(baru.length === a.tersedia.length ? '' : a.tersedia.filter((k) => baru.includes(k.kode)).map((k) => k.kode).join(','));
  };
  return html`<div class="row wrap gap-8"><span class="small muted" style="font-weight:700">Try out dihitung:</span>
    ${a.tersedia.map((k) => html`<button type="button" class=${cls('chip', aktif.includes(k.kode) ? 'sky-solid' : '')} style="cursor:pointer;border:0;padding:6px 12px;font-size:12.5px" aria-pressed=${aktif.includes(k.kode)} onClick=${() => ubah(k.kode)}>
      ${aktif.includes(k.kode) && html`<${Icon} n="check" s=${12} />`}${k.nama}</button>`)}</div>`;
}
