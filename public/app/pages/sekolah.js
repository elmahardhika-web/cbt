import { html, useState, useEffect, useRef, fmt } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, put, del, setSession } from '../api.js';
import { Loading, ErrorBox, Empty, Chip, Switch, Modal, Field, toast, toastErr, confirmDialog, useAsync, PageHead, PilihGambar, unggahGambar, Hitung } from '../ui.js';
import { WilayahFields, labelWilayah } from '../wilayah.js';

function FormSekolah({ s, set, baru, tanpaPengesahan }) {
  return html`
    <div class="form-grid">
      <${Field} label="NPSN" hint=${baru ? '8 digit' : 'tidak bisa diubah'}><input class="input" value=${s.npsn || ''} disabled=${!baru} inputmode="numeric" maxlength="8" onInput=${(e) => set({ npsn: e.target.value.replace(/\D/g, '') })} /><//>
      <${Field} label="Nama sekolah"><input class="input" value=${s.nama || ''} onInput=${(e) => set({ nama: e.target.value })} placeholder="SDN …" /><//>
      <${Field} label="Telepon sekolah" hint="opsional, tampil di kop surat"><input class="input" inputmode="tel" value=${s.telepon || ''} onInput=${(e) => set({ telepon: e.target.value })} /><//>
      <${Field} label="Email sekolah" hint="opsional, tampil di kop surat"><input class="input" type="email" value=${s.email || ''} onInput=${(e) => set({ email: e.target.value })} /><//>
    </div>
    <div class="col" style="gap:8px"><strong class="small">Wilayah</strong>
      <${WilayahFields} value=${s} onChange=${(w) => set(w)} />
      <span class="tiny muted">Provinsi dan kabupaten/kota mengikuti data resmi Kemendagri. Kecamatan dan kelurahan dapat dipilih dari isian sekolah lain atau diketik baru.</span>
    </div>
    <${Field} label="Alamat" hint="opsional"><input class="input" value=${s.alamat || ''} onInput=${(e) => set({ alamat: e.target.value })} /><//>
    <${Koordinat} s=${s} set=${set} />
    <${Field} label="Target capaian sekolah" hint=${`kosong = ikut pusat (${session.info?.target_capaian ?? 70})`} style="max-width:320px">
      <input class="input" type="number" min="0" max="100" step="0.5" value=${s.target_capaian ?? ''} placeholder=${String(session.info?.target_capaian ?? 70)} onInput=${(e) => set({ target_capaian: e.target.value })} /><//>
    ${!tanpaPengesahan && html`<${FormPengesahan} s=${s} set=${set} />`}`;
}

/** Template pengesahan dokumen sekolah: kepala sekolah, logo, tanda tangan, stempel. */
export function FormPengesahan({ s, set }) {
  return html`<div class="col" style="gap:14px">
    <div class="form-grid">
      <${Field} label="Nama kepala sekolah" hint="lengkap dengan gelar"><input class="input" value=${s.kepala_sekolah || ''} onInput=${(e) => set({ kepala_sekolah: e.target.value })} /><//>
      <${Field} label="NIP kepala sekolah" hint="kosongkan bila tidak ada"><input class="input" value=${s.nip_kepsek || ''} onInput=${(e) => set({ nip_kepsek: e.target.value })} /><//>
      <${Field} label="Kota penandatanganan" hint=${`kosong = ${kotaDefault(s) || 'nama kab/kota'}`}><input class="input" value=${s.kota_ttd || ''} placeholder=${kotaDefault(s)} onInput=${(e) => set({ kota_ttd: e.target.value })} /><//>
    </div>
    <div class="row wrap" style="gap:28px;align-items:flex-start">
      <${PilihGambar} label="Logo sekolah" url=${s.logo_url} lebar=${110} tinggi=${110} kosong="Logo bawaan" onChange=${(u) => set({ logo_url: u })} />
      <${PilihGambar} label="Tanda tangan kepala sekolah" url=${s.ttd_url} lebar=${200} tinggi=${110} kosong="Belum ada" onChange=${(u) => set({ ttd_url: u })}
        extra=${html`<${TombolGambarTtd} onChange=${(u) => set({ ttd_url: u })} />`} />
      <${PilihGambar} label="Stempel / cap sekolah" url=${s.stempel_url} lebar=${110} tinggi=${110} kosong="Belum ada" onChange=${(u) => set({ stempel_url: u })} />
    </div>
    <span class="tiny muted">Pakai gambar PNG berlatar transparan (maks. 3 MB). Tanda tangan dan stempel otomatis dipasang pada sertifikat, rekap nilai, legger, laporan perkembangan, berita acara, dan kartu peserta.</span>
    <div class="col" style="gap:8px"><span class="label">Pratinjau pengesahan pada dokumen</span><${PratinjauPengesahan} s=${s} /></div>
  </div>`;
}

const kotaDefault = (s) => (s?.kabkota || '').replace(/^(Kota Administrasi|Kabupaten Administrasi|Kabupaten|Kota)\s+/, '');

/** Contoh kop + blok tanda tangan persis seperti di dokumen cetak. */
export function PratinjauPengesahan({ s }) {
  const logo = s.logo_url || session.info?.tampilan?.logo_url;
  return html`<div style="border:1px solid var(--line);border-radius:var(--radius-sm);background:#fff;padding:18px 22px;font-family:var(--font);color:#0F172A;max-width:720px">
    <div style="display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:3px double #0F2A4F">
      ${logo ? html`<img src=${logo} alt="" style="width:52px;height:52px;object-fit:contain" />` : html`<span class="logo" style="width:52px;height:52px">TKA</span>`}
      <div style="flex:1;text-align:center;display:flex;flex-direction:column;gap:1px">
        <span style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#334155">${(session.info?.nama_instansi || '').toUpperCase()}</span>
        <strong style="font-size:16px;color:#0F2A4F">${(s.nama || 'NAMA SEKOLAH').toUpperCase()}</strong>
        <span style="font-size:11px;color:#334155">NPSN ${s.npsn || '-'}${s.alamat ? ` · ${s.alamat}` : ''}${s.telepon ? ` · Telp. ${s.telepon}` : ''}${s.email ? ` · ${s.email}` : ''}</span>
      </div><span style="width:52px"></span>
    </div>
    <div style="display:flex;justify-content:flex-end;padding-top:14px">
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:13px;min-width:220px">
        <span>${s.kota_ttd || kotaDefault(s) || '[Kota]'}, ${fmt.tanggal(Date.now())}</span><span>Kepala Sekolah,</span>
        <span style="position:relative;height:64px;width:200px;display:flex;align-items:center;justify-content:center">
          ${s.stempel_url && html`<img src=${s.stempel_url} alt="" style="position:absolute;left:4px;top:-6px;width:78px;height:78px;object-fit:contain;opacity:.88" />`}
          ${s.ttd_url && html`<img src=${s.ttd_url} alt="" style="position:relative;max-height:70px;max-width:180px;object-fit:contain" />`}
        </span>
        <strong style="text-decoration:underline">${s.kepala_sekolah || '[Nama Kepala Sekolah]'}</strong>${s.nip_kepsek ? html`<span>NIP ${s.nip_kepsek}</span>` : ''}
      </div>
    </div>
  </div>`;
}

/** Koordinat opsional untuk titik sekolah di peta. Tempelan "lat, lng" dari Google Maps langsung dipecah. */
function Koordinat({ s, set }) {
  const tempel = (v) => { const m = v.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? set({ lat: m[1], lng: m[2] }) : set({ lat: v }); };
  const lokasiSaya = () => {
    if (!navigator.geolocation) return toast('Perangkat ini tidak mendukung lokasi.');
    navigator.geolocation.getCurrentPosition((p) => set({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }), () => toast('Lokasi tidak dapat dibaca. Izinkan akses lokasi di browser.'));
  };
  return html`<div class="col" style="gap:8px"><strong class="small">Titik lokasi di peta <span class="muted" style="font-weight:600">(opsional)</span></strong>
    <div class="row wrap gap-8" style="align-items:flex-end">
      <${Field} label="Lintang (latitude)"><input class="input" inputmode="decimal" value=${s.lat ?? ''} placeholder="-6.200000" onInput=${(e) => tempel(e.target.value)} /><//>
      <${Field} label="Bujur (longitude)"><input class="input" inputmode="decimal" value=${s.lng ?? ''} placeholder="106.816666" onInput=${(e) => set({ lng: e.target.value })} /><//>
      <button type="button" class="btn btn-o btn-sm" style="margin-bottom:4px" onClick=${lokasiSaya}><${Icon} n="map" s=${16} />Pakai lokasi saya</button>
    </div>
    <span class="tiny muted">Di Google Maps, klik kanan lokasi sekolah lalu klik angka koordinat untuk menyalinnya, kemudian tempel di kolom lintang. Kosongkan bila tidak tahu — titik akan ditaruh di sekitar pusat kab/kota.</span>
  </div>`;
}

/** Gambar tanda tangan langsung di layar (mouse, pena, atau jari). */
function TombolGambarTtd({ onChange }) {
  const [buka, setBuka] = useState(false);
  return html`<button class="btn btn-o btn-sm" onClick=${() => setBuka(true)}><${Icon} n="edit" s=${16} />Gambar langsung</button>
    ${buka && html`<${PadTtd} onClose=${() => setBuka(false)} onSaved=${(u) => { onChange(u); setBuka(false); }} />`}`;
}

function PadTtd({ onClose, onSaved }) {
  const ref = useRef();
  const [ada, setAda] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10284A';
    let gambar = false;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
    const down = (e) => { gambar = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e) => { if (!gambar) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setAda(true); };
    const up = () => { gambar = false; };
    c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointerleave', up);
    return () => { c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointerleave', up); };
  }, []);
  const hapus = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setAda(false); };
  const simpan = async () => {
    setBusy(true);
    try {
      const blob = await new Promise((r) => ref.current.toBlob(r, 'image/png'));
      onSaved(await unggahGambar(new File([blob], 'ttd.png', { type: 'image/png' })));
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${Modal} title="Gambar tanda tangan" sub="Tanda tangan di dalam kotak memakai mouse, pena, atau jari." onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${hapus}>Ulangi</button><button class="btn btn-p" disabled=${!ada || busy} onClick=${simpan}>${busy ? 'Menyimpan…' : 'Pakai tanda tangan ini'}</button>`}>
    <canvas ref=${ref} width="900" height="360" style="width:100%;height:auto;border-radius:16px;border:1.5px dashed var(--sky-300);background:#fff;touch-action:none;cursor:crosshair"></canvas>
  <//>`;
}

/** Profil sekolah untuk admin sekolah. */
export function ProfilSekolah() {
  const npsn = session.user.npsn;
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get('sekolah').then((d) => setS(d[0])).catch(toastErr); }, []);
  if (!s) return html`<${Loading} />`;
  const simpan = async () => {
    setBusy(true);
    try { const d = await put(`sekolah/${npsn}`, s); setS({ ...s, ...d }); setSession({ ...session, sekolah: d }); toast('Profil sekolah disimpan.'); } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  const set = (p) => setS({ ...s, ...p });
  return html`<${PageHead} title="Profil Sekolah" sub="Identitas, wilayah, dan template pengesahan dokumen sekolah.">
      <button class="btn btn-p" disabled=${busy} onClick=${simpan}><${Icon} n="check" s=${18} />${busy ? 'Menyimpan…' : 'Simpan perubahan'}</button><//>
    ${!s.kabkota_kode && html`<div class="card row" style="padding:12px 16px;background:var(--amber-50);border-color:#F0D7A4"><${Icon} n="alert" /><span class="small">Lengkapi wilayah sekolah agar hasil ujian masuk ke analisis per kabupaten/kota, kecamatan, dan kelurahan.</span></div>`}
    <section class="card col" style="gap:0"><div class="card-head"><h2>Identitas & wilayah</h2></div>
      <div class="col" style="padding:20px;gap:16px"><${FormSekolah} s=${s} set=${set} tanpaPengesahan /></div></section>
    <section class="card col" style="gap:0"><div class="card-head"><h2 class="grow">Template pengesahan dokumen</h2><span class="small muted">sertifikat · rekap nilai · legger · kartu peserta</span></div>
      <div class="col" style="padding:20px;gap:16px"><${FormPengesahan} s=${s} set=${set} /></div></section>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-p" disabled=${busy} onClick=${simpan}><${Icon} n="check" s=${18} />${busy ? 'Menyimpan…' : 'Simpan perubahan'}</button></div>`;
}

/** Daftar sekolah untuk superadmin. */
export function DaftarSekolah() {
  const { data, error, loading, reload } = useAsync(() => get('sekolah'), []);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [saring, setSaring] = useState('');
  const semua = data || [];
  const list = semua.filter((s) => (!q || s.nama.toLowerCase().includes(q.toLowerCase()) || s.npsn.includes(q) || (s.kabkota || '').toLowerCase().includes(q.toLowerCase()))
    && (saring === '' || (saring === 'aktif' && s.aktif) || (saring === 'nonaktif' && !s.aktif) || (saring === 'ujian' && s.ujian_aktif) || (saring === 'tanpa-admin' && !s.admin) || (saring === 'tanpa-wilayah' && !s.kabkota_kode)));
  const n = (f) => semua.filter(f).length;
  const aktif = async (s, v) => { try { await put(`sekolah/${s.npsn}`, { aktif: v }); reload(true); } catch (e) { toastErr(e); } };
  const hapus = async (s) => {
    if (!(await confirmDialog(`Hapus ${s.nama}? Semua siswa, guru, jadwal, dan nilai sekolah ini ikut terhapus permanen.`, { danger: true, ok: 'Hapus sekolah' }))) return;
    try { await del(`sekolah/${s.npsn}`); toast('Sekolah dihapus.'); reload(); } catch (e) { toastErr(e); }
  };
  return html`<${PageHead} title="Sekolah" sub=${data ? `${data.length} sekolah terdaftar` : ''}>
      <button class="btn btn-p" onClick=${() => setForm({ baru: true })}><${Icon} n="plus" s=${18} />Tambah Sekolah</button><//>
    ${data && html`<${Hitung} items=${[
      { label: 'Semua sekolah', value: fmt.bulat(semua.length), onClick: () => setSaring(''), on: saring === '' },
      { label: 'Aktif', value: fmt.bulat(n((s) => s.aktif)), onClick: () => setSaring('aktif'), on: saring === 'aktif' },
      { label: 'Nonaktif', value: fmt.bulat(n((s) => !s.aktif)), onClick: () => setSaring('nonaktif'), on: saring === 'nonaktif' },
      { label: 'Ujian dibuka', value: fmt.bulat(n((s) => s.ujian_aktif)), onClick: () => setSaring('ujian'), on: saring === 'ujian' },
      { label: 'Belum ada admin', value: fmt.bulat(n((s) => !s.admin)), onClick: () => setSaring('tanpa-admin'), on: saring === 'tanpa-admin' },
      { label: 'Wilayah kosong', value: fmt.bulat(n((s) => !s.kabkota_kode)), onClick: () => setSaring('tanpa-wilayah'), on: saring === 'tanpa-wilayah' },
      { label: 'Total siswa', value: fmt.bulat(semua.reduce((a, s) => a + s.jml_siswa, 0)) },
    ]} />`}
    <section class="card col" style="gap:0">
      <div class="card-head"><label class="input-icon soft grow" style="max-width:420px"><${Icon} n="search" s=${18} /><input type="search" placeholder="Cari NPSN, nama, atau kab/kota" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Cari sekolah" /></label>
        <span class="small muted num">${list.length} dari ${semua.length} sekolah</span></div>
      ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : html`<div class="table-wrap"><table class="tbl">
        <thead><tr><th class="no">No</th><th>NPSN</th><th>Nama Sekolah</th><th>Wilayah</th><th>Admin</th><th class="r">Siswa</th><th class="r">Guru</th><th>Ujian</th><th>Aktif</th><th class="r">Aksi</th></tr></thead>
        <tbody>${list.length === 0 && html`<tr><td colspan="10"><${Empty} icon="school" title="Tidak ada sekolah" /></td></tr>`}
          ${list.map((s, i) => html`<tr>
            <td class="no">${i + 1}</td><td class="num">${s.npsn}</td>
            <td><span class="col" style="gap:2px"><strong class="strong">${s.nama}</strong>${s.is_demo ? html`<${Chip} c="violet">Data demo<//>` : ''}</span></td>
            <td class="small" style="max-width:280px">${labelWilayah(s) || html`<${Chip} c="amber">Belum diisi<//>`}</td>
            <td class="small">${s.admin || html`<${Chip} c="amber">Belum ada<//>`}</td>
            <td class="r num">${s.jml_siswa}</td><td class="r num">${s.jml_guru}</td>
            <td>${s.ujian_aktif ? html`<${Chip} c="green"><span class="dot"></span>${s.ujian_aktif} dibuka<//>` : html`<${Chip}>–<//>`}</td>
            <td><${Switch} checked=${!!s.aktif} label=${`Aktifkan ${s.nama}`} onChange=${(v) => aktif(s, v)} /></td>
            <td class="r"><span class="row" style="justify-content:flex-end;gap:2px">
              <a class="icon-btn sm" href=${`#/pusat/sekolah/${s.npsn}/profil`} aria-label=${`Profil 360 ${s.nama}`} title="Profil 360"><${Icon} n="award" s=${18} /></a>
              <button class="icon-btn sm" aria-label="Ubah" onClick=${() => setForm(s)}><${Icon} n="edit" s=${18} /></button>
              <button class="icon-btn sm danger" aria-label="Hapus" onClick=${() => hapus(s)}><${Icon} n="trash" s=${18} /></button></span></td>
          </tr>`)}</tbody></table></div>`}
    </section>
    ${form && html`<${ModalSekolah} awal=${form} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); reload(); }} />`}`;
}

function ModalSekolah({ awal, onClose, onSaved }) {
  const baru = !!awal.baru;
  const [s, setS] = useState(baru ? { npsn: '', nama: '', admin_username: '', admin_password: '' } : awal);
  const [busy, setBusy] = useState(false);
  const simpan = async () => {
    setBusy(true);
    try { if (baru) await post('sekolah', s); else await put(`sekolah/${awal.npsn}`, s); toast('Sekolah disimpan.'); onSaved(); } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${baru ? 'Tambah sekolah' : `Ubah ${awal.nama}`} size="wide" onClose=${onClose}
    foot=${html`<button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-p" disabled=${busy} onClick=${simpan}>Simpan</button>`}>
    <${FormSekolah} s=${s} set=${(p) => setS({ ...s, ...p })} baru=${baru} />
    ${baru && html`<div class="col" style="gap:8px;padding:14px;border-radius:16px;background:var(--sky-50)"><strong class="small">Akun admin sekolah (opsional)</strong>
      <div class="form-grid">
        <${Field} label="Username admin"><input class="input" value=${s.admin_username} onInput=${(e) => setS({ ...s, admin_username: e.target.value.trim() })} placeholder=${`admin${s.npsn ? s.npsn.slice(-4) : ''}`} /><//>
        <${Field} label="Password" hint="kosong = 123456"><input class="input" value=${s.admin_password} onInput=${(e) => setS({ ...s, admin_password: e.target.value })} /><//>
      </div></div>`}
  <//>`;
}
