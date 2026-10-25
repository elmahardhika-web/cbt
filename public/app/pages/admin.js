import { html, useEffect, fmt, cls, singkat } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post } from '../api.js';
import { openPrint } from '../router.js';
import { Shell } from '../layout.js';
import { Loading, ErrorBox, Empty, Chip, Stat, toast, toastErr, useAsync, PageHead } from '../ui.js';
import { DataPengguna } from './pengguna.js';
import { UjianMonitor, toneMapel, useLive } from './ujian.js';
import { Koreksi } from './koreksi.js';
import { BankSoal } from './soal.js';
import { HasilLegger } from './hasil.js';
import { Analisis } from './analisis.js';
import { ProfilSekolah } from './sekolah.js';
import { BackupSekolah } from './backup.js';
import { Profil360 } from './profil360.js';

export function App({ route }) {
  const p = route.path;
  const npsn = session.user.npsn;
  let page;
  if (p === '/admin/siswa') page = html`<${DataPengguna} peran="siswa" npsn=${npsn} />`;
  else if (p === '/admin/guru') page = html`<${DataPengguna} peran="guru" npsn=${npsn} />`;
  else if (p === '/admin/ujian') page = html`<${UjianMonitor} npsn=${npsn} />`;
  else if (p === '/admin/koreksi') page = html`<${Koreksi} />`;
  else if (p === '/admin/soal') page = html`<${BankSoal} mode="admin" base="#/admin/soal" />`;
  else if (p === '/admin/hasil') page = html`<${HasilLegger} npsn=${npsn} />`;
  else if (p === '/admin/analisis') page = html`<${Analisis} lingkup="sekolah" />`;
  else if (p === '/admin/sekolah') page = html`<${ProfilSekolah} />`;
  else if (p === '/admin/profil360') page = html`<${Profil360} />`;
  else if (p === '/admin/backup') page = html`<${BackupSekolah} />`;
  else page = html`<${Dashboard} />`;
  return html`<${Shell} route=${route}>${page}<//>`;
}

function salam() {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}

function Dashboard() {
  const { data: d, error, loading, reload } = useAsync(() => get('dashboard'), []);
  const hidup = useLive(session.user.npsn, () => reload(true));
  useEffect(() => { const t = setInterval(() => reload(true), hidup ? 60e3 : 15e3); return () => clearInterval(t); }, [reload, hidup]);
  const s = session.sekolah;
  if (loading && !d) return html`<${Loading} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const aktif = d.ujian.find((u) => u.aktif);
  const tokenBaru = async () => { try { const r = await post(`ujian/${aktif.id}/token`); toast(`Token baru: ${r.token}`); reload(true); } catch (e) { toastErr(e); } };
  const pct = aktif && aktif.sasaran ? Math.round((aktif.selesai / aktif.sasaran) * 100) : 0;
  const kurang = [!s?.kabkota_kode && 'wilayah sekolah', !s?.logo_url && 'logo sekolah', !s?.ttd_url && 'tanda tangan kepala sekolah', !s?.kepala_sekolah && 'nama kepala sekolah'].filter(Boolean);
  return html`
    <${PageHead} title=${`${salam()}, ${session.user.nama.split(' ')[0]}`} sub=${`${fmt.hari(Date.now())} · ${s?.nama || ''} · NPSN ${s?.npsn || ''}`}>
      <a class="btn btn-o" href="#/admin/siswa"><${Icon} n="upload" s=${18} />Impor siswa</a>
      <a class="btn btn-p" href="#/admin/ujian"><${Icon} n="monitor" s=${18} />Ujian & monitor</a><//>
    ${kurang.length > 0 && html`<a href="#/admin/sekolah" class="card row" style="padding:12px 16px;border-color:#F0D7A4;background:var(--amber-50);text-decoration:none;color:var(--amber-900)">
      <${Icon} n="alert" s=${20} /><span class="grow small">Lengkapi profil sekolah: <strong>${kurang.join(', ')}</strong>. Data ini dipakai pada kartu peserta, sertifikat, dan dokumen cetak.</span><${Icon} n="chev-r" s=${18} /></a>`}
    <section class="grid-auto" style="--min:140px">
      <${Stat} icon="users" tone="sky" value=${fmt.bulat(d.siswa)} label="Siswa terdaftar" sub=${`${d.kelas} kelas`} href="#/admin/siswa" />
      <${Stat} icon="book" tone="orange" value=${fmt.bulat(d.guru)} label="Guru" href="#/admin/guru" />
      <${Stat} icon="calendar" tone="violet" value=${fmt.bulat(d.ujian_total)} label="Jadwal ujian" sub=${`${d.ujian_aktif} sedang dibuka`} href="#/admin/ujian" />
      <${Stat} icon="monitor" tone="green" value=${fmt.bulat(d.mengerjakan)} label="Sedang mengerjakan" sub=${d.terkunci ? `${d.terkunci} akun terkunci` : 'tidak ada akun terkunci'} href="#/admin/ujian" />
      <${Stat} icon="check-circle" tone="amber" value=${fmt.bulat(d.perlu_koreksi)} label="Jawaban perlu koreksi" href="#/admin/koreksi" />
      <${Stat} icon="chart" tone="slate" value=${d.rata == null ? '–' : fmt.angka(d.rata)} label="Rata-rata nilai" sub=${`${fmt.bulat(d.selesai)} ujian selesai`} href="#/admin/hasil" />
    </section>
    ${aktif ? html`<section class="hero row wrap" style="gap:24px;align-items:center">
      <div class="col" style="flex:1 1 340px;gap:10px">
        <span class="row gap-8 small" style="font-weight:600"><span class="dot live"></span>Sedang dibuka</span>
        <strong style="font-size:24px;line-height:1.2">${aktif.mapel_nama} · ${aktif.kategori_nama}</strong>
        <span class="small muted-inv">${aktif.sesi === 'SEMUA' ? 'Semua sesi' : aktif.sesi}${aktif.jam_mulai ? ` · ${aktif.jam_mulai}${aktif.jam_selesai ? `–${aktif.jam_selesai}` : ''}` : ''} · ${aktif.sasaran} peserta · ${aktif.durasi} menit</span>
        <div class="row wrap gap-8" style="margin-top:6px"><a href="#/admin/ujian" class="btn btn-inv"><${Icon} n="monitor" s=${18} />Buka monitor</a>
          <button class="btn btn-inv-o" onClick=${() => openPrint(`/cetak/berita-acara/${aktif.id}`)}><${Icon} n="printer" s=${18} />Berita acara</button></div>
      </div>
      <div class="col" style="flex:0 1 220px;gap:4px;padding:14px 16px;border:1px solid rgba(255,255,255,.2);border-radius:var(--radius-sm)">
        <span class="tiny muted-inv" style="font-weight:600;letter-spacing:.06em;text-transform:uppercase">Token ujian</span>
        <div class="row gap-8"><strong class="grow num" style="font-size:28px;letter-spacing:.16em">${aktif.token}</strong>
          <button class="icon-btn" style="background:transparent;border-color:rgba(255,255,255,.35);color:#fff" aria-label="Buat token baru" title="Buat token baru" onClick=${tokenBaru}><${Icon} n="refresh" s=${18} /></button></div>
      </div>
      <div class="col" style="flex:0 1 200px;gap:6px">
        <span class="row small" style="justify-content:space-between"><span class="muted-inv">Selesai</span><strong class="num">${aktif.selesai}/${aktif.sasaran} · ${pct}%</strong></span>
        <span class="meter" style="height:8px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;display:block"><span style=${`display:block;height:100%;width:${pct}%;background:#9DBDEB`}></span></span>
        <span class="tiny muted-inv">${aktif.mengerjakan} sedang mengerjakan</span>
      </div>
    </section>` : html`<section class="card row wrap" style="padding:16px 20px"><${Icon} n="calendar" s=${22} />
      <span class="grow"><strong>Tidak ada ujian yang sedang dibuka.</strong><br /><span class="small muted">Buka atau buat jadwal dari menu Ujian & Monitor.</span></span>
      <a class="btn btn-o" href="#/admin/ujian">Lihat jadwal</a></section>`}
    <section class="dasbor-grid">
      <div class="card col s7" style="gap:0">
        <div class="card-head"><h2 class="grow">Aktivitas peserta terbaru</h2><a href="#/admin/ujian" class="small" style="font-weight:600;text-decoration:none">Lihat semua →</a></div>
        ${d.aktivitas.length === 0 ? html`<${Empty} icon="users" title="Belum ada aktivitas ujian" />` : html`<div class="table-wrap"><table class="tbl">
          <thead><tr><th class="no">No</th><th>Peserta</th><th>Mapel</th><th>Status</th><th class="r">Terakhir</th></tr></thead>
          <tbody>${d.aktivitas.map((a, i) => html`<tr><td class="no">${i + 1}</td>
            <td><span class="col" style="gap:0"><strong class="strong small">${a.nama}</strong><span class="tiny muted">${a.kelas} · ${a.username}</span></span></td><td class="small">${a.mapel}</td>
            <td>${a.status === 'selesai' ? html`<${Chip} c="green">Selesai<//>` : a.terkunci ? html`<${Chip} c="red">Terkunci<//>` : !a.aktif_sejak ? html`<${Chip} c="amber">Dijeda<//>` : a.keluar_layar ? html`<${Chip} c="amber">Keluar layar<//>` : html`<${Chip} c="sky">${a.dijawab}/${a.total} dijawab<//>`}</td>
            <td class="r tiny muted num">${fmt.jam(a.last_active)}</td></tr>`)}</tbody></table></div>`}
      </div>
      <div class="col s5" style="gap:20px">
        <div class="card col" style="gap:0">
          <div class="card-head"><h2 class="grow">Jadwal ujian</h2><span class="small muted num">${d.ujian_total} jadwal</span></div>
          ${d.ujian.length === 0 ? html`<span class="small muted" style="padding:16px 20px">Belum ada jadwal.</span>` : html`<div class="col" style="gap:0">${d.ujian.slice(0, 5).map((u, i) => html`<div class="row" style=${`padding:10px 20px;${i ? 'border-top:1px solid #EDF1F5' : ''}`}>
            <span class=${cls('tile sm', u.aktif ? 't-sky-solid' : toneMapel(u.mapel))}>${singkat(u.mapel)}</span>
            <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${u.mapel_nama} · ${u.kategori}</strong>
              <span class="tiny muted">${u.tanggal ? fmt.tglPendek(u.tanggal) : 'Tanpa tanggal'}${u.jam_mulai ? ` · ${u.jam_mulai}` : ''} · ${u.selesai}/${u.sasaran} selesai</span></span>
            ${u.aktif ? html`<${Chip} c="green">Dibuka<//>` : html`<span class="tiny muted">Ditutup</span>`}
          </div>`)}</div>`}
        </div>
        <div class="card col" style="gap:0">
          <div class="card-head"><h2>Aksi cepat</h2></div>
          <nav class="aksi-list" style="padding:2px 20px 6px" aria-label="Aksi cepat">
            <a href="#/admin/siswa"><${Icon} n="idcard" s=${18} />Cetak kartu peserta<${Icon} n="chev-r" s=${16} /></a>
            <a href="#/admin/hasil"><${Icon} n="sheet" s=${18} />Unduh legger & rekap nilai<${Icon} n="chev-r" s=${16} /></a>
            <a href="#/admin/profil360"><${Icon} n="award" s=${18} />Profil 360 sekolah<${Icon} n="chev-r" s=${16} /></a>
            <a href="#/admin/sekolah"><${Icon} n="stamp" s=${18} />Logo, tanda tangan & stempel<${Icon} n="chev-r" s=${16} /></a>
            <a href="#/admin/backup"><${Icon} n="database" s=${18} />Cadangkan data sekolah<${Icon} n="chev-r" s=${16} /></a>
          </nav>
        </div>
      </div>
    </section>`;
}
