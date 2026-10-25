// Dasbor capaian wilayah: nasional → provinsi → kab/kota → kecamatan (opsional) → kelurahan (opsional), dengan berbagai diagram.
import { html, useState, useEffect, useMemo, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { get } from '../api.js';
import { go } from '../router.js';
import { Loading, ErrorBox, Empty, useAsync, PageHead, Seg, Field, toastErr } from '../ui.js';
import { PetaIndonesia, useDataPeta, posisiSekolah, warnaNilai, LEGENDA_NILAI } from '../peta.js';
import { BatangH, Donat, BatangTumpuk, KotakGaris, BatangKelompok, Histogram, ringkas, PREDIKAT, PALET } from '../diagram.js';
import { GrafikTren, WARNA_SERI } from './rekap.js';
import { eksporDasbor } from '../excel.js';

const TINGKAT = ['nasional', 'provinsi', 'kabkota', 'kecamatan', 'kelurahan'];
const NAMA_LEVEL = { provinsi: 'Provinsi', kabkota: 'Kab/Kota', kecamatan: 'Kecamatan', kelurahan: 'Kelurahan', sekolah: 'Sekolah', kelas: 'Kelas' };
const PILIHAN_GRUP = {
  nasional: ['provinsi', 'kabkota', 'sekolah'], provinsi: ['kabkota', 'kecamatan', 'sekolah'], kabkota: ['kecamatan', 'kelurahan', 'sekolah'],
  kecamatan: ['kelurahan', 'sekolah'], kelurahan: ['sekolah', 'kelas'],
};
const KUNCI = {
  provinsi: (r) => [r.provinsi_kode || '-', r.provinsi || 'Provinsi belum diisi', ''],
  kabkota: (r) => [r.kabkota_kode || '-', r.kabkota || 'Kab/Kota belum diisi', r.provinsi || ''],
  kecamatan: (r) => [`${r.kabkota_kode}|${r.kecamatan || '-'}`, r.kecamatan ? `Kec. ${r.kecamatan}` : 'Kecamatan belum diisi', r.kabkota || ''],
  kelurahan: (r) => [`${r.kabkota_kode}|${r.kecamatan}|${r.kelurahan || '-'}`, r.kelurahan ? `Kel. ${r.kelurahan}` : 'Kelurahan belum diisi', r.kecamatan ? `Kec. ${r.kecamatan}` : ''],
  sekolah: (r) => [r.npsn, r.sekolah, [r.kecamatan && `Kec. ${r.kecamatan}`, r.kabkota].filter(Boolean).join(', ')],
  kelas: (r) => [`${r.npsn}|${r.kelas}`, `Kelas ${r.kelas || '-'}`, r.sekolah],
};

/** Ubah hasil API (per mapel / akumulatif / semua try out) menjadi baris seragam per siswa. */
function barisData(mode, d) {
  if (!d) return [];
  if (mode === 'rekap') return d.siswa.map((s) => ({ ...s, nilai: s.rata }));
  if (mode === 'akum') return d.ranking.filter((p) => p.lengkap).map((p) => ({ ...p, perMapel: p.nilai, nilai: p.rata }));
  return d.ranking.filter((p) => p.nilai != null);
}

export function DasborWilayah({ base = '#/pusat' }) {
  const opsi = useAsync(() => get('analisis/opsi'), []);
  const peta = useDataPeta();
  const [f, setF] = useState({ paket: '@rekap', provinsi: '', kabkota: '', kecamatan: '', kelurahan: '', grup: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const rekap = f.paket === '@rekap';
  const [mapel, kategori] = rekap ? [] : f.paket.split('|');
  const mode = rekap ? 'rekap' : mapel === '*' ? 'akum' : 'mapel';
  const tingkat = f.kelurahan ? 'kelurahan' : f.kecamatan ? 'kecamatan' : f.kabkota ? 'kabkota' : f.provinsi ? 'provinsi' : 'nasional';
  const pilihanGrup = PILIHAN_GRUP[tingkat];
  const grup = pilihanGrup.includes(f.grup) ? f.grup : pilihanGrup[0];
  const filter = { provinsi: f.provinsi, kabkota: f.kabkota, kecamatan: f.kecamatan, kelurahan: f.kelurahan };
  const a = useAsync(() => (mode === 'rekap' ? get('rekap-tryout', filter) : mode === 'akum' ? get('akumulatif', { kategori, ...filter }) : get('analisis', { mapel, kategori, ...filter })),
    [f.paket, f.provinsi, f.kabkota, f.kecamatan, f.kelurahan]);
  const target = a.data?.target ?? 75;
  const modeData = (x) => (x?.rekap ? 'rekap' : x?.akumulatif ? 'akum' : x ? 'mapel' : null);
  const siap = a.data && modeData(a.data) === mode;
  const rows = useMemo(() => (siap ? barisData(mode, a.data) : []), [a.data, siap]);

  // kelompok sesuai pilihan pengguna
  const kelompok = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const [k, label, sub] = KUNCI[grup](r);
      const g = m.get(k) || { kunci: k, label, sub, baris: [], contoh: r };
      g.baris.push(r);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, ...ringkas(g.baris.map((r) => r.nilai), target), sekolah: new Set(g.baris.map((r) => r.npsn)).size }))
      .sort((x, y) => y.rata - x.rata);
  }, [rows, grup, target]);
  const semua = useMemo(() => ringkas(rows.map((r) => r.nilai), target), [rows, target]);

  // turun satu tingkat saat kelompok/wilayah diklik; sekolah → profil 360
  const bisaProfil = base === '#/pusat' || base === '#/supervisor';
  const telusuri = (g) => {
    const r = g.contoh;
    if (grup === 'provinsi') set({ provinsi: r.provinsi_kode || '', kabkota: '', kecamatan: '', kelurahan: '', grup: '' });
    else if (grup === 'kabkota') set({ provinsi: r.provinsi_kode || '', kabkota: r.kabkota_kode || '', kecamatan: '', kelurahan: '', grup: '' });
    else if (grup === 'kecamatan') set({ provinsi: r.provinsi_kode || '', kabkota: r.kabkota_kode || '', kecamatan: r.kecamatan || '', kelurahan: '', grup: '' });
    else if (grup === 'kelurahan') set({ provinsi: r.provinsi_kode || '', kabkota: r.kabkota_kode || '', kecamatan: r.kecamatan || '', kelurahan: r.kelurahan || '', grup: '' });
    else if (grup === 'sekolah' && bisaProfil) go(`${base.slice(1)}/sekolah/${r.npsn}/profil`);
  };

  const w = opsi.data?.wilayah || [];
  const uniq = (arr, k, label) => [...new Map(arr.filter((x) => x[k]).map((x) => [x[k], x[label]])).entries()];
  const provList = uniq(w, 'provinsi_kode', 'provinsi');
  const kabList = uniq(w.filter((x) => !f.provinsi || x.provinsi_kode === f.provinsi), 'kabkota_kode', 'kabkota');
  const kecList = uniq(w.filter((x) => x.kabkota_kode === f.kabkota), 'kecamatan', 'kecamatan');
  const kelList = uniq(w.filter((x) => x.kabkota_kode === f.kabkota && x.kecamatan === f.kecamatan), 'kelurahan', 'kelurahan');
  const kategoriList = [...new Map((opsi.data?.paket || []).map((p) => [p.kategori, p.kategori_nama])).entries()];
  const namaProv = provList.find(([k]) => k === f.provinsi)?.[1];
  const namaKab = kabList.find(([k]) => k === f.kabkota)?.[1];
  const namaPaket = rekap ? 'Semua try out' : mode === 'akum' ? `Semua mapel · ${kategoriList.find(([k]) => k === kategori)?.[1] || kategori}`
    : (() => { const p = opsi.data?.paket.find((x) => x.mapel === mapel && x.kategori === kategori); return p ? `${p.mapel_nama} · ${p.kategori_nama}` : ''; })();
  const lingkup = [f.kelurahan && `Kel. ${f.kelurahan}`, f.kecamatan && `Kec. ${f.kecamatan}`, namaKab, namaProv].filter(Boolean).join(', ') || 'Nasional';

  const ekspor = async () => { try { await eksporDasbor({ kelompok, semua, grup: NAMA_LEVEL[grup], target, lingkup, paket: namaPaket }); } catch (e) { toastErr(e); } };

  return html`
    <${PageHead} title="Dasbor Capaian Wilayah" sub=${`${lingkup} · ${namaPaket}`}>
      <button class="btn btn-o" disabled=${!rows.length} onClick=${ekspor}><span style="color:var(--green-700);display:flex"><${Icon} n="sheet" s=${18} /></span>Unduh Excel</button>
      <button class="btn btn-o" disabled=${!rows.length} onClick=${() => window.print()}><span style="color:var(--red-700);display:flex"><${Icon} n="printer" s=${18} /></span>Cetak</button>
    <//>
    ${opsi.loading ? html`<${Loading} />` : opsi.error ? html`<${ErrorBox} error=${opsi.error} retry=${opsi.reload} />` : !opsi.data.paket.length ? html`<div class="card"><${Empty} icon="pie" title="Belum ada hasil ujian">Dasbor terisi setelah ada siswa yang menyelesaikan ujian.<//></div>` : html`
    <section class="card pad col" style="gap:14px">
      <div class="form-grid">
        <${Field} label="Data yang dianalisis"><select class="select" value=${f.paket} onChange=${(e) => set({ paket: e.target.value })}>
          <option value="@rekap">Rata-rata semua try out</option>
          <optgroup label="Akumulatif semua mapel">${kategoriList.map(([k, n]) => html`<option value=${`*|${k}`}>Semua mapel · ${n}</option>`)}</optgroup>
          <optgroup label="Per mata pelajaran">${opsi.data.paket.map((p) => html`<option value=${`${p.mapel}|${p.kategori}`}>${p.mapel_nama} · ${p.kategori_nama}</option>`)}</optgroup></select><//>
        <${Field} label="Provinsi"><select class="select" value=${f.provinsi} onChange=${(e) => set({ provinsi: e.target.value, kabkota: '', kecamatan: '', kelurahan: '', grup: '' })}><option value="">Nasional (semua provinsi)</option>${provList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select><//>
        <${Field} label="Kabupaten / Kota"><select class="select" value=${f.kabkota} disabled=${!f.provinsi} onChange=${(e) => set({ kabkota: e.target.value, kecamatan: '', kelurahan: '', grup: '' })}><option value="">${f.provinsi ? 'Semua kab/kota' : 'Pilih provinsi dulu'}</option>${kabList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select><//>
        <${Field} label="Kecamatan" hint="opsional"><select class="select" value=${f.kecamatan} disabled=${!f.kabkota} onChange=${(e) => set({ kecamatan: e.target.value, kelurahan: '', grup: '' })}><option value="">${f.kabkota ? 'Semua kecamatan' : 'Pilih kab/kota dulu'}</option>${kecList.map(([k]) => html`<option value=${k}>${k}</option>`)}</select><//>
        <${Field} label="Kelurahan" hint="opsional"><select class="select" value=${f.kelurahan} disabled=${!f.kecamatan} onChange=${(e) => set({ kelurahan: e.target.value, grup: '' })}><option value="">${f.kecamatan ? 'Semua kelurahan' : 'Pilih kecamatan dulu'}</option>${kelList.map(([k]) => html`<option value=${k}>${k}</option>`)}</select><//>
      </div>
      <div class="row wrap" style="justify-content:space-between;gap:12px">
        <nav class="remah" aria-label="Tingkat wilayah">
          ${[['Nasional', { provinsi: '', kabkota: '', kecamatan: '', kelurahan: '' }], namaProv && [namaProv, { kabkota: '', kecamatan: '', kelurahan: '' }],
            namaKab && [namaKab, { kecamatan: '', kelurahan: '' }], f.kecamatan && [`Kec. ${f.kecamatan}`, { kelurahan: '' }], f.kelurahan && [`Kel. ${f.kelurahan}`, {}]].filter(Boolean)
            .map(([l, patch], i, arr) => html`${i > 0 && html`<${Icon} n="chev-r" s=${14} />`}${i === arr.length - 1 ? html`<span class="kini">${l}</span>` : html`<button type="button" onClick=${() => set({ ...patch, grup: '' })}>${l}</button>`}`)}
        </nav>
        <span class="row gap-8 small"><span class="muted" style="font-weight:700">Kelompokkan per</span><${Seg} soft items=${pilihanGrup.map((g) => ({ value: g, label: NAMA_LEVEL[g] }))} value=${grup} onChange=${(g) => set({ grup: g })} /></span>
      </div>
    </section>
    ${a.error ? html`<${ErrorBox} error=${a.error} retry=${a.reload} />` : !siap || a.loading && !rows.length ? html`<${Loading} text="Menghitung…" />` : !rows.length ? html`<div class="card"><${Empty} title="Tidak ada data pada wilayah ini" /></div>` : html`
      <${Kpi} semua=${semua} rows=${rows} kelompok=${kelompok} grup=${grup} target=${target} mode=${mode} a=${a.data} />
      <div class="dasbor-grid">
        <section class="card pad col s8" style="gap:12px">
          <div class="row wrap" style="justify-content:space-between;gap:8px"><h2>Peta Capaian</h2>
            <span class="tiny muted">${tingkat === 'nasional' ? 'Warna provinsi = rata-rata nilai. Klik provinsi untuk menelusuri.' : 'Warna kab/kota = rata-rata nilai · titik = sekolah.'}</span></div>
          ${peta.error ? html`<${ErrorBox} error=${peta.error} /> ` : html`<${PetaCapaian} dasar=${peta.data} rows=${rows} target=${target} fokus=${f.provinsi}
            onProv=${(k) => set({ provinsi: k, kabkota: '', kecamatan: '', kelurahan: '', grup: '' })} onKab=${(k) => set({ kabkota: k, kecamatan: '', kelurahan: '', grup: '' })} />`}
          <div class="row wrap tiny" style="gap:12px;color:var(--text-2)">${LEGENDA_NILAI(target).map(([l, c]) => html`<span class="row gap-4"><span style=${`width:12px;height:12px;border-radius:3px;background:${c}`}></span>${l}</span>`)}</div>
        </section>
        <section class="card pad col s4" style="gap:12px">
          <h2>Komposisi Predikat</h2>
          <${Donat} bagian=${PREDIKAT.map((p, i) => ({ label: p.label, warna: p.warna, nilai: semua.predikat[i] }))} tengah=${fmt.persen(semua.persen)} sub=${`capai target ${target}`} ukuran=${170} />
        </section>
        <section class="card pad col s7" style="gap:12px">
          <div class="row wrap" style="justify-content:space-between;gap:8px"><h2>Peringkat per ${NAMA_LEVEL[grup]}</h2><span class="tiny muted">garis koral = target ${target}${grup === 'sekolah' ? (bisaProfil ? ' · klik untuk profil 360' : '') : grup !== 'kelas' ? ' · klik untuk menelusuri' : ''}</span></div>
          <${BatangH} items=${kelompok.slice(0, 15).map((g) => ({ ...g, nilai: g.rata, sub: `${g.sub ? `${g.sub} · ` : ''}${g.n} siswa` }))} target=${target}
            onPilih=${grup === 'kelas' || (grup === 'sekolah' && !bisaProfil) ? null : telusuri} />
          ${kelompok.length > 15 && html`<span class="tiny muted">Menampilkan 15 teratas dari ${kelompok.length}. Lihat tabel di bawah untuk semuanya.</span>`}
        </section>
        <section class="card pad col s5" style="gap:14px">
          <h2>Sebaran Nilai</h2>
          <${Histogram} nilai=${rows.map((r) => r.nilai)} target=${target} />
          <div class="row tiny" style="gap:16px;color:var(--text-2)"><span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-200)"></span>Di bawah target</span><span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-400)"></span>Mencapai target</span></div>
        </section>
        <section class="card pad col s6" style="gap:12px">
          <h2>Predikat per ${NAMA_LEVEL[grup]}</h2>
          <${BatangTumpuk} items=${kelompok.slice(0, 12).map((g) => ({ label: g.label, bagian: g.predikat }))} seri=${PREDIKAT} />
        </section>
        <section class="card pad col s6" style="gap:12px">
          <h2>Rentang Nilai per ${NAMA_LEVEL[grup]}</h2>
          <${KotakGaris} items=${kelompok.slice(0, 10)} target=${target} />
        </section>
        <${DiagramMode} mode=${mode} a=${a.data} rows=${rows} kelompok=${kelompok} grup=${grup} target=${target} />
        <section class="card col s12" style="gap:0">
          <div class="card-head"><h2 class="grow">Rekap per ${NAMA_LEVEL[grup]}</h2><span class="small muted">${kelompok.length} ${NAMA_LEVEL[grup].toLowerCase()}</span></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th class="c">#</th><th>${NAMA_LEVEL[grup]}</th>${!['sekolah', 'kelas'].includes(grup) && html`<th class="r">Sekolah</th>`}<th class="r">Siswa</th><th class="r">Rata-rata</th><th class="r">Median</th><th class="r">Tertinggi</th><th class="r">Terendah</th><th class="r">Capai target</th></tr></thead>
            <tbody>${kelompok.map((g, i) => html`<tr>
              <td class="c"><strong>${i + 1}</strong></td>
              <td><span class="col" style="gap:0"><strong class="strong">${g.label}</strong><span class="tiny muted">${g.sub}</span></span></td>
              ${!['sekolah', 'kelas'].includes(grup) && html`<td class="r num">${g.sekolah}</td>`}
              <td class="r num">${g.n}</td><td class="r num" style=${`font-weight:800;color:${g.rata < target ? 'var(--orange-700)' : 'var(--ink)'}`}>${fmt.angka(g.rata)}</td>
              <td class="r num">${fmt.angka(g.median)}</td><td class="r num">${fmt.angka(g.maks)}</td><td class="r num">${fmt.angka(g.min)}</td><td class="r num">${fmt.persen(g.persen)}</td>
            </tr>`)}</tbody></table></div>
        </section>
      </div>`}`}`;
}

function Kpi({ semua, rows, target, mode, a }) {
  const sekolah = new Set(rows.map((r) => r.npsn)).size;
  const tren = mode === 'rekap' && a.per_tryout.length > 1 ? a.per_tryout[a.per_tryout.length - 1].rata - a.per_tryout[0].rata : null;
  const jk = ['L', 'P'].map((k) => ringkas(rows.filter((r) => r.jk === k).map((r) => r.nilai), target));
  return html`<section class="grid-auto" style="--min:160px">
    ${[['Siswa', fmt.bulat(semua.n), `${sekolah} sekolah`], ['Rata-rata', fmt.angka(semua.rata), `median ${fmt.angka(semua.median)}`],
      [`Capai target (≥ ${target})`, fmt.persen(semua.persen), `${semua.capai} siswa`],
      ['Tertinggi / terendah', `${fmt.angka(semua.maks)} / ${fmt.angka(semua.min)}`, ''],
      tren != null ? ['Perubahan try out', `${tren > 0 ? '+' : ''}${fmt.angka(tren)}`, `${a.per_tryout[0].nama} → ${a.per_tryout[a.per_tryout.length - 1].nama}`]
        : ['Laki-laki / Perempuan', `${fmt.angka(jk[0].rata)} / ${fmt.angka(jk[1].rata)}`, 'rata-rata nilai']].map(([l, v, s]) =>
      html`<div class="card stat-v"><span class="small muted">${l}</span><strong class="num">${v}</strong><span class="tiny muted ellipsis">${s}</span></div>`)}
  </section>`;
}

/** Peta tematik: provinsi diwarnai rata-rata (nasional); saat provinsi dipilih → kab/kota diwarnai + titik sekolah. */
function PetaCapaian({ dasar, rows, target, fokus, onProv, onKab }) {
  const avg = (key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!k) continue; const x = m.get(k) || [0, 0]; x[0] += r.nilai; x[1]++; m.set(k, x); } return Object.fromEntries([...m].map(([k, [s, n]]) => [k, { rata: s / n, n }])); };
  const prov = avg('provinsi_kode');
  const kab = avg('kabkota_kode');
  const sek = avg('npsn');
  const contoh = new Map(rows.map((r) => [r.npsn, r]));
  const titik = fokus && dasar ? [...contoh.values()].map((r) => { const p = posisiSekolah(r, dasar.titik, dasar.pusatProv); return p && { x: p[0], y: p[1], r: 5, warna: warnaNilai(sek[r.npsn].rata, target) === '#FFB4AE' ? '#E85A50' : warnaNilai(sek[r.npsn].rata, target), judul: `${r.sekolah}: ${fmt.angka(sek[r.npsn].rata)} (${sek[r.npsn].n} siswa)` }; }).filter(Boolean) : [];
  return html`<${PetaIndonesia} dasar=${dasar} fokus=${fokus} titik=${titik} label="Peta capaian per wilayah"
    warnaProv=${(k) => warnaNilai(prov[k]?.rata, target)} warnaKab=${(k) => warnaNilai(kab[k]?.rata, target)}
    judulProv=${(p) => `${p.nama}: ${prov[p.kode] ? `${fmt.angka(prov[p.kode].rata)} (${prov[p.kode].n} siswa)` : 'belum ada data'}`}
    judulKab=${(k) => `${k.nama}: ${kab[k.kode] ? `${fmt.angka(kab[k.kode].rata)} (${kab[k.kode].n} siswa)` : 'belum ada data'}`}
    onPilihProv=${fokus ? null : (k) => prov[k] && onProv(k)} onPilihKab=${(k) => kab[k] && onKab(k)} />`;
}

/** Diagram khusus sesuai data: tren try out, per mapel, atau tingkat kesulitan butir. */
function DiagramMode({ mode, a, rows, kelompok, grup, target }) {
  const atas = kelompok.slice(0, 6);
  const jk = ['L', 'P'].map((k) => rows.filter((r) => r.jk === k));
  const kartuJk = html`<section class="card pad col s5" style="gap:12px">
    <h2>Laki-laki vs Perempuan</h2>
    <${BatangKelompok} kategori=${['Rata-rata', 'Median', '% capai target']} target=${null} tinggi=${210}
      seri=${[['Laki-laki', PALET.azure], ['Perempuan', PALET.lavenderTua]].map(([l, c], i) => { const s = ringkas(jk[i].map((r) => r.nilai), target); return { label: `${l} (${s.n || 0})`, warna: c, nilai: [s.rata ?? null, s.median ?? null, s.n ? s.persen : null] }; })} />
  </section>`;
  if (mode === 'rekap') {
    const K = a.kategori;
    const seri = [{ nama: 'Semua', warna: PALET.navy, tebal: true, nilai: a.per_tryout.map((t) => t.rata) },
      ...atas.map((g, i) => ({ nama: g.label, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: K.map((k) => { const v = g.baris.map((s) => s.tryout[k.kode]?.rata).filter((x) => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; }) }))];
    return html`<section class="card pad col s7" style="gap:12px">
      <div class="row wrap" style="justify-content:space-between"><h2>Tren per Try Out</h2><span class="tiny muted">${atas.length < kelompok.length ? `6 ${NAMA_LEVEL[grup].toLowerCase()} teratas` : ''}</span></div>
      <${GrafikTren} label=${K.map((k) => k.nama)} seri=${seri} target=${target} />
    </section>${kartuJk}`;
  }
  if (mode === 'akum') {
    return html`<section class="card pad col s7" style="gap:12px">
      <h2>Rata-rata per Mata Pelajaran</h2>
      <${BatangKelompok} kategori=${['Semua', ...atas.map((g) => g.label)]} target=${target}
        seri=${a.mapel.map((m, i) => ({ label: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: [rows, ...atas.map((g) => g.baris)].map((b) => { const v = b.map((r) => r.perMapel?.[m.kode]).filter((x) => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; }) }))} />
    </section>${kartuJk}`;
  }
  const butir = a.butir || [];
  const tingkat = [['Sulit (< 30% benar)', PALET.koral, butir.filter((b) => b.p < 0.3).length], ['Sedang', PALET.lavender, butir.filter((b) => b.p >= 0.3 && b.p <= 0.7).length], ['Mudah (> 70% benar)', PALET.azure, butir.filter((b) => b.p > 0.7).length]];
  return html`<section class="card pad col s7" style="gap:12px">
    <h2>Tingkat Kesulitan Butir Soal</h2>
    <${Donat} bagian=${tingkat.map(([label, warna, nilai]) => ({ label, warna, nilai }))} tengah=${butir.length} sub="butir soal" ukuran=${160} />
    <div class="col" style="gap:6px"><strong class="small">5 butir paling sulit</strong>
      ${butir.slice(0, 5).map((b) => html`<div class="row small" style="gap:10px"><span class="chip">No. ${b.nomor}</span><span class="grow ellipsis muted">${b.cuplikan}</span><strong class="num">${fmt.angka(b.persen_benar)}%</strong></div>`)}</div>
  </section>${kartuJk}`;
}
