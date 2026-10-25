// Profil 360 sekolah: identitas, posisi di kab/kota–provinsi–nasional, tren try out, profil mapel, kelas, siswa, dan butir tersulit.
import { html, useMemo, fmt, TIPE_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { get } from '../api.js';
import { Loading, ErrorBox, Empty, useAsync, PageHead, Chip } from '../ui.js';
import { Logo } from '../layout.js';
import { labelWilayah } from '../wilayah.js';
import { PetaIndonesia, useDataPeta, posisiSekolah } from '../peta.js';
import { BatangH, Donat, BatangKelompok, Histogram, Radar, ringkas, PREDIKAT, PALET } from '../diagram.js';
import { GrafikTren, Tren, WARNA_SERI } from './rekap.js';

const WARNA = { sekolah: PALET.navy, kabkota: PALET.azure, provinsi: PALET.lavenderTua, nasional: PALET.koral };
const NAMA_LV = { kabkota: 'Kab/Kota', provinsi: 'Provinsi', nasional: 'Nasional' };
const rataDari = (v) => { const x = v.filter((n) => n != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; };
const selisih = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${fmt.angka(v)}`);

/** npsn kosong = sekolah milik akun yang sedang masuk (admin sekolah). */
export function Profil360({ npsn, back }) {
  const a = useAsync(() => get('profil360', npsn ? { npsn } : null), [npsn]);
  if (a.loading && !a.data) return html`<${Loading} text="Menyusun profil sekolah…" />`;
  if (a.error) return html`<${ErrorBox} error=${a.error} retry=${a.reload} />`;
  const d = a.data;
  const s = d.sekolah;
  return html`
    <${PageHead} title="Profil 360 Sekolah" sub=${`${s.nama} · capaian CBT dibanding kab/kota, provinsi, dan nasional`} back=${back}>
      <button class="btn btn-o" disabled=${!d.ada} onClick=${() => window.print()}><span style="color:var(--red-700);display:flex"><${Icon} n="printer" s=${18} /></span>Cetak</button>
    <//>
    <div class="dasbor-grid">
      <${Identitas} d=${d} />
      ${!d.ada ? html`<section class="card s12"><${Empty} icon="pie" title="Belum ada hasil ujian">Profil capaian terisi setelah siswa sekolah ini menyelesaikan try out.<//></section>`
        : html`<${Isi} d=${d} />`}
    </div>`;
}

function Identitas({ d }) {
  const s = d.sekolah;
  const peta = useDataPeta();
  const titik = peta.data && posisiSekolah(s, peta.data.titik, peta.data.pusatProv);
  return html`
    <section class="card pad col s8" style="gap:16px">
      <div class="row" style="gap:16px;align-items:flex-start">
        <${Logo} size=${72} src=${s.logo_url || undefined} />
        <div class="col grow" style="gap:6px;min-width:0">
          <h2 style="font-size:22px">${s.nama}</h2>
          <div class="row wrap" style="gap:6px"><${Chip} c="sky">NPSN ${s.npsn}<//>${s.is_demo ? html`<${Chip} c="violet">Data demo<//>` : ''}
            ${d.ada && html`<${Chip} c="green">${d.kategori.length} try out diikuti<//>`}</div>
          <span class="small muted">${labelWilayah(s) || 'Wilayah belum diisi'}${s.alamat ? ` · ${s.alamat}` : ''}</span>
          ${s.kepala_sekolah && html`<span class="small">Kepala sekolah: <strong>${s.kepala_sekolah}</strong>${s.nip_kepsek ? html` <span class="muted">· NIP ${s.nip_kepsek}</span>` : ''}</span>`}
        </div>
      </div>
      <div class="grid-auto" style="--min:130px;gap:12px">
        ${[['users', 'Siswa terdaftar', s.jml_siswa], ['book', 'Guru', s.jml_guru], ['layers', 'Rombel / kelas', s.jml_kelas], ['calendar', 'Jadwal ujian', s.jml_ujian]].map(([ic, l, v]) =>
          html`<div class="row" style="gap:10px;padding:10px 12px;border-radius:14px;background:var(--sky-50)"><span style="color:var(--sky-700);display:flex"><${Icon} n=${ic} s=${20} /></span>
            <span class="col" style="gap:0"><strong class="num">${fmt.bulat(v)}</strong><span class="tiny muted">${l}</span></span></div>`)}
      </div>
    </section>
    <section class="card pad col s4" style="gap:8px">
      <h2>Lokasi</h2>
      ${!s.provinsi_kode ? html`<span class="small muted">Lengkapi wilayah sekolah di menu Profil Sekolah agar lokasi tampil di peta.</span>`
        : peta.error ? html`<${ErrorBox} error=${peta.error} />`
        : html`<${PetaIndonesia} dasar=${peta.data} fokus=${s.provinsi_kode} label=${`Lokasi ${s.nama}`}
            warnaKab=${(k) => (k === s.kabkota_kode ? '#9CCBFF' : '#DCEBFB')} titik=${titik ? [{ x: titik[0], y: titik[1], r: 6, warna: PALET.koralTua, judul: s.nama }] : []} />`}
      <span class="tiny muted">${s.lat != null ? 'Titik sesuai koordinat sekolah.' : 'Titik di sekitar pusat kab/kota (koordinat sekolah belum diisi).'}</span>
    </section>`;
}

function Isi({ d }) {
  const { target, ringkasan: r, wilayah, mapel, kategori } = d;
  const nas = wilayah.find((w) => w.level === 'nasional');
  const kab = wilayah.find((w) => w.level === 'kabkota');
  const terdaftar = d.terdaftar.reduce((a, x) => a + x.n, 0);
  const st = useMemo(() => ringkas(d.siswa.map((x) => x.rata), target), [d]);
  const awal = d.per_tryout[0], akhir = d.per_tryout[d.per_tryout.length - 1];
  const tren = d.per_tryout.length > 1 && awal.rata != null && akhir.rata != null ? akhir.rata - awal.rata : null;
  const seriWilayah = (ambil) => [{ label: 'Sekolah ini', warna: WARNA.sekolah, nilai: ambil(null) }, ...wilayah.map((w) => ({ label: w.level === 'nasional' ? 'Nasional' : w.nama, warna: WARNA[w.level], nilai: ambil(w) }))];
  const bandingMapel = mapel.map((m) => ({ ...m, sekolah: d.per_mapel[m.kode], nasional: nas?.per_mapel[m.kode] }))
    .map((m) => ({ ...m, beda: m.sekolah != null && m.nasional != null ? m.sekolah - m.nasional : null })).sort((x, y) => (y.beda ?? -999) - (x.beda ?? -999));
  const jk = ['L', 'P'].map((k) => d.siswa.filter((x) => x.jk === k));
  const atas = d.siswa.slice(0, 10);
  const perhatian = d.siswa.filter((x) => x.rata != null && x.rata < target).sort((x, y) => x.rata - y.rata).slice(0, 10);

  return html`
    <section class="grid-auto s12" style="--min:170px">
      ${[['Rata-rata sekolah', fmt.angka(r.rata), nas ? `${selisih(r.rata - nas.rata)} dari rata-rata nasional` : `median ${fmt.angka(r.median)}`],
        [`Capai target (≥ ${target})`, fmt.persen(r.persen_tuntas), `${fmt.bulat(r.tuntas)} dari ${fmt.bulat(r.n)} siswa`],
        ['Partisipasi', fmt.persen(terdaftar ? (d.siswa.length / terdaftar) * 100 : null), `${fmt.bulat(d.siswa.length)} dari ${fmt.bulat(terdaftar)} siswa ikut try out`],
        ['Perubahan try out', tren == null ? '–' : selisih(tren), tren == null ? 'perlu minimal 2 try out' : `${awal.nama} → ${akhir.nama}`],
        kab?.peringkat ? ['Peringkat di kab/kota', `${kab.peringkat} / ${kab.sekolah}`, kab.nama] : ['Siswa naik nilai', fmt.bulat(r.naik), `${fmt.bulat(r.turun)} turun`]].map(([l, v, sub]) =>
        html`<div class="card stat-v"><span class="small muted">${l}</span><strong class="num">${v}</strong><span class="tiny muted ellipsis">${sub}</span></div>`)}
    </section>

    <section class="card pad col s5" style="gap:14px">
      <h2>Posisi Sekolah</h2>
      ${wilayah.map((w) => {
        const unggul = w.peringkat && w.sekolah > 1 ? ((w.sekolah - w.peringkat) / (w.sekolah - 1)) * 100 : null;
        return html`<div class="col" style="gap:6px">
          <div class="row" style="justify-content:space-between;gap:8px"><span class="col" style="gap:0;min-width:0"><strong class="small ellipsis">${NAMA_LV[w.level]}${w.level !== 'nasional' ? ` · ${w.nama}` : ''}</strong>
            <span class="tiny muted">${fmt.bulat(w.sekolah)} sekolah · rata-rata ${fmt.angka(w.rata)}</span></span>
            <strong class="num" style="white-space:nowrap">${w.peringkat ? html`#${w.peringkat}<span class="tiny muted" style="font-weight:600"> / ${w.sekolah}</span>` : '–'}</strong></div>
          <span class="dg-trek" style="height:10px"><span class="dg-isi" style=${`width:${unggul ?? 100}%;background:${WARNA[w.level]}`}></span></span>
          <span class="tiny muted">${unggul == null ? 'Satu-satunya sekolah dengan data di wilayah ini.' : `Lebih tinggi dari ${fmt.persen(unggul)} sekolah lain`}</span>
        </div>`;
      })}
    </section>
    <section class="card pad col s7" style="gap:12px">
      <div class="row wrap" style="justify-content:space-between;gap:8px"><h2>Rata-rata Dibanding Wilayah</h2><span class="tiny muted">garis koral = target ${target}</span></div>
      <${BatangH} items=${[{ label: 'Sekolah ini', sub: `${r.n} siswa`, nilai: r.rata, warna: WARNA.sekolah },
        ...wilayah.map((w) => ({ label: w.level === 'nasional' ? 'Nasional' : w.nama, sub: `${NAMA_LV[w.level]} · ${fmt.bulat(w.siswa)} siswa`, nilai: w.rata, warna: WARNA[w.level] }))]} target=${target} />
      <span class="tiny muted">Pembanding memakai try out yang sama dengan yang diikuti sekolah ini.</span>
    </section>

    <section class="card pad col s7" style="gap:12px">
      <h2>Tren Nilai per Try Out</h2>
      <${GrafikTren} label=${kategori.map((k) => k.nama)} target=${target}
        seri=${[{ nama: 'Sekolah ini', warna: WARNA.sekolah, tebal: true, nilai: d.per_tryout.map((t) => t.rata) },
          ...wilayah.map((w) => ({ nama: w.level === 'nasional' ? 'Nasional' : w.nama, warna: WARNA[w.level], putus: true, nilai: kategori.map((k) => w.per_tryout[k.kode] ?? null) }))]} />
    </section>
    <section class="card pad col s5" style="gap:12px">
      <h2>Komposisi Predikat</h2>
      <${Donat} bagian=${PREDIKAT.map((p, i) => ({ label: p.label, warna: p.warna, nilai: st.predikat?.[i] || 0 }))} tengah=${fmt.persen(st.persen)} sub=${`capai target ${target}`} ukuran=${160} />
    </section>

    ${mapel.length >= 3 ? html`<section class="card pad col s5" style="gap:12px">
      <h2>Profil Mata Pelajaran</h2>
      <${Radar} sumbu=${mapel.map((m) => m.nama)} target=${target}
        seri=${[{ label: 'Sekolah ini', warna: WARNA.sekolah, tebal: true, isi: true, nilai: mapel.map((m) => d.per_mapel[m.kode]) },
          ...(nas ? [{ label: 'Nasional', warna: WARNA.nasional, putus: true, nilai: mapel.map((m) => nas.per_mapel[m.kode]) }] : [])]} />
    </section>` : html`<section class="card pad col s5" style="gap:12px">
      <h2>Perkembangan per Mata Pelajaran</h2>
      <${GrafikTren} label=${d.per_tryout.map((t) => t.nama)} target=${target} ringkas=${true} tinggi=${380}
        seri=${mapel.map((m, i) => ({ nama: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: d.per_tryout.map((t) => t.per_mapel[m.kode]) }))} />
    </section>`}
    <section class="card pad col s7" style="gap:12px">
      <h2>Mata Pelajaran: Sekolah vs Wilayah</h2>
      <${BatangKelompok} kategori=${mapel.map((m) => m.nama)} target=${target} tinggi=${230} seri=${seriWilayah((w) => mapel.map((m) => (w ? w.per_mapel : d.per_mapel)[m.kode]))} />
      <div class="col" style="gap:6px">
        <strong class="small">Dibanding rata-rata nasional</strong>
        ${bandingMapel.map((m) => html`<div class="row small" style="gap:10px">
          <span class=${`chip ${m.beda == null ? '' : m.beda >= 0 ? 'green' : 'red'}`} style="min-width:72px;justify-content:center">${m.beda == null ? '–' : `${m.beda >= 0 ? '▲' : '▼'} ${selisih(m.beda)}`}</span>
          <span class="grow">${m.nama}</span><span class="muted num">${fmt.angka(m.sekolah)} vs ${fmt.angka(m.nasional)}</span></div>`)}
      </div>
    </section>

    <section class="card pad col s6" style="gap:12px">
      <h2>Peringkat Kelas</h2>
      <${BatangH} items=${d.kelas.map((k) => ({ label: `Kelas ${k.kelas}`, sub: `${k.n} siswa · ${fmt.persen(k.persen_tuntas)} capai target`, nilai: k.rata }))} target=${target} />
    </section>
    <section class="card pad col s6" style="gap:14px">
      <h2>Sebaran Nilai Siswa</h2>
      <${Histogram} nilai=${d.siswa.map((x) => x.rata)} target=${target} />
      <div class="row tiny" style="gap:16px;color:var(--text-2)"><span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-200)"></span>Di bawah target</span><span class="row gap-4"><span style="width:10px;height:10px;border-radius:3px;background:var(--sky-400)"></span>Mencapai target</span></div>
    </section>

    <section class="card col s12" style="gap:0">
      <div class="card-head"><h2 class="grow">Capaian per Kelas dan Mata Pelajaran</h2><span class="small muted">rata-rata semua try out</span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Kelas</th><th class="r">Siswa</th>${mapel.map((m) => html`<th class="r">${m.nama}</th>`)}<th class="r">Rata-rata</th><th class="r">Capai target</th><th class="r">Tren</th></tr></thead>
        <tbody>${d.kelas.map((k) => html`<tr><td><strong class="strong">Kelas ${k.kelas}</strong></td><td class="r num">${k.n}</td>
          ${mapel.map((m) => html`<td class="r num" style=${k.per_mapel[m.kode] != null && k.per_mapel[m.kode] < target ? 'color:var(--orange-700)' : ''}>${fmt.angka(k.per_mapel[m.kode])}</td>`)}
          <td class="r num" style="font-weight:800">${fmt.angka(k.rata)}</td><td class="r num">${fmt.persen(k.persen_tuntas)}</td><td class="r"><${Tren} v=${k.tren} /></td></tr>`)}
          <tr style="background:var(--sky-50)"><td><strong>Sekolah</strong></td><td class="r num"><strong>${r.n}</strong></td>${mapel.map((m) => html`<td class="r num"><strong>${fmt.angka(d.per_mapel[m.kode])}</strong></td>`)}
            <td class="r num"><strong>${fmt.angka(r.rata)}</strong></td><td class="r num"><strong>${fmt.persen(r.persen_tuntas)}</strong></td><td class="r"><${Tren} v=${r.rata_tren} /></td></tr></tbody>
      </table></div>
    </section>

    <section class="card pad col s6" style="gap:12px">
      <h2>Laki-laki vs Perempuan</h2>
      <${BatangKelompok} kategori=${[...mapel.map((m) => m.nama), 'Rata-rata']} target=${target} tinggi=${220}
        seri=${[['Laki-laki', PALET.azure], ['Perempuan', PALET.lavenderTua]].map(([l, c], i) => ({ label: `${l} (${jk[i].length})`, warna: c,
          nilai: [...mapel.map((m) => rataDari(jk[i].map((x) => x.per_mapel[m.kode]))), rataDari(jk[i].map((x) => x.rata))] }))} />
    </section>
    <section class="card pad col s6" style="gap:12px">
      <h2>Perkembangan Siswa</h2>
      <${Donat} bagian=${[{ label: 'Nilai naik', warna: PALET.azure, nilai: r.naik }, { label: 'Tetap', warna: PALET.lavender, nilai: r.tetap }, { label: 'Nilai turun', warna: PALET.koral, nilai: r.turun }]}
        tengah=${selisih(r.rata_tren) || '–'} sub="rata-rata perubahan" ukuran=${150} />
      <span class="tiny muted">Dihitung dari siswa yang mengikuti minimal 2 try out (try out pertama → terakhir yang diikuti).</span>
    </section>

    <${DaftarSiswa} judul="10 Siswa Teratas" ikon="trophy" items=${atas} target=${target} />
    <${DaftarSiswa} judul="Perlu Pendampingan" ikon="target" items=${perhatian} target=${target} kosong=${`Semua siswa sudah mencapai target ${target}.`}
      ket=${`Siswa dengan rata-rata di bawah target ${target}, mulai dari yang terendah.`} />

    ${d.butir.length > 0 && html`<section class="card pad col s12" style="gap:14px">
      <div class="row wrap" style="justify-content:space-between;gap:8px"><h2>Butir Soal Tersulit · ${d.akhir.nama}</h2><span class="tiny muted">% benar siswa sekolah ini dibanding seluruh peserta nasional pada soal yang sama</span></div>
      <div class="grid-auto" style="--min:320px;gap:16px">
        ${d.butir.map((m) => html`<div class="col" style="gap:10px;padding:14px;border:1px solid var(--line);border-radius:16px">
          <div class="row" style="justify-content:space-between;gap:8px"><strong>${m.nama}</strong><span class="small muted">rata-rata <strong class="num" style="color:var(--ink)">${fmt.angka(m.rata)}</strong></span></div>
          <div class="row wrap" style="gap:6px"><${Chip} c="red">${m.tingkat.sulit} sulit<//><${Chip} c="violet">${m.tingkat.sedang} sedang<//><${Chip} c="sky">${m.tingkat.mudah} mudah<//></div>
          ${m.tersulit.map((b) => html`<div class="col" style="gap:4px">
            <div class="row small" style="gap:8px"><span class="chip">No. ${b.nomor}</span><span class="grow ellipsis muted" title=${b.cuplikan}>${b.cuplikan || TIPE_LABEL[b.tipe] || '-'}</span></div>
            <div class="row tiny" style="gap:8px"><span style="width:58px" class="muted">Sekolah</span><span class="dg-trek grow" style="height:8px"><span class="dg-isi" style=${`width:${b.persen_benar || 0}%;background:${WARNA.sekolah}`}></span></span><strong class="num" style="width:40px;text-align:right">${fmt.angka(b.persen_benar)}%</strong></div>
            ${b.nasional != null && html`<div class="row tiny" style="gap:8px"><span style="width:58px" class="muted">Nasional</span><span class="dg-trek grow" style="height:8px"><span class="dg-isi" style=${`width:${b.nasional}%;background:${WARNA.nasional}`}></span></span><strong class="num" style="width:40px;text-align:right">${fmt.angka(b.nasional)}%</strong></div>`}
          </div>`)}
        </div>`)}
      </div>
    </section>`}`;
}

function DaftarSiswa({ judul, ikon, items, target, kosong = 'Belum ada data.', ket }) {
  return html`<section class="card col s6" style="gap:0">
    <div class="card-head"><span style="color:var(--sky-700);display:flex"><${Icon} n=${ikon} s=${20} /></span><h2 class="grow">${judul}</h2></div>
    ${ket && html`<span class="tiny muted" style="padding:0 20px 8px">${ket}</span>`}
    ${!items.length ? html`<div style="padding:0 20px 20px" class="small muted">${kosong}</div>` : html`<div class="table-wrap"><table class="tbl">
      <thead><tr><th class="c">#</th><th>Nama</th><th>Kelas</th><th class="r">Try out</th><th class="r">Rata-rata</th><th class="r">Tren</th></tr></thead>
      <tbody>${items.map((x) => html`<tr><td class="c"><strong>${x.peringkat}</strong></td><td><strong class="strong">${x.nama}</strong></td><td>${x.kelas || '-'}</td>
        <td class="r num">${x.ikut}</td><td class="r num" style=${`font-weight:800;color:${x.rata < target ? 'var(--orange-700)' : 'var(--ink)'}`}>${fmt.angka(x.rata)}</td><td class="r"><${Tren} v=${x.tren} /></td></tr>`)}</tbody>
    </table></div>`}
  </section>`;
}
