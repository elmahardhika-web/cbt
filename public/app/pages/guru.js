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
      <a class="btn btn-p" href="#/guru/soal/baru"><${Icon} n="plus" s=${18} />Input Soal</a><//>
    <section class="grid-auto" style="--min:200px">
      <${Stat} icon="book" tone="sky" value=${fmt.bulat(s.total || 0)} label="Soal saya" />
      <${Stat} icon="check-circle" tone="green" value=${fmt.bulat(s.disetujui || 0)} label="Disetujui" />
      <${Stat} icon="clock" tone="amber" value=${fmt.bulat(s.menunggu || 0)} label="Menunggu telaah" />
      <a href="#/guru/soal" style="text-decoration:none;color:inherit"><${Stat} icon="message" tone="red" value=${fmt.bulat(s.revisi || 0)} label="Perlu revisi" /></a>
    </section>
    <section class="grid-auto" style="--min:320px;gap:20px">
      ${session.user.npsn && html`<a href="#/guru/koreksi" class="card pad row" style="text-decoration:none;color:inherit"><span class="tile lg t-violet"><${Icon} n="check-circle" s=${26} /></span>
        <span class="col grow" style="gap:2px"><strong style="font-size:18px">${fmt.bulat(d.perlu_koreksi || 0)} jawaban perlu dikoreksi</strong><span class="small muted">Uraian dan isian tanpa kunci</span></span><${Icon} n="chev-r" /></a>`}
      <a href="#/guru/feedback" class="card pad row" style="text-decoration:none;color:inherit"><span class="tile lg t-orange"><${Icon} n="message" s=${26} /></span>
        <span class="col grow" style="gap:2px"><strong style="font-size:18px">${d.feedback_baru} feedback baru</strong><span class="small muted">Laporan siswa tentang soal Anda</span></span><${Icon} n="chev-r" /></a>
      ${session.user.bisa_monitor ? html`<a href="#/guru/monitor" class="card pad row" style="text-decoration:none;color:inherit"><span class="tile lg t-green"><${Icon} n="monitor" s=${26} /></span>
        <span class="col grow" style="gap:2px"><strong style="font-size:18px">${fmt.bulat(d.mengerjakan || 0)} siswa sedang ujian</strong><span class="small muted">Monitor dan reset login</span></span><${Icon} n="chev-r" /></a>` : ''}
    </section>
    ${(s.draf || 0) + (s.revisi || 0) > 0 && html`<div class="card row" style="padding:16px;background:var(--sky-50)"><${Icon} n="send" /><span class="grow small">${(s.draf || 0) + (s.revisi || 0)} soal belum diajukan ke supervisor. Soal hanya dipakai ujian setelah disetujui.</span>
      <a class="btn btn-p btn-sm" href="#/guru/soal">Buka Bank Soal</a></div>`}`;
}

function Feedback() {
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
