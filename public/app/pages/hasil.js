import { html, useState, useEffect, fmt, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get } from '../api.js';
import { openPrint } from '../router.js';
import { Loading, ErrorBox, Empty, Chip, toast, toastErr, useAsync, PageHead, Seg, Bar, Field, Pager } from '../ui.js';
import { eksporHasil, eksporLegger } from '../excel.js';
import { useMaster } from './soal.js';

/** Hasil ujian per paket + legger per kategori (admin sekolah). */
export function HasilLegger({ npsn }) {
  const [tab, setTab] = useState('hasil');
  return html`
    <${PageHead} title="Hasil & Legger" sub=${session.sekolah?.nama || ''} />
    <div class="row wrap" style="gap:12px">
      <${Seg} items=${[{ value: 'hasil', label: 'Hasil Ujian', icon: 'clipboard' }, { value: 'legger', label: 'Legger Nilai', icon: 'sheet' }]} value=${tab} onChange=${setTab} />
      <a class="btn btn-s right" href=${`${session.user.peran === 'guru' ? '#/guru/analisis' : '#/admin/analisis'}?paket=@rekap`}><${Icon} n="chart" s=${18} />Rekap semua try out</a>
      <a class="btn btn-s" href=${session.user.peran === 'guru' ? '#/guru/analisis' : '#/admin/analisis'}><${Icon} n="layers" s=${18} />Hasil akumulatif semua mapel</a>
    </div>
    ${tab === 'hasil' ? html`<${Hasil} npsn=${npsn} />` : html`<${Legger} npsn=${npsn} />`}`;
}

function Hasil({ npsn }) {
  const opsi = useAsync(() => get('analisis/opsi', { npsn }), [npsn]);
  const [f, setF] = useState({ paket: '', kelas: '' });
  const [q, setQ] = useState('');
  const [hal, setHal] = useState(1);
  useEffect(() => { if (opsi.data && !f.paket && opsi.data.paket[0]) setF((x) => ({ ...x, paket: `${opsi.data.paket[0].mapel}|${opsi.data.paket[0].kategori}` })); }, [opsi.data]);
  const [mapel, kategori] = f.paket.split('|');
  const a = useAsync(() => (mapel ? get('analisis', { mapel, kategori, npsn, kelas: f.kelas, grup: 'kelas' }) : Promise.resolve(null)), [f.paket, f.kelas, npsn]);
  const paket = opsi.data?.paket.find((p) => `${p.mapel}|${p.kategori}` === f.paket);
  if (opsi.loading) return html`<${Loading} />`;
  if (opsi.error) return html`<${ErrorBox} error=${opsi.error} />`;
  if (!opsi.data.paket.length) return html`<div class="card"><${Empty} icon="clipboard" title="Belum ada hasil ujian">Hasil muncul setelah siswa menyelesaikan ujian.<//></div>`;
  const d = a.data;
  const list = (d?.ranking || []).filter((p) => !q || p.nama.toLowerCase().includes(q.toLowerCase()) || p.username.includes(q));
  const per = 50;
  const dinilai = (d?.ranking || []).filter((p) => p.nilai != null);
  const maxBin = Math.max(1, ...(d?.distribusi || []).map((x) => x.n));
  return html`
    <section class="card pad row wrap" style="gap:12px;padding:14px 16px">
      <select class="select" style="width:auto;min-width:260px" aria-label="Paket ujian" value=${f.paket} onChange=${(e) => setF({ ...f, paket: e.target.value })}>
        ${opsi.data.paket.map((p) => html`<option value=${`${p.mapel}|${p.kategori}`}>${p.mapel_nama} · ${p.kategori_nama}</option>`)}</select>
      <select class="select" style="width:auto;min-width:160px" aria-label="Kelas" value=${f.kelas} onChange=${(e) => setF({ ...f, kelas: e.target.value })}>
        <option value="">Semua kelas</option>${opsi.data.kelas.map((k) => html`<option value=${k}>${k}</option>`)}</select>
    </section>
    ${a.loading && !d ? html`<${Loading} />` : a.error ? html`<${ErrorBox} error=${a.error} />` : d && html`
      <section class="grid-auto" style="--min:180px">
        <div class="card stat-v"><span class="small muted">Rata-rata</span><strong>${fmt.angka(d.ringkasan.rata)}</strong><span class="tiny muted">${d.ringkasan.peserta} peserta</span></div>
        <div class="card stat-v"><span class="small muted">Nilai tertinggi</span><strong>${fmt.angka(d.ringkasan.maks)}</strong><span class="tiny muted ellipsis">${dinilai[0] ? `${dinilai[0].nama} · ${dinilai[0].kelas}` : ''}</span></div>
        <div class="card stat-v"><span class="small muted">Nilai terendah</span><strong>${fmt.angka(d.ringkasan.min)}</strong><span class="tiny muted">${dinilai.filter((p) => p.nilai < 50).length} siswa di bawah 50</span></div>
        <div class="card stat-v"><span class="small muted">Capai target (≥ ${d.target})</span><strong>${fmt.persen(d.ringkasan.persen_tuntas)}</strong><span class="tiny muted">${d.ringkasan.tuntas} dari ${d.ringkasan.n} siswa</span></div>
        ${d.ringkasan.menunggu_koreksi > 0 && html`<a href="#/admin/koreksi" class="card stat-v" style="text-decoration:none;background:var(--amber-50)"><span class="small" style="color:var(--amber-900)">Menunggu koreksi</span><strong style="color:var(--amber-800)">${d.ringkasan.menunggu_koreksi}</strong><span class="tiny" style="color:var(--amber-900)">Buka koreksi →</span></a>`}
      </section>
      <section class="card pad col" style="gap:14px">
        <div class="row" style="justify-content:space-between"><h2>Sebaran Nilai</h2><a class="btn btn-g btn-sm" href="#/admin/analisis">Analisis lengkap <${Icon} n="arrow-r" s=${14} /></a></div>
        <div class="hist" style="height:150px">${d.distribusi.map((x) => html`<div class=${cls('b', x.dari >= d.target && 'tuntas')}><strong>${x.n || ''}</strong><span style=${`height:${(x.n / maxBin) * 100}%`}></span></div>`)}</div>
        <div class="hist-x">${d.distribusi.map((x) => html`<span>${x.label}</span>`)}</div>
      </section>
      <section class="card col" style="gap:0">
        <div class="card-head">
          <h2 class="grow">Daftar Nilai</h2>
          <label class="input-icon soft" style="flex:0 1 240px;min-height:40px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari siswa" value=${q} onInput=${(e) => { setQ(e.target.value); setHal(1); }} aria-label="Cari siswa" /></label>
          <button class="btn btn-o btn-sm" onClick=${() => eksporHasil(d, { mapel: paket.mapel_nama, kategori: paket.kategori_nama, lingkup: `${session.sekolah?.nama || ''}${f.kelas ? ` · Kelas ${f.kelas}` : ''}`, file: session.sekolah?.nama || '' }).catch(toastErr)}>
            <span style="color:var(--green-700);display:flex"><${Icon} n="sheet" s=${16} /></span>Unduh Excel</button>
          <button class="btn btn-o btn-sm" onClick=${() => openPrint('/cetak/rekap', { mapel, kategori, npsn, kelas: f.kelas })}><span style="color:var(--red-700);display:flex"><${Icon} n="file-pdf" s=${16} /></span>Cetak / PDF</button>
          <button class="btn btn-s btn-sm" disabled=${!dinilai.length} onClick=${() => openPrint('/cetak/sertifikat', { peserta: dinilai.map((p) => p.id).join(',') })}><${Icon} n="award" s=${16} />Sertifikat Massal</button>
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th class="c">#</th><th>No. Peserta</th><th>Nama</th><th class="c">L/P</th><th>Kelas</th><th class="r">Objektif</th><th>Uraian</th><th class="r">Nilai Akhir</th><th class="r">Aksi</th></tr></thead>
          <tbody>${list.slice((hal - 1) * per, hal * per).map((p) => html`<tr>
            <td class="c">${p.peringkat ? html`<span class="tile sm" style=${`margin:auto;${p.peringkat === 1 ? 'background:var(--amber-100);color:var(--amber-800)' : p.peringkat <= 3 ? 'background:var(--orange-100);color:#9A3412' : 'background:var(--bg);color:var(--text-2)'}`}>${p.peringkat}</span>` : '–'}</td>
            <td class="num">${p.username}</td><td class="strong">${p.nama}</td><td class="c">${p.jk || '–'}</td><td>${p.kelas}</td>
            <td class="r num">${fmt.angka(p.skor_objektif)}/${fmt.angka(p.maks_objektif, 0)}</td>
            <td>${p.ada_manual ? (p.nilai == null ? html`<${Chip} c="amber">Menunggu<//>` : html`<${Chip} c="green">${fmt.angka(p.skor_manual)}/${fmt.angka(p.maks_manual, 0)}<//>`) : html`<span class="muted">–</span>`}</td>
            <td class="r num" style=${`font-weight:800;${p.nilai != null && p.nilai < d.target ? 'color:var(--orange-700)' : ''}`}>${fmt.angka(p.nilai)}</td>
            <td class="r"><button class="icon-btn sm" style="color:var(--sky-700)" aria-label="Sertifikat" title="Sertifikat" disabled=${p.nilai == null} onClick=${() => openPrint('/cetak/sertifikat', { peserta: p.id })}><${Icon} n="award" s=${18} /></button></td>
          </tr>`)}</tbody></table></div>
        <div class="tbl-foot"><${Pager} halaman=${hal} per=${per} total=${list.length} onChange=${setHal} /></div>
      </section>`}`;
}

function Legger({ npsn }) {
  const master = useMaster();
  const kelasOpt = useAsync(() => get('pengguna/kelas', { npsn }), [npsn]);
  const [f, setF] = useState({ kategori: '', kelas: '' });
  useEffect(() => { if (!f.kategori && master.kategori.length) setF((x) => ({ ...x, kategori: master.kategori[0].kode })); }, [master]);
  const d = useAsync(() => (f.kategori ? get('legger', { npsn, kategori: f.kategori, kelas: f.kelas }) : Promise.resolve(null)), [f.kategori, f.kelas, npsn]);
  const L = d.data;
  return html`
    <section class="card pad row wrap" style="gap:12px;padding:14px 16px">
      <select class="select" style="width:auto;min-width:200px" aria-label="Kategori" value=${f.kategori} onChange=${(e) => setF({ ...f, kategori: e.target.value })}>${master.kategori.map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select>
      <select class="select" style="width:auto;min-width:160px" aria-label="Kelas" value=${f.kelas} onChange=${(e) => setF({ ...f, kelas: e.target.value })}><option value="">Semua kelas</option>${(kelasOpt.data?.kelas || []).map((k) => html`<option value=${k}>${k}</option>`)}</select>
      <button class="btn btn-p right" disabled=${!L?.mapel?.length} onClick=${() => eksporLegger(L).then(() => toast('Legger diunduh.')).catch(toastErr)}><${Icon} n="sheet" s=${18} />Unduh Legger Excel</button>
    </section>
    ${d.loading && !L ? html`<${Loading} />` : d.error ? html`<${ErrorBox} error=${d.error} />` : L && (!L.mapel.length ? html`<div class="card"><${Empty} icon="sheet" title="Belum ada ujian pada kategori ini" /></div>` : html`
      <section class="card col" style="gap:0">
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>No</th><th>No. Peserta</th><th>Nama</th><th>Kelas</th>${L.mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th class="r">Rata-rata</th><th class="c">Peringkat</th></tr></thead>
          <tbody>${L.siswa.map((s, i) => html`<tr>
            <td>${i + 1}</td><td class="num">${s.username}</td><td class="strong">${s.nama}</td><td>${s.kelas}</td>
            ${L.mapel.map((m) => { const n = s.nilai[m.kode]; return html`<td class="r num">${n.status === 'ok' ? fmt.angka(n.nilai) : n.status === 'menunggu' ? html`<${Chip} c="amber">koreksi<//>` : n.status === 'absen' ? html`<${Chip}>absen<//>` : html`<span class="muted">–</span>`}</td>`; })}
            <td class="r num" style="font-weight:800">${fmt.angka(s.rata)}</td><td class="c">${s.peringkat || '–'}</td>
          </tr>`)}</tbody>
          <tfoot>${[['Rata-rata', 'rata'], ['Tertinggi', 'maks'], ['Terendah', 'min'], ['% Capai target', 'persen_tuntas']].map(([l, k]) => html`<tr style="background:var(--surface-2)">
            <td colspan="4" class="strong">${l}</td>${L.mapel.map((m) => html`<td class="r num strong">${k === 'persen_tuntas' ? fmt.persen(L.ringkasan[m.kode][k]) : fmt.angka(L.ringkasan[m.kode][k])}</td>`)}<td></td><td></td></tr>`)}</tfoot>
        </table></div>
      </section>`)}`;
}
