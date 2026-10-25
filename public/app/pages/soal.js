import { html, useState, useEffect, useRef, useMemo, fmt, cls, TIPE_LABEL, TIPE_WARNA, STATUS_SOAL, unduhBlob } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post, put, del } from '../api.js';
import { go, openPrint } from '../router.js';
import { Loading, ErrorBox, Empty, Chip, Switch, Modal, Field, toast, toastErr, confirmDialog, promptDialog, useAsync, useDebounced, PageHead, Seg } from '../ui.js';
import { Rich, plain, sanitize, renderMath, pisahSoal, gabungSoal, isiKosong } from '../rich.js';
import { SoalView, PratinjauSoal } from './soalview.js';

export function useMaster() {
  const { data } = useAsync(async () => {
    const [mapel, kategori] = await Promise.all([get('mapel'), get('kategori')]);
    return { mapel, kategori };
  }, []);
  return data || { mapel: [], kategori: [] };
}

function ringkasKunci(s) {
  const k = s.kunci;
  switch (s.tipe) {
    case 'pilihan_ganda': return k;
    case 'pilihan_ganda_kompleks': return (k || []).map((id) => (s.opsi || []).findIndex((o) => String(o.id) === String(id)) + 1).join(', ');
    case 'benar_salah': return k;
    case 'pg_kategori': return Object.values(k || {}).map((v) => v[0]).join('·');
    case 'menjodohkan': return `${Object.keys(k || {}).length} pasangan`;
    case 'isian': return (k || []).length ? (k || []).join(' / ') : 'dikoreksi manual';
    case 'uraian': return 'rubrik';
    default: return '';
  }
}

/** Daftar bank soal. mode: guru | admin | supervisor | pusat */
export function BankSoal({ mode, base }) {
  const master = useMaster();
  const [f, setF] = useState({ mapel: '', kategori: '', tipe: '', status: '', q: '' });
  const dq = useDebounced(f.q, 300);
  const { data, error, loading, reload } = useAsync(() => get('soal', { ...f, q: dq }), [f.mapel, f.kategori, f.tipe, f.status, dq]);
  const [lihat, setLihat] = useState(null);
  const [pilih, setPilih] = useState(new Set());
  const bisaUbah = mode === 'guru' || mode === 'pusat';
  const set = (patch) => setF({ ...f, ...patch });
  const items = data?.items || [];
  const total = Object.values(data?.per_tipe || {}).reduce((a, b) => a + b, 0);
  const ps = data?.per_status || {};
  const draf = items.filter((s) => s.status === 'draf' || s.status === 'revisi');

  const aksi = {
    aktif: async (s, v) => { try { await put(`soal/${s.id}/aktif`, { aktif: v }); reload(true); } catch (e) { toastErr(e); } },
    hapus: async (s) => {
      if (!(await confirmDialog('Hapus soal ini secara permanen?', { danger: true, ok: 'Hapus' }))) return;
      try { await del(`soal/${s.id}`); toast('Soal dihapus.'); reload(true); } catch (e) { toastErr(e); }
    },
    duplikat: async (s) => { try { const d = await post(`soal/${s.id}/duplikat`); toast('Soal diduplikat sebagai draf.'); go(`${base.slice(1)}/${d.id}`); } catch (e) { toastErr(e); } },
    ajukan: async (ids) => {
      try { const r = await post('soal/ajukan', { ids }); toast(`${r.diajukan} soal diajukan untuk ditelaah.`); setPilih(new Set()); reload(true); } catch (e) { toastErr(e); }
    },
  };

  return html`
    <${PageHead} title="Bank Soal" sub=${`${total} soal${ps.menunggu ? ` · ${ps.menunggu} menunggu telaah` : ''}${mode === 'admin' ? ' · hanya soal yang sudah disetujui' : ''}`}>
      <button class="btn btn-o" onClick=${() => f.mapel && f.kategori ? openPrint('/cetak/soal', { mapel: f.mapel, kategori: f.kategori }) : toast('Pilih mapel dan kategori dulu.', 'err')}><${Icon} n="printer" s=${18} />Pratinjau & Cetak</button>
      ${bisaUbah && html`<a class="btn btn-p" href=${`${base}/baru`}><${Icon} n="plus" s=${18} />Input Soal</a>`}
    <//>
    <section class="card pad col" style="gap:14px">
      <div class="row wrap gap-8" style="gap:10px">
        <label class="input-icon soft" style="flex:1 1 240px"><${Icon} n="search" s=${18} /><input type="search" placeholder="Cari isi soal…" aria-label="Cari soal" value=${f.q} onInput=${(e) => set({ q: e.target.value })} /></label>
        <select class="select" style="width:auto;min-width:200px" aria-label="Mata pelajaran" value=${f.mapel} onChange=${(e) => set({ mapel: e.target.value })}>
          <option value="">Semua mapel</option>${master.mapel.map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select>
        <${Seg} soft items=${[{ value: '', label: 'Semua' }, ...master.kategori.map((k) => ({ value: k.kode, label: k.kode }))]} value=${f.kategori} onChange=${(v) => set({ kategori: v })} />
      </div>
      <div class="row wrap gap-8">
        <button class=${cls('chip', !f.tipe ? 'navy' : 'outline')} style="min-height:34px;padding:0 12px;cursor:pointer;border:0" onClick=${() => set({ tipe: '' })}>Semua tipe · ${total}</button>
        ${Object.entries(TIPE_LABEL).map(([k, l]) => html`<button class=${cls('chip', f.tipe === k ? 'navy' : 'outline')} style="min-height:34px;padding:0 12px;cursor:pointer" onClick=${() => set({ tipe: f.tipe === k ? '' : k })}>${l} · ${data?.per_tipe?.[k] || 0}</button>`)}
      </div>
      ${mode !== 'admin' && html`<div class="row wrap gap-8">
        <span class="small muted">Status:</span>
        ${[['', 'Semua'], ...Object.entries(STATUS_SOAL).map(([k, [l]]) => [k, l])].map(([k, l]) => html`<button class=${cls('chip', f.status === k ? 'navy' : 'outline')} style="min-height:32px;padding:0 12px;cursor:pointer" onClick=${() => set({ status: k })}>${l}${k ? ` · ${ps[k] || 0}` : ''}</button>`)}
      </div>`}
    </section>

    <div class="row wrap" style="gap:20px;align-items:flex-start">
      <section aria-label="Daftar soal" class="col" style="flex:999 1 600px;min-width:0">
        ${mode === 'guru' && draf.length > 0 && html`<div class="card row wrap" style="padding:12px 16px;background:var(--sky-50)">
          <span class="grow small"><strong>${pilih.size || draf.length}</strong> soal draf/revisi ${pilih.size ? 'dipilih' : 'belum diajukan'}.</span>
          <button class="btn btn-p btn-sm" onClick=${() => aksi.ajukan(pilih.size ? [...pilih] : draf.map((s) => s.id))}><${Icon} n="send" s=${16} />Ajukan ${pilih.size ? 'yang dipilih' : 'semua'} untuk telaah</button>
        </div>`}
        ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : items.length === 0 ? html`<div class="card"><${Empty} icon="book" title="Belum ada soal">${bisaUbah ? html`<a href=${`${base}/baru`}>Tambah soal pertama</a>` : 'Ubah filter untuk melihat soal lain.'}<//></div>` :
          items.map((s) => {
            const [sl, sc] = STATUS_SOAL[s.status];
            const milik = mode === 'pusat' || (mode === 'guru' && s.penulis_id === session.user.id);
            return html`<article class="card row" style=${`padding:16px;gap:14px;align-items:flex-start;${s.status === 'revisi' ? 'border-color:#FECACA' : ''}`}>
              ${mode === 'guru' && milik && (s.status === 'draf' || s.status === 'revisi') ? html`<input type="checkbox" style="width:20px;height:20px;margin-top:2px;accent-color:var(--sky-600)" aria-label=${`Pilih soal ${s.nomor}`}
                checked=${pilih.has(s.id)} onChange=${(e) => { const n = new Set(pilih); e.target.checked ? n.add(s.id) : n.delete(s.id); setPilih(n); }} />` : html`<span style="width:20px"></span>`}
              <div class="col grow" style="gap:10px;min-width:0">
                <div class="row wrap gap-8"><strong class="small">#${String(s.nomor).padStart(2, '0')}</strong>
                  <${Chip} c=${TIPE_WARNA[s.tipe]}>${TIPE_LABEL[s.tipe]}<//><${Chip}>${s.mapel} · ${s.kategori}<//>
                  ${mode !== 'admin' && html`<${Chip} c=${sc} icon=${s.status === 'disetujui' ? 'check' : s.status === 'menunggu' ? 'clock' : s.status === 'revisi' ? 'message' : null}>${sl}<//>`}
                  ${!s.aktif && html`<${Chip} c="outline">Nonaktif<//>`}
                  ${s.feedback_baru > 0 && html`<${Chip} c="orange" icon="message">${s.feedback_baru} feedback<//>`}
                </div>
                <p class="small" style="line-height:1.55;color:var(--body)">${plain(s.pertanyaan).slice(0, 260)}${plain(s.pertanyaan).length > 260 ? '…' : ''}</p>
                ${s.status === 'revisi' && s.catatan_telaah && html`<div class="small" style="padding:10px 12px;border-radius:12px;background:var(--red-50);color:#7F1D1D"><strong>Catatan supervisor:</strong> ${s.catatan_telaah}</div>`}
                <div class="row wrap tiny muted" style="gap:16px"><span>Kunci: <strong style="color:var(--ink)">${ringkasKunci(s)}</strong></span><span>Skor maks ${s.skor_maks}</span>
                  ${mode !== 'guru' && s.penulis && html`<span>Penulis: ${s.penulis}</span>`}${s.dipakai > 0 && html`<span>Sudah dijawab ${s.dipakai}×</span>`}</div>
              </div>
              <div class="col" style="gap:6px;align-items:flex-end">
                ${milik && html`<${Switch} checked=${!!s.aktif} label="Soal aktif" onChange=${(v) => aksi.aktif(s, v)} />`}
                <span class="row gap-4" style="gap:2px">
                  <button class="icon-btn sm" aria-label="Pratinjau" onClick=${() => setLihat(s)}><${Icon} n="eye" s=${18} /></button>
                  ${milik && html`<a class="icon-btn sm" aria-label="Ubah" href=${`${base}/${s.id}`}><${Icon} n="edit" s=${18} /></a>`}
                  ${bisaUbah && html`<button class="icon-btn sm" aria-label="Duplikat" onClick=${() => aksi.duplikat(s)}><${Icon} n="copy" s=${18} /></button>`}
                  ${milik && html`<button class="icon-btn sm danger" aria-label="Hapus" disabled=${s.dipakai > 0} onClick=${() => aksi.hapus(s)}><${Icon} n="trash" s=${18} /></button>`}
                </span>
              </div>
            </article>`;
          })}
      </section>
      <aside class="col" style="flex:1 1 300px;gap:20px">
        <${DonutTelaah} ps=${ps} />
        ${mode === 'guru' && html`<div class="col" style="padding:18px;border-radius:20px;background:var(--sky-100);gap:10px">
          <strong>Pindahkan paket soal</strong><span class="small" style="color:#1B3358">Ekspor atau impor soal dengan format cadangan TKA (JSON), termasuk dari aplikasi lama.</span>
          <a class="btn btn-sm" style="align-self:flex-start;background:#fff;color:var(--sky-700)" href="#/guru/backup"><${Icon} n="database" s=${16} />Backup & Impor</a></div>`}
      </aside>
    </div>
    ${lihat && html`<${Modal} title=${`Soal #${lihat.nomor} · ${TIPE_LABEL[lihat.tipe]}`} sub=${`${lihat.mapel} · ${lihat.kategori} · skor maks ${lihat.skor_maks}`} size="wide" onClose=${() => setLihat(null)}>
      <${PratinjauSoal} soal=${lihat} />
    <//>`}
  `;
}

function DonutTelaah({ ps }) {
  const t = (ps.disetujui || 0) + (ps.menunggu || 0) + (ps.revisi || 0) + (ps.draf || 0);
  const a = t ? ((ps.disetujui || 0) / t) * 100 : 0;
  const b = t ? a + ((ps.menunggu || 0) / t) * 100 : 0;
  const c = t ? b + ((ps.revisi || 0) / t) * 100 : 0;
  return html`<div class="card pad col">
    <h2 style="font-size:17px">Status Telaah</h2>
    <div class="row" style="gap:18px">
      <span style=${`width:104px;height:104px;flex:none;border-radius:50%;background:conic-gradient(var(--green-500) 0 ${a}%, var(--amber-500) ${a}% ${b}%, var(--red-500) ${b}% ${c}%, #CBD5E1 ${c}% 100%);display:flex;align-items:center;justify-content:center`}>
        <span style="width:72px;height:72px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center"><strong style="font-size:20px">${t}</strong><span class="tiny muted">soal</span></span></span>
      <div class="col small" style="gap:8px;color:var(--text-2);flex:1">
        ${[['Disetujui', 'disetujui', 'var(--green-500)'], ['Menunggu', 'menunggu', 'var(--amber-500)'], ['Perlu revisi', 'revisi', 'var(--red-500)'], ['Draf', 'draf', '#CBD5E1']].map(([l, k, c]) =>
          html`<span class="row gap-8"><span style=${`width:10px;height:10px;border-radius:3px;background:${c}`}></span>${l}<strong class="right" style="color:var(--ink)">${ps[k] || 0}</strong></span>`)}
      </div>
    </div>
  </div>`;
}

// ---------- editor teks kaya ----------
export function RichEditor({ value, onChange, placeholder, kecil, label }) {
  const ref = useRef();
  const last = useRef(null);
  const fileRef = useRef();
  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = sanitize(value || '');
      last.current = value;
    }
  }, [value]);
  const emit = () => { const h = ref.current.innerHTML; last.current = h; onChange(h); };
  const cmd = (c, v) => { ref.current.focus(); document.execCommand(c, false, v); emit(); };
  const sisip = (h) => { ref.current.focus(); document.execCommand('insertHTML', false, h); emit(); };
  const unggah = async (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast('Ukuran gambar maksimal 3 MB.', 'err');
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    try { const { url } = await post('unggah', { dataUrl }); sisip(`<img src="${url}" alt="">`); } catch (e) { toastErr(e); }
  };
  return html`<div class="editor">
    <div class="editor-bar" role="toolbar" aria-label=${`Format ${label || 'teks'}`}>
      <button type="button" class="icon-btn" aria-label="Tebal" onMouseDown=${(e) => { e.preventDefault(); cmd('bold'); }}><${Icon} n="bold" s=${18} /></button>
      <button type="button" class="icon-btn" aria-label="Miring" onMouseDown=${(e) => { e.preventDefault(); cmd('italic'); }}><${Icon} n="italic" s=${18} /></button>
      <button type="button" class="icon-btn" aria-label="Garis bawah" onMouseDown=${(e) => { e.preventDefault(); cmd('underline'); }}><${Icon} n="underline" s=${18} /></button>
      ${!kecil && html`<button type="button" class="icon-btn" aria-label="Daftar berpoin" onMouseDown=${(e) => { e.preventDefault(); cmd('insertUnorderedList'); }}><${Icon} n="list" s=${18} /></button>
      <button type="button" class="icon-btn" aria-label="Sisipkan tabel" onMouseDown=${(e) => { e.preventDefault(); sisip('<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p></p>'); }}><${Icon} n="table" s=${18} /></button>`}
      <button type="button" class="icon-btn" aria-label="Sisipkan gambar" onMouseDown=${(e) => { e.preventDefault(); fileRef.current.click(); }}><${Icon} n="image" s=${18} /></button>
      <button type="button" class="btn btn-g btn-sm" onMouseDown=${async (e) => {
        e.preventDefault();
        const sel = window.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        const tex = await promptDialog('Tulis rumus dalam format LaTeX. Contoh: \\frac{1}{2} atau x^2 + 3x', { title: 'Sisipkan rumus', ok: 'Sisipkan', placeholder: '\\frac{a}{b}' });
        if (tex) { if (range) { sel.removeAllRanges(); sel.addRange(range); } sisip(` $${tex.replace(/</g, '&lt;')}$ `); }
      }}><${Icon} n="sigma" s=${16} />Rumus</button>
      ${!kecil && html`<button type="button" class="btn btn-g btn-sm" onMouseDown=${async (e) => {
        e.preventDefault();
        const url = await promptDialog('Tempel tautan berbagi Google Drive untuk gambar (akses: siapa saja yang memiliki link).', { title: 'Gambar dari Google Drive', ok: 'Sisipkan', placeholder: 'https://drive.google.com/file/d/…' });
        const id = url && (/\/d\/([\w-]{20,})/.exec(url) || /[?&]id=([\w-]{20,})/.exec(url))?.[1];
        if (url && !id) return toast('Tautan Google Drive tidak dikenali.', 'err');
        if (id) sisip(`<img src="https://lh3.googleusercontent.com/d/${id}" alt="">`);
      }}>GDrive → gambar</button>`}
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden ref=${fileRef} onChange=${(e) => { unggah(e.target.files[0]); e.target.value = ''; }} />
    </div>
    <div class=${cls('editor-area', kecil && 'sm')} contenteditable="true" ref=${ref} role="textbox" aria-multiline="true" aria-label=${label}
      data-placeholder=${placeholder || ''} onInput=${emit} onBlur=${emit}
      onPaste=${(e) => {
        const h = e.clipboardData.getData('text/html');
        if (h) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(h)); emit(); }
      }}></div>
  </div>`;
}

// ---------- editor soal ----------
const KOSONG = {
  pilihan_ganda: () => ({ opsi: ['', '', '', ''].map((t, i) => ({ kode: String.fromCharCode(65 + i), teks: t })), kunci: 'A' }),
  pilihan_ganda_kompleks: () => ({ opsi: [1, 2, 3, 4].map((i) => ({ id: String(i), teks: '' })), kunci: [] }),
  benar_salah: () => ({ opsi: null, kunci: 'Benar' }),
  pg_kategori: () => ({ opsi: { labels: ['Benar', 'Salah'], items: [1, 2, 3].map((i) => ({ id: i, pernyataan: '' })) }, kunci: {} }),
  menjodohkan: () => ({ opsi: { premis: [1, 2, 3].map((i) => ({ id: `p${i}`, teks: '' })), respon: [1, 2, 3, 4].map((i) => ({ id: `r${i}`, teks: '' })) }, kunci: {} }),
  isian: () => ({ opsi: null, kunci: [] }),
  uraian: () => ({ opsi: null, kunci: '' }),
};
const TIPE_IKON = { pilihan_ganda: ['check-circle', 't-sky'], pilihan_ganda_kompleks: ['list', 't-violet'], benar_salah: ['check', 't-green'], pg_kategori: ['table', 't-amber'], menjodohkan: ['layers', 't-pink'], isian: ['edit', 't-violet'], uraian: ['file', 't-orange'] };

function cekSoal(s) {
  const isi = (h) => plain(h) !== '' || /<img/i.test(h || '');
  const c = [[isi(s.tanya ?? s.pertanyaan), 'Pertanyaan terisi']];
  if (s.tipe === 'pilihan_ganda') { const o = s.opsi.filter((x) => isi(x.teks)); c.push([o.length >= 2, 'Minimal 2 opsi terisi'], [o.some((x) => x.kode === s.kunci), 'Kunci jawaban dipilih']); }
  if (s.tipe === 'pilihan_ganda_kompleks') { const o = s.opsi.filter((x) => isi(x.teks)); c.push([o.length >= 3, 'Minimal 3 opsi terisi'], [s.kunci.length >= 2, 'Minimal 2 kunci untuk PG kompleks']); }
  if (s.tipe === 'pg_kategori') { const it = s.opsi.items.filter((x) => isi(x.pernyataan)); c.push([it.length >= 2, 'Minimal 2 pernyataan'], [it.every((x) => s.kunci[x.id]), 'Setiap pernyataan punya kunci']); }
  if (s.tipe === 'menjodohkan') { const p = s.opsi.premis.filter((x) => isi(x.teks)); c.push([p.length >= 2 && s.opsi.respon.filter((x) => isi(x.teks)).length >= 2, 'Minimal 2 premis & 2 respon'], [p.every((x) => s.kunci[x.id]), 'Setiap premis dipasangkan']); }
  if (s.tipe === 'isian') c.push([true, s.kunci.length ? 'Dinilai otomatis dari kunci' : 'Tanpa kunci: dikoreksi manual oleh guru']);
  if (s.tipe === 'uraian') c.push([!!plain(s.kunci), 'Rubrik penilaian terisi (disarankan)']);
  return c;
}

export function EditorSoal({ id, base, mode }) {
  const master = useMaster();
  const baru = !id;
  const [s, setS] = useState(baru ? { mapel: '', kategori: '', tipe: 'pilihan_ganda', pertanyaan: '', stimulus: '', tanya: '', skor_maks: 1, ...KOSONG.pilihan_ganda() } : null);
  // isi soal dipecah: stimulus (bacaan/ilustrasi) dan pertanyaan, digabung lagi saat disimpan
  const muat = (d) => { const sp = pisahSoal(d.pertanyaan); return { ...d, stimulus: sp.stimulus, tanya: sp.pertanyaan, opsi: d.opsi ?? KOSONG[d.tipe]().opsi, kunci: d.kunci ?? KOSONG[d.tipe]().kunci }; };
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [simpanAt, setSimpanAt] = useState(null);
  useEffect(() => {
    if (!baru) get(`soal/${id}`).then((d) => setS(muat(d))).catch(setErr);
  }, [id]);
  useEffect(() => {
    if (baru && s && !s.mapel && master.mapel.length) setS((x) => ({ ...x, mapel: master.mapel.find((m) => m.aktif)?.kode || '', kategori: master.kategori.find((k) => k.aktif)?.kode || '' }));
  }, [master]);
  if (err) return html`<${ErrorBox} error=${err} />`;
  if (!s) return html`<${Loading} />`;
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const gantiTipe = (t) => { if (t !== s.tipe) set({ tipe: t, ...KOSONG[t](), skor_maks: t === 'uraian' ? 5 : 1 }); };
  const cek = cekSoal(s);
  const simpan = async (lanjut) => {
    setBusy(true);
    try {
      const { stimulus, tanya, ...isi } = s;
      const body = { ...isi, pertanyaan: gabungSoal(stimulus, tanya), ajukan: lanjut === 'ajukan' };
      const d = baru ? await post('soal', body) : await put(`soal/${id}`, body);
      if (lanjut === 'setujui') await post(`soal/${d.id}/telaah`, { keputusan: 'disetujui' });
      setSimpanAt(Date.now());
      toast(lanjut === 'ajukan' ? 'Soal disimpan dan diajukan untuk ditelaah.' : lanjut === 'setujui' ? 'Soal disimpan dan disetujui.' : lanjut === 'baru' && !isiKosong(stimulus) ? 'Soal disimpan. Bacaan tetap terisi untuk soal berikutnya.' : 'Soal disimpan.');
      if (lanjut === 'baru') { setS({ ...s, pertanyaan: '', tanya: '', ...KOSONG[s.tipe]() }); if (!baru) go(`${base.slice(1)}/baru`); }
      else if (baru) go(`${base.slice(1)}/${d.id}`);
      else setS(muat(d));
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`
    <${PageHead} back=${base} title=${baru ? 'Input Soal Baru' : `Ubah Soal #${s.nomor}`} sub=${simpanAt ? `Tersimpan ${fmt.jam(simpanAt)}` : s.status ? `Status: ${STATUS_SOAL[s.status][0]}` : 'Belum disimpan'}>
      <button class="btn btn-o" disabled=${busy} onClick=${() => simpan('draf')}>Simpan${mode === 'guru' ? ' Draf' : ''}</button>
      ${baru && html`<button class="btn btn-s" disabled=${busy} onClick=${() => simpan('baru')}><${Icon} n="plus" s=${18} />Simpan & Buat Lagi</button>`}
      ${mode === 'guru' ? html`<button class="btn btn-p" disabled=${busy} onClick=${() => simpan('ajukan')}><${Icon} n="send" s=${18} />Simpan & Ajukan Telaah</button>`
        : html`<button class="btn btn-p" disabled=${busy} onClick=${() => simpan('setujui')}><${Icon} n="check" s=${18} />Simpan & Setujui</button>`}
    <//>
    ${s.status === 'revisi' && s.catatan_telaah && html`<div class="card row" style="padding:14px 16px;background:var(--red-50);border-color:#FECACA;align-items:flex-start">
      <${Icon} n="message" /><span class="small"><strong>Catatan supervisor:</strong> ${s.catatan_telaah}</span></div>`}
    <div class="row wrap" style="gap:20px;align-items:flex-start">
      <div class="col" style="flex:999 1 640px;min-width:0;gap:20px">
        <section class="card pad form-grid" style="grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))">
          <${Field} label="Mata pelajaran"><select class="select" value=${s.mapel} onChange=${(e) => set({ mapel: e.target.value })}><option value="">— pilih —</option>${master.mapel.map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select><//>
          <${Field} label="Kategori"><select class="select" value=${s.kategori} onChange=${(e) => set({ kategori: e.target.value })}><option value="">— pilih —</option>${master.kategori.map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select><//>
          <${Field} label="Skor maksimum"><input class="input" type="number" min="0.5" max="100" step="0.5" value=${s.skor_maks} onInput=${(e) => set({ skor_maks: e.target.value })} /><//>
        </section>
        <section class="card pad col">
          <h2 style="font-size:16px">Tipe Soal</h2>
          <div role="radiogroup" aria-label="Tipe soal" class="grid-auto" style="--min:140px;gap:10px">
            ${Object.entries(TIPE_LABEL).map(([k, l]) => {
              const on = s.tipe === k;
              return html`<label style=${`display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;cursor:pointer;font-size:13px;font-weight:${on ? 800 : 700};${on ? 'border:2px solid var(--sky-400);background:var(--sky-50);color:var(--ink)' : 'border:1px solid var(--line);color:var(--text-2)'}`}>
                <input type="radio" name="tipe" class="sr-only" checked=${on} onChange=${() => gantiTipe(k)} />
                <span class=${cls('tile sm', on ? 't-sky-solid' : TIPE_IKON[k][1])}><${Icon} n=${TIPE_IKON[k][0]} s=${18} /></span>${l}</label>`;
            })}
          </div>
        </section>
        <section class="card pad col">
          <div class="col" style="gap:2px"><h2 style="font-size:16px">Stimulus / Bacaan / Ilustrasi <span class="small muted" style="font-weight:600">(opsional)</span></h2>
            <span class="small muted">Teks bacaan, gambar, atau tabel. Saat ujian tampil di kolom kiri. Kosongkan bila soal tidak memakai bacaan.</span></div>
          <${RichEditor} label="Stimulus" value=${s.stimulus} onChange=${(v) => set({ stimulus: v })} placeholder="Tempel teks bacaan atau sisipkan gambar/tabel di sini." />
        </section>
        <section class="card pad col">
          <div class="col" style="gap:2px"><h2 style="font-size:16px">Pertanyaan</h2>
            <span class="small muted">Kalimat perintah/pertanyaan. Saat ujian tampil dalam kotak tersendiri di atas pilihan jawaban.</span></div>
          <${RichEditor} label="Pertanyaan" value=${s.tanya} onChange=${(v) => set({ tanya: v })} placeholder="Tulis pertanyaan di sini. Gunakan tombol Rumus untuk matematika." />
        </section>
        <section class="card pad col"><${EditorJawaban} s=${s} set=${set} /></section>
      </div>
      <aside class="col" style="flex:1 1 340px;gap:20px">
        <div class="card pad col">
          <div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Pratinjau Siswa</h2><span class="chip"><${Icon} n="eye" s=${12} />Langsung</span></div>
          <div style="border-radius:24px;border:8px solid var(--ink);background:var(--bg);padding:14px;display:flex;flex-direction:column;gap:10px;--soal-size:14px;max-height:620px;overflow:auto">
            <span class="row gap-8"><span class="chip sky-solid">Soal ${s.nomor || 1}</span><span class="chip white">${TIPE_LABEL[s.tipe]}</span></span>
            ${!isiKosong(s.stimulus) && html`<div class="card" style="padding:12px;box-shadow:none"><${Rich} html=${s.stimulus} /></div>`}
            <div class="card soal-tanya" style="padding:12px;box-shadow:none"><${Rich} html=${isiKosong(s.tanya) ? '<p style="color:#94A3B8">Pertanyaan…</p>' : s.tanya} /></div>
            <${SoalView} soal=${s} jawaban=${null} readOnly=${true} kunci=${s.kunci} />
          </div>
        </div>
        <div class="card pad col" style="gap:10px">
          <h2 style="font-size:16px">Cek Sebelum Simpan</h2>
          ${cek.map(([ok, t]) => html`<span class="row gap-8 small" style=${`color:${ok ? 'var(--green-700)' : 'var(--amber-800)'}`}><${Icon} n=${ok ? 'check-circle' : 'alert'} s=${18} />${t}</span>`)}
        </div>
      </aside>
    </div>`;
}

function EditorJawaban({ s, set }) {
  const isi = (h) => plain(h) !== '' || /<img/i.test(h || '');
  switch (s.tipe) {
    case 'pilihan_ganda':
      return html`<div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Opsi & Kunci Jawaban</h2><span class="small muted">Pilih satu kunci</span></div>
        ${s.opsi.map((o, i) => html`<div class="row" style=${`gap:10px;padding:8px 10px;border-radius:14px;align-items:flex-start;${s.kunci === o.kode ? 'background:var(--green-50);border:1px solid #BBF7D0' : 'border:1px solid var(--line)'}`}>
          <input type="radio" name="kunci" checked=${s.kunci === o.kode} onChange=${() => set({ kunci: o.kode })} aria-label=${`Opsi ${o.kode} kunci`} style="width:22px;height:22px;margin-top:12px;accent-color:#16A34A" />
          <span class="tile sm" style="margin-top:4px;background:#fff">${o.kode}</span>
          <div class="grow"><${RichEditor} kecil label=${`Opsi ${o.kode}`} value=${o.teks} onChange=${(v) => set({ opsi: s.opsi.map((x, j) => (j === i ? { ...x, teks: v } : x)) })} /></div>
          <button type="button" class="icon-btn sm danger" style="margin-top:4px" aria-label=${`Hapus opsi ${o.kode}`} disabled=${s.opsi.length <= 2}
            onClick=${() => { const op = s.opsi.filter((_, j) => j !== i).map((x, j) => ({ ...x, kode: String.fromCharCode(65 + j) })); set({ opsi: op, kunci: op[0]?.kode || 'A' }); }}><${Icon} n="trash" s=${18} /></button>
        </div>`)}
        <button type="button" class="btn btn-g" style="align-self:flex-start;border:1.5px dashed var(--sky-300);color:var(--sky-700)" disabled=${s.opsi.length >= 6}
          onClick=${() => set({ opsi: [...s.opsi, { kode: String.fromCharCode(65 + s.opsi.length), teks: '' }] })}><${Icon} n="plus" s=${18} />Tambah opsi</button>`;
    case 'pilihan_ganda_kompleks':
      return html`<div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Opsi & Kunci Jawaban</h2><span class="small muted">Centang semua jawaban yang benar</span></div>
        ${s.opsi.map((o, i) => {
          const on = s.kunci.map(String).includes(String(o.id));
          return html`<div class="row" style=${`gap:10px;padding:8px 10px;border-radius:14px;align-items:flex-start;${on ? 'background:var(--green-50);border:1px solid #BBF7D0' : 'border:1px solid var(--line)'}`}>
            <input type="checkbox" checked=${on} aria-label=${`Opsi ${i + 1} benar`} style="width:22px;height:22px;margin-top:12px;accent-color:#16A34A"
              onChange=${() => set({ kunci: on ? s.kunci.filter((k) => String(k) !== String(o.id)) : [...s.kunci, String(o.id)] })} />
            <span class="tile sm" style="margin-top:4px;background:#fff">${i + 1}</span>
            <div class="grow"><${RichEditor} kecil label=${`Opsi ${i + 1}`} value=${o.teks} onChange=${(v) => set({ opsi: s.opsi.map((x, j) => (j === i ? { ...x, teks: v } : x)) })} /></div>
            <button type="button" class="icon-btn sm danger" style="margin-top:4px" aria-label=${`Hapus opsi ${i + 1}`} disabled=${s.opsi.length <= 3}
              onClick=${() => set({ opsi: s.opsi.filter((_, j) => j !== i), kunci: s.kunci.filter((k) => String(k) !== String(o.id)) })}><${Icon} n="trash" s=${18} /></button>
          </div>`;
        })}
        <button type="button" class="btn btn-g" style="align-self:flex-start;border:1.5px dashed var(--sky-300);color:var(--sky-700)" disabled=${s.opsi.length >= 8}
          onClick=${() => set({ opsi: [...s.opsi, { id: String(Math.max(0, ...s.opsi.map((o) => +o.id || 0)) + 1), teks: '' }] })}><${Icon} n="plus" s=${18} />Tambah opsi</button>`;
    case 'benar_salah':
      return html`<h2 style="font-size:16px">Kunci Jawaban</h2>
        <div class="row">${['Benar', 'Salah'].map((l) => html`<label class=${cls('opsi', s.kunci === l && 'on')} style="flex:1;justify-content:center"><input type="radio" name="bs" checked=${s.kunci === l} onChange=${() => set({ kunci: l })} />${l}</label>`)}</div>`;
    case 'pg_kategori':
      return html`<div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Pernyataan & Kunci</h2></div>
        <div class="row wrap gap-8"><span class="small muted">Label pilihan:</span>
          ${s.opsi.labels.map((l, i) => html`<input class="input" style="width:140px;min-height:40px" value=${l} aria-label=${`Label ${i + 1}`}
            onChange=${(e) => { const labels = s.opsi.labels.map((x, j) => (j === i ? e.target.value.trim() || x : x)); const kunci = Object.fromEntries(Object.entries(s.kunci).map(([k, v]) => [k, v === l ? labels[i] : v])); set({ opsi: { ...s.opsi, labels }, kunci }); }} />`)}
        </div>
        ${s.opsi.items.map((it, i) => html`<div class="row wrap" style="gap:10px;padding:8px 10px;border-radius:14px;border:1px solid var(--line);align-items:flex-start">
          <span class="tile sm" style="margin-top:4px">${i + 1}</span>
          <div class="grow" style="min-width:240px"><${RichEditor} kecil label=${`Pernyataan ${i + 1}`} value=${it.pernyataan} onChange=${(v) => set({ opsi: { ...s.opsi, items: s.opsi.items.map((x, j) => (j === i ? { ...x, pernyataan: v } : x)) } })} /></div>
          <div class="row gap-4" style="margin-top:4px">${s.opsi.labels.map((l) => html`<button type="button" class=${cls('kat-btn', s.kunci[it.id] === l && 'on')} onClick=${() => set({ kunci: { ...s.kunci, [it.id]: l } })}>${l}</button>`)}</div>
          <button type="button" class="icon-btn sm danger" style="margin-top:4px" aria-label=${`Hapus pernyataan ${i + 1}`} disabled=${s.opsi.items.length <= 2}
            onClick=${() => { const k = { ...s.kunci }; delete k[it.id]; set({ opsi: { ...s.opsi, items: s.opsi.items.filter((_, j) => j !== i) }, kunci: k }); }}><${Icon} n="trash" s=${18} /></button>
        </div>`)}
        <button type="button" class="btn btn-g" style="align-self:flex-start;border:1.5px dashed var(--sky-300);color:var(--sky-700)"
          onClick=${() => set({ opsi: { ...s.opsi, items: [...s.opsi.items, { id: Math.max(0, ...s.opsi.items.map((x) => +x.id || 0)) + 1, pernyataan: '' }] } })}><${Icon} n="plus" s=${18} />Tambah pernyataan</button>`;
    case 'menjodohkan': {
      const ubahList = (key, i, v) => set({ opsi: { ...s.opsi, [key]: s.opsi[key].map((x, j) => (j === i ? { ...x, teks: v } : x)) } });
      return html`<h2 style="font-size:16px">Pasangan & Kunci</h2>
        <div class="row wrap" style="gap:16px;align-items:flex-start">
          <div class="col" style="flex:1 1 300px"><strong class="small">Premis (kiri) & pasangannya</strong>
            ${s.opsi.premis.map((p, i) => html`<div class="col" style="gap:6px;padding:10px;border-radius:14px;border:1px solid var(--line)">
              <div class="row gap-8"><span class="tile sm">${i + 1}</span><div class="grow"><${RichEditor} kecil label=${`Premis ${i + 1}`} value=${p.teks} onChange=${(v) => ubahList('premis', i, v)} /></div></div>
              <select class="select" aria-label=${`Kunci premis ${i + 1}`} value=${s.kunci[p.id] || ''} onChange=${(e) => set({ kunci: { ...s.kunci, [p.id]: e.target.value } })}>
                <option value="">— pasangan yang benar —</option>${s.opsi.respon.map((r, j) => html`<option value=${r.id}>${String.fromCharCode(65 + j)}. ${plain(r.teks) || '(kosong)'}</option>`)}</select>
            </div>`)}
            <button type="button" class="btn btn-g btn-sm" style="align-self:flex-start;color:var(--sky-700)" onClick=${() => set({ opsi: { ...s.opsi, premis: [...s.opsi.premis, { id: `p${Date.now()}`, teks: '' }] } })}><${Icon} n="plus" s=${16} />Premis</button>
          </div>
          <div class="col" style="flex:1 1 260px"><strong class="small">Respon (kanan) — boleh lebih banyak sebagai pengecoh</strong>
            ${s.opsi.respon.map((r, i) => html`<div class="row gap-8"><span class="tile sm">${String.fromCharCode(65 + i)}</span><div class="grow"><${RichEditor} kecil label=${`Respon ${i + 1}`} value=${r.teks} onChange=${(v) => ubahList('respon', i, v)} /></div>
              <button type="button" class="icon-btn sm danger" aria-label="Hapus respon" disabled=${s.opsi.respon.length <= 2} onClick=${() => set({ opsi: { ...s.opsi, respon: s.opsi.respon.filter((_, j) => j !== i) } })}><${Icon} n="trash" s=${16} /></button></div>`)}
            <button type="button" class="btn btn-g btn-sm" style="align-self:flex-start;color:var(--sky-700)" onClick=${() => set({ opsi: { ...s.opsi, respon: [...s.opsi.respon, { id: `r${Date.now()}`, teks: '' }] } })}><${Icon} n="plus" s=${16} />Respon</button>
          </div>
        </div>`;
    }
    case 'isian':
      return html`<h2 style="font-size:16px">Kunci Jawaban Isian</h2>
        <${Field} label="Jawaban yang diterima" hint="pisahkan dengan | (garis tegak). Kosongkan bila ingin dikoreksi manual.">
          <input class="input" value=${(s.kunci || []).join(' | ')} placeholder="contoh: malas | pemalas" onInput=${(e) => set({ kunci: e.target.value.split('|').map((x) => x.trim()).filter(Boolean) })} /><//>
        <span class="small muted">Huruf besar/kecil, spasi berlebih, dan tanda titik di akhir diabaikan saat menilai.</span>`;
    case 'uraian':
      return html`<h2 style="font-size:16px">Rubrik Penilaian</h2>
        <${Field} label="Panduan untuk guru saat mengoreksi"><textarea class="textarea" rows="5" value=${s.kunci || ''} onInput=${(e) => set({ kunci: e.target.value })}
          placeholder="Contoh: 1 manfaat tepat = 2 poin; 2 manfaat tepat = 4 poin; kalimat runtut = +1 poin"></textarea><//>`;
    default: return null;
  }
}

/** Backup & impor soal (JSON). */
export function BackupSoal() {
  const master = useMaster();
  const [f, setF] = useState({ mapel: '', kategori: '' });
  const [hasil, setHasil] = useState(null);
  const [busy, setBusy] = useState(false);
  const ekspor = async () => {
    try {
      const d = await get('soal/ekspor', f);
      unduhBlob(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), `Soal_${f.mapel || 'Semua'}_${f.kategori || 'Semua'}_${new Date().toISOString().slice(0, 10)}.json`);
      toast(`${d.soal.length} soal diekspor.`);
    } catch (e) { toastErr(e); }
  };
  const impor = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const json = JSON.parse(await file.text());
      const soal = Array.isArray(json) ? json : json.soal;
      if (!Array.isArray(soal)) throw new Error('Isi file bukan daftar soal.');
      const r = await post('soal/impor', { soal, mapel: f.mapel, kategori: f.kategori });
      setHasil(r);
      toast(`${r.berhasil} soal diimpor sebagai draf.`);
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${PageHead} title="Backup & Impor Soal" sub="Format JSON TKA 2026. File dari aplikasi lama (BI_TO1.json, dll.) juga bisa diimpor." />
    <section class="card pad col">
      <div class="form-grid">
        <${Field} label="Mata pelajaran" hint="kosong = ikut isi file"><select class="select" value=${f.mapel} onChange=${(e) => setF({ ...f, mapel: e.target.value })}><option value="">Semua / ikut file</option>${master.mapel.map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select><//>
        <${Field} label="Kategori" hint="kosong = ikut isi file"><select class="select" value=${f.kategori} onChange=${(e) => setF({ ...f, kategori: e.target.value })}><option value="">Semua / ikut file</option>${master.kategori.map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select><//>
      </div>
      <div class="row wrap">
        <button class="btn btn-o" onClick=${ekspor}><${Icon} n="download" s=${18} />Unduh backup soal saya</button>
        <label class="btn btn-p" style="cursor:pointer"><${Icon} n="upload" s=${18} />${busy ? 'Mengimpor…' : 'Impor dari file JSON'}<input type="file" accept=".json,application/json" hidden onChange=${(e) => { impor(e.target.files[0]); e.target.value = ''; }} /></label>
      </div>
      <p class="small muted">Soal hasil impor berstatus draf. Ajukan ke supervisor dari halaman Bank Soal agar bisa dipakai ujian.</p>
      ${hasil && html`<div class="card pad col" style="box-shadow:none;background:var(--surface-2)">
        <strong>${hasil.berhasil} soal berhasil diimpor${hasil.gagal.length ? `, ${hasil.gagal.length} gagal` : ''}.</strong>
        ${hasil.gagal.slice(0, 20).map((g) => html`<span class="small" style="color:var(--red-700)">Soal ke-${g.no}: ${g.pesan}</span>`)}
      </div>`}
    </section>`;
}
