import { html, useState, useEffect, useMemo, fmt, cls, TIPE_LABEL, TIPE_WARNA } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get } from '../api.js';
import { openPrint } from '../router.js';
import { Loading, ErrorBox, Empty, Chip, toastErr, useAsync, PageHead, Seg, Bar, Avatar, Field, Pager } from '../ui.js';
import { eksporAnalisis, eksporAkumulatif, eksporRekapTryout } from '../excel.js';
import { RekapRingkasan, RekapSiswa, RekapGrup, PilihTryout } from './rekap.js';

const LEVEL = [
  ['provinsi', 'Provinsi'], ['kabkota', 'Kab/Kota'], ['kecamatan', 'Kecamatan'], ['kelurahan', 'Kelurahan'], ['sekolah', 'Sekolah'], ['kelas', 'Kelas'],
];

/** Analisis hasil: ranking, kesulitan butir, sebaran nilai, pengelompokan wilayah. lingkup: 'pusat' | 'sekolah' */
export function Analisis({ lingkup = 'pusat' }) {
  const opsi = useAsync(() => get('analisis/opsi'), []);
  const sekolahSaja = lingkup === 'sekolah';
  const [f, setF] = useState({ paket: new URLSearchParams(location.hash.split('?')[1] || '').get('paket') || '', tryout: '', provinsi: '', kabkota: '', kecamatan: '', kelurahan: '', npsn: '', kelas: '', grup: sekolahSaja ? 'kelas' : 'kabkota' });
  const [tab, setTab] = useState('ringkasan');
  useEffect(() => { if (opsi.data && !f.paket && opsi.data.paket[0]) setF((x) => ({ ...x, paket: `${opsi.data.paket[0].mapel}|${opsi.data.paket[0].kategori}` })); }, [opsi.data]);
  const rekap = f.paket === '@rekap';
  const [mapel, kategori] = rekap ? [] : f.paket.split('|');
  const q = rekap ? { kategori: f.tryout } : { mapel, kategori };
  Object.assign(q, { grup: f.grup, provinsi: f.provinsi, kabkota: f.kabkota, kecamatan: f.kecamatan, kelurahan: f.kelurahan, npsn: f.npsn, kelas: f.kelas });
  const akum = mapel === '*';
  const mode = rekap ? 'rekap' : akum ? 'akum' : 'mapel';
  const modeData = (d) => (d?.rekap ? 'rekap' : d?.akumulatif ? 'akum' : 'mapel');
  const a = useAsync(() => (rekap ? get('rekap-tryout', q) : mapel ? get(akum ? 'akumulatif' : 'analisis', q) : Promise.resolve(null)), [f.paket, f.tryout, f.grup, f.provinsi, f.kabkota, f.kecamatan, f.kelurahan, f.npsn, f.kelas]);

  const w = opsi.data?.wilayah || [];
  const uniq = (arr, k, label) => [...new Map(arr.filter((x) => x[k]).map((x) => [x[k], x[label]])).entries()];
  const provList = uniq(w, 'provinsi_kode', 'provinsi');
  const kabList = uniq(w.filter((x) => !f.provinsi || x.provinsi_kode === f.provinsi), 'kabkota_kode', 'kabkota');
  const kecList = uniq(w.filter((x) => x.kabkota_kode === f.kabkota), 'kecamatan', 'kecamatan');
  const kelList = uniq(w.filter((x) => x.kabkota_kode === f.kabkota && x.kecamatan === f.kecamatan), 'kelurahan', 'kelurahan');
  const sekList = w.filter((x) => (!f.provinsi || x.provinsi_kode === f.provinsi) && (!f.kabkota || x.kabkota_kode === f.kabkota) && (!f.kecamatan || x.kecamatan === f.kecamatan) && (!f.kelurahan || x.kelurahan === f.kelurahan));
  const paket = opsi.data?.paket.find((p) => `${p.mapel}|${p.kategori}` === f.paket);
  const kategoriList = [...new Map((opsi.data?.paket || []).map((p) => [p.kategori, p.kategori_nama])).entries()];
  const namaKategori = kategoriList.find(([k]) => k === kategori)?.[1] || kategori;
  const lingkupTeks = [f.kelurahan && `Kel. ${f.kelurahan}`, f.kecamatan && `Kec. ${f.kecamatan}`, kabList.find(([k]) => k === f.kabkota)?.[1], provList.find(([k]) => k === f.provinsi)?.[1],
    f.npsn && w.find((x) => x.npsn === f.npsn)?.nama, f.kelas && `Kelas ${f.kelas}`].filter(Boolean).join(' · ') || (sekolahSaja ? session.sekolah?.nama : 'Semua wilayah');
  const set = (p) => setF({ ...f, ...p });

  const ekspor = async () => {
    try {
      if (rekap) await eksporRekapTryout(a.data, { lingkup: lingkupTeks, file: lingkupTeks });
      else if (akum) await eksporAkumulatif(a.data, { kategori: namaKategori, lingkup: lingkupTeks, file: lingkupTeks });
      else await eksporAnalisis(a.data, { mapel: paket.mapel_nama, kategori: paket.kategori_nama, lingkup: lingkupTeks, file: lingkupTeks });
    } catch (e) { toastErr(e); }
  };

  return html`
    <${PageHead} title=${sekolahSaja ? 'Analisis Hasil' : 'Analisis Hasil Ujian'} sub=${lingkupTeks}>
      <button class="btn btn-o" disabled=${!a.data} onClick=${ekspor}><span style="color:var(--green-700);display:flex"><${Icon} n="sheet" s=${18} /></span>Unduh Excel</button>
      <button class="btn btn-o" disabled=${!a.data} onClick=${() => openPrint(rekap ? '/cetak/rekap-tryout' : akum ? '/cetak/akumulatif' : '/cetak/analisis', { ...q, lingkup: lingkupTeks })}><span style="color:var(--red-700);display:flex"><${Icon} n="file-pdf" s=${18} /></span>Cetak / PDF</button>
    <//>
    ${opsi.loading ? html`<${Loading} />` : opsi.error ? html`<${ErrorBox} error=${opsi.error} retry=${opsi.reload} />` : !opsi.data.paket.length ? html`<div class="card"><${Empty} icon="pie" title="Belum ada hasil ujian">Analisis tersedia setelah ada siswa yang menyelesaikan ujian.<//></div>` : html`
    <section class="card pad col" style="gap:14px">
      <div class="form-grid">
        <${Field} label="Paket ujian"><select class="select" value=${f.paket} onChange=${(e) => set({ paket: e.target.value })}>
          <optgroup label="Rekap perkembangan"><option value="@rekap">Rekap & analisis semua try out</option></optgroup>
          <optgroup label="Akumulatif semua mata pelajaran">${kategoriList.map(([k, n]) => html`<option value=${`*|${k}`}>Semua mapel · ${n}</option>`)}</optgroup>
          <optgroup label="Per mata pelajaran">${opsi.data.paket.map((p) => html`<option value=${`${p.mapel}|${p.kategori}`}>${p.mapel_nama} · ${p.kategori_nama} (${p.n} peserta)</option>`)}</optgroup></select><//>
        ${!sekolahSaja && html`
          <${Field} label="Provinsi"><select class="select" value=${f.provinsi} onChange=${(e) => set({ provinsi: e.target.value, kabkota: '', kecamatan: '', kelurahan: '', npsn: '' })}><option value="">Semua provinsi</option>${provList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select><//>
          <${Field} label="Kabupaten / Kota"><select class="select" value=${f.kabkota} onChange=${(e) => set({ kabkota: e.target.value, kecamatan: '', kelurahan: '', npsn: '' })}><option value="">Semua kab/kota</option>${kabList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select><//>
          <${Field} label="Kecamatan"><select class="select" value=${f.kecamatan} disabled=${!f.kabkota} onChange=${(e) => set({ kecamatan: e.target.value, kelurahan: '', npsn: '' })}><option value="">${f.kabkota ? 'Semua kecamatan' : 'Pilih kab/kota dulu'}</option>${kecList.map(([k]) => html`<option value=${k}>${k}</option>`)}</select><//>
          <${Field} label="Kelurahan"><select class="select" value=${f.kelurahan} disabled=${!f.kecamatan} onChange=${(e) => set({ kelurahan: e.target.value, npsn: '' })}><option value="">${f.kecamatan ? 'Semua kelurahan' : 'Pilih kecamatan dulu'}</option>${kelList.map(([k]) => html`<option value=${k}>${k}</option>`)}</select><//>
          <${Field} label="Sekolah"><select class="select" value=${f.npsn} onChange=${(e) => set({ npsn: e.target.value })}><option value="">Semua sekolah</option>${sekList.map((s) => html`<option value=${s.npsn}>${s.nama}</option>`)}</select><//>`}
        <${Field} label="Kelas"><select class="select" value=${f.kelas} onChange=${(e) => set({ kelas: e.target.value })}><option value="">Semua kelas</option>${(opsi.data.kelas || []).map((k) => html`<option value=${k}>${k}</option>`)}</select><//>
      </div>
      ${rekap && a.data?.rekap && html`<${PilihTryout} a=${a.data} value=${f.tryout} onChange=${(v) => set({ tryout: v })} />`}
    </section>
    <${Seg} items=${[{ value: 'ringkasan', label: rekap ? 'Perkembangan' : 'Ringkasan & Sebaran', icon: 'chart' }, { value: 'ranking', label: rekap ? 'Rekap Nilai Siswa' : 'Ranking Peserta', icon: 'trophy' },
      ...(akum || rekap ? [] : [{ value: 'butir', label: 'Kesulitan Butir Soal', icon: 'layers' }]), { value: 'grup', label: 'Pengelompokan', icon: 'map' }]}
      value=${(akum || rekap) && tab === 'butir' ? 'ringkasan' : tab} onChange=${setTab} />
    ${(a.loading && (!a.data || modeData(a.data) !== mode)) || (a.data && modeData(a.data) !== mode) ? html`<${Loading} text="Menghitung…" />` : a.error ? html`<${ErrorBox} error=${a.error} retry=${a.reload} />` : !a.data ? null : (rekap ? a.data.ringkasan.siswa : a.data.ringkasan.peserta) === 0 ? html`<div class="card"><${Empty} title="Tidak ada peserta pada filter ini" /></div>` : html`
      ${rekap ? html`
        ${(tab === 'ringkasan' || tab === 'butir') && html`<${RekapRingkasan} a=${a.data} onTab=${setTab} />`}
        ${tab === 'ranking' && html`<${RekapSiswa} a=${a.data} sekolahSaja=${sekolahSaja} lingkup=${lingkupTeks} />`}
        ${tab === 'grup' && html`<${RekapGrup} a=${a.data} level=${f.grup} sekolahSaja=${sekolahSaja} onLevel=${(g) => set({ grup: g })} />`}` : akum ? html`
        ${(tab === 'ringkasan' || tab === 'butir') && html`<${AkumRingkasan} a=${a.data} onTab=${setTab} />`}
        ${tab === 'ranking' && html`<${AkumRanking} a=${a.data} sekolahSaja=${sekolahSaja} />`}
        ${tab === 'grup' && html`<${AkumGrup} a=${a.data} level=${f.grup} sekolahSaja=${sekolahSaja} onLevel=${(g) => set({ grup: g })} />`}` : html`
      ${tab === 'ringkasan' && html`<${Ringkasan} a=${a.data} sekolahSaja=${sekolahSaja} onTab=${setTab} />`}
      ${tab === 'ranking' && html`<${Ranking} a=${a.data} sekolahSaja=${sekolahSaja} />`}
      ${tab === 'butir' && html`<${Butir} a=${a.data} />`}
      ${tab === 'grup' && html`<${Grup} a=${a.data} level=${f.grup} sekolahSaja=${sekolahSaja} onLevel=${(g) => set({ grup: g })} />`}`}
    `}`}`;
}

function Ringkasan({ a, sekolahSaja, onTab }) {
  const r = a.ringkasan;
  const maxBin = Math.max(1, ...a.distribusi.map((d) => d.n));
  return html`
    <section class="grid-auto" style="--min:170px">
      ${[['Peserta', fmt.bulat(r.peserta), r.menunggu_koreksi ? `${r.menunggu_koreksi} menunggu koreksi` : `${r.sekolah} sekolah`],
        ['Rata-rata', fmt.angka(r.rata), `median ${fmt.angka(r.median)} · SD ${fmt.angka(r.sd)}`],
        ['Nilai tertinggi', fmt.angka(r.maks), a.ranking[0]?.nama || ''],
        ['Nilai terendah', fmt.angka(r.min), ''],
        [`Capai target (≥ ${a.target})`, fmt.persen(r.persen_tuntas), `${r.tuntas} dari ${r.n} siswa`]].map(([l, v, s]) =>
        html`<div class="card stat-v"><span class="small muted">${l}</span><strong class="num">${v}</strong><span class="tiny muted ellipsis">${s}</span></div>`)}
    </section>
    <section class="row wrap" style="gap:20px;align-items:stretch">
      <div class="card pad col" style="flex:999 1 460px;gap:16px">
        <div class="row" style="justify-content:space-between"><h2>Sebaran Nilai</h2><span class="tiny muted">jumlah siswa per rentang nilai</span></div>
        <div class="hist" role="img" aria-label="Histogram sebaran nilai">
          ${a.distribusi.map((d) => html`<div class=${cls('b', d.dari >= a.target && 'tuntas')}><strong>${d.n || ''}</strong><span style=${`height:${(d.n / maxBin) * 100}%`}></span></div>`)}
        </div>
        <div class="hist-x">${a.distribusi.map((d) => html`<span>${d.label}</span>`)}</div>
        <div class="row tiny" style="gap:16px;color:var(--text-2)"><span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-200)"></span>Di bawah target</span>
          <span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-400)"></span>Mencapai target capaian (${a.target})</span></div>
      </div>
      <div class="card pad col" style="flex:1 1 320px;gap:12px">
        <div class="row" style="justify-content:space-between"><h2>Butir Paling Sulit</h2><button class="btn btn-g btn-sm" onClick=${() => onTab('butir')}>Semua</button></div>
        ${a.butir.slice(0, 5).map((b) => html`<div class="col" style="gap:6px">
          <div class="row small" style="justify-content:space-between"><span><strong>Soal ${b.nomor}</strong> <span class="muted">· ${TIPE_LABEL[b.tipe]}</span></span>
            <strong style=${`color:${b.p < 0.3 ? 'var(--red-700)' : b.p <= 0.7 ? 'var(--amber-800)' : 'var(--green-700)'}`}>${fmt.angka(b.persen_benar)}% benar</strong></div>
          <${Bar} value=${b.persen_benar} tone=${b.p < 0.3 ? 'red' : b.p <= 0.7 ? 'amber' : 'green'} /></div>`)}
      </div>
    </section>
    <section class="card pad col" style="gap:12px">
      <div class="row" style="justify-content:space-between"><h2>${sekolahSaja ? 'Peringkat Kelas' : 'Peringkat Kelompok'}</h2><button class="btn btn-g btn-sm" onClick=${() => onTab('grup')}>Detail</button></div>
      ${a.grup.items.slice(0, 6).map((g) => html`<div class="hbar"><span style="width:28px;font-weight:800" class="small">${g.peringkat}</span>
        <span class="col" style="width:min(320px,45%);gap:0;min-width:0"><strong class="small ellipsis">${g.nama}</strong><span class="tiny muted ellipsis">${g.induk || ''}</span></span>
        <${Bar} value=${g.rata} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(g.rata)}</strong></div>`)}
    </section>`;
}

function Ranking({ a, sekolahSaja }) {
  const [q, setQ] = useState('');
  const [hal, setHal] = useState(1);
  const per = 50;
  const list = a.ranking.filter((p) => !q || p.nama.toLowerCase().includes(q.toLowerCase()) || p.username.includes(q) || (p.sekolah || '').toLowerCase().includes(q.toLowerCase()));
  const medal = ['#F59E0B', '#94A3B8', '#C2410C'];
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><h2 class="grow">Ranking Keseluruhan</h2>
      <label class="input-icon soft" style="flex:0 1 280px;min-height:42px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari nama, nomor, sekolah" value=${q} onInput=${(e) => { setQ(e.target.value); setHal(1); }} aria-label="Cari peserta" /></label></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>Peserta</th><th>Kelas</th>${!sekolahSaja && html`<th>Sekolah</th><th>Wilayah</th>`}<th class="r">Objektif</th><th class="r">Uraian</th><th class="r">Nilai</th></tr></thead>
      <tbody>${list.slice((hal - 1) * per, hal * per).map((p) => html`<tr>
        <td class="c">${p.peringkat ? html`<span class="tile sm" style=${`margin:auto;${p.peringkat <= 3 ? `background:${medal[p.peringkat - 1]};color:#fff` : 'background:var(--bg);color:var(--text-2)'}`}>${p.peringkat}</span>` : '–'}</td>
        <td><span class="col" style="gap:0"><strong class="strong">${p.nama}</strong><span class="tiny muted">${p.username}</span></span></td>
        <td>${p.kelas}</td>
        ${!sekolahSaja && html`<td class="small">${p.sekolah}</td><td class="tiny muted">${[p.kecamatan, p.kabkota].filter(Boolean).join(', ')}</td>`}
        <td class="r num">${fmt.angka(p.skor_objektif)}</td>
        <td class="r">${p.ada_manual ? (p.nilai == null ? html`<${Chip} c="amber">menunggu<//>` : fmt.angka(p.skor_manual)) : '–'}</td>
        <td class="r num" style="font-weight:800;color:${p.nilai != null && p.nilai < a.target ? 'var(--orange-700)' : 'var(--ink)'}">${fmt.angka(p.nilai)}</td>
      </tr>`)}</tbody></table></div>
    <div class="tbl-foot"><${Pager} halaman=${hal} per=${per} total=${list.length} onChange=${setHal} /></div>
  </section>`;
}

function Butir({ a }) {
  const [buka, setBuka] = useState(null);
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Urutan Soal: Paling Sulit → Paling Mudah</h2>
      <span class="small muted">Tingkat kesukaran = rata-rata skor ÷ skor maksimum. Daya beda = selisih kelompok atas 27% dan bawah 27%.</span></div>
      <span class="row wrap gap-8"><${Chip} c="red">Sulit < 30%<//><${Chip} c="amber">Sedang 30–70%<//><${Chip} c="green">Mudah > 70%<//></span></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">Urutan</th><th>Soal</th><th style="min-width:200px">% Benar</th><th>Kesukaran</th><th class="r">Daya beda</th><th>Kualitas</th><th class="r">Penjawab</th></tr></thead>
      <tbody>${a.butir.map((b, i) => html`<tr style="cursor:pointer" onClick=${() => setBuka(buka === b.soal_id ? null : b.soal_id)}>
        <td class="c"><strong>${i + 1}</strong></td>
        <td style="max-width:420px"><div class="col" style="gap:4px"><span class="row gap-8"><strong class="strong">No. ${b.nomor}</strong><${Chip} c=${TIPE_WARNA[b.tipe]}>${TIPE_LABEL[b.tipe]}<//></span>
          <span class="tiny muted" style=${buka === b.soal_id ? '' : 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden'}>${b.cuplikan}</span>
          ${buka === b.soal_id && b.sebaran_opsi && html`<div class="row wrap gap-8" style="margin-top:6px">${b.sebaran_opsi.map((o) => html`<span class=${cls('chip', o.kode === b.kunci ? 'green' : '')}>${o.kode}: ${o.n} (${b.n ? Math.round((o.n / b.n) * 100) : 0}%)${o.kode === b.kunci ? ' ✓' : ''}</span>`)}
            ${b.kosong > 0 && html`<span class="chip">Kosong: ${b.kosong}</span>`}</div>`}</div></td>
        <td><span class="hbar"><${Bar} value=${b.persen_benar} tone=${b.p < 0.3 ? 'red' : b.p <= 0.7 ? 'amber' : 'green'} /><strong class="num small" style="width:48px;text-align:right">${fmt.angka(b.persen_benar)}%</strong></span></td>
        <td><${Chip} c=${b.kesukaran === 'Sulit' ? 'red' : b.kesukaran === 'Sedang' ? 'amber' : 'green'}>${b.kesukaran}<//></td>
        <td class="r num">${b.daya_beda == null ? '–' : fmt.angka(b.daya_beda, 2)}</td>
        <td class="small" style=${b.kualitas_daya_beda === 'Perlu revisi' ? 'color:var(--red-700);font-weight:700' : ''}>${b.kualitas_daya_beda}</td>
        <td class="r num">${b.n}</td>
      </tr>`)}</tbody></table></div>
    <div class="tbl-foot small muted">Klik baris pilihan ganda untuk melihat sebaran jawaban per opsi (analisis pengecoh).</div>
  </section>`;
}

function Grup({ a, level, onLevel, sekolahSaja }) {
  const items = a.grup.items;
  const levels = sekolahSaja ? LEVEL.filter(([k]) => k === 'kelas') : LEVEL;
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Pengelompokan Klasikal</h2><span class="small muted">Rekap nilai per ${LEVEL.find(([k]) => k === level)?.[1].toLowerCase()}, diurutkan dari rata-rata tertinggi.</span></div>
      ${levels.length > 1 && html`<${Seg} soft items=${levels.map(([value, label]) => ({ value, label }))} value=${level} onChange=${onLevel} />`}</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>${LEVEL.find(([k]) => k === level)?.[1]}</th>${level !== 'sekolah' && level !== 'kelas' && html`<th class="r">Sekolah</th>`}<th class="r">Peserta</th><th style="min-width:200px">Rata-rata</th><th class="r">Median</th><th class="r">Tertinggi</th><th class="r">Terendah</th><th class="r">Capai target</th></tr></thead>
      <tbody>${items.map((g) => html`<tr>
        <td class="c"><strong>${g.peringkat}</strong></td>
        <td><span class="col" style="gap:0"><strong class="strong">${g.nama}</strong><span class="tiny muted">${g.induk}</span></span></td>
        ${level !== 'sekolah' && level !== 'kelas' && html`<td class="r">${g.jml_sekolah}</td>`}
        <td class="r num">${g.n}</td>
        <td><span class="hbar"><${Bar} value=${g.rata} tone=${g.rata < a.target ? 'amber' : ''} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(g.rata)}</strong></span></td>
        <td class="r num">${fmt.angka(g.median)}</td><td class="r num">${fmt.angka(g.maks)}</td><td class="r num">${fmt.angka(g.min)}</td>
        <td class="r num">${fmt.persen(g.persen_tuntas)}</td>
      </tr>`)}</tbody></table></div>
  </section>`;
}

// ---------- tampilan akumulatif semua mapel ----------
function AkumRingkasan({ a, onTab }) {
  const r = a.ringkasan;
  const maxBin = Math.max(1, ...a.distribusi.map((d) => d.n));
  const top = a.ranking.find((p) => p.peringkat === 1);
  return html`
    <section class="grid-auto" style="--min:170px">
      ${[['Siswa', fmt.bulat(r.peserta), `${r.lengkap} mengikuti semua mapel`], ['Rata-rata gabungan', fmt.angka(r.rata), `median ${fmt.angka(r.median)}`],
        ['Rata-rata tertinggi', fmt.angka(r.maks), top?.nama || ''], ['Rata-rata terendah', fmt.angka(r.min), ''],
        [`Capai target (≥ ${a.target})`, fmt.persen(r.persen_tuntas), `${r.tuntas} dari ${r.n} siswa`]].map(([l, v, sub]) =>
        html`<div class="card stat-v"><span class="small muted">${l}</span><strong class="num">${v}</strong><span class="tiny muted ellipsis">${sub}</span></div>`)}
    </section>
    <section class="row wrap" style="gap:20px;align-items:stretch">
      <div class="card pad col" style="flex:1 1 380px;gap:14px">
        <h2>Rata-rata per Mata Pelajaran</h2>
        ${a.per_mapel.map((m) => html`<div class="col" style="gap:6px">
          <div class="row small" style="justify-content:space-between"><strong>${m.nama}</strong><span class="muted">${m.n} siswa · capai target ${fmt.persen(m.persen_tuntas)}</span></div>
          <div class="hbar"><${Bar} value=${m.rata} tone=${m.rata < a.target ? 'amber' : ''} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(m.rata)}</strong></div></div>`)}
      </div>
      <div class="card pad col" style="flex:999 1 460px;gap:16px">
        <div class="row" style="justify-content:space-between"><h2>Sebaran Rata-rata Gabungan</h2><button class="btn btn-g btn-sm" onClick=${() => onTab('ranking')}>Ranking</button></div>
        <div class="hist" role="img" aria-label="Histogram rata-rata gabungan">
          ${a.distribusi.map((d) => html`<div class=${cls('b', d.dari >= a.target && 'tuntas')}><strong>${d.n || ''}</strong><span style=${`height:${(d.n / maxBin) * 100}%`}></span></div>`)}
        </div>
        <div class="hist-x">${a.distribusi.map((d) => html`<span>${d.label}</span>`)}</div>
        <span class="tiny muted">Hanya siswa yang sudah mengikuti semua mata pelajaran (${a.mapel.map((m) => m.nama).join(', ')}).</span>
      </div>
    </section>`;
}

function AkumRanking({ a, sekolahSaja }) {
  const [q, setQ] = useState('');
  const [hal, setHal] = useState(1);
  const per = 50;
  const list = a.ranking.filter((p) => !q || p.nama.toLowerCase().includes(q.toLowerCase()) || p.username.includes(q) || (p.sekolah || '').toLowerCase().includes(q.toLowerCase()));
  const medal = ['#F59E0B', '#94A3B8', '#C2410C'];
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Ranking Akumulatif</h2><span class="small muted">Diurutkan dari rata-rata semua mata pelajaran ${a.kategori?.nama || ''}</span></div>
      <label class="input-icon soft" style="flex:0 1 280px;min-height:42px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari nama, nomor, sekolah" value=${q} onInput=${(e) => { setQ(e.target.value); setHal(1); }} aria-label="Cari peserta" /></label></div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>Peserta</th><th>Kelas</th>${!sekolahSaja && html`<th>Sekolah</th>`}${a.mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th class="r">Jumlah</th><th class="r">Rata-rata</th></tr></thead>
      <tbody>${list.slice((hal - 1) * per, hal * per).map((p) => html`<tr>
        <td class="c">${p.peringkat ? html`<span class="tile sm" style=${`margin:auto;${p.peringkat <= 3 ? `background:${medal[p.peringkat - 1]};color:#fff` : 'background:var(--bg);color:var(--text-2)'}`}>${p.peringkat}</span>` : html`<${Chip} c="amber">${p.jml_mapel}/${a.mapel.length}<//>`}</td>
        <td><span class="col" style="gap:0"><strong class="strong">${p.nama}</strong><span class="tiny muted">${p.username}</span></span></td>
        <td>${p.kelas}</td>${!sekolahSaja && html`<td class="small">${p.sekolah}</td>`}
        ${a.mapel.map((m) => html`<td class="r num">${fmt.angka(p.nilai[m.kode])}</td>`)}
        <td class="r num">${fmt.angka(p.jumlah)}</td>
        <td class="r num" style=${`font-weight:800;color:${p.rata != null && p.rata < a.target ? 'var(--orange-700)' : 'var(--ink)'}`}>${fmt.angka(p.rata)}</td>
      </tr>`)}</tbody></table></div>
    <div class="tbl-foot"><${Pager} halaman=${hal} per=${per} total=${list.length} onChange=${setHal} /></div>
  </section>`;
}

function AkumGrup({ a, level, onLevel, sekolahSaja }) {
  const levels = sekolahSaja ? LEVEL.filter(([k]) => k === 'kelas') : LEVEL;
  return html`<section class="card col" style="gap:0">
    <div class="card-head"><div class="col grow" style="gap:2px"><h2>Pengelompokan Akumulatif</h2><span class="small muted">Rata-rata gabungan semua mata pelajaran per ${LEVEL.find(([k]) => k === level)?.[1].toLowerCase()}</span></div>
      ${levels.length > 1 && html`<${Seg} soft items=${levels.map(([value, label]) => ({ value, label }))} value=${level} onChange=${onLevel} />`}</div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>${LEVEL.find(([k]) => k === level)?.[1]}</th><th class="r">Siswa</th><th style="min-width:180px">Rata-rata gabungan</th>${a.mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th class="r">Capai target</th></tr></thead>
      <tbody>${a.grup.items.map((g) => html`<tr>
        <td class="c"><strong>${g.peringkat}</strong></td>
        <td><span class="col" style="gap:0"><strong class="strong">${g.nama}</strong><span class="tiny muted">${g.induk}</span></span></td>
        <td class="r num">${g.n}</td>
        <td><span class="hbar"><${Bar} value=${g.rata} tone=${g.rata < a.target ? 'amber' : ''} /><strong class="num small" style="width:44px;text-align:right">${fmt.angka(g.rata)}</strong></span></td>
        ${a.mapel.map((m) => html`<td class="r num">${fmt.angka(g.per_mapel[m.kode])}</td>`)}
        <td class="r num">${fmt.persen(g.persen_tuntas)}</td>
      </tr>`)}</tbody></table></div>
  </section>`;
}
