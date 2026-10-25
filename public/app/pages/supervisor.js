import { html, useState, useEffect, fmt, cls, TIPE_LABEL, TIPE_WARNA } from '../lib.js';
import { Icon } from '../icons.js';
import { session, get, post } from '../api.js';
import { Shell } from '../layout.js';
import { Loading, ErrorBox, Empty, Chip, Stat, Field, toast, toastErr, useAsync, PageHead, Bar } from '../ui.js';
import { plain } from '../rich.js';
import { PratinjauSoal } from './soalview.js';
import { BankSoal, useMaster } from './soal.js';
import { Analisis } from './analisis.js';
import { DasborWilayah } from './dasbor.js';
import { Profil360 } from './profil360.js';
import { match } from '../router.js';

export function App({ route }) {
  const p = route.path;
  let page, m;
  if (p === '/supervisor/telaah') page = html`<${Telaah} />`;
  else if (p === '/supervisor/soal') page = html`<${BankSoal} mode="supervisor" base="#/supervisor/soal" />`;
  else if (p === '/supervisor/analisis') page = html`<${Analisis} lingkup="pusat" />`;
  else if (p === '/supervisor/dasbor') page = html`<${DasborWilayah} base="#/supervisor" />`;
  else if ((m = match('/supervisor/sekolah/:npsn/profil', p))) page = html`<${Profil360} key=${m.npsn} npsn=${m.npsn} back="#/supervisor/dasbor" />`;
  else page = html`<${RingkasanTelaah} />`;
  return html`<${Shell} route=${route}>${page}<//>`;
}

export function RingkasanTelaah() {
  const { data: d, error, loading, reload } = useAsync(() => get('telaah/ringkasan'), []);
  if (loading) return html`<${Loading} />`;
  if (error) return html`<${ErrorBox} error=${error} retry=${reload} />`;
  const ps = d.per_status;
  return html`<${PageHead} title="Dashboard Telaah" sub="Kualitas bank soal sebelum dipakai ujian">
      <a class="btn btn-p" href=${session.user.peran === 'superadmin' ? '#/pusat/telaah' : '#/supervisor/telaah'}><${Icon} n="shield" s=${18} />Mulai Telaah${ps.menunggu ? ` (${ps.menunggu})` : ''}</a><//>
    <section class="grid-auto" style="--min:200px">
      <${Stat} icon="clock" tone="amber" value=${fmt.bulat(ps.menunggu || 0)} label="Menunggu telaah" />
      <${Stat} icon="check-circle" tone="green" value=${fmt.bulat(ps.disetujui || 0)} label="Disetujui" />
      <${Stat} icon="message" tone="red" value=${fmt.bulat(ps.revisi || 0)} label="Diminta revisi" />
      <${Stat} icon="edit" tone="slate" value=${fmt.bulat(ps.draf || 0)} label="Draf guru" />
    </section>
    <section class="row wrap" style="gap:20px;align-items:flex-start">
      <div class="card col" style="flex:999 1 520px;gap:0">
        <div class="card-head"><h2>Kesiapan Paket Soal</h2></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Paket</th><th style="min-width:180px">Disetujui</th><th class="r">Menunggu</th><th class="r">Revisi</th><th class="r">Draf</th></tr></thead>
          <tbody>${d.per_mapel.length === 0 && html`<tr><td colspan="5"><${Empty} title="Belum ada soal" /></td></tr>`}
            ${d.per_mapel.map((m) => { const t = m.disetujui + m.menunggu + m.revisi + m.draf; return html`<tr>
              <td><span class="col" style="gap:0"><strong class="strong">${m.nama}</strong><span class="tiny muted">${m.kategori_nama}</span></span></td>
              <td><span class="hbar"><${Bar} value=${t ? (m.disetujui / t) * 100 : 0} tone="green" /><strong class="small num">${m.disetujui}/${t}</strong></span></td>
              <td class="r num">${m.menunggu || '–'}</td><td class="r num">${m.revisi || '–'}</td><td class="r num">${m.draf || '–'}</td></tr>`; })}
          </tbody></table></div>
      </div>
      <div class="card pad col" style="flex:1 1 300px;gap:12px">
        <h2>Per Penulis</h2>
        ${d.per_penulis.length === 0 ? html`<span class="small muted">Belum ada data.</span>` : d.per_penulis.map((p) => html`<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <span class="col grow" style="gap:0"><strong class="small">${p.nama}</strong><span class="tiny muted">${p.total} soal</span></span>
          ${p.menunggu ? html`<${Chip} c="amber">${p.menunggu} menunggu<//>` : ''}${p.revisi ? html`<${Chip} c="red">${p.revisi} revisi<//>` : ''}</div>`)}
      </div>
    </section>`;
}

const CEKLIS = ['Sesuai kisi-kisi & jenjang', 'Bahasa jelas, tidak ambigu', 'Kunci jawaban tepat', 'Pengecoh berfungsi', 'Gambar/rumus tampil benar'];

export function Telaah() {
  const master = useMaster();
  const [mapel, setMapel] = useState('');
  const { data, error, loading, reload } = useAsync(() => get('soal', { status: 'menunggu', mapel }), [mapel]);
  const [aktif, setAktif] = useState(null);
  const [cek, setCek] = useState({});
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  useEffect(() => { if (data && !items.find((s) => s.id === aktif)) setAktif(items[0]?.id ?? null); }, [data]);
  useEffect(() => { setCek({}); setCatatan(''); }, [aktif]);
  const s = items.find((x) => x.id === aktif);
  const putuskan = async (keputusan) => {
    if (keputusan === 'revisi' && !catatan.trim()) {
      const gagal = CEKLIS.filter((_, i) => !cek[i]);
      if (!gagal.length) return toast('Tulis catatan revisi untuk penulis.', 'err');
      setCatatan(`Perlu diperbaiki: ${gagal.join('; ')}.`);
      return toast('Catatan revisi diisi dari ceklis yang belum terpenuhi. Periksa lalu kirim lagi.');
    }
    setBusy(true);
    try {
      await post(`soal/${s.id}/telaah`, { keputusan, catatan });
      toast(keputusan === 'disetujui' ? 'Soal disetujui.' : 'Catatan revisi dikirim ke penulis.');
      const idx = items.findIndex((x) => x.id === s.id);
      setAktif(items[idx + 1]?.id ?? items[idx - 1]?.id ?? null);
      reload(true);
    } catch (e) { toastErr(e); } finally { setBusy(false); }
  };
  return html`<${PageHead} title="Menunggu Telaah" sub=${data ? `${items.length} soal dari ${new Set(items.map((x) => x.penulis_id)).size} penulis` : ''}>
      <select class="select" style="width:auto;min-width:200px" aria-label="Mapel" value=${mapel} onChange=${(e) => setMapel(e.target.value)}><option value="">Semua mapel</option>${master.mapel.map((m) => html`<option value=${m.kode}>${m.nama}</option>`)}</select><//>
    ${loading && !data ? html`<${Loading} />` : error ? html`<${ErrorBox} error=${error} retry=${reload} />` : items.length === 0 ? html`<div class="card"><${Empty} icon="check-circle" title="Tidak ada soal yang menunggu telaah">Semua soal sudah ditelaah.<//></div>` : html`
    <div class="row wrap" style="gap:20px;align-items:flex-start">
      <aside aria-label="Antrean soal" class="col" style="flex:1 1 320px;gap:10px;max-height:80vh;overflow:auto;padding:2px">
        ${items.map((x) => html`<button class="card col" style=${`padding:14px;gap:8px;text-align:left;cursor:pointer;${x.id === aktif ? 'border:2px solid var(--sky-400)' : ''}`} onClick=${() => setAktif(x.id)}>
          <span class="row wrap gap-8"><${Chip} c=${TIPE_WARNA[x.tipe]}>${TIPE_LABEL[x.tipe]}<//><${Chip}>${x.mapel} · ${x.kategori}<//></span>
          <span class="small" style="line-height:1.5;color:var(--body);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${plain(x.pertanyaan)}</span>
          <span class="tiny muted">${x.penulis || '–'} · diajukan ${fmt.relatif(x.diajukan_at)}</span>
        </button>`)}
      </aside>
      ${s && html`<section class="col" style="flex:999 1 560px;min-width:0;gap:16px">
        <article class="card pad col" style="gap:16px">
          <div class="row wrap small muted" style="gap:16px"><span>Penulis <strong style="color:var(--ink)">${s.penulis}</strong></span><span>Paket <strong style="color:var(--ink)">${s.mapel}-${s.kategori}</strong></span>
            <span>Tipe <strong style="color:var(--ink)">${TIPE_LABEL[s.tipe]}</strong></span><span>Skor maks <strong style="color:var(--ink)">${s.skor_maks}</strong></span></div>
          <${PratinjauSoal} soal=${s} />
        </article>
        <div class="row wrap" style="gap:16px;align-items:stretch">
          <fieldset class="card pad col" style="flex:1 1 280px;margin:0;gap:4px">
            <legend class="sr-only">Daftar telaah</legend><strong style="margin-bottom:6px">Daftar Telaah</strong>
            ${CEKLIS.map((c, i) => html`<label class="check"><input type="checkbox" checked=${!!cek[i]} onChange=${(e) => setCek({ ...cek, [i]: e.target.checked })} />${c}</label>`)}
          </fieldset>
          <div class="card pad col" style="flex:1 1 280px">
            <${Field} label="Catatan untuk penulis"><textarea class="textarea" rows="5" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="Wajib diisi bila soal perlu revisi"></textarea><//>
          </div>
        </div>
        <div class="row wrap" style="justify-content:flex-end;gap:10px">
          <button class="btn btn-w" disabled=${busy} onClick=${() => putuskan('revisi')}><${Icon} n="message" s=${18} />Minta Revisi</button>
          <button class="btn btn-p" disabled=${busy} onClick=${() => putuskan('disetujui')}><${Icon} n="check" s=${18} />Setujui Soal</button>
        </div>
      </section>`}
    </div>`}`;
}
