// Ujian massal: superadmin mengatur satu ujian untuk banyak sekolah sekaligus.
import { html, useState, useEffect, useMemo, fmt, cls, singkat } from '../lib.js';
import { Icon } from '../icons.js';
import { get, post, put, del } from '../api.js';
import { Loading, ErrorBox, Empty, Chip, Switch, Modal, Field, toast, toastErr, confirmDialog, useAsync, PageHead, Bar } from '../ui.js';
import { useMaster } from './soal.js';
import { Monitor, toneMapel } from './ujian.js';

export function UjianMassal() {
  const { data, error, loading, reload } = useAsync(() => get('massal'), []);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => { const t = setInterval(() => reload(true), 15e3); return () => clearInterval(t); }, [reload]);
  const aktif = async (m, v) => { try { await put(`massal/${m.id}/aktif`, { aktif: v }); toast(v ? 'Ujian dibuka di semua sekolah terpilih.' : 'Ujian ditutup di semua sekolah.'); reload(true); } catch (e) { toastErr(e); } };
  const token = async (m) => { try { const r = await post(`massal/${m.id}/token`); toast(r.token ? `Token baru: ${r.token}` : 'Token baru dibuat untuk tiap sekolah.'); reload(true); } catch (e) { toastErr(e); } };
  const hapus = async (m) => {
    const ada = m.selesai + m.mengerjakan > 0;
    if (!(await confirmDialog(ada ? 'Ujian massal ini sudah punya hasil. Menghapusnya akan menghapus nilai siswa di semua sekolah terkait.' : `Hapus ujian massal ini dari ${m.jml_sekolah} sekolah?`, { danger: true, ok: 'Hapus' }))) return;
    try { await del(`massal/${m.id}`, { paksa: ada }); toast('Ujian massal dihapus.'); reload(); } catch (e) { toastErr(e); }
  };
  return html`
    <${PageHead} title="Ujian Massal" sub="Satu jadwal untuk banyak sekolah sekaligus. Ujian per sekolah tetap diatur admin sekolah masing-masing.">
      <button class="btn btn-p" onClick=${() => setForm({})}><${Icon} n="plus" s=${18} />Buat Ujian Massal</button>
    <//>
    ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : data.length === 0 ? html`<div class="card"><${Empty} icon="layers" title="Belum ada ujian massal">Buat satu jadwal lalu pilih sekolah berdasarkan wilayah.<//></div>` : html`
      <section class="grid-auto" style="--min:340px">
        ${data.map((m) => {
          const siap = m.paket.siap > 0 && m.paket.belum_ditelaah === 0;
          return html`<article class="card col" style=${`padding:18px;gap:14px;${detail === m.id ? 'border:2px solid var(--sky-400)' : ''}`}>
            <div class="row"><span class=${cls('tile', m.aktif ? toneMapel(m.mapel) : 't-slate')}>${singkat(m.mapel)}</span>
              <span class="col grow" style="gap:0;min-width:0"><strong class="ellipsis">${m.nama || `${m.mapel_nama} · ${m.kategori_nama}`}</strong>
                <span class="tiny muted">${m.mapel_nama} · ${m.kategori_nama} · ${m.paket.siap} soal siap</span></span>
              <${Switch} checked=${!!m.aktif} label="Buka ujian massal" onChange=${(v) => aktif(m, v)} /></div>
            <div class="row wrap gap-8">
              ${m.aktif ? html`<${Chip} c="green"><span class="dot live" style="width:7px;height:7px"></span>Dibuka<//>` : html`<${Chip}>Ditutup<//>`}
              <${Chip} icon="school">${m.jml_sekolah} sekolah<//>
              <${Chip} icon="clock">${m.durasi} menit<//>
              <${Chip}>${m.sesi === 'SEMUA' ? 'Semua sesi' : m.sesi} · ${m.kelas === 'SEMUA' ? 'Semua kelas' : `Kelas ${m.kelas}`}<//>
              ${m.tanggal && html`<${Chip} icon="calendar">${fmt.tglPendek(m.tanggal)}${m.jam_mulai ? ` ${m.jam_mulai}` : ''}${m.jam_selesai ? `–${m.jam_selesai}` : ''}<//>`}
              ${!siap && html`<${Chip} c="amber" icon="alert">${m.paket.siap === 0 ? 'Paket kosong' : `${m.paket.belum_ditelaah} soal belum ditelaah`}<//>`}
            </div>
            <div class="row" style="padding:12px 14px;border-radius:16px;background:var(--sky-50);gap:8px">
              <span class="col grow" style="gap:0"><span class="tiny" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Token</span>
                <strong style=${m.token_sama ? 'font-size:24px;letter-spacing:.16em' : 'font-size:14px'}>${m.token_sama ? m.token : 'Berbeda tiap sekolah'}</strong></span>
              <button class="icon-btn" style="width:40px;height:40px;background:var(--tombol);border:0;color:#fff" aria-label="Buat token baru" onClick=${() => token(m)}><${Icon} n="refresh" s=${18} /></button>
            </div>
            <div class="row wrap small" style="gap:14px;color:var(--text-2)"><span><strong>${m.selesai}</strong> selesai</span><span><strong>${m.mengerjakan}</strong> mengerjakan</span><span style="color:var(--green-700)"><strong>${m.online}</strong> online</span></div>
            <div class="row wrap gap-8">
              <button class="btn btn-s btn-sm" onClick=${() => setDetail(detail === m.id ? null : m.id)}><${Icon} n="monitor" s=${16} />${detail === m.id ? 'Tutup pantauan' : 'Pantau sekolah'}</button>
              <button class="btn btn-o btn-sm" onClick=${() => setForm({ ...m, edit: true })}><${Icon} n="edit" s=${16} />Ubah</button>
              <button class="btn btn-g btn-sm" style="color:var(--red-700)" onClick=${() => hapus(m)}><${Icon} n="trash" s=${16} />Hapus</button>
            </div>
          </article>`;
        })}
      </section>
      ${detail && html`<${DetailMassal} key=${detail} id=${detail} />`}`}
    ${form && html`<${FormMassal} awal=${form} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); reload(); }} />`}`;
}

function DetailMassal({ id }) {
  const { data, error, loading, reload } = useAsync(() => get(`massal/${id}`), [id]);
  const [pantau, setPantau] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { const t = setInterval(() => reload(true), 8e3); return () => clearInterval(t); }, [reload]);
  if (loading && !data) return html`<div class="card"><${Loading} /></div>`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const r = data.ringkasan;
  const list = data.sekolah.filter((s) => !q || `${s.nama} ${s.npsn} ${s.kabkota} ${s.kecamatan}`.toLowerCase().includes(q.toLowerCase()));
  return html`<section class="card col" style="gap:0">
    <div class="card-head">
      <div class="col grow" style="gap:2px"><h2>Pantauan per Sekolah</h2><span class="small muted">${data.mapel_nama} · ${data.kategori_nama}${data.batas_jam ? ` · sesi berakhir ${fmt.jam(data.batas_jam)}` : ''} · diperbarui tiap 8 detik</span></div>
      <label class="input-icon soft" style="flex:0 1 260px;min-height:42px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari sekolah atau wilayah" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Cari sekolah" /></label>
    </div>
    <div class="grid-auto" style="--min:130px;padding:14px 20px;border-bottom:1px solid var(--line);gap:10px">
      ${[['Sekolah', r.sekolah], ['Peserta', r.sasaran], ['Online', r.online], ['Mengerjakan', r.mengerjakan], ['Selesai', r.selesai], ['Belum mulai', r.belum], ['Terkunci', r.terkunci]].map(([l, v]) =>
        html`<div class="col" style="gap:0"><span class="tiny muted">${l}</span><strong style="font-size:20px">${fmt.bulat(v)}</strong></div>`)}
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Sekolah</th><th>Wilayah</th><th>Token</th><th class="r">Peserta</th><th style="min-width:160px">Selesai</th><th class="r">Online</th><th class="r">Belum</th><th class="r">Terkunci</th><th class="r">Aksi</th></tr></thead>
      <tbody>${list.map((s) => html`<tr class=${s.terkunci ? 'warn' : ''}>
        <td><span class="col" style="gap:0"><strong class="strong">${s.nama}</strong><span class="tiny muted">${s.npsn}</span></span></td>
        <td class="tiny muted">${[s.kecamatan, s.kabkota].filter(Boolean).join(', ') || '–'}</td>
        <td class="num" style="font-weight:700;letter-spacing:.08em">${s.token || '–'}</td>
        <td class="r num">${s.sasaran}</td>
        <td><span class="hbar"><${Bar} value=${s.sasaran ? (s.selesai / s.sasaran) * 100 : 0} tone="green" /><span class="tiny num" style="width:52px;text-align:right">${s.selesai}/${s.sasaran}</span></span></td>
        <td class="r num" style="color:var(--green-700);font-weight:700">${s.online || '–'}</td>
        <td class="r num">${s.belum || '–'}</td>
        <td class="r num" style=${s.terkunci ? 'color:var(--red-700);font-weight:700' : ''}>${s.terkunci || '–'}</td>
        <td class="r"><button class="btn btn-o btn-sm" onClick=${() => setPantau(s)}><${Icon} n="monitor" s=${16} />Monitor</button></td>
      </tr>`)}</tbody></table></div>
    ${pantau && html`<${Modal} title=${`Monitor · ${pantau.nama}`} size="xwide" onClose=${() => { setPantau(null); reload(true); }}>
      <${Monitor} id=${pantau.ujian_id} onChange=${() => reload(true)} />
    <//>`}
  </section>`;
}

function FormMassal({ awal, onClose, onSaved }) {
  const master = useMaster();
  const sekolahAll = useAsync(() => get('sekolah'), []);
  const terpilihAwal = useAsync(() => (awal.edit ? get(`massal/${awal.id}`).then((d) => d.sekolah.map((s) => s.npsn)) : Promise.resolve([])), []);
  const [f, setF] = useState({ nama: '', mapel: '', kategori: '', durasi: 60, sesi: 'SEMUA', kelas: 'SEMUA', tanggal: '', jam_mulai: '', jam_selesai: '', acak: 1, token_sama: 1, ...awal });
  const [pilih, setPilih] = useState(null);
  const [filt, setFilt] = useState({ provinsi: '', kabkota: '', kecamatan: '', q: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (terpilihAwal.data && pilih === null) setPilih(new Set(terpilihAwal.data)); }, [terpilihAwal.data]);
  useEffect(() => { if (!f.mapel && master.mapel.length) setF((x) => ({ ...x, mapel: master.mapel.find((m) => m.aktif)?.kode || '', kategori: master.kategori.find((k) => k.aktif)?.kode || '' })); }, [master]);
  const set = (p) => setF({ ...f, ...p });
  const semua = (sekolahAll.data || []).filter((s) => s.aktif);
  const uniq = (arr, k, l) => [...new Map(arr.filter((x) => x[k]).map((x) => [x[k], x[l]])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const provList = uniq(semua, 'provinsi_kode', 'provinsi');
  const kabList = uniq(semua.filter((s) => !filt.provinsi || s.provinsi_kode === filt.provinsi), 'kabkota_kode', 'kabkota');
  const kecList = uniq(semua.filter((s) => s.kabkota_kode === filt.kabkota), 'kecamatan', 'kecamatan');
  const tampil = semua.filter((s) => (!filt.provinsi || s.provinsi_kode === filt.provinsi) && (!filt.kabkota || s.kabkota_kode === filt.kabkota)
    && (!filt.kecamatan || s.kecamatan === filt.kecamatan) && (!filt.q || `${s.nama} ${s.npsn}`.toLowerCase().includes(filt.q.toLowerCase())));
  const sel = pilih || new Set();
  const ubahPilih = (fn) => { const n = new Set(sel); fn(n); setPilih(n); };
  const simpan = async () => {
    setBusy(true);
    try {
      const body = { ...f, sekolah: [...sel] };
      const r = f.edit ? await put(`massal/${f.id}`, body) : await post('massal', body);
      toast(`Disimpan. ${r.tambah ? `${r.tambah} sekolah ditambahkan. ` : ''}${r.hapus ? `${r.hapus} sekolah dikeluarkan. ` : ''}${r.tertahan ? `${r.tertahan} sekolah tidak bisa dikeluarkan karena sudah ada hasil.` : ''}`);
      onSaved();
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${Modal} title=${f.edit ? 'Ubah ujian massal' : 'Buat ujian massal'} sub="Soal yang dipakai: semua soal aktif & disetujui pada paket mapel + kategori ini." size="wide" onClose=${onClose}
    foot=${html`<span class="small muted" style="margin-right:auto;align-self:center"><strong>${sel.size}</strong> sekolah dipilih</span>
      <button class="btn btn-o" onClick=${onClose}>Batal</button><button class="btn btn-p" disabled=${busy || !sel.size} onClick=${simpan}>${busy ? 'Menyimpan…' : 'Simpan'}</button>`}>
    <div class="form-grid">
      <${Field} label="Nama ujian" hint="opsional"><input class="input" value=${f.nama || ''} onInput=${(e) => set({ nama: e.target.value })} placeholder="Try Out 1 Serentak Jakarta" /><//>
      <${Field} label="Mata pelajaran"><select class="select" value=${f.mapel} onChange=${(e) => set({ mapel: e.target.value })}>${master.mapel.filter((m) => m.aktif || m.kode === f.mapel).map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select><//>
      <${Field} label="Kategori"><select class="select" value=${f.kategori} onChange=${(e) => set({ kategori: e.target.value })}>${master.kategori.filter((k) => k.aktif || k.kode === f.kategori).map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select><//>
      <${Field} label="Durasi pengerjaan (menit)"><input class="input" type="number" min="1" max="600" value=${f.durasi} onInput=${(e) => set({ durasi: e.target.value })} /><//>
      <${Field} label="Sesi"><select class="select" value=${f.sesi} onChange=${(e) => set({ sesi: e.target.value })}><option value="SEMUA">Semua sesi</option>${['Sesi 1', 'Sesi 2', 'Sesi 3', 'Sesi 4'].map((x) => html`<option>${x}</option>`)}</select><//>
      <${Field} label="Kelas" hint="SEMUA atau mis. 6A"><input class="input" value=${f.kelas} onInput=${(e) => set({ kelas: e.target.value.toUpperCase() || 'SEMUA' })} /><//>
      <${Field} label="Tanggal"><input class="input" type="date" value=${f.tanggal || ''} onInput=${(e) => set({ tanggal: e.target.value })} /><//>
      <${Field} label="Jam mulai"><input class="input" type="time" value=${f.jam_mulai || ''} onInput=${(e) => set({ jam_mulai: e.target.value })} /><//>
      <${Field} label="Jam selesai sesi" hint="ujian otomatis dikumpulkan"><input class="input" type="time" value=${f.jam_selesai || ''} onInput=${(e) => set({ jam_selesai: e.target.value })} /><//>
    </div>
    <div class="row wrap" style="gap:20px">
      <label class="check"><input type="checkbox" checked=${!!f.acak} onChange=${(e) => set({ acak: e.target.checked ? 1 : 0 })} />Acak urutan soal</label>
      <label class="check"><input type="checkbox" checked=${!!f.token_sama} onChange=${(e) => set({ token_sama: e.target.checked ? 1 : 0 })} />Token sama untuk semua sekolah</label>
    </div>
    <div class="col" style="gap:10px;padding:14px;border-radius:18px;background:var(--surface-2);border:1px solid var(--line)">
      <strong>Pilih sekolah</strong>
      <div class="form-grid">
        <select class="select" aria-label="Provinsi" value=${filt.provinsi} onChange=${(e) => setFilt({ ...filt, provinsi: e.target.value, kabkota: '', kecamatan: '' })}><option value="">Semua provinsi</option>${provList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
        <select class="select" aria-label="Kab/Kota" value=${filt.kabkota} onChange=${(e) => setFilt({ ...filt, kabkota: e.target.value, kecamatan: '' })}><option value="">Semua kab/kota</option>${kabList.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
        <select class="select" aria-label="Kecamatan" value=${filt.kecamatan} disabled=${!filt.kabkota} onChange=${(e) => setFilt({ ...filt, kecamatan: e.target.value })}><option value="">Semua kecamatan</option>${kecList.map(([k]) => html`<option value=${k}>${k}</option>`)}</select>
        <input class="input" placeholder="Cari nama / NPSN" value=${filt.q} onInput=${(e) => setFilt({ ...filt, q: e.target.value })} aria-label="Cari sekolah" />
      </div>
      <div class="row wrap gap-8">
        <button class="btn btn-s btn-sm" onClick=${() => ubahPilih((n) => tampil.forEach((s) => n.add(s.npsn)))}>Pilih ${tampil.length} yang tampil</button>
        <button class="btn btn-o btn-sm" onClick=${() => ubahPilih((n) => tampil.forEach((s) => n.delete(s.npsn)))}>Batalkan yang tampil</button>
        <button class="btn btn-g btn-sm" onClick=${() => setPilih(new Set())}>Kosongkan semua</button>
      </div>
      <div style="max-height:260px;overflow:auto;border-radius:14px;border:1px solid var(--line);background:#fff">
        ${sekolahAll.loading ? html`<${Loading} />` : tampil.length === 0 ? html`<${Empty} icon="school" title="Tidak ada sekolah pada filter ini" />` : tampil.map((s) => html`
          <label class="check" style="padding:8px 12px;border-bottom:1px solid #EEF4F9;min-height:44px">
            <input type="checkbox" checked=${sel.has(s.npsn)} onChange=${(e) => ubahPilih((n) => (e.target.checked ? n.add(s.npsn) : n.delete(s.npsn)))} />
            <span class="col grow" style="gap:0"><strong class="small">${s.nama}</strong><span class="tiny muted">${s.npsn} · ${[s.kecamatan, s.kabkota].filter(Boolean).join(', ') || 'wilayah belum diisi'} · ${s.jml_siswa} siswa</span></span>
          </label>`)}
      </div>
    </div>
  <//>`;
}
