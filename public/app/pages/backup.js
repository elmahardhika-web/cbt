import { html, useState, fmt, unduhBlob, sleep } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, del } from '../api.js';
import { Loading, ErrorBox, Empty, Chip, toast, toastErr, confirmDialog, useAsync, PageHead } from '../ui.js';

const ukuran = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Tunggu aplikasi menyala kembali setelah pemulihan, lalu muat ulang halaman. */
async function tungguMenyala(setStatus) {
  setStatus('Memulihkan dan menyalakan ulang aplikasi…');
  await sleep(4000);
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('/api/public/info', { cache: 'no-store' }); if (r.ok) { location.reload(); return; } } catch { /* belum menyala */ }
    await sleep(2000);
  }
  setStatus('Aplikasi belum menyala kembali. Muat ulang halaman ini beberapa saat lagi.');
}

/** Backup & restore seluruh sistem (superadmin). */
export function Backup() {
  const { data, error, loading, reload } = useAsync(() => get('backup'), []);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const buat = async () => {
    setBusy(true);
    try { const r = await post('backup'); toast(`Cadangan ${r.nama} dibuat.`); reload(true); } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const pulihkan = async (nama) => {
    if (!(await confirmDialog(`Pulihkan seluruh data dari ${nama}? Semua data saat ini diganti isi cadangan. Data sekarang otomatis dicadangkan dulu.`, { danger: true, ok: 'Pulihkan' }))) return;
    try { await post(`backup/pulihkan/${encodeURIComponent(nama)}`); tungguMenyala(setStatus); } catch (e) { toastErr(e); }
  };
  const unggah = async (file) => {
    if (!file) return;
    if (!(await confirmDialog(`Pulihkan seluruh data dari berkas ${file.name} (${ukuran(file.size)})? Semua data saat ini diganti isi cadangan.`, { danger: true, ok: 'Unggah & pulihkan' }))) return;
    setStatus('Mengunggah berkas cadangan…');
    try {
      const r = await fetch('/api/backup/unggah', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/octet-stream' }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || 'Gagal memulihkan.');
      tungguMenyala(setStatus);
    } catch (e) { setStatus(''); toastErr(e); }
  };
  const hapus = async (nama) => {
    if (!(await confirmDialog(`Hapus berkas cadangan ${nama}?`, { danger: true, ok: 'Hapus' }))) return;
    try { await del(`backup/${encodeURIComponent(nama)}`); reload(true); } catch (e) { toastErr(e); }
  };
  if (status) return html`<div class="card pad col" style="align-items:center;text-align:center;gap:14px;padding:48px"><span class="spinner" style="width:40px;height:40px"></span><strong>${status}</strong><span class="small muted">Jangan tutup halaman ini.</span></div>`;
  return html`
    <${PageHead} title="Backup & Restore" sub="Cadangan berisi seluruh database dan gambar soal. Cadangan otomatis dibuat setiap hari (7 terakhir disimpan).">
      <label class="btn btn-o" style="cursor:pointer"><${Icon} n="upload" s=${18} />Pulihkan dari berkas<input type="file" accept=".db" hidden onChange=${(e) => { unggah(e.target.files[0]); e.target.value = ''; }} /></label>
      <button class="btn btn-p" disabled=${busy} onClick=${buat}><${Icon} n="database" s=${18} />${busy ? 'Membuat…' : 'Buat cadangan sekarang'}</button>
    <//>
    <div class="card row small" style="padding:14px 16px;background:var(--amber-50);border-color:var(--amber-100);align-items:flex-start;color:var(--amber-900)">
      <${Icon} n="info" s=${18} /><span>Simpan salinan cadangan di tempat lain (laptop atau Google Drive) secara berkala. Pemulihan mengganti <strong>semua</strong> data dan menyalakan ulang aplikasi; siswa yang sedang ujian akan terputus sebentar.</span></div>
    <section class="card col" style="gap:0">
      ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : data.length === 0 ? html`<${Empty} icon="database" title="Belum ada cadangan">Cadangan otomatis pertama dibuat sekitar satu menit setelah aplikasi menyala.<//>` : html`
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Berkas</th><th>Jenis</th><th>Waktu</th><th class="r">Ukuran</th><th class="r">Aksi</th></tr></thead>
        <tbody>${data.map((b) => html`<tr>
          <td class="strong">${b.nama}</td>
          <td><${Chip} c=${b.jenis === 'otomatis' ? 'sky' : b.jenis === 'manual' ? 'green' : 'amber'}>${b.jenis}<//></td>
          <td class="small">${fmt.waktu(b.dibuat)}</td><td class="r num">${ukuran(b.ukuran)}</td>
          <td class="r"><span class="row gap-4" style="justify-content:flex-end">
            <a class="btn btn-o btn-sm" href=${`/api/backup/unduh/${encodeURIComponent(b.nama)}?token=${encodeURIComponent(session.token)}`} download><${Icon} n="download" s=${16} />Unduh</a>
            <button class="btn btn-s btn-sm" onClick=${() => pulihkan(b.nama)}><${Icon} n="refresh" s=${16} />Pulihkan</button>
            <button class="icon-btn sm danger" aria-label="Hapus" onClick=${() => hapus(b.nama)}><${Icon} n="trash" s=${18} /></button>
          </span></td></tr>`)}</tbody></table></div>`}
    </section>`;
}

/** Backup & restore data satu sekolah (admin sekolah). */
export function BackupSekolah() {
  const [busy, setBusy] = useState(false);
  const [hasil, setHasil] = useState(null);
  const unduh = async () => {
    setBusy(true);
    try {
      const d = await get('sekolah-backup');
      unduhBlob(new Blob([JSON.stringify(d)], { type: 'application/json' }), `Cadangan_${d.sekolah.npsn}_${new Date().toISOString().slice(0, 10)}.json`);
      toast(`Cadangan diunduh: ${d.pengguna.length} akun, ${d.ujian.length} jadwal, ${d.peserta.length} hasil ujian.`);
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const pulihkan = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirmDialog(`Pulihkan data sekolah dari ${file.name}? Data siswa, guru, jadwal, dan nilai saat ini akan diganti isi cadangan.`, { danger: true, ok: 'Pulihkan' }))) return;
      setBusy(true);
      setHasil(await post('sekolah-backup/pulihkan', { data }));
      toast('Data sekolah dipulihkan.');
    } catch (e) { toastErr(e.name === 'SyntaxError' ? new Error('Berkas bukan cadangan JSON yang valid.') : e); } finally { setBusy(false); }
  };
  return html`
    <${PageHead} title="Backup & Restore" sub=${`Data ${session.sekolah?.nama || 'sekolah'}: profil, siswa, guru, jadwal ujian, dan hasil.`} />
    <section class="grid-auto" style="--min:320px;gap:20px">
      <div class="card pad col" style="gap:12px">
        <span class="tile lg t-sky"><${Icon} n="download" s=${26} /></span>
        <h2>Unduh cadangan</h2>
        <p class="small" style="color:var(--text-2)">Simpan berkas cadangan di laptop atau Google Drive. Lakukan sebelum dan sesudah setiap ujian.</p>
        <button class="btn btn-p" style="align-self:flex-start" disabled=${busy} onClick=${unduh}><${Icon} n="download" s=${18} />Unduh cadangan sekolah</button>
      </div>
      <div class="card pad col" style="gap:12px">
        <span class="tile lg t-amber"><${Icon} n="refresh" s=${26} /></span>
        <h2>Pulihkan dari cadangan</h2>
        <p class="small" style="color:var(--text-2)">Mengganti data siswa, guru, jadwal ujian sekolah, dan nilai dengan isi berkas cadangan. Ujian massal dari pusat tidak ikut terhapus.</p>
        <label class="btn btn-w" style="align-self:flex-start;cursor:pointer"><${Icon} n="upload" s=${18} />${busy ? 'Memproses…' : 'Pilih berkas .json'}<input type="file" accept=".json,application/json" hidden onChange=${(e) => { pulihkan(e.target.files[0]); e.target.value = ''; }} /></label>
        ${hasil && html`<div class="row small" style="padding:12px 14px;border-radius:14px;background:var(--green-50);color:var(--green-700)"><${Icon} n="check-circle" />
          Dipulihkan: ${hasil.pengguna} akun, ${hasil.ujian} jadwal, ${hasil.peserta} hasil ujian, ${hasil.jawaban} jawaban.</div>`}
      </div>
    </section>`;
}
