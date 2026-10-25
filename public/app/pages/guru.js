import { html, useState, fmt, cls, TIPE_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, put } from '../api.js';
import { match } from '../router.js';
import { Shell } from '../layout.js';
import { Loading, ErrorBox, Empty, Chip, Stat, toastErr, useAsync, PageHead } from '../ui.js';
import { plain } from '../rich.js';
import { BankSoal, EditorSoal, BackupSoal } from './soal.js';
import { Koreksi } from './koreksi.js';
import { UjianMonitor } from './ujian.js';
import { Analisis } from './analisis.js';

export function App({ route }) {
  const p = route.path;
  const u = session.user;
  let page, m;
  if (p === '/guru/soal') page = html`<${BankSoal} mode="guru" base="#/guru/soal" />`;
  else if (p === '/guru/soal/baru') page = html`<${EditorSoal} key="baru" base="#/guru/soal" mode="guru" />`;
  else if ((m = match('/guru/soal/:id', p))) page = html`<${EditorSoal} key=${m.id} id=${+m.id} base="#/guru/soal" mode="guru" />`;
  else if (p === '/guru/koreksi' && u.npsn) page = html`<${Koreksi} />`;
  else if (p === '/guru/monitor' && u.bisa_monitor) page = html`<${UjianMonitor} npsn=${u.npsn} bolehAtur=${false} />`;
  else if (p === '/guru/analisis' && u.npsn) page = html`<${Analisis} lingkup="sekolah" />`;
  else if (p === '/guru/feedback') page = html`<${Feedback} />`;
  else if (p === '/guru/backup') page = html`<${BackupSoal} />`;
  else page = html`<${Beranda} />`;
  return html`<${Shell} route=${route}>${page}<//>`;
}

function Beranda() {
  const { data: d, error, loading, reload } = useAsync(() => get('dashboard'), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const s = d.soal || {};
  return html`
    <${PageHead} title=${`Halo, ${session.user.nama}`} sub=${session.sekolah ? `${session.sekolah.nama}${session.user.kelas ? ` · Kelas ${session.user.kelas}` : ''}` : 'Guru penulis soal pusat'}>
      <a class="btn btn-o" href="#/guru/soal"><${Icon} n="book" s=${18} />Bank soal</a>
      <a class="btn btn-p" href="#/guru/soal/baru"><${Icon} n="plus" s=${18} />Tulis soal</a><//>
    ${(s.draf || 0) + (s.revisi || 0) > 0 && html`<a href="#/guru/soal" class="card row" style="padding:12px 16px;text-decoration:none;color:var(--ink);border-color:var(--sky-200);background:var(--sky-50)"><${Icon} n="send" s=${20} />
      <span class="grow small"><strong>${(s.draf || 0) + (s.revisi || 0)} soal</strong> belum diajukan untuk ditelaah. Soal baru dipakai ujian setelah disetujui.</span><span class="small" style="font-weight:600;color:var(--sky-700)">Ajukan →</span></a>`}
    <section class="grid-auto" style="--min:160px">
      <${Stat} icon="book" tone="sky" value=${fmt.bulat(s.total || 0)} label="Soal saya" sub=${`${fmt.bulat(s.draf || 0)} draf`} href="#/guru/soal" />
      <${Stat} icon="check-circle" tone="green" value=${fmt.bulat(s.disetujui || 0)} label="Disetujui" />
      <${Stat} icon="clock" tone="amber" value=${fmt.bulat(s.menunggu || 0)} label="Menunggu telaah" />
      <${Stat} icon="message" tone="red" value=${fmt.bulat(s.revisi || 0)} label="Perlu revisi" href="#/guru/soal" />
    </section>
    <section class="card col" style="gap:0">
      <div class="card-head"><h2>Pekerjaan hari ini</h2></div>
      <nav class="aksi-list" style="padding:2px 20px 6px" aria-label="Pekerjaan guru">
        ${session.user.npsn && html`<a href="#/guru/koreksi"><${Icon} n="check-circle" s=${18} />Koreksi jawaban uraian & isian<span class="ket">${fmt.bulat(d.perlu_koreksi || 0)} jawaban</span><${Icon} n="chev-r" s=${16} /></a>`}
        <a href="#/guru/feedback"><${Icon} n="message" s=${18} />Feedback siswa tentang soal Anda<span class="ket">${fmt.bulat(d.feedback_baru || 0)} baru</span><${Icon} n="chev-r" s=${16} /></a>
        ${session.user.bisa_monitor ? html`<a href="#/guru/monitor"><${Icon} n="monitor" s=${18} />Monitor ujian & reset login<span class="ket">${fmt.bulat(d.mengerjakan || 0)} sedang ujian</span><${Icon} n="chev-r" s=${16} /></a>` : ''}
        ${session.user.npsn && html`<a href="#/guru/analisis"><${Icon} n="pie" s=${18} />Analisis hasil kelas<${Icon} n="chev-r" s=${16} /></a>`}
        <a href="#/guru/backup"><${Icon} n="database" s=${18} />Ekspor / impor bank soal<${Icon} n="chev-r" s=${16} /></a>
      </nav>
    </section>`;
}

export function Feedback() {
  const { data, error, loading, reload } = useAsync(() => get('feedback'), []);
  const baca = async (f) => { try { await put(`feedback/${f.id}/baca`); reload(true); } catch (e) { toastErr(e); } };
  return html`<${PageHead} title="Feedback Soal" sub="Laporan siswa saat mengerjakan ujian" />
    ${loading ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} />` : data.length === 0 ? html`<div class="card"><${Empty} icon="message" title="Belum ada feedback" /></div>` : html`<div class="col">
      ${data.map((f) => html`<article class="card row" style=${`padding:16px;align-items:flex-start;${f.dibaca ? 'opacity:.7' : ''}`}>
        <span class=${cls('tile', f.dibaca ? 't-slate' : 't-orange')}><${Icon} n="message" /></span>
        <div class="col grow" style="gap:6px;min-width:0">
          <div class="row wrap gap-8"><strong>Soal #${f.nomor}</strong><${Chip}>${f.mapel} · ${f.kategori}<//><${Chip}>${TIPE_LABEL[f.tipe]}<//><span class="tiny muted">${fmt.waktu(f.created_at)}</span></div>
          <p style="font-size:15px">“${f.pesan}”</p>
          <span class="tiny muted">${f.siswa || 'Siswa'}${f.sekolah ? ` · ${f.sekolah}` : ''} · ${plain(f.pertanyaan).slice(0, 120)}…</span>
        </div>
        <div class="col" style="gap:6px;align-items:flex-end">
          <a class="btn btn-o btn-sm" href=${`#/guru/soal/${f.soal_id}`}><${Icon} n="edit" s=${16} />Buka soal</a>
          ${!f.dibaca && html`<button class="btn btn-g btn-sm" onClick=${() => baca(f)}>Tandai dibaca</button>`}
        </div>
      </article>`)}</div>`}`;
}
