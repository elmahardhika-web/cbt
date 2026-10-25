import { html, useState, useEffect, fmt, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, put, del } from '../api.js';
import { match } from '../router.js';
import { Shell, PindahPeran } from '../layout.js';
import { Loading, ErrorBox, Empty, Chip, Stat, Switch, Modal, Field, toast, toastErr, confirmDialog, useAsync, PageHead, Bar, PilihGambar } from '../ui.js';
import { session as sesi, setSession } from '../api.js';
import { PRESET_LATAR } from '../tampilan.js';
import { Backup } from './backup.js';
import { UjianMassal } from './massal.js';
import { BankSoal, EditorSoal, useMaster } from './soal.js';
import { Telaah } from './supervisor.js';
import { Analisis } from './analisis.js';
import { DaftarSekolah } from './sekolah.js';
import { DataPengguna } from './pengguna.js';
import { DasborWilayah } from './dasbor.js';
import { Profil360 } from './profil360.js';
import { PengajuanAkun } from './pengajuan.js';

export function App({ route }) {
  const p = route.path;
  let page, m;
  if (p === '/pusat/sekolah') page = html`<${DaftarSekolah} />`;
  else if ((m = match('/pusat/sekolah/:npsn/profil', p))) page = html`<${Profil360} key=${m.npsn} npsn=${m.npsn} back="#/pusat/sekolah" />`;
  else if (p === '/pusat/pengajuan') page = html`<${PengajuanAkun} />`;
  else if (p === '/pusat/pengguna') page = html`<${DataPengguna} peran="admin" pilihPeran=${true} />`;
  else if (p === '/pusat/soal') page = html`<${BankSoal} mode="pusat" base="#/pusat/soal" />`;
  else if (p === '/pusat/soal/baru') page = html`<${EditorSoal} key="baru" base="#/pusat/soal" mode="pusat" />`;
  else if ((m = match('/pusat/soal/:id', p))) page = html`<${EditorSoal} key=${m.id} id=${+m.id} base="#/pusat/soal" mode="pusat" />`;
  else if (p === '/pusat/telaah') page = html`<${Telaah} />`;
  else if (p === '/pusat/master') page = html`<${Master} />`;
  else if (p === '/pusat/analisis') page = html`<${Analisis} lingkup="pusat" />`;
  else if (p === '/pusat/dasbor') page = html`<${DasborWilayah} base="#/pusat" />`;
  else if (p === '/pusat/pengaturan') page = html`<${Pengaturan} />`;
  else if (p === '/pusat/backup') page = html`<${Backup} />`;
  else if (p === '/pusat/ujian') page = html`<${UjianMassal} />`;
  else page = html`<${Dashboard} />`;
  return html`<${Shell} route=${route}>${page}<//>`;
}

function Dashboard() {
  const { data: d, error, loading, reload } = useAsync(() => get('dashboard'), []);
  const aju = useAsync(() => get('pengajuan/ringkasan'), []);
  const [pindah, setPindah] = useState(false);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  return html`
    <${PageHead} title="Dashboard Superadmin" sub="Ringkasan seluruh sekolah peserta TKA">
      <button class="btn btn-s" onClick=${() => setPindah(true)}><${Icon} n="swap" s=${18} />Pindah Peran</button>
      <a class="btn btn-p" href="#/pusat/sekolah"><${Icon} n="plus" s=${18} />Tambah Sekolah</a><//>
    ${aju.data?.menunggu > 0 && html`<a class="card row" href="#/pusat/pengajuan" style="padding:14px 18px;gap:12px;text-decoration:none;color:var(--ink);background:var(--amber-50);border-color:var(--amber-100)">
      <span class="tile t-amber"><${Icon} n="send" s=${20} /></span><span class="grow"><strong>${aju.data.menunggu} pengajuan akun sekolah</strong> menunggu keputusan Anda.</span>
      <span class="btn btn-p btn-sm">Tinjau <${Icon} n="arrow-r" s=${16} /></span></a>`}
    <section class="grid-auto" style="--min:190px">
      <${Stat} icon="school" tone="sky" value=${fmt.bulat(d.sekolah)} label="Sekolah" />
      <${Stat} icon="users" tone="green" value=${fmt.bulat(d.siswa)} label="Siswa" />
      <${Stat} icon="book" tone="orange" value=${fmt.bulat(d.guru)} label="Guru" />
      <${Stat} icon="user" tone="violet" value=${fmt.bulat(d.admin)} label="Admin sekolah" />
      <${Stat} icon="shield" tone="pink" value=${fmt.bulat(d.supervisor)} label="Supervisor" />
    </section>
    <section class="row wrap" style="gap:20px;align-items:stretch">
      <div class="hero col" style="flex:1 1 360px;gap:14px">
        <span class="deco" style="width:220px;height:220px;background:rgba(255,255,255,.22);right:-60px;top:-80px"></span>
        <span class="chip white" style="align-self:flex-start"><span class="dot live"></span>Langsung</span>
        <strong style="font-size:40px;line-height:1">${fmt.bulat(d.mengerjakan)}</strong>
        <span style="font-weight:600">siswa sedang mengerjakan · ${d.ujian_aktif} jadwal ujian dibuka</span>
        <span class="row wrap gap-8"><a class="btn" style="background:#fff;color:var(--sky-700)" href="#/pusat/dasbor"><${Icon} n="map" s=${18} />Dasbor Wilayah</a>
          <a class="btn" style="background:rgba(255,255,255,.18);color:#fff" href="#/pusat/analisis"><${Icon} n="pie" s=${18} />Analisis Rinci</a></span>
      </div>
      <div class="card pad col" style="flex:999 1 420px;gap:12px">
        <div class="row" style="justify-content:space-between"><h2>Kesiapan Soal per Mapel</h2><a class="btn btn-g btn-sm" href="#/pusat/telaah">${d.telaah_menunggu} menunggu telaah</a></div>
        ${d.soal.map((m) => html`<div class="col" style="gap:6px">
          <div class="row small" style="justify-content:space-between"><strong>${m.nama}</strong><span class="muted">${m.disetujui} disetujui${m.menunggu ? ` · ${m.menunggu} menunggu` : ''}${m.revisi ? ` · ${m.revisi} revisi` : ''}</span></div>
          <${Bar} value=${m.total ? (m.disetujui / m.total) * 100 : 0} /></div>`)}
      </div>
    </section>
    ${pindah && html`<${PindahPeran} onClose=${() => setPindah(false)} />`}`;
}

function Master() {
  const { data, error, loading, reload } = useAsync(async () => ({ mapel: await get('mapel'), kategori: await get('kategori') }), []);
  const [form, setForm] = useState(null);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const simpan = async () => {
    const { tabel, baru, ...b } = form;
    try { if (baru) await post(tabel, b); else await put(`${tabel}/${b.kode}`, b); toast('Disimpan.'); setForm(null); reload(true); } catch (e) { toastErr(e); }
  };
  const hapus = async (tabel, r) => {
    if (!(await confirmDialog(`Hapus ${r.nama}?`, { danger: true, ok: 'Hapus' }))) return;
    try { await del(`${tabel}/${r.kode}`); toast('Dihapus.'); reload(true); } catch (e) { toastErr(e); }
  };
  const aktif = async (tabel, r, v) => { try { await put(`${tabel}/${r.kode}`, { aktif: v }); reload(true); } catch (e) { toastErr(e); } };
  const tabel = (t, judul, rows) => html`<section class="card col" style="flex:1 1 380px;gap:0">
    <div class="card-head"><h2 class="grow">${judul}</h2><button class="btn btn-p btn-sm" onClick=${() => setForm({ tabel: t, baru: true, kode: '', nama: '', urutan: rows.length + 1 })}><${Icon} n="plus" s=${16} />Tambah</button></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Kode</th><th>Nama</th><th class="r">Urutan</th><th>Aktif</th><th class="r">Aksi</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td><strong>${r.kode}</strong></td><td>${r.nama}</td><td class="r">${r.urutan}</td>
        <td><${Switch} checked=${!!r.aktif} label=${`Aktifkan ${r.nama}`} onChange=${(v) => aktif(t, r, v)} /></td>
        <td class="r"><button class="icon-btn sm" aria-label="Ubah" onClick=${() => setForm({ tabel: t, ...r })}><${Icon} n="edit" s=${18} /></button>
          <button class="icon-btn sm danger" aria-label="Hapus" onClick=${() => hapus(t, r)}><${Icon} n="trash" s=${18} /></button></td></tr>`)}</tbody></table></div>
  </section>`;
  return html`<${PageHead} title="Mapel & Kategori" sub="Paket soal = mata pelajaran + kategori ujian" />
    <div class="row wrap" style="gap:20px;align-items:flex-start">${tabel('mapel', 'Mata Pelajaran', data.mapel)}${tabel('kategori', 'Kategori Ujian', data.kategori)}</div>
    ${form && html`<${Modal} title=${`${form.baru ? 'Tambah' : 'Ubah'} ${form.tabel === 'mapel' ? 'mata pelajaran' : 'kategori'}`} onClose=${() => setForm(null)}
      foot=${html`<button class="btn btn-o" onClick=${() => setForm(null)}>Batal</button><button class="btn btn-p" onClick=${simpan}>Simpan</button>`}>
      <div class="form-grid">
        <${Field} label="Kode" hint="huruf/angka, contoh IPAS"><input class="input" value=${form.kode} disabled=${!form.baru} onInput=${(e) => setForm({ ...form, kode: e.target.value.toUpperCase() })} /><//>
        <${Field} label="Nama"><input class="input" value=${form.nama} onInput=${(e) => setForm({ ...form, nama: e.target.value })} /><//>
        <${Field} label="Urutan"><input class="input" type="number" value=${form.urutan} onInput=${(e) => setForm({ ...form, urutan: e.target.value })} /><//>
      </div><//>`}`;
}

function Pengaturan() {
  const [f, setF] = useState(null);
  const demo = useAsync(() => get('demo'), []);
  useEffect(() => { get('pengaturan').then(setF).catch(toastErr); }, []);
  if (!f) return html`<${Loading} />`;
  const set = (p) => setF({ ...f, ...p });
  const simpan = async () => {
    try { const d = await put('pengaturan', f); setF(d); sesi.info = d; setSession({ ...sesi }); toast('Pengaturan disimpan.'); } catch (e) { toastErr(e); }
  };
  const listEditor = (key, cols, kosong) => html`<div class="col" style="gap:8px">
    ${(f[key] || []).map((row, i) => html`<div class="row wrap gap-8">${cols.map(([c, ph, w]) => html`<input class="input" style=${`flex:${w}`} placeholder=${ph} value=${row[c] || ''} aria-label=${ph}
      onInput=${(e) => set({ [key]: f[key].map((r, j) => (j === i ? { ...r, [c]: e.target.value } : r)) })} />`)}
      <button class="icon-btn danger" aria-label="Hapus baris" onClick=${() => set({ [key]: f[key].filter((_, j) => j !== i) })}><${Icon} n="trash" s=${18} /></button></div>`)}
    <button class="btn btn-g btn-sm" style="align-self:flex-start;color:var(--sky-700)" onClick=${() => set({ [key]: [...(f[key] || []), kosong] })}><${Icon} n="plus" s=${16} />Tambah</button></div>`;
  return html`<${PageHead} title="Pengaturan" sub="Identitas aplikasi, target capaian, tampilan, dan informasi di halaman depan">
      <button class="btn btn-p" onClick=${simpan}><${Icon} n="check" s=${18} />Simpan</button><//>
    <section class="card pad col" style="gap:16px">
      <div class="form-grid">
        <${Field} label="Nama aplikasi"><input class="input" value=${f.nama_aplikasi} onInput=${(e) => set({ nama_aplikasi: e.target.value })} /><//>
        <${Field} label="Nama instansi penyelenggara"><input class="input" value=${f.nama_instansi} onInput=${(e) => set({ nama_instansi: e.target.value })} /><//>
        <${Field} label="Tahun ajaran"><input class="input" value=${f.tahun_ajaran} onInput=${(e) => set({ tahun_ajaran: e.target.value })} /><//>
        <${Field} label="Target capaian (bawaan pusat)" hint="sekolah dapat mengatur sendiri"><input class="input" type="number" min="0" max="100" value=${f.target_capaian} onInput=${(e) => set({ target_capaian: e.target.value })} /><//>
      </div>
    </section>
    <section class="card pad col" style="gap:16px">
      <h2>Tampilan</h2>
      <div class="col" style="gap:8px"><span class="label">Latar belakang aplikasi</span>
        <div class="grid-auto" style="--min:140px;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(140px,100%),1fr))">
          ${[...PRESET_LATAR, ['gambar', 'Gambar sendiri', f.tampilan?.latar_url]].map(([k, l, src]) => {
            const on = (f.tampilan?.latar || 'bawaan') === k;
            return html`<button class="card col" style=${`padding:8px;gap:8px;cursor:pointer;text-align:left;${on ? 'border:2px solid var(--sky-400);background:var(--sky-50)' : ''}`}
              onClick=${() => set({ tampilan: { ...f.tampilan, latar: k } })} aria-pressed=${on}>
              <span style=${`height:84px;border-radius:12px;background:${src ? `url('${src}') center bottom/cover` : 'var(--bg)'};border:1px solid var(--line)`}></span>
              <strong class="small">${l}</strong></button>`;
          })}
        </div></div>
      ${f.tampilan?.latar === 'gambar' && html`<${PilihGambar} label="Gambar latar (lanskap, min. 1600 px)" url=${f.tampilan?.latar_url} lebar=${240} tinggi=${130}
        onChange=${(u) => set({ tampilan: { ...f.tampilan, latar_url: u } })} />`}
      <div class="row wrap" style="gap:28px;align-items:flex-start">
        <${PilihGambar} label="Gambar halaman login (potret)" url=${f.tampilan?.login_url || '/img/login.jpg'} lebar=${110} tinggi=${170} latar="var(--navy)"
          onChange=${(u) => set({ tampilan: { ...f.tampilan, login_url: u } })} />
        <${PilihGambar} label="Logo aplikasi (bawaan semua sekolah)" url=${f.tampilan?.logo_url} lebar=${110} tinggi=${110} kosong="Logo TKA bawaan"
          onChange=${(u) => set({ tampilan: { ...f.tampilan, logo_url: u } })} />
      </div>
      <span class="small muted">Klik <strong>Simpan</strong> di atas untuk menerapkan. Sekolah yang mengunggah logo sendiri tetap memakai logonya.</span>
    </section>
    <section class="card pad col"><h2>Helpdesk</h2><span class="small muted">Ditampilkan di halaman depan. Nomor HP otomatis menjadi tautan WhatsApp.</span>
      ${listEditor('helpdesk', [['nama', 'Nama (mis. Helpdesk 1)', 1], ['kontak', 'Nomor HP atau tautan', 2]], { nama: '', kontak: '' })}</section>
    <section class="card pad col"><h2>Dokumen Pendukung</h2><span class="small muted">Tautan PDF panduan (misalnya dari Google Drive).</span>
      ${listEditor('dokumen', [['nama', 'Judul dokumen', 2], ['keterangan', 'Keterangan (Versi 2.0 · PDF)', 2], ['url', 'Tautan', 3]], { nama: '', keterangan: '', url: '' })}</section>
    <section class="card pad col">
      <h2>Data Demo</h2>
      <span class="small muted">Enam sekolah contoh “[DEMO]” di DKI Jakarta, Jawa Barat, Jawa Timur, dan Banten beserta hasil ujian simulasi, untuk mencoba fitur analisis. Hapus sebelum ujian sungguhan.</span>
      ${demo.data && html`<div class="row wrap">${demo.data.ada
        ? html`<button class="btn btn-d" onClick=${async () => { if (await confirmDialog('Hapus semua sekolah dan siswa demo beserta nilainya?', { danger: true, ok: 'Hapus data demo' })) { try { const r = await post('demo/hapus'); toast(`${r.dihapus} sekolah demo dihapus.`); demo.reload(); } catch (e) { toastErr(e); } } }}><${Icon} n="trash" s=${18} />Hapus data demo</button>`
        : html`<button class="btn btn-o" onClick=${async () => { try { const r = await post('demo/buat'); toast(`Data demo dibuat: ${r.sekolah} sekolah, ${r.siswa} siswa.`); demo.reload(); } catch (e) { toastErr(e); } }}><${Icon} n="database" s=${18} />Buat data demo</button>`}</div>`}
    </section>`;
}
