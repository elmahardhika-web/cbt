import { html, useState, useEffect, fmt, cls, TIPE_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { get, put } from '../api.js';
import { Loading, ErrorBox, Empty, Chip, toast, toastErr, useAsync, useDebounced, PageHead, Avatar, Bar, Field } from '../ui.js';
import { Rich } from '../rich.js';
import { useMaster } from './soal.js';

export function Koreksi() {
  const master = useMaster();
  const [f, setF] = useState({ mapel: '', kategori: '', q: '' });
  const { data, error, loading, reload } = useAsync(() => get('koreksi', { mapel: f.mapel, kategori: f.kategori }), [f.mapel, f.kategori]);
  const [aktif, setAktif] = useState(null);
  const list = (data || []).filter((x) => !f.q || x.nama.toLowerCase().includes(f.q.toLowerCase()) || x.username.includes(f.q));
  useEffect(() => { if (data && !aktif) setAktif(list.find((x) => x.perlu_koreksi > 0)?.peserta_id ?? list[0]?.peserta_id ?? null); }, [data]);
  const total = (data || []).reduce((a, x) => a + x.perlu_koreksi, 0);
  const selesai = (data || []).reduce((a, x) => a + x.dikoreksi, 0);
  const idx = list.findIndex((x) => x.peserta_id === aktif);
  const lanjut = () => {
    const next = list.slice(idx + 1).find((x) => x.perlu_koreksi > 0) || list.find((x) => x.perlu_koreksi > 0 && x.peserta_id !== aktif);
    if (next) setAktif(next.peserta_id); else toast('Semua jawaban sudah dikoreksi.');
  };
  return html`
    <${PageHead} title="Koreksi Jawaban" sub="Soal uraian dan isian tanpa kunci dikoreksi manual. Nilai akhir muncul setelah semua dikoreksi.">
      <div class="col" style="flex:0 1 300px;gap:6px">
        <div class="row small" style="justify-content:space-between;color:var(--text-2)"><span>${total} jawaban menunggu</span><strong>${selesai} / ${selesai + total} selesai</strong></div>
        <${Bar} value=${selesai + total ? (selesai / (selesai + total)) * 100 : 100} />
      </div>
    <//>
    <section class="card pad row wrap" style="gap:10px;padding:14px 16px">
      <select class="select" style="width:auto;min-width:190px" aria-label="Mapel" value=${f.mapel} onChange=${(e) => setF({ ...f, mapel: e.target.value })}><option value="">Semua mapel</option>${master.mapel.map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select>
      <select class="select" style="width:auto;min-width:170px" aria-label="Kategori" value=${f.kategori} onChange=${(e) => setF({ ...f, kategori: e.target.value })}><option value="">Semua kategori</option>${master.kategori.map((k) => html`<option value=${k.kode}>${k.nama}</option>`)}</select>
    </section>
    ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : !data.length ? html`<div class="card"><${Empty} icon="check-circle" title="Tidak ada jawaban yang perlu dikoreksi">Paket soal yang dipakai hanya berisi soal yang dinilai otomatis, atau belum ada siswa yang selesai.<//></div>` : html`
    <div class="row wrap" style="gap:20px;align-items:flex-start">
      <aside aria-label="Daftar siswa" class="card col" style="flex:1 1 300px;padding:14px;gap:6px;max-height:80vh;overflow:auto">
        <label class="input-icon soft" style="min-height:42px;margin-bottom:6px"><${Icon} n="search" s=${16} /><input type="search" placeholder="Cari siswa" value=${f.q} onInput=${(e) => setF({ ...f, q: e.target.value })} aria-label="Cari siswa" /></label>
        ${list.map((x) => html`<button class="row" style=${`padding:10px;border-radius:14px;border:0;cursor:pointer;text-align:left;background:${x.peserta_id === aktif ? 'var(--sky-100)' : 'transparent'}`} onClick=${() => setAktif(x.peserta_id)}>
          <${Avatar} nama=${x.nama} tone=${x.peserta_id === aktif ? 'sky-solid' : 'slate'} size=${36} />
          <span class="col grow" style="gap:0;min-width:0"><strong class="small ellipsis">${x.nama}</strong><span class="tiny muted ellipsis">${x.kelas} · ${x.mapel} ${x.kategori}</span></span>
          ${x.perlu_koreksi > 0 ? html`<${Chip} c="amber">${x.perlu_koreksi} menunggu<//>` : html`<${Chip} c="green" icon="check">${fmt.angka(x.nilai)}<//>`}
        </button>`)}
      </aside>
      <section class="col" style="flex:999 1 600px;min-width:0">
        ${aktif ? html`<${KoreksiPeserta} key=${aktif} pid=${aktif} onSaved=${() => reload(true)} onNext=${lanjut} onPrev=${() => idx > 0 && setAktif(list[idx - 1].peserta_id)} />` : html`<${Empty} title="Pilih siswa" />`}
      </section>
    </div>`}`;
}

function KoreksiPeserta({ pid, onSaved, onNext, onPrev }) {
  const { data, error, loading, reload } = useAsync(() => get(`koreksi/${pid}`), [pid]);
  const [nilai, setNilai] = useState({});
  useEffect(() => { if (data) setNilai(Object.fromEntries(data.items.map((i) => [i.id, { skor: i.dikoreksi ? i.skor : null, catatan: i.catatan || '' }]))); }, [data]);
  if (loading) return html`<div class="card"><${Loading} /></div>`;
  if (error) return html`<${ErrorBox} error=${error} />`;
  const p = data.peserta;
  const simpan = async (lanjut) => {
    try {
      let last = null;
      for (const it of data.items) {
        const v = nilai[it.id];
        if (v?.skor == null || v.skor === '') continue;
        last = await put(`koreksi/jawaban/${it.id}`, { skor: +v.skor, catatan: v.catatan });
      }
      toast(last?.nilai != null ? `Tersimpan. Nilai akhir ${fmt.angka(last.nilai)}.` : 'Koreksi tersimpan.');
      onSaved();
      if (lanjut) onNext(); else reload(true);
    } catch (e) { toastErr(e); }
  };
  const skala = (max) => (max <= 10 && Number.isInteger(+max) ? Array.from({ length: +max + 1 }, (_, i) => i) : null);
  return html`
    <div class="card row wrap" style="padding:16px 18px">
      <${Avatar} nama=${p.nama} size=${46} />
      <span class="col grow" style="gap:0"><strong style="font-size:16px">${p.nama}</strong><span class="small muted">${p.username} · ${p.kelas} · ${p.mapel_nama} ${p.kategori_nama} · skor sementara ${fmt.angka(p.skor)}/${fmt.angka(p.skor_maks)}</span></span>
      <button class="btn btn-o btn-sm" onClick=${onPrev}><${Icon} n="chev-l" s=${16} />Sebelumnya</button>
      <button class="btn btn-o btn-sm" onClick=${onNext}>Berikutnya <${Icon} n="chev-r" s=${16} /></button>
    </div>
    ${data.items.length === 0 && html`<div class="card"><${Empty} title="Siswa ini tidak menjawab soal uraian/isian" /></div>`}
    ${data.items.map((it) => {
      const v = nilai[it.id] || {};
      const sk = skala(it.skor_maks);
      return html`<article class="card pad col" style="gap:14px">
        <div class="row wrap gap-8"><strong>Soal ${it.nomor}</strong><${Chip} c=${it.tipe === 'uraian' ? 'orange' : 'violet'}>${TIPE_LABEL[it.tipe]}<//><${Chip}>Skor maks ${it.skor_maks}<//>${it.dikoreksi ? html`<${Chip} c="green" icon="check">Sudah dikoreksi<//>` : ''}</div>
        <${Rich} html=${it.pertanyaan} />
        <div class="col" style="padding:14px 16px;border-radius:16px;background:var(--surface-2);border:1px solid var(--line);gap:6px">
          <span class="tiny" style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)">Jawaban siswa</span>
          <p style="font-size:15px;line-height:1.7;white-space:pre-wrap">${typeof it.jawaban === 'string' ? it.jawaban : JSON.stringify(it.jawaban)}</p>
        </div>
        ${it.kunci && (Array.isArray(it.kunci) ? it.kunci.length : true) && html`<details open style="border-radius:16px;background:var(--sky-50);padding:12px 16px">
          <summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--sky-700)">Rubrik / kunci</summary>
          <p class="small" style="margin-top:8px;white-space:pre-wrap">${Array.isArray(it.kunci) ? it.kunci.join(' / ') : it.kunci}</p></details>`}
        <div class="col gap-8"><span class="label">Skor</span>
          ${sk ? html`<div role="radiogroup" aria-label=${`Skor soal ${it.nomor}`} style=${`display:grid;grid-template-columns:repeat(${sk.length},minmax(0,1fr));gap:8px`}>
            ${sk.map((n) => html`<button type="button" aria-pressed=${+v.skor === n && v.skor !== null} class=${cls('btn', +v.skor === n && v.skor !== null ? 'btn-p' : 'btn-o')} style=${`min-height:46px;font-size:16px;${+v.skor === n && v.skor !== null ? 'box-shadow:0 0 0 3px var(--sky-200)' : ''}`}
              onClick=${() => setNilai({ ...nilai, [it.id]: { ...v, skor: n } })}>${n}</button>`)}</div>`
          : html`<input class="input" type="number" min="0" max=${it.skor_maks} step="0.5" style="max-width:160px" value=${v.skor ?? ''} onInput=${(e) => setNilai({ ...nilai, [it.id]: { ...v, skor: e.target.value } })} />`}
        </div>
        <${Field} label="Catatan untuk siswa" hint="opsional"><textarea class="textarea" rows="2" style="min-height:64px" value=${v.catatan || ''} onInput=${(e) => setNilai({ ...nilai, [it.id]: { ...v, catatan: e.target.value } })}></textarea><//>
      </article>`;
    })}
    ${data.items.length > 0 && html`<div class="row wrap" style="justify-content:flex-end;gap:10px">
      <button class="btn btn-o" onClick=${() => simpan(false)}>Simpan</button>
      <button class="btn btn-p" onClick=${() => simpan(true)}>Simpan & Siswa Berikutnya <${Icon} n="arrow-r" s=${18} /></button>
    </div>`}`;
}
