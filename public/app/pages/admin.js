import { html, useEffect, fmt, cls, singkat } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post } from '../api.js';
import { openPrint } from '../router.js';
import { Shell } from '../layout.js';
import { Loading, ErrorBox, Empty, Chip, Stat, toast, toastErr, useAsync, PageHead, Avatar } from '../ui.js';
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
  return html`
    <${PageHead} title=${`${salam()}, ${session.user.nama.split(' ')[0]}`} sub=${`${fmt.hari(Date.now())} · ${s?.nama || ''} · NPSN ${s?.npsn || ''}`} />
    ${!s?.kabkota_kode && html`<a href="#/admin/sekolah" class="card row" style="padding:14px 16px;background:var(--amber-50);border-color:var(--amber-100);text-decoration:none;color:var(--amber-900)">
      <${Icon} n="map" /><span class="grow small">Wilayah sekolah belum diisi. Lengkapi agar nilai masuk ke analisis per kab/kota hingga kelurahan.</span><${Icon} n="chev-r" /></a>`}
    ${aktif ? html`<section class="hero row wrap" style="gap:28px;align-items:center">
      <span class="deco" style="width:300px;height:300px;background:rgba(255,255,255,.2);right:-60px;top:-140px"></span>
      <span class="deco" style="width:140px;height:140px;background:rgba(169,155,242,.45);right:300px;bottom:-80px"></span>
      <div class="col" style="flex:1 1 360px;gap:14px">
        <span class="chip white" style="align-self:flex-start;color:var(--green-700)"><span class="dot live"></span>Sedang dibuka</span>
        <div class="col" style="gap:6px"><strong style="font-size:26px;line-height:1.2">${aktif.mapel_nama} · ${aktif.kategori_nama}</strong>
          <span class="small" style="font-weight:600">${aktif.sesi === 'SEMUA' ? 'Semua sesi' : aktif.sesi}${aktif.jam_mulai ? ` · ${aktif.jam_mulai}${aktif.jam_selesai ? `–${aktif.jam_selesai}` : ''}` : ''} · ${aktif.sasaran} peserta · ${aktif.durasi} menit</span></div>
        <div class="row wrap"><a href="#/admin/ujian" class="btn" style="background:#fff;color:var(--sky-700)"><${Icon} n="monitor" s=${18} />Buka Monitor</a>
          <button class="btn" style="background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.4)" onClick=${() => openPrint(`/cetak/berita-acara/${aktif.id}`)}><${Icon} n="printer" s=${18} />Berita Acara</button></div>
      </div>
      <div class="card col" style="flex:0 1 260px;padding:18px;gap:8px;border:0">
        <span class="tiny" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Token ujian</span>
        <div class="row gap-8"><strong class="grow" style="font-size:30px;letter-spacing:.18em">${aktif.token}</strong>
          <button class="icon-btn" style="background:var(--sky-100);border:0;color:var(--sky-700)" aria-label="Buat token baru" onClick=${tokenBaru}><${Icon} n="refresh" /></button></div>
        <span class="tiny muted">Bagikan ke siswa di ruang ujian</span>
      </div>
      <span style=${`width:112px;height:112px;border-radius:50%;background:conic-gradient(var(--sky-200) 0 ${pct}%, rgba(255,255,255,.2) ${pct}% 100%);display:flex;align-items:center;justify-content:center`} role="img" aria-label=${`${pct}% selesai`}>
        <span style="width:84px;height:84px;border-radius:50%;background:var(--sky-700);display:flex;flex-direction:column;align-items:center;justify-content:center"><strong style="font-size:22px">${pct}%</strong><span class="tiny" style="font-weight:700">selesai</span></span></span>
    </section>` : html`<section class="card pad row wrap"><span class="tile t-sky"><${Icon} n="calendar" /></span>
      <span class="grow"><strong>Tidak ada ujian yang sedang dibuka.</strong><br /><span class="small muted">Buka atau buat jadwal ujian dari menu Ujian & Monitor.</span></span>
      <a class="btn btn-p" href="#/admin/ujian">Ujian & Monitor</a></section>`}
    <section class="grid-auto" style="--min:200px">
      <${Stat} icon="users" tone="sky" value=${fmt.bulat(d.siswa)} label="Siswa terdaftar" />
      <${Stat} icon="book" tone="orange" value=${fmt.bulat(d.guru)} label="Guru" />
      <${Stat} icon="monitor" tone="green" value=${fmt.bulat(d.mengerjakan)} label="Sedang mengerjakan" />
      <a href="#/admin/koreksi" style="text-decoration:none;color:inherit"><${Stat} icon="check-circle" tone="violet" value=${fmt.bulat(d.perlu_koreksi)} label="Jawaban perlu koreksi" /></a>
    </section>
    <section class="grid-auto" style="--min:420px;gap:20px">
      <div class="card pad col" style="gap:14px">
        <div class="row" style="justify-content:space-between"><h2>Aktivitas Peserta</h2><a href="#/admin/ujian" class="small" style="font-weight:700;text-decoration:none">Lihat semua</a></div>
        ${d.aktivitas.length === 0 ? html`<${Empty} icon="users" title="Belum ada aktivitas ujian" />` : html`<div class="col" style="gap:0">
          ${d.aktivitas.map((a, i) => html`<div class="row" style=${`padding:10px 0;${i < d.aktivitas.length - 1 ? 'border-bottom:1px solid #EEF4F9' : ''}`}>
            <${Avatar} nama=${a.nama} tone=${a.status === 'selesai' ? 'green' : a.keluar_layar ? 'amber' : 'sky'} />
            <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${a.nama}</strong><span class="tiny muted">${a.kelas} · ${a.username} · ${a.mapel}</span></span>
            ${a.status === 'selesai' ? html`<${Chip} c="green" icon="check">Selesai<//>` : a.terkunci ? html`<${Chip} c="red" icon="lock">Terkunci<//>` : !a.aktif_sejak ? html`<${Chip} c="amber" icon="clock">Dijeda<//>` : a.keluar_layar ? html`<${Chip} c="amber" icon="alert">Keluar layar<//>` : html`<${Chip} c="sky">Mengerjakan ${a.dijawab}/${a.total}<//>`}
            <span class="tiny muted" style="width:60px;text-align:right">${fmt.jam(a.last_active)}</span>
          </div>`)}</div>`}
      </div>
      <div class="col" style="gap:20px">
        <div class="card pad col" style="gap:14px">
          <h2>Aksi Cepat</h2>
          <div class="grid-auto" style="--min:140px;gap:10px">
            ${[['#/admin/siswa', 'upload', 't-sky', 'Impor Siswa'], ['#/admin/siswa', 'idcard', 't-orange', 'Cetak Kartu'], ['#/admin/ujian', 'file', 't-violet', 'Berita Acara'],
              ['#/admin/hasil', 'sheet', 't-green', 'Unduh Legger'], ['#/admin/profil360', 'award', 't-pink', 'Profil 360'], ['#/admin/sekolah', 'school', 't-slate', 'Profil Sekolah']].map(([href, ic, t, l]) =>
              html`<a href=${href} class="col" style="padding:14px;border-radius:18px;background:var(--surface-2);border:1px solid var(--line);gap:10px;text-decoration:none;color:var(--ink)">
                <span class=${cls('tile', t)} style="width:40px;height:40px"><${Icon} n=${ic} /></span><strong class="small">${l}</strong></a>`)}
          </div>
        </div>
        <div class="card pad col" style="gap:10px">
          <h2>Jadwal Ujian</h2>
          ${d.ujian.length === 0 ? html`<span class="small muted">Belum ada jadwal.</span>` : d.ujian.slice(0, 5).map((u) => html`<div class="row" style=${`padding:10px 12px;border-radius:16px;${u.aktif ? 'background:var(--sky-50)' : ''}`}>
            <span class=${cls('tile', u.aktif ? 't-sky-solid' : toneMapel(u.mapel))} style="width:40px;height:40px;font-size:12px">${singkat(u.mapel)}</span>
            <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${u.mapel_nama} · ${u.kategori} · ${u.sesi === 'SEMUA' ? 'Semua sesi' : u.sesi}</strong>
              <span class="tiny muted">${u.tanggal ? fmt.tglPendek(u.tanggal) : 'Tanpa tanggal'}${u.jam_mulai ? ` · ${u.jam_mulai}` : ''} · ${u.selesai}/${u.sasaran} selesai</span></span>
            ${u.aktif ? html`<${Chip} c="green">Dibuka<//>` : html`<${Chip}>Ditutup<//>`}
          </div>`)}
        </div>
      </div>
    </section>`;
}
