import { html, useState, useEffect, fmt, cls, PERAN_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, put, del } from '../api.js';
import { openPrint } from '../router.js';
import { Loading, ErrorBox, Empty, Chip, Switch, Modal, Field, toast, toastErr, confirmDialog, promptDialog, useAsync, useDebounced, PageHead, Pager, Avatar, Hitung } from '../ui.js';
import { templateImpor, bacaImpor, KOLOM_IMPOR } from '../excel.js';
import { useLive } from './ujian.js';

/**
 * Tabel pengguna + impor Excel. peran: siswa | guru | admin.
 * npsn: dikunci ke satu sekolah (admin sekolah) atau null (superadmin).
 */
export function DataPengguna({ peran, npsn, pilihPeran }) {
  const [p, setP] = useState(peran);
  useEffect(() => setP(peran), [peran]);
  const [f, setF] = useState({ q: '', kelas: '', sesi: '', aktif: '', npsn: npsn || '' });
  const [hal, setHal] = useState(1);
  const [per, setPer] = useState(25);
  const dq = useDebounced(f.q, 300);
  const { data, error, loading, reload } = useAsync(() => get('pengguna', { peran: p, npsn: f.npsn, kelas: f.kelas, sesi: f.sesi, aktif: f.aktif, q: dq, halaman: hal, per }), [p, f.npsn, f.kelas, f.sesi, f.aktif, dq, hal, per]);
  const ringkas = useAsync(() => (['siswa', 'guru'].includes(p) ? get('pengguna/ringkasan', { peran: p, npsn: f.npsn }) : Promise.resolve(null)), [p, f.npsn, data?.total]);
  useLive(p === 'siswa' ? f.npsn || npsn || session.user.npsn : null, () => p === 'siswa' && reload(true));
  const opsiKelas = useAsync(() => get('pengguna/kelas', { npsn: f.npsn }), [f.npsn, data?.total]);
  const sekolahList = useAsync(() => (npsn ? Promise.resolve([]) : get('sekolah')), [npsn]);
  const [pilih, setPilih] = useState(new Set());
  const [form, setForm] = useState(null);
  const [impor, setImpor] = useState(false);
  useEffect(() => { setPilih(new Set()); setHal(1); }, [p, f.npsn, f.kelas, f.sesi, f.aktif, dq, per]);
  const items = data?.items || [];
  const set = (x) => setF({ ...f, ...x });
  const siswa = p === 'siswa';

  const massal = async (aksi, nilai) => {
    const ids = [...pilih];
    const label = { aktif: 'mengaktifkan', nonaktif: 'menonaktifkan', 'reset-password': 'mereset password (menjadi 123456)', 'reset-login': 'mereset login', hapus: 'MENGHAPUS', sesi: `memindah sesi ke ${nilai}`, kelas: `memindah kelas ke ${nilai}` }[aksi];
    if (!(await confirmDialog(`Lanjutkan ${label} ${ids.length} akun?`, { danger: aksi === 'hapus', ok: 'Lanjutkan' }))) return;
    try { const r = await post('pengguna/massal', { ids, aksi, nilai }); toast(`${r.diproses} akun diproses.`); setPilih(new Set()); reload(true); } catch (e) { toastErr(e); }
  };
  const satu = {
    aktif: async (u, v) => { try { await put(`pengguna/${u.id}`, { aktif: v }); reload(true); } catch (e) { toastErr(e); } },
    hapus: async (u) => { if (!(await confirmDialog(`Hapus akun ${u.nama}? Semua data ujiannya ikut terhapus.`, { danger: true, ok: 'Hapus' }))) return; try { await del(`pengguna/${u.id}`); toast('Akun dihapus.'); reload(true); } catch (e) { toastErr(e); } },
    reset: async (u) => { if (!(await confirmDialog(`Reset password ${u.nama} menjadi 123456?`))) return; try { await post(`pengguna/${u.id}/reset-password`); toast('Password direset ke 123456.'); } catch (e) { toastErr(e); } },
    login: async (u) => { try { await post(`pengguna/${u.id}/reset-login`); toast('Login direset.'); reload(true); } catch (e) { toastErr(e); } },
  };
  const kolSekolah = !npsn;
  const semuaDipilih = items.length > 0 && items.every((u) => pilih.has(u.id));

  return html`
    <${PageHead} title=${pilihPeran ? 'Pengguna' : siswa ? 'Data Siswa' : `Data ${PERAN_LABEL[p]}`} sub=${data ? `${fmt.bulat(data.total)} ${PERAN_LABEL[p].toLowerCase()}${siswa && opsiKelas.data ? ` · ${opsiKelas.data.kelas.length} kelas · ${opsiKelas.data.sesi.length} sesi` : ''}` : ''}>
      <button class="btn btn-o" onClick=${() => templateImpor(p, { sekolah: session.sekolah && npsn ? session.sekolah : null, kelas: opsiKelas.data?.kelas, sesi: opsiKelas.data?.sesi }).catch(toastErr)}><${Icon} n="download" s=${18} />Unduh Template</button>
      <button class="btn btn-s" onClick=${() => setImpor(true)}><${Icon} n="upload" s=${18} />Impor Excel</button>
      <button class="btn btn-p" onClick=${() => setForm({})}><${Icon} n="plus" s=${18} />Tambah ${PERAN_LABEL[p]}</button>
    <//>
    ${pilihPeran && html`<div class="seg" role="tablist">${['admin', 'guru', 'siswa'].map((x) => html`<button class=${p === x ? 'on' : ''} onClick=${() => { setP(x); setF({ ...f, kelas: '', sesi: '' }); }}>${PERAN_LABEL[x]}</button>`)}</div>`}
    ${ringkas.data && html`<${Hitung} label=${`Jumlah ${PERAN_LABEL[p].toLowerCase()}`} items=${[
      { label: `Total ${PERAN_LABEL[p].toLowerCase()}`, value: fmt.bulat(ringkas.data.total), onClick: () => set({ aktif: '', kelas: '', sesi: '' }), on: !f.aktif && !f.kelas && !f.sesi },
      siswa && { label: 'Laki-laki', value: fmt.bulat(ringkas.data.l) },
      siswa && { label: 'Perempuan', value: fmt.bulat(ringkas.data.p) },
      { label: 'Aktif', value: fmt.bulat(ringkas.data.aktif), onClick: () => set({ aktif: '1' }), on: f.aktif === '1' },
      { label: 'Nonaktif', value: fmt.bulat(ringkas.data.nonaktif), onClick: () => set({ aktif: '0' }), on: f.aktif === '0' },
      siswa && { label: 'Online sekarang', value: fmt.bulat(ringkas.data.online) },
      siswa && { label: 'Akun terkunci', value: fmt.bulat(ringkas.data.terkunci) },
      siswa && { label: 'Belum ganti password', value: fmt.bulat(ringkas.data.password_awal) },
    ]} />`}
    ${siswa && ringkas.data?.per_kelas?.length > 0 && html`<div class="col" style="gap:6px"><span class="tiny muted">Jumlah per kelas (klik untuk menyaring)</span>
      <div class="hitung-baris">${ringkas.data.per_kelas.map((k) => html`<button class=${f.kelas === k.kelas ? 'on' : ''} aria-pressed=${f.kelas === k.kelas}
        onClick=${() => set({ kelas: f.kelas === k.kelas ? '' : k.kelas })} title=${`L ${k.l} · P ${k.p}`}>Kelas ${k.kelas || '–'} <b>${k.n}</b></button>`)}
        ${ringkas.data.per_sesi.map((x) => html`<button class=${f.sesi === x.sesi ? 'on' : ''} aria-pressed=${f.sesi === x.sesi} onClick=${() => set({ sesi: f.sesi === x.sesi ? '' : x.sesi })}>${x.sesi || 'Tanpa sesi'} <b>${x.n}</b></button>`)}</div></div>`}
    <div class="row wrap" style="gap:20px;align-items:flex-start">
      <section class="card col" style="flex:999 1 620px;min-width:0;gap:0">
        <div class="row wrap" style="padding:16px;gap:10px;border-bottom:1px solid var(--line)">
          <label class="input-icon soft" style="flex:1 1 220px"><${Icon} n="search" s=${18} /><input type="search" placeholder="Cari nama atau username" aria-label="Cari" value=${f.q} onInput=${(e) => set({ q: e.target.value })} /></label>
          ${!npsn && html`<select class="select" style="width:auto;min-width:200px" aria-label="Sekolah" value=${f.npsn} onChange=${(e) => set({ npsn: e.target.value, kelas: '', sesi: '' })}>
            <option value="">Semua sekolah</option>${(sekolahList.data || []).map((s) => html`<option value=${s.npsn}>${s.nama}</option>`)}</select>`}
          ${(siswa || p === 'guru') && html`<select class="select" style="width:auto" aria-label="Kelas" value=${f.kelas} onChange=${(e) => set({ kelas: e.target.value })}><option value="">Semua kelas</option>${(opsiKelas.data?.kelas || []).map((k) => html`<option>${k}</option>`)}</select>`}
          ${siswa && html`<select class="select" style="width:auto" aria-label="Sesi" value=${f.sesi} onChange=${(e) => set({ sesi: e.target.value })}><option value="">Semua sesi</option>${(opsiKelas.data?.sesi || []).map((k) => html`<option>${k}</option>`)}</select>`}
          <select class="select" style="width:auto" aria-label="Status" value=${f.aktif} onChange=${(e) => set({ aktif: e.target.value })}><option value="">Semua status</option><option value="1">Aktif</option><option value="0">Nonaktif</option></select>
          ${siswa && (f.npsn || npsn) && html`<button class="btn btn-o" title="Cetak kartu peserta sesuai saringan kelas" onClick=${() => openPrint('/cetak/kartu', { npsn: f.npsn || npsn, kelas: f.kelas })}><${Icon} n="idcard" s=${18} />Cetak kartu${f.kelas ? ` kelas ${f.kelas}` : ''}</button>`}
        </div>
        ${pilih.size > 0 && html`<div class="row wrap gap-8" style="padding:10px 16px;background:var(--sky-50);border-bottom:1px solid var(--line)">
          <strong class="small" style="color:var(--sky-700);margin-right:auto">${pilih.size} dipilih</strong>
          ${siswa && html`<button class="btn btn-o btn-sm" onClick=${() => openPrint('/cetak/kartu', { ids: [...pilih].join(','), npsn: f.npsn })}><${Icon} n="idcard" s=${16} />Cetak Kartu</button>
          <button class="btn btn-o btn-sm" onClick=${async () => { const v = await promptDialog('Pindahkan ke sesi:', { title: 'Atur sesi', value: 'Sesi 1' }); if (v) massal('sesi', v); }}><${Icon} n="calendar" s=${16} />Atur Sesi</button>
          <button class="btn btn-o btn-sm" onClick=${async () => { const v = await promptDialog('Pindahkan ke kelas:', { title: 'Atur kelas', placeholder: '6A' }); if (v) massal('kelas', v); }}>Atur Kelas</button>
          <button class="btn btn-o btn-sm" onClick=${() => massal('reset-login')}>Reset Login</button>`}
          <button class="btn btn-o btn-sm" onClick=${() => massal('reset-password')}><${Icon} n="key" s=${16} />Reset Password</button>
          <button class="btn btn-o btn-sm" onClick=${() => massal('aktif')}>Aktifkan</button>
          <button class="btn btn-o btn-sm" onClick=${() => massal('nonaktif')}>Nonaktifkan</button>
          <button class="btn btn-d btn-sm" onClick=${() => massal('hapus')}><${Icon} n="trash" s=${16} />Hapus</button>
        </div>`}
        ${loading && !data ? html`<${Loading} />` : error ? html`<div style="padding:16px"><${ErrorBox} error=${error} retry=${reload} /></div>` : html`
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th style="width:44px"><input type="checkbox" aria-label="Pilih semua di halaman ini" checked=${semuaDipilih} onChange=${(e) => { const n = new Set(pilih); items.forEach((u) => (e.target.checked ? n.add(u.id) : n.delete(u.id))); setPilih(n); }} /></th>
            <th class="no">No</th><th>${siswa ? 'No. Peserta' : 'Username'}</th><th>Nama</th>
            ${siswa && html`<th class="c">L/P</th><th>Kelas</th><th>Sesi</th><th>Login</th>`}
            ${p === 'guru' && html`<th>Kelas</th><th class="c">Monitor</th>`}
            ${kolSekolah && html`<th>Sekolah</th>`}
            <th>Aktif</th><th class="r">Aksi</th></tr></thead>
          <tbody>
            ${items.length === 0 && html`<tr><td colspan="11"><${Empty} icon="users" title="Belum ada data">Tambah satu per satu atau impor dari Excel.<//></td></tr>`}
            ${items.map((u, i) => html`<tr class=${pilih.has(u.id) ? 'sel' : ''}>
              <td><input type="checkbox" aria-label=${`Pilih ${u.nama}`} checked=${pilih.has(u.id)} onChange=${(e) => { const n = new Set(pilih); e.target.checked ? n.add(u.id) : n.delete(u.id); setPilih(n); }} /></td>
              <td class="no">${(hal - 1) * per + i + 1}</td>
              <td class="num">${u.username}</td><td class="strong">${u.nama}</td>
              ${siswa && html`<td class="c">${u.jk || '–'}</td><td>${u.kelas || '–'}</td><td>${u.sesi || '–'}</td>
                <td>${u.terkunci ? html`<button class="chip red" style="border:0;cursor:pointer" title="Klik untuk reset login" onClick=${() => satu.login(u)}><${Icon} n="lock" s=${12} />Terkunci · reset</button>` : u.online ? html`<${Chip} c="green"><span class="dot"></span>Online<//>` : u.sedang_login ? html`<button class="chip amber" style="border:0;cursor:pointer" title="Klik untuk reset login" onClick=${() => satu.login(u)}>Tersimpan · reset</button>` : html`<${Chip}>Offline<//>`}</td>`}
              ${p === 'guru' && html`<td>${u.kelas || '–'}</td><td class="c">${u.bisa_monitor ? html`<${Icon} n="check" s=${18} />` : '–'}</td>`}
              ${kolSekolah && html`<td class="small">${u.sekolah || html`<span class="muted">Pusat</span>`}</td>`}
              <td><${Switch} checked=${!!u.aktif} label=${`Aktifkan ${u.nama}`} onChange=${(v) => satu.aktif(u, v)} /></td>
              <td class="r"><span class="row gap-4" style="justify-content:flex-end;gap:2px">
                <button class="icon-btn sm" aria-label="Ubah" onClick=${() => setForm(u)}><${Icon} n="edit" s=${18} /></button>
                <button class="icon-btn sm" aria-label="Reset password" title="Reset password ke 123456" onClick=${() => satu.reset(u)}><${Icon} n="key" s=${18} /></button>
                <button class="icon-btn sm danger" aria-label="Hapus" onClick=${() => satu.hapus(u)}><${Icon} n="trash" s=${18} /></button>
              </span></td>
            </tr>`)}
          </tbody></table></div>
        <div class="tbl-foot"><${Pager} halaman=${hal} per=${per} total=${data.total} onChange=${setHal} />
          <label class="row small muted" style="gap:6px">Baris per halaman <select class="select" style="width:auto;min-height:32px" value=${per} onChange=${(e) => setPer(+e.target.value)}>${[25, 50, 100, 250].map((n) => html`<option value=${n}>${n}</option>`)}</select></label></div>`}
      </section>
      ${impor && html`<${PanelImpor} peran=${p} npsn=${npsn || f.npsn} kelas=${opsiKelas.data} onClose=${() => setImpor(false)} onDone=${() => reload()} />`}
    </div>
    ${form && html`<${FormPengguna} peran=${p} awal=${form} npsn=${npsn} sekolah=${sekolahList.data || []} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); reload(true); }} />`}`;
}

function FormPengguna({ peran, awal, npsn, sekolah, onClose, onSaved }) {
  const [f, setF] = useState({ username: '', nama: '', password: '', jk: '', kelas: '', sesi: peran === 'siswa' ? 'Sesi 1' : '', nik: '', tgl_lahir: '', nip: '', npsn: npsn || '', bisa_monitor: 0, ...awal, password: '' });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF({ ...f, ...p });
  const simpan = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, peran };
      if (!body.password) delete body.password;
      if (awal.id) await put(`pengguna/${awal.id}`, body); else await post('pengguna', body);
      toast(awal.id ? 'Data disimpan.' : `Akun dibuat${f.password ? '' : ' dengan password 123456'}.`);
      onSaved();
    } catch (x) { toastErr(x); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${`${awal.id ? 'Ubah' : 'Tambah'} ${PERAN_LABEL[peran]}`} onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-p" disabled=${busy} onClick=${simpan}>Simpan</button>`}>
    <form class="form-grid" onSubmit=${simpan}>
      <${Field} label=${peran === 'siswa' ? 'No. Peserta (username)' : 'Username'} hint=${peran === 'siswa' && !awal.id ? 'kosong = otomatis' : ''}><input class="input" value=${f.username} onInput=${(e) => set({ username: e.target.value.trim() })} autocapitalize="off" /><//>
      <${Field} label="Nama lengkap"><input class="input" value=${f.nama} onInput=${(e) => set({ nama: e.target.value })} required /><//>
      <${Field} label="Password" hint=${awal.id ? 'kosong = tidak diubah' : 'kosong = 123456'}><input class="input" type="text" value=${f.password} onInput=${(e) => set({ password: e.target.value })} autocomplete="new-password" /><//>
      ${!npsn && html`<${Field} label="Sekolah"><select class="select" value=${f.npsn || ''} onChange=${(e) => set({ npsn: e.target.value })}>
        ${peran === 'guru' && html`<option value="">Pusat (guru penulis)</option>`}${peran !== 'guru' && html`<option value="">— pilih sekolah —</option>`}${sekolah.map((s) => html`<option value=${s.npsn}>${s.nama}</option>`)}</select><//>`}
      ${peran === 'siswa' && html`
        <${Field} label="Jenis kelamin"><select class="select" value=${f.jk || ''} onChange=${(e) => set({ jk: e.target.value })} required><option value="">— pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select><//>
        <${Field} label="Kelas"><input class="input" value=${f.kelas || ''} onInput=${(e) => set({ kelas: e.target.value.toUpperCase() })} placeholder="6A" required /><//>
        <${Field} label="Sesi"><select class="select" value=${f.sesi || 'Sesi 1'} onChange=${(e) => set({ sesi: e.target.value })}>${['Sesi 1', 'Sesi 2', 'Sesi 3', 'Sesi 4'].map((s) => html`<option>${s}</option>`)}</select><//>
        <${Field} label="NIK" hint="opsional"><input class="input" value=${f.nik || ''} onInput=${(e) => set({ nik: e.target.value })} inputmode="numeric" /><//>
        <${Field} label="Tanggal lahir" hint="opsional"><input class="input" value=${f.tgl_lahir || ''} onInput=${(e) => set({ tgl_lahir: e.target.value })} placeholder="12/05/2014" /><//>`}
      ${peran === 'guru' && html`
        <${Field} label="Kelas yang diampu" hint="opsional"><input class="input" value=${f.kelas || ''} onInput=${(e) => set({ kelas: e.target.value.toUpperCase() })} placeholder="6A" /><//>
        <${Field} label="NIP" hint="opsional"><input class="input" value=${f.nip || ''} onInput=${(e) => set({ nip: e.target.value })} /><//>`}
    </form>
    ${peran === 'guru' && html`<label class="check"><input type="checkbox" checked=${!!f.bisa_monitor} onChange=${(e) => set({ bisa_monitor: e.target.checked ? 1 : 0 })} />Boleh memantau ujian (monitor, reset login, berita acara)</label>`}
  <//>`;
}

/** Panel impor 3 langkah: unduh template → unggah → periksa validasi → impor. */
function PanelImpor({ peran, npsn, kelas, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [cek, setCek] = useState(null);
  const [mode, setMode] = useState('perbarui');
  const [busy, setBusy] = useState(false);
  const [selesai, setSelesai] = useState(null);
  const periksa = async (fl, md = mode) => {
    setBusy(true); setCek(null); setSelesai(null);
    try {
      const r = rows && fl === file ? rows : await bacaImpor(fl);
      setRows(r); setFile(fl);
      if (!r.length) throw new Error('Tidak ada baris data di file ini.');
      setCek(await post('pengguna/impor', { peran, npsn, rows: r, mode: md, cek: true }));
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const jalankan = async () => {
    setBusy(true);
    try {
      const r = await post('pengguna/impor', { peran, npsn, rows, mode });
      setSelesai(r);
      toast(`${r.ringkasan.baru} akun baru, ${r.ringkasan.perbarui} diperbarui.`);
      onDone();
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const s = cek?.ringkasan;
  const masalah = (cek?.hasil || []).filter((h) => h.status === 'error' || h.status === 'perbarui' || h.status === 'lewati');
  const langkah = (n, done, title, body) => html`<div class="row" style="gap:12px;align-items:flex-start">
    <span class="tile round" style=${`width:28px;height:28px;font-size:13px;${done ? 'background:var(--green-500);color:#fff' : 'background:var(--sky-400);color:#fff'}`}>${done ? html`<${Icon} n="check" s=${16} w=${2.4} />` : n}</span>
    <div class="col grow" style="gap:8px;min-width:0"><strong class="small">${title}</strong>${body}</div></div>`;
  return html`<aside aria-label="Impor dari Excel" class="card pad col" style="flex:1 1 340px;gap:18px">
    <div class="row"><span class="tile t-green"><${Icon} n="sheet" s=${22} /></span>
      <div class="col grow" style="gap:0"><h2 style="font-size:17px">Impor dari Excel</h2><span class="tiny muted">3 langkah, data dicek sebelum disimpan</span></div>
      <button class="icon-btn sm" aria-label="Tutup panel impor" onClick=${onClose}><${Icon} n="x" s=${18} /></button></div>
    ${langkah(1, true, 'Unduh template', html`<button class="row" style="padding:10px 12px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer;text-align:left"
      onClick=${() => templateImpor(peran, { sekolah: session.sekolah && npsn === session.sekolah?.npsn ? session.sekolah : null, kelas: kelas?.kelas, sesi: kelas?.sesi }).catch(toastErr)}>
      <span style="color:var(--green-700);display:flex"><${Icon} n="sheet" s=${18} /></span><span class="grow small" style="font-weight:600">Template_Impor_${peran}_TKA2026.xlsx</span><span style="color:var(--sky-700);display:flex"><${Icon} n="download" s=${16} /></span></button>
      <span class="tiny muted">Kolom: ${KOLOM_IMPOR[peran].map((k) => k[1]).join(', ')}</span>`)}
    ${langkah(2, !!file, 'Unggah file', html`<label class="row" style="padding:14px;border-radius:16px;border:1.5px dashed var(--sky-300);background:var(--sky-50);cursor:pointer">
      <span class="tile" style="background:#fff;color:var(--green-700);width:40px;height:40px"><${Icon} n=${file ? 'sheet' : 'upload'} /></span>
      <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${file ? file.name : 'Pilih file .xlsx'}</strong><span class="tiny muted">${rows ? `${rows.length} baris` : 'atau seret ke sini'}</span></span>
      ${file && html`<span class="btn btn-o btn-sm">Ganti</span>`}
      <input type="file" accept=".xlsx" hidden onChange=${(e) => { const fl = e.target.files[0]; setRows(null); if (fl) periksa(fl); e.target.value = ''; }} /></label>`)}
    ${langkah(3, !!selesai, 'Periksa hasil validasi', busy && !cek ? html`<${Loading} text="Memeriksa…" />` : !cek ? html`<span class="tiny muted">Hasil pemeriksaan muncul di sini.</span>` : html`
      <div class="row wrap gap-8"><${Chip} c="green">${s.baru} baru<//>${s.perbarui > 0 && html`<${Chip} c="amber">${s.perbarui} sudah ada<//>`}${s.lewati > 0 && html`<${Chip} c="amber">${s.lewati} dilewati<//>`}${s.error > 0 && html`<${Chip} c="red">${s.error} error<//>`}</div>
      ${masalah.length > 0 && html`<div style="border:1px solid var(--line);border-radius:14px;overflow:auto;max-height:220px" class="small">
        ${masalah.slice(0, 100).map((h) => html`<div class="row" style=${`gap:10px;padding:9px 12px;border-bottom:1px solid #EEF4F9;background:${h.status === 'error' ? 'var(--red-50)' : 'var(--amber-50)'}`}>
          <strong style=${`flex:none;color:${h.status === 'error' ? 'var(--red-700)' : 'var(--amber-800)'}`}>Baris ${h.baris}</strong><span style="color:var(--text-2)">${h.pesan}</span></div>`)}</div>`}
      <fieldset class="col" style="margin:0;padding:0;border:0;gap:4px"><legend class="tiny" style="font-weight:700;color:var(--muted);padding-bottom:4px">Data yang sudah ada</legend>
        <label class="check small"><input type="radio" name="dup" checked=${mode === 'perbarui'} onChange=${() => { setMode('perbarui'); periksa(file, 'perbarui'); }} />Perbarui dengan data baru</label>
        <label class="check small"><input type="radio" name="dup" checked=${mode === 'lewati'} onChange=${() => { setMode('lewati'); periksa(file, 'lewati'); }} />Lewati, jangan diubah</label></fieldset>`)}
    ${selesai ? html`<div class="row small" style="padding:12px 14px;border-radius:14px;background:var(--green-50);color:var(--green-700)"><${Icon} n="check-circle" />Impor selesai: ${selesai.ringkasan.baru} baru, ${selesai.ringkasan.perbarui} diperbarui${selesai.ringkasan.error ? `, ${selesai.ringkasan.error} baris dilewati karena error` : ''}.</div>`
      : html`<button class="btn btn-p btn-lg" disabled=${busy || !cek || s.baru + s.perbarui === 0} onClick=${jalankan}><${Icon} n="upload" s=${18} />Impor ${cek ? s.baru + s.perbarui : ''} ${PERAN_LABEL[peran]}</button>
        <span class="tiny muted" style="text-align:center">Baris error dilewati. Password kosong otomatis 123456.</span>`}
  </aside>`;
}
