// Halaman siap cetak (A4). Tombol "Cetak / Simpan PDF" membuka dialog cetak browser.
import { html, useEffect, useRef, fmt, loadScript, TIPE_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get } from '../api.js';
import { match } from '../router.js';
import { Loading, ErrorBox, useAsync } from '../ui.js';
import { Rich } from '../rich.js';
import { PratinjauSoal } from './soalview.js';
import { GrafikTren, WARNA_SERI, WARNA_GABUNGAN } from './rekap.js';

/** Logo untuk dokumen: logo sekolah → logo aplikasi → tulisan TKA. */
function LogoDok({ sekolah, size = 48 }) {
  const url = sekolah?.logo_url || session.info?.tampilan?.logo_url;
  if (url) return html`<span style=${`width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex:none`}><img src=${url} alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain" /></span>`;
  return html`<span class="logo" style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.3)}px`}>TKA</span>`;
}
/** Ruang tanda tangan: gambar tanda tangan bila ada, selain itu ruang kosong. */
const RuangTtd = ({ url, tinggi = 64 }) => (url
  ? html`<span style=${`height:${tinggi}px;display:flex;align-items:center;justify-content:center`}><img src=${url} alt="Tanda tangan" style=${`max-height:${tinggi + 8}px;max-width:200px;object-fit:contain;margin:-4px 0`} /></span>`
  : html`<span style=${`height:${tinggi}px`}></span>`);

const kota = (s) => (s?.kabkota || '').replace(/^(Kota Administrasi|Kabupaten Administrasi|Kabupaten|Kota)\s+/, '') || '[Kota]';
const PAPER = 'font-family:var(--font);color:#0F172A';

function Toolbar({ judul, land }) {
  useEffect(() => {
    document.title = judul;
    const st = document.createElement('style');
    st.textContent = `@page { size: A4 ${land ? 'landscape' : 'portrait'}; margin: 0; }`;
    document.head.appendChild(st);
    return () => st.remove();
  }, []);
  return html`<div class="print-toolbar">
    <span class="logo" style="width:36px;height:36px;font-size:12px">TKA</span>
    <strong class="grow">${judul}</strong>
    <span class="small muted">Pilih “Simpan sebagai PDF” di dialog cetak untuk mengunduh PDF.</span>
    <button class="btn btn-p" onClick=${() => window.print()}><${Icon} n="printer" s=${18} />Cetak / Simpan PDF</button>
    <button class="btn btn-o" onClick=${() => window.close()}>Tutup</button>
  </div>`;
}

function Kop({ sekolah, kecil }) {
  return html`<div style=${`display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:${kecil ? '2px solid #10284A' : '3px double #10284A'}`}>
    <${LogoDok} sekolah=${sekolah} size=${kecil ? 48 : 64} />
    <div style=${`flex:1;display:flex;flex-direction:column;${kecil ? '' : 'align-items:center;text-align:center'};gap:2px`}>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:.06em;color:#334155">${(session.info?.nama_instansi || '').toUpperCase()}</span>
      <strong style=${`font-size:${kecil ? 17 : 20}px;color:#10284A`}>${(sekolah?.nama || '').toUpperCase()}</strong>
      <span style="font-size:12px;color:#334155">NPSN ${sekolah?.npsn || '-'} · ${[sekolah?.kelurahan, sekolah?.kecamatan, sekolah?.kabkota].filter(Boolean).join(', ') || ''}${sekolah?.alamat ? ` · ${sekolah.alamat}` : ''}</span>
    </div>
    ${!kecil && html`<span style="width:60px"></span>`}
  </div>`;
}

function Ttd({ kiri, kanan, sekolah }) {
  const blok = (b) => b ? html`<div style="display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;font-size:14px">
    <span>${b.atas || ' '}</span><span>${b.jabatan}</span><${RuangTtd} url=${b.ttd} /><strong style="text-decoration:underline">${b.nama || '[Nama]'}</strong>${b.nip !== false ? html`<span>NIP ${b.nip || ''}</span>` : ''}</div>` : html`<span></span>`;
  return html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:auto">${blok(kiri)}${blok(kanan)}</div>`;
}

export function Cetak({ route }) {
  const p = route.path;
  const q = route.query;
  let m;
  if (p === '/cetak/kartu') return html`<${Kartu} q=${q} />`;
  if ((m = match('/cetak/berita-acara/:id', p))) return html`<${BeritaAcara} id=${m.id} q=${q} />`;
  if (p === '/cetak/rekap') return html`<${Rekap} q=${q} />`;
  if (p === '/cetak/analisis') return html`<${CetakAnalisis} q=${q} />`;
  if (p === '/cetak/akumulatif') return html`<${CetakAkumulatif} q=${q} />`;
  if (p === '/cetak/rekap-tryout') return html`<${CetakRekapTryout} q=${q} />`;
  if (p === '/cetak/sertifikat') return html`<${Sertifikat} q=${q} />`;
  if (p === '/cetak/soal') return html`<${DaftarSoal} q=${q} />`;
  return html`<div style="padding:24px">Halaman cetak tidak dikenal.</div>`;
}

function Kartu({ q }) {
  const { data, error, loading } = useAsync(() => get('cetak/kartu', q), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const halaman = [];
  for (let i = 0; i < data.siswa.length; i += 8) halaman.push(data.siswa.slice(i, i + 8));
  const s = data.sekolah;
  return html`<${Toolbar} judul=${`Kartu Peserta · ${s.nama}`} />
    ${halaman.map((hal, hi) => html`<div class="paper" style=${`${PAPER};padding:9mm 10mm;display:flex;flex-direction:column;gap:8px`}>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:#475569"><span><strong style="color:#10284A">Kartu Peserta ${session.info?.nama_aplikasi || 'TKA'}</strong> · ${s.nama}</span><span>Lembar ${hi + 1} dari ${halaman.length} · Gunting di garis putus-putus</span></div>
      <div style="flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:8px">
        ${hal.map((x) => html`<div style="border:1px dashed #A9B6CC;border-radius:4px;padding:5px;display:flex">
          <div style="flex:1;border:1.5px solid #9CC8F8;border-radius:12px;overflow:hidden;display:flex;flex-direction:column">
            <div style="height:58px;background:#E3F2FF;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1.5px solid #9CC8F8">
              <${LogoDok} sekolah=${s} size=${34} />
              <div style="display:flex;flex-direction:column;min-width:0"><strong style="font-size:12.5px;letter-spacing:.04em;color:#10284A">KARTU PESERTA ${(session.info?.nama_aplikasi || 'TKA').toUpperCase()}</strong>
                <span style="font-size:12px;color:#1B3358;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.nama} · NPSN ${s.npsn}</span></div>
            </div>
            <div style="flex:1;padding:10px 12px 0;display:flex;gap:12px">
              <div style="width:62px;height:82px;flex:none;border:1.5px dashed #A9B6CC;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;color:#64748B">Foto<br />3×4</div>
              <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
                <div style="display:flex;flex-direction:column"><span style="font-size:12px;color:#475569">No. Peserta</span><strong style="font-size:18px;letter-spacing:.05em;color:#10284A">${x.username}</strong></div>
                <div style="display:flex;flex-direction:column"><span style="font-size:12px;color:#475569">Nama</span><strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${x.nama}</strong></div>
                <span style="font-size:13px">Kelas <strong>${x.kelas || '-'}</strong> · <strong>${x.sesi || '-'}</strong></span>
              </div>
            </div>
            <div style="padding:6px 12px 10px;display:flex;align-items:flex-end;gap:10px">
              <span style="padding:5px 10px;border-radius:8px;background:#F0F7FF;border:1px solid #CFEAFF;font-size:12.5px">Password <strong style="letter-spacing:.06em">${x.password_awal || '(sudah diganti)'}</strong></span>
              <span style="margin-left:auto;display:flex;flex-direction:column;align-items:center;gap:14px;font-size:12px;color:#475569"><span>Kepala Sekolah</span>${s.ttd_url ? html`<img src=${s.ttd_url} alt="" style="height:30px;max-width:110px;object-fit:contain;margin:-14px 0 -4px" />` : ''}<span style="width:96px;border-top:1px solid #64748B"></span></span>
            </div>
          </div></div>`)}
      </div></div>`)}`;
}

function BeritaAcara({ id, q }) {
  const { data: d, error, loading } = useAsync(() => get(`cetak/berita-acara/${id}`), [id]);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const u = d.ujian;
  const tgl = d.mulai_at || (u.tanggal ? Date.parse(u.tanggal) : Date.now());
  const t = new Date(tgl);
  const angka = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const terbilang = (n) => n < 12 ? angka[n] : n < 20 ? `${angka[n - 10]} belas` : n < 100 ? `${angka[Math.floor(n / 10)]} puluh${n % 10 ? ` ${angka[n % 10]}` : ''}` : String(n);
  const tahunT = (y) => `dua ribu ${terbilang(y - 2000)}`;
  const td = 'padding:8px 12px;border:1px solid #94A3B8';
  const catatan = [...d.insiden.map((x) => `Peserta ${x.username} (${x.nama}) tercatat keluar layar penuh ${x.keluar_layar} kali.`), q.catatan].filter(Boolean).join(' ');
  return html`<${Toolbar} judul="Berita Acara Pelaksanaan" />
    <div class="paper" style=${`${PAPER};padding:16mm 18mm 14mm;display:flex;flex-direction:column;gap:16px`}>
      <${Kop} sekolah=${d.sekolah} />
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center">
        <h1 style="font-size:19px;letter-spacing:.03em">BERITA ACARA PELAKSANAAN</h1>
        <span style="font-size:15px;font-weight:700;color:#1A55B8">${(session.info?.nama_aplikasi || 'TES KEMAMPUAN AKADEMIK').toUpperCase()}</span>
      </div>
      <p style="font-size:15px;line-height:1.75;text-align:justify">Pada hari ini <strong>${t.toLocaleDateString('id-ID', { weekday: 'long' })}</strong>, tanggal <strong>${terbilang(t.getDate())}</strong> bulan <strong>${t.toLocaleDateString('id-ID', { month: 'long' })}</strong> tahun <strong>${tahunT(t.getFullYear())}</strong>, telah dilaksanakan tes berbasis komputer dengan rincian sebagai berikut.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14.5px"><tbody>
        ${[['Mata pelajaran', u.mapel_nama], ['Kategori · Paket', `${u.kategori_nama} · ${u.mapel}-${u.kategori}`], ['Sesi · Waktu', `${u.sesi === 'SEMUA' ? 'Semua sesi' : u.sesi} · ${d.mulai_at ? fmt.jam(d.mulai_at) : u.jam_mulai || '…'}–${d.selesai_at ? fmt.jam(d.selesai_at) : u.jam_selesai || '…'} WIB`],
          ['Kelas', u.kelas === 'SEMUA' ? 'Semua kelas' : u.kelas], ['Ruang', q.ruang || '……………………'], ['Jumlah peserta terdaftar', `${d.terdaftar} orang`], ['Hadir', `${d.hadir} orang`],
          ['Tidak hadir', `${d.tidak_hadir.length} orang${d.tidak_hadir.length ? ` · No. ${d.tidak_hadir.map((x) => x.username).join(', ')}` : ''}`]].map(([a, b]) =>
          html`<tr><td style=${`${td};background:#F0F7FF;width:40%;font-weight:600`}>${a}</td><td style=${td}>${b}</td></tr>`)}
      </tbody></table>
      <div style="display:flex;flex-direction:column;gap:6px"><strong style="font-size:14.5px">Catatan selama pelaksanaan</strong>
        <div style="min-height:90px;padding:12px 14px;border:1px solid #94A3B8;border-radius:6px;font-size:14px;line-height:1.65">${catatan || 'Ujian berjalan lancar tanpa kendala.'}</div></div>
      <p style="font-size:15px;line-height:1.75">Demikian berita acara ini dibuat dengan sesungguhnya untuk dapat dipergunakan sebagaimana mestinya.</p>
      <${Ttd} kiri=${{ jabatan: 'Pengawas,', nama: q.pengawas, nip: q.nip_pengawas }} kanan=${{ atas: `${kota(d.sekolah)}, ${fmt.tanggal(tgl)}`, jabatan: 'Proktor,', nama: q.proktor, nip: q.nip_proktor }} />
      <div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #CBD5E1;font-size:12px;color:#475569"><span>Dibuat otomatis oleh ${session.info?.nama_aplikasi || 'TKA'} · ${fmt.waktu(Date.now())}</span><span>Halaman 1 dari 1</span></div>
    </div>`;
}

function Rekap({ q }) {
  const { data, error, loading } = useAsync(async () => {
    const [a, sekolah, mapel, kategori] = await Promise.all([get('analisis', { ...q, grup: 'kelas' }), get('sekolah', { npsn: q.npsn }), get('mapel'), get('kategori')]);
    return { a, sekolah: sekolah[0], mapel: mapel.find((m) => m.kode === q.mapel), kategori: kategori.find((k) => k.kode === q.kategori) };
  }, []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const { a, sekolah } = data;
  const perHal = 26;
  const hal = [];
  for (let i = 0; i < Math.max(1, a.ranking.length); i += perHal) hal.push(a.ranking.slice(i, i + perHal));
  const th = 'padding:7px 8px;border:1px solid #64748B;background:#CFEAFF;color:#10284A;font-size:12.5px;font-weight:800;text-align:left';
  const td = 'padding:6px 8px;border:1px solid #94A3B8;font-size:12.5px';
  const r = a.ringkasan;
  return html`<${Toolbar} judul=${`Rekap Nilai · ${data.mapel?.nama} · ${data.kategori?.nama}`} />
    ${hal.map((rows, hi) => html`<div class="paper" style=${`${PAPER};display:flex;flex-direction:column;gap:14px`}>
      <${Kop} sekolah=${sekolah} kecil />
      ${hi === 0 && html`<div style="display:flex;flex-direction:column;gap:6px"><h1 style="font-size:22px">Rekap Nilai Ujian</h1>
        <div style="display:flex;flex-wrap:wrap;gap:6px 20px;font-size:13px;color:#334155"><span>Mata pelajaran <strong style="color:#10284A">${data.mapel?.nama}</strong></span><span>Kategori <strong style="color:#10284A">${data.kategori?.nama}</strong></span>
          <span>Kelas <strong style="color:#10284A">${q.kelas || 'Semua'}</strong></span><span>Diurutkan <strong style="color:#10284A">nilai tertinggi</strong></span></div></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
        ${[['Peserta', r.peserta, r.menunggu_koreksi ? `${r.menunggu_koreksi} menunggu koreksi` : ''], ['Rata-rata', fmt.angka(r.rata), `Target ${a.target}`], ['Tertinggi', fmt.angka(r.maks), `Terendah ${fmt.angka(r.min)}`], ['Capai target', fmt.persen(r.persen_tuntas), `${r.tuntas} siswa`]].map(([l, v, s]) =>
          html`<div style="padding:10px 12px;border-radius:10px;background:#F0F7FF;border:1px solid #CFEAFF;display:flex;flex-direction:column;gap:2px"><span style="font-size:12px;color:#475569">${l}</span><strong style="font-size:20px">${v}</strong><span style="font-size:12px;color:#475569">${s}</span></div>`)}
      </div>`}
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${`${th};text-align:right;width:34px`}>No</th><th style=${th}>No. Peserta</th><th style=${th}>Nama Lengkap</th><th style=${`${th};text-align:center`}>L/P</th><th style=${`${th};text-align:center`}>Kelas</th><th style=${`${th};text-align:right`}>Objektif</th><th style=${`${th};text-align:right`}>Uraian</th><th style=${`${th};text-align:right`}>Nilai</th><th style=${th}>Target</th></tr></thead>
        <tbody>${rows.map((p, i) => html`<tr style=${i % 2 ? 'background:#F8FBFE' : ''}>
          <td style=${`${td};text-align:right`}>${p.peringkat ?? '-'}</td><td style=${td}>${p.username}</td><td style=${`${td};font-weight:600`}>${p.nama}</td><td style=${`${td};text-align:center`}>${p.jk || '-'}</td><td style=${`${td};text-align:center`}>${p.kelas}</td>
          <td style=${`${td};text-align:right`}>${fmt.angka(p.skor_objektif)}</td><td style=${`${td};text-align:right`}>${p.ada_manual ? (p.nilai == null ? 'menunggu' : fmt.angka(p.skor_manual)) : '-'}</td>
          <td style=${`${td};text-align:right;font-weight:800`}>${fmt.angka(p.nilai)}</td>
          <td style=${`${td};font-weight:700;color:${p.nilai == null ? '#475569' : p.nilai >= a.target ? '#166534' : '#9A3412'}`}>${p.nilai == null ? 'Koreksi' : p.nilai >= a.target ? 'Capai' : 'Belum'}</td></tr>`)}</tbody></table>
      ${hi === hal.length - 1 && html`<${Ttd} kanan=${{ atas: `${kota(sekolah)}, ${fmt.tanggal(Date.now())}`, jabatan: 'Kepala Sekolah,', ttd: sekolah?.ttd_url, nama: sekolah?.kepala_sekolah, nip: sekolah?.nip_kepsek }} />`}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #CBD5E1;font-size:12px;color:#475569;margin-top:${hi === hal.length - 1 ? '0' : 'auto'}"><span>Diunduh dari ${session.info?.nama_aplikasi || 'TKA'} · ${fmt.waktu(Date.now())}</span><span>Halaman ${hi + 1} dari ${hal.length}</span></div>
    </div>`)}`;
}

function CetakAnalisis({ q }) {
  const { data: a, error, loading } = useAsync(() => get('analisis', q), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const r = a.ringkasan;
  const maxBin = Math.max(1, ...a.distribusi.map((d) => d.n));
  const th = 'padding:6px 8px;border:1px solid #64748B;background:#CFEAFF;font-size:12px;text-align:left';
  const td = 'padding:5px 8px;border:1px solid #94A3B8;font-size:12px';
  return html`<${Toolbar} judul="Laporan Analisis Hasil" />
    <div class="paper" style=${`${PAPER};display:flex;flex-direction:column;gap:14px`}>
      <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #10284A;padding-bottom:10px"><span class="logo">TKA</span><div style="flex:1"><strong style="font-size:18px">Laporan Analisis Hasil Ujian</strong><br /><span style="font-size:12.5px;color:#334155">${session.info?.nama_instansi || ''} · ${q.mapel} ${q.kategori}</span></div></div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px">${[['Peserta', r.peserta], ['Rata-rata', fmt.angka(r.rata)], ['Median', fmt.angka(r.median)], ['Tertinggi / terendah', `${fmt.angka(r.maks)} / ${fmt.angka(r.min)}`], [`Capai target ≥ ${a.target}`, fmt.persen(r.persen_tuntas)]].map(([l, v]) =>
        html`<div style="padding:8px 10px;border:1px solid #CFEAFF;background:#F0F7FF;border-radius:8px"><span style="font-size:12px;color:#475569">${l}</span><br /><strong style="font-size:17px">${v}</strong></div>`)}</div>
      <strong>Sebaran nilai</strong>
      <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;align-items:end;height:110px">${a.distribusi.map((d) => html`<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px"><span style="font-size:11px">${d.n || ''}</span><span style=${`width:100%;height:${(d.n / maxBin) * 100}%;background:${d.dari >= a.target ? '#1F6BE0' : '#CFEAFF'};border-radius:4px 4px 0 0;min-height:1px`}></span></div>`)}</div>
      <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;font-size:11px;text-align:center;color:#475569">${a.distribusi.map((d) => html`<span>${d.label}</span>`)}</div>
      <strong>Pengelompokan (${a.grup.level})</strong>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>#</th><th style=${th}>Kelompok</th><th style=${th}>Peserta</th><th style=${th}>Rata-rata</th><th style=${th}>Tertinggi</th><th style=${th}>Terendah</th><th style=${th}>% Capai target</th></tr></thead>
        <tbody>${a.grup.items.slice(0, 15).map((g) => html`<tr><td style=${td}>${g.peringkat}</td><td style=${td}><strong>${g.nama}</strong> <span style="color:#64748B">${g.induk}</span></td><td style=${td}>${g.n}</td><td style=${td}>${fmt.angka(g.rata)}</td><td style=${td}>${fmt.angka(g.maks)}</td><td style=${td}>${fmt.angka(g.min)}</td><td style=${td}>${fmt.persen(g.persen_tuntas)}</td></tr>`)}</tbody></table>
      <strong>Butir soal (paling sulit → paling mudah)</strong>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>Urutan</th><th style=${th}>No.</th><th style=${th}>Tipe</th><th style=${th}>% Benar</th><th style=${th}>Kesukaran</th><th style=${th}>Daya beda</th></tr></thead>
        <tbody>${a.butir.map((b, i) => html`<tr><td style=${td}>${i + 1}</td><td style=${td}>${b.nomor}</td><td style=${td}>${TIPE_LABEL[b.tipe]}</td><td style=${td}>${fmt.angka(b.persen_benar)}%</td><td style=${td}>${b.kesukaran}</td><td style=${td}>${b.daya_beda == null ? '-' : fmt.angka(b.daya_beda, 2)} · ${b.kualitas_daya_beda}</td></tr>`)}</tbody></table>
      <strong>Peringkat 30 besar</strong>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>#</th><th style=${th}>Nama</th><th style=${th}>Sekolah</th><th style=${th}>Wilayah</th><th style=${th}>Nilai</th></tr></thead>
        <tbody>${a.ranking.filter((p) => p.nilai != null).slice(0, 30).map((p) => html`<tr><td style=${td}>${p.peringkat}</td><td style=${td}>${p.nama}</td><td style=${td}>${p.sekolah}</td><td style=${td}>${[p.kecamatan, p.kabkota].filter(Boolean).join(', ')}</td><td style=${`${td};font-weight:700`}>${fmt.angka(p.nilai)}</td></tr>`)}</tbody></table>
    </div>`;
}

function QR({ teks, size = 84 }) {
  const ref = useRef();
  useEffect(() => {
    loadScript('/vendor/qrcode.js').then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(teks);
      qr.make();
      if (ref.current) ref.current.innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    }).catch(() => {});
  }, [teks]);
  return html`<span ref=${ref} style=${`width:${size}px;height:${size}px;display:block`}></span>`;
}

function Sertifikat({ q }) {
  const { data, error, loading } = useAsync(() => get('cetak/sertifikat', { peserta: q.peserta }), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const s = data.sekolah;
  return html`<${Toolbar} judul=${`Sertifikat (${data.items.length})`} land=${true} />
    ${data.items.map((x) => html`<div class="paper land" style=${`${PAPER};padding:7mm;overflow:hidden;height:210mm`}>
      <span style="position:absolute;width:360px;height:360px;border-radius:50%;background:#E3F2FF;left:-150px;top:-170px"></span>
      <span style="position:absolute;width:220px;height:220px;border-radius:50%;background:#CFEAFF;left:-90px;top:-110px"></span>
      <span style="position:absolute;width:300px;height:300px;border-radius:50%;background:#E3F2FF;right:-130px;bottom:-150px"></span>
      <span style="position:absolute;width:160px;height:160px;border-radius:50%;background:#9CC8F8;right:-60px;bottom:-70px"></span>
      <div style="position:relative;height:100%;border:2px solid #1F6BE0;border-radius:24px;padding:8px">
        <div style="height:100%;border:1px solid #CFEAFF;border-radius:18px;padding:30px 60px 26px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px">
          <div style="display:flex;align-items:center;gap:12px"><${LogoDok} sekolah=${s} size=${52} /><span style="display:flex;flex-direction:column;align-items:flex-start"><strong style="font-size:15px">${x.sekolah}</strong><span style="font-size:12.5px;color:#334155">NPSN ${x.npsn} · ${session.info?.nama_instansi || ''}</span></span></div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px"><h1 style="font-size:46px;line-height:1;letter-spacing:.12em">SERTIFIKAT</h1>
            <span style="font-size:15px;font-weight:700;letter-spacing:.14em;color:#1A55B8">HASIL ${(session.info?.nama_aplikasi || 'TES KEMAMPUAN AKADEMIK').toUpperCase()}</span></div>
          <span style="font-size:15px;color:#334155">diberikan kepada</span>
          <strong style="font-size:38px;line-height:1.1;padding:0 40px 8px;border-bottom:2px solid #CFEAFF">${x.nama}</strong>
          <span style="font-size:14px;color:#334155">No. Peserta <strong style="color:#10284A">${x.username}</strong> · Kelas <strong style="color:#10284A">${x.kelas}</strong></span>
          <div style="display:flex;align-items:center;gap:24px;padding:14px 26px;border-radius:20px;background:#F0F7FF;border:1px solid #CFEAFF">
            <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px"><span style="font-size:12.5px;color:#475569">Mata pelajaran</span><strong style="font-size:17px">${x.mapel_nama}</strong><span style="font-size:13px;color:#334155">${x.kategori_nama} · ${fmt.tanggal(x.selesai_at)}</span></div>
            <span style="width:1px;align-self:stretch;background:#CFEAFF"></span>
            <div style="display:flex;flex-direction:column;align-items:center"><span style="font-size:12.5px;color:#475569">Nilai</span><strong style="font-size:34px;line-height:1;color:#1A55B8">${fmt.angka(x.nilai)}</strong></div>
            <span style="width:1px;align-self:stretch;background:#CFEAFF"></span>
            <div style="display:flex;flex-direction:column;align-items:center"><span style="font-size:12.5px;color:#475569">Predikat</span><strong style="font-size:17px">${x.predikat}</strong>${x.peringkat ? html`<span style="font-size:13px;color:#334155">Peringkat ${x.peringkat} dari ${x.dari}</span>` : ''}</div>
          </div>
          <div style="margin-top:auto;width:100%;display:flex;align-items:flex-end;justify-content:space-between;gap:24px">
            <div style="display:flex;align-items:center;gap:12px;text-align:left"><${QR} teks=${`${location.origin}/#/verifikasi/${x.kode}`} size=${76} />
              <span style="display:flex;flex-direction:column;gap:2px;font-size:12px;color:#475569"><span>Kode verifikasi</span><strong style="font-size:13px;color:#10284A;letter-spacing:.04em">${x.kode}</strong><span>Pindai untuk memeriksa keaslian</span></span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:3px;font-size:14px"><span>${kota(s)}, ${fmt.tanggal(x.selesai_at)}</span><span>Kepala Sekolah,</span><${RuangTtd} url=${s?.ttd_url} tinggi=${50} />
              <strong style="text-decoration:underline">${s?.kepala_sekolah || '[Nama Kepala Sekolah]'}</strong><span style="font-size:13px">NIP ${s?.nip_kepsek || ''}</span></div>
          </div>
        </div>
      </div>
    </div>`)}`;
}

function DaftarSoal({ q }) {
  const { data, error, loading } = useAsync(() => get('soal', { mapel: q.mapel, kategori: q.kategori, status: session.user.peran === 'admin' ? '' : q.status }), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  return html`<${Toolbar} judul=${`Daftar Soal ${q.mapel}-${q.kategori}`} />
    <div class="paper" style=${`${PAPER};--soal-size:13.5px;display:flex;flex-direction:column;gap:14px;height:auto`}>
      <div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #10284A;padding-bottom:10px"><span class="logo">TKA</span><div><strong style="font-size:18px">Bank Soal ${q.mapel} · ${q.kategori}</strong><br /><span style="font-size:12.5px;color:#334155">${data.items.length} soal · dengan kunci jawaban · RAHASIA</span></div></div>
      ${data.items.map((s) => html`<div style="break-inside:avoid;padding-bottom:12px;border-bottom:1px solid #CBD5E1;display:flex;flex-direction:column;gap:8px">
        <strong style="font-size:13px">${s.nomor}. [${TIPE_LABEL[s.tipe]}] · skor ${s.skor_maks}</strong>
        <${PratinjauSoal} soal=${s} />
      </div>`)}
    </div>`;
}

function CetakAkumulatif({ q }) {
  const { data: a, error, loading } = useAsync(async () => {
    const [d, sk] = await Promise.all([get('akumulatif', q), q.npsn || session.user.npsn ? get('sekolah', { npsn: q.npsn }) : Promise.resolve([])]);
    return { ...d, sekolah: (q.npsn || session.user.npsn) ? sk[0] : null };
  }, []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  const th = 'padding:6px 7px;border:1px solid #64748B;background:#CFEAFF;font-size:11.5px;text-align:left';
  const td = 'padding:5px 7px;border:1px solid #94A3B8;font-size:11.5px';
  const r = a.ringkasan;
  const perHal = 30;
  const hal = [];
  for (let i = 0; i < Math.max(1, a.ranking.length); i += perHal) hal.push(a.ranking.slice(i, i + perHal));
  return html`<${Toolbar} judul=${`Hasil Akumulatif · ${a.kategori?.nama || ''}`} />
    ${hal.map((rows, hi) => html`<div class="paper" style=${`${PAPER};display:flex;flex-direction:column;gap:12px`}>
      ${a.sekolah ? html`<${Kop} sekolah=${a.sekolah} kecil />` : html`<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #10284A;padding-bottom:10px"><${LogoDok} size=${48} /><div><strong style="font-size:17px">${session.info?.nama_instansi || ''}</strong><br /><span style="font-size:12.5px;color:#334155">${q.lingkup || 'Semua wilayah'}</span></div></div>`}
      ${hi === 0 && html`<h1 style="font-size:20px">Hasil Akumulatif Semua Mata Pelajaran · ${a.kategori?.nama || ''}</h1>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">${[['Siswa', `${r.peserta} (${r.lengkap} lengkap)`], ['Rata-rata gabungan', fmt.angka(r.rata)], ['Tertinggi / terendah', `${fmt.angka(r.maks)} / ${fmt.angka(r.min)}`], [`Capai target ≥ ${a.target}`, fmt.persen(r.persen_tuntas)]].map(([l, v]) =>
          html`<div style="padding:8px 10px;border:1px solid #CFEAFF;background:#F0F7FF;border-radius:8px"><span style="font-size:12px;color:#475569">${l}</span><br /><strong style="font-size:16px">${v}</strong></div>`)}</div>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>Mata pelajaran</th><th style=${th}>Siswa</th><th style=${th}>Rata-rata</th><th style=${th}>Tertinggi</th><th style=${th}>Terendah</th><th style=${th}>% Capai target</th></tr></thead>
          <tbody>${a.per_mapel.map((m) => html`<tr><td style=${td}><strong>${m.nama}</strong></td><td style=${td}>${m.n}</td><td style=${td}>${fmt.angka(m.rata)}</td><td style=${td}>${fmt.angka(m.maks)}</td><td style=${td}>${fmt.angka(m.min)}</td><td style=${td}>${fmt.persen(m.persen_tuntas)}</td></tr>`)}</tbody></table>`}
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>#</th><th style=${th}>Nama</th><th style=${th}>Kelas</th>${!a.sekolah ? html`<th style=${th}>Sekolah</th>` : ''}${a.mapel.map((m) => html`<th style=${`${th};text-align:right`}>${m.nama}</th>`)}<th style=${`${th};text-align:right`}>Rata-rata</th></tr></thead>
        <tbody>${rows.map((p, i) => html`<tr style=${i % 2 ? 'background:#F8FBFE' : ''}><td style=${td}>${p.peringkat ?? '-'}</td><td style=${`${td};font-weight:600`}>${p.nama}</td><td style=${td}>${p.kelas}</td>${!a.sekolah ? html`<td style=${td}>${p.sekolah}</td>` : ''}
          ${a.mapel.map((m) => html`<td style=${`${td};text-align:right`}>${fmt.angka(p.nilai[m.kode])}</td>`)}<td style=${`${td};text-align:right;font-weight:800`}>${fmt.angka(p.rata)}</td></tr>`)}</tbody></table>
      ${hi === hal.length - 1 && a.sekolah && html`<${Ttd} kanan=${{ atas: `${kota(a.sekolah)}, ${fmt.tanggal(Date.now())}`, jabatan: 'Kepala Sekolah,', ttd: a.sekolah.ttd_url, nama: a.sekolah.kepala_sekolah, nip: a.sekolah.nip_kepsek }} />`}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #CBD5E1;font-size:12px;color:#475569;margin-top:auto"><span>${session.info?.nama_aplikasi || 'TKA'} · ${fmt.waktu(Date.now())}</span><span>Halaman ${hi + 1} dari ${hal.length}</span></div>
    </div>`)}`;
}

// ---------- rekap semua try out ----------
const trenTeks = (v) => (v == null ? '–' : `${v > 0 ? '▲ +' : v < 0 ? '▼ ' : ''}${fmt.angka(v)}`);
const trenWarna = (v) => (v == null ? '#64748B' : v > 0 ? '#15803D' : v < 0 ? '#B91C1C' : '#334155');

function CetakRekapTryout({ q }) {
  const { siswa, ...qs } = q;
  const { data: a, error, loading } = useAsync(async () => {
    const npsn = q.npsn || session.user.npsn;
    const [d, sk] = await Promise.all([get('rekap-tryout', qs), npsn ? get('sekolah', { npsn: q.npsn }) : Promise.resolve([])]);
    return { ...d, sekolah: npsn ? sk[0] : null };
  }, []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<div style="padding:24px"><${ErrorBox} error=${error} /></div>`;
  if (siswa) {
    const s = a.siswa.find((x) => String(x.siswa_id) === String(siswa));
    if (!s) return html`<div style="padding:24px"><${ErrorBox} error=${new Error('Siswa tidak ditemukan pada rekap ini.')} /></div>`;
    return html`<${LaporanSiswa} a=${a} s=${s} />`;
  }
  const th = 'padding:6px 7px;border:1px solid #64748B;background:#CFEAFF;font-size:11.5px;text-align:left';
  const td = 'padding:5px 7px;border:1px solid #94A3B8;font-size:11.5px';
  const K = a.kategori, M = a.mapel, r = a.ringkasan;
  const land = K.length > 4;
  const perHal = land ? 22 : 30;
  const hal = [];
  for (let i = 0; i < Math.max(1, a.siswa.length); i += perHal) hal.push(a.siswa.slice(i, i + perHal));
  const kop = a.sekolah ? html`<${Kop} sekolah=${a.sekolah} kecil />` : html`<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #10284A;padding-bottom:10px"><${LogoDok} size=${48} /><div><strong style="font-size:17px">${session.info?.nama_instansi || ''}</strong><br /><span style="font-size:12.5px;color:#334155">${q.lingkup || 'Semua wilayah'}</span></div></div>`;
  const seri = [{ nama: 'Rata-rata gabungan', warna: WARNA_GABUNGAN, tebal: true, nilai: a.per_tryout.map((t) => t.rata) },
    ...M.map((m, i) => ({ nama: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: a.per_tryout.map((t) => t.per_mapel[m.kode]) }))];
  return html`<${Toolbar} judul="Rekap Nilai Semua Try Out" land=${land} />
    <div class=${`paper${land ? ' land' : ''}`} style=${`${PAPER};display:flex;flex-direction:column;gap:12px`}>
      ${kop}
      <h1 style="font-size:20px">Rekap & Analisis Nilai Semua Try Out</h1>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">${[['Siswa', `${r.siswa} (${r.ikut_semua} ikut semua)`], ['Rata-rata semua try out', fmt.angka(r.rata)], ['Siswa naik / turun', `${r.naik} / ${r.turun}`], [`Capai target ≥ ${a.target}`, fmt.persen(r.persen_tuntas)]].map(([l, v]) =>
        html`<div style="padding:8px 10px;border:1px solid #CFEAFF;background:#F0F7FF;border-radius:8px"><span style="font-size:12px;color:#475569">${l}</span><br /><strong style="font-size:16px">${v}</strong></div>`)}</div>
      <div style="border:1px solid #E3E8F2;border-radius:10px;padding:10px 12px"><strong style="font-size:13px">Perkembangan rata-rata per try out</strong>
        <${GrafikTren} label=${K.map((k) => k.nama)} seri=${seri} target=${a.target} tinggi=${200} /></div>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>Try out</th><th style=${th}>Siswa</th>${M.map((m) => html`<th style=${th}>${m.nama}</th>`)}<th style=${th}>Rata-rata</th><th style=${th}>Tertinggi</th><th style=${th}>Terendah</th><th style=${th}>% Capai target</th></tr></thead>
        <tbody>${a.per_tryout.map((t) => html`<tr><td style=${td}><strong>${t.nama}</strong></td><td style=${td}>${t.n}</td>${M.map((m) => html`<td style=${td}>${fmt.angka(t.per_mapel[m.kode])}</td>`)}<td style=${`${td};font-weight:800`}>${fmt.angka(t.rata)}</td><td style=${td}>${fmt.angka(t.maks)}</td><td style=${td}>${fmt.angka(t.min)}</td><td style=${td}>${fmt.persen(t.persen_tuntas)}</td></tr>`)}</tbody></table>
      ${!a.sekolah && html`<strong>Perkembangan per kelompok (${a.grup.level})</strong>
        <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>#</th><th style=${th}>Kelompok</th><th style=${th}>Siswa</th>${K.map((k) => html`<th style=${th}>${k.nama}</th>`)}<th style=${th}>Rata-rata</th><th style=${th}>Perubahan</th></tr></thead>
          <tbody>${a.grup.items.slice(0, 12).map((g) => html`<tr><td style=${td}>${g.peringkat}</td><td style=${td}><strong>${g.nama}</strong></td><td style=${td}>${g.n}</td>${K.map((k) => html`<td style=${td}>${fmt.angka(g.per_tryout[k.kode])}</td>`)}<td style=${`${td};font-weight:800`}>${fmt.angka(g.rata)}</td><td style=${`${td};color:${trenWarna(g.tren)};font-weight:700`}>${trenTeks(g.tren)}</td></tr>`)}</tbody></table>`}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #CBD5E1;font-size:12px;color:#475569;margin-top:auto"><span>${session.info?.nama_aplikasi || 'TKA'} · ${fmt.waktu(Date.now())}</span><span>Ringkasan</span></div>
    </div>
    ${hal.map((rows, hi) => html`<div class=${`paper${land ? ' land' : ''}`} style=${`${PAPER};display:flex;flex-direction:column;gap:12px`}>
      ${kop}
      <strong style="font-size:15px">Rekap nilai siswa${hal.length > 1 ? ` · bagian ${hi + 1} dari ${hal.length}` : ''}</strong>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>#</th><th style=${th}>Nama</th><th style=${th}>Kelas</th>${!a.sekolah ? html`<th style=${th}>Sekolah</th>` : ''}${K.map((k) => html`<th style=${`${th};text-align:right`}>${k.nama}</th>`)}<th style=${`${th};text-align:right`}>Rata-rata</th><th style=${`${th};text-align:right`}>Perubahan</th></tr></thead>
        <tbody>${rows.map((p, i) => html`<tr style=${i % 2 ? 'background:#F8FBFE' : ''}><td style=${td}>${p.peringkat}</td><td style=${`${td};font-weight:600`}>${p.nama}</td><td style=${td}>${p.kelas}</td>${!a.sekolah ? html`<td style=${td}>${p.sekolah}</td>` : ''}
          ${K.map((k) => html`<td style=${`${td};text-align:right`}>${fmt.angka(p.tryout[k.kode]?.rata)}</td>`)}<td style=${`${td};text-align:right;font-weight:800`}>${fmt.angka(p.rata)}</td><td style=${`${td};text-align:right;color:${trenWarna(p.tren)};font-weight:700`}>${trenTeks(p.tren)}</td></tr>`)}</tbody></table>
      ${hi === hal.length - 1 && a.sekolah && html`<${Ttd} kanan=${{ atas: `${kota(a.sekolah)}, ${fmt.tanggal(Date.now())}`, jabatan: 'Kepala Sekolah,', ttd: a.sekolah.ttd_url, nama: a.sekolah.kepala_sekolah, nip: a.sekolah.nip_kepsek }} />`}
      <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #CBD5E1;font-size:12px;color:#475569;margin-top:auto"><span>${session.info?.nama_aplikasi || 'TKA'} · ${fmt.waktu(Date.now())}</span><span>Halaman ${hi + 2} dari ${hal.length + 1}</span></div>
    </div>`)}`;
}

/** Laporan perkembangan satu siswa (untuk orang tua / wali). */
function LaporanSiswa({ a, s }) {
  const th = 'padding:7px 9px;border:1px solid #64748B;background:#CFEAFF;font-size:12.5px;text-align:left';
  const td = 'padding:6px 9px;border:1px solid #94A3B8;font-size:12.5px';
  const K = a.kategori, M = a.mapel;
  const seri = [{ nama: 'Nilai rata-rata', warna: WARNA_GABUNGAN, tebal: true, nilai: K.map((k) => s.tryout[k.kode]?.rata ?? null) },
    ...M.map((m, i) => ({ nama: m.nama, warna: WARNA_SERI[i % WARNA_SERI.length], nilai: K.map((k) => s.tryout[k.kode]?.nilai[m.kode] ?? null) })),
    { nama: 'Rata-rata sekolah', warna: '#94A3B8', putus: true, nilai: a.per_tryout.map((t) => t.rata) }];
  const sekolah = a.sekolah;
  const terbaik = M.map((m) => [m, s.per_mapel[m.kode]]).filter(([, v]) => v != null).sort((x, y) => y[1] - x[1]);
  return html`<${Toolbar} judul=${`Laporan Perkembangan · ${s.nama}`} />
    <div class="paper" style=${`${PAPER};display:flex;flex-direction:column;gap:14px`}>
      ${sekolah ? html`<${Kop} sekolah=${sekolah} />` : ''}
      <div style="text-align:center"><strong style="font-size:18px;letter-spacing:.04em">LAPORAN PERKEMBANGAN HASIL TRY OUT</strong><br /><span style="font-size:13px;color:#334155">Tahun Ajaran ${session.info?.tahun_ajaran || ''}</span></div>
      <table style="font-size:13.5px;border-collapse:collapse"><tbody>
        ${[['Nama', s.nama], ['Nomor peserta', s.username], ['Kelas', s.kelas], ['Sekolah', s.sekolah]].map(([l, v]) => html`<tr><td style="padding:2px 18px 2px 0;color:#475569">${l}</td><td style="padding:2px 0"><strong>: ${v}</strong></td></tr>`)}
      </tbody></table>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">${[['Rata-rata semua try out', fmt.angka(s.rata)], ['Peringkat di sekolah', `${s.peringkat} dari ${a.siswa.length}`], ['Try out diikuti', `${s.ikut} dari ${K.length}`], ['Perubahan awal → akhir', trenTeks(s.tren)]].map(([l, v], i) =>
        html`<div style="padding:8px 10px;border:1px solid #CFEAFF;background:#F0F7FF;border-radius:8px"><span style="font-size:12px;color:#475569">${l}</span><br /><strong style=${`font-size:17px;${i === 3 ? `color:${trenWarna(s.tren)}` : ''}`}>${v}</strong></div>`)}</div>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th style=${th}>Try out</th><th style=${th}>Tanggal</th>${M.map((m) => html`<th style=${`${th};text-align:right`}>${m.nama}</th>`)}<th style=${`${th};text-align:right`}>Rata-rata</th><th style=${`${th};text-align:right`}>Rata-rata sekolah</th></tr></thead>
        <tbody>${K.map((k, i) => { const t = s.tryout[k.kode]; return html`<tr><td style=${td}><strong>${k.nama}</strong></td><td style=${td}>${t?.selesai_at ? fmt.tanggal(t.selesai_at) : 'Tidak ikut'}</td>
          ${M.map((m) => html`<td style=${`${td};text-align:right`}>${t ? fmt.angka(t.nilai[m.kode]) : '–'}</td>`)}<td style=${`${td};text-align:right;font-weight:800`}>${t ? fmt.angka(t.rata) : '–'}</td><td style=${`${td};text-align:right;color:#475569`}>${fmt.angka(a.per_tryout[i].rata)}</td></tr>`; })}
          <tr style="background:#F0F7FF"><td style=${td} colspan="2"><strong>Rata-rata</strong></td>${M.map((m) => html`<td style=${`${td};text-align:right;font-weight:800`}>${fmt.angka(s.per_mapel[m.kode])}</td>`)}<td style=${`${td};text-align:right;font-weight:800`}>${fmt.angka(s.rata)}</td><td style=${`${td};text-align:right;color:#475569`}>${fmt.angka(a.ringkasan.rata)}</td></tr></tbody></table>
      <div style="border:1px solid #E3E8F2;border-radius:10px;padding:10px 12px"><strong style="font-size:13px">Grafik perkembangan</strong>
        <${GrafikTren} label=${K.map((k) => k.nama)} seri=${seri} target=${a.target} tinggi=${210} /></div>
      <div style="font-size:13px;line-height:1.6;padding:10px 12px;border-left:4px solid #1F6BE0;background:#F0F7FF">
        <strong>Catatan:</strong> Target capaian sekolah ${a.target}. Rata-rata ${s.nama} ${s.rata >= a.target ? 'sudah mencapai' : 'belum mencapai'} target.
        ${terbaik.length > 1 ? ` Mata pelajaran terkuat ${terbaik[0][0].nama} (${fmt.angka(terbaik[0][1])}); perlu penguatan pada ${terbaik[terbaik.length - 1][0].nama} (${fmt.angka(terbaik[terbaik.length - 1][1])}).` : ''}
        ${s.tren != null ? ` Dibanding try out pertama, nilai ${s.tren > 0 ? `naik ${fmt.angka(s.tren)} poin` : s.tren < 0 ? `turun ${fmt.angka(-s.tren)} poin` : 'tetap'}.` : ''}
      </div>
      ${sekolah && html`<${Ttd} kiri=${{ atas: 'Mengetahui,', jabatan: 'Orang Tua / Wali', nama: '..............................', nip: false }} kanan=${{ atas: `${kota(sekolah)}, ${fmt.tanggal(Date.now())}`, jabatan: 'Kepala Sekolah,', ttd: sekolah.ttd_url, nama: sekolah.kepala_sekolah, nip: sekolah.nip_kepsek }} />`}
    </div>`;
}
