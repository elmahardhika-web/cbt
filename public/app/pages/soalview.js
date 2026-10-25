// Tampilan satu soal untuk siswa (juga dipakai pratinjau guru/supervisor).
import { html, useState, useEffect, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { Rich, pisahSoal } from '../rich.js';

export function SoalView({ soal, jawaban, onChange, readOnly, kunci }) {
  const s = soal;
  const set = (v) => !readOnly && onChange?.(v);
  switch (s.tipe) {
    case 'pilihan_ganda':
      return html`<div role="radiogroup" aria-label="Pilihan jawaban" class="col gap-8" style="gap:10px">
        ${(s.opsi || []).map((o) => {
          const on = jawaban === o.kode;
          const benar = kunci != null && kunci === o.kode;
          return html`<label class=${cls('opsi', on && 'on')} style=${benar ? 'border:2px solid var(--green-500);background:var(--green-50)' : ''}>
            <input type="radio" name=${`q${s.id}`} checked=${on} disabled=${readOnly} onChange=${() => set(o.kode)} />
            <span class="huruf">${o.kode}</span><${Rich} html=${o.teks} class="rich grow" />
            ${benar && html`<${Icon} n="check-circle" class="right" />`}
          </label>`;
        })}</div>`;
    case 'pilihan_ganda_kompleks': {
      const arr = Array.isArray(jawaban) ? jawaban.map(String) : [];
      const kk = Array.isArray(kunci) ? kunci.map(String) : null;
      return html`<div class="col" style="gap:10px">
        <span class="small muted">Pilih semua jawaban yang benar (bisa lebih dari satu).</span>
        ${(s.opsi || []).map((o) => {
          const on = arr.includes(String(o.id));
          const benar = kk?.includes(String(o.id));
          return html`<label class=${cls('opsi', on && 'on')} style=${benar ? 'border:2px solid var(--green-500);background:var(--green-50)' : ''}>
            <input type="checkbox" checked=${on} disabled=${readOnly} onChange=${() => set((prev) => { const a = Array.isArray(prev) ? prev.map(String) : []; return a.includes(String(o.id)) ? a.filter((x) => x !== String(o.id)) : [...a, String(o.id)]; })} />
            <span class="kotak">${on && html`<${Icon} n="check" s=${14} w=${3} />`}</span><${Rich} html=${o.teks} class="rich grow" />
            ${benar && html`<${Icon} n="check-circle" class="right" />`}
          </label>`;
        })}</div>`;
    }
    case 'benar_salah':
      return html`<div class="row wrap" role="radiogroup" aria-label="Benar atau salah">
        ${['Benar', 'Salah'].map((l) => html`<label class=${cls('opsi', jawaban === l && 'on')} style=${`flex:1 1 160px;justify-content:center;${kunci === l ? 'border:2px solid var(--green-500)' : ''}`}>
          <input type="radio" name=${`q${s.id}`} checked=${jawaban === l} disabled=${readOnly} onChange=${() => set(l)} /><span class="huruf">${l[0]}</span>${l}</label>`)}
      </div>`;
    case 'pg_kategori': {
      const v = jawaban && typeof jawaban === 'object' ? jawaban : {};
      const labels = s.opsi?.labels || ['Benar', 'Salah'];
      return html`<div class="table-wrap"><table class="kat-tbl">
        <thead><tr><th style="text-align:left">Pernyataan</th>${labels.map((l) => html`<th>${l}</th>`)}</tr></thead>
        <tbody>${(s.opsi?.items || []).map((it) => html`<tr>
          <td><${Rich} html=${it.pernyataan} class="rich" /></td>
          ${labels.map((l) => {
            const on = v[it.id] === l;
            const benar = kunci && kunci[it.id] === l;
            return html`<td style="text-align:center;width:1%"><button type="button" class=${cls('kat-btn', on && 'on')} aria-pressed=${on} disabled=${readOnly}
              style=${benar ? 'box-shadow:0 0 0 3px var(--green-500)' : ''} onClick=${() => set((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [it.id]: l }))}>${l}</button></td>`;
          })}
        </tr>`)}</tbody></table></div>`;
    }
    case 'menjodohkan': {
      const v = jawaban && typeof jawaban === 'object' ? jawaban : {};
      return html`<div class="col" style="gap:10px">
        <span class="small muted">Pasangkan setiap pernyataan di kiri dengan jawaban yang tepat.</span>
        ${(s.opsi?.premis || []).map((p, i) => html`<div class="opsi" style="cursor:default;flex-wrap:wrap">
          <span class="huruf">${i + 1}</span><${Rich} html=${p.teks} class="rich grow" style="min-width:180px" />
          <select class="select" style="flex:1 1 220px;max-width:100%" value=${v[p.id] || ''} disabled=${readOnly} aria-label=${`Pasangan untuk nomor ${i + 1}`}
            onChange=${(e) => { const val = e.target.value; set((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [p.id]: val })); }}>
            <option value="">— pilih pasangan —</option>
            ${(s.opsi?.respon || []).map((r) => html`<option value=${r.id}>${r.teks.replace(/<[^>]*>/g, '')}</option>`)}
          </select>
          ${kunci && html`<span class="chip green">Kunci: ${(s.opsi.respon.find((r) => r.id === kunci[p.id])?.teks || '').replace(/<[^>]*>/g, '')}</span>`}
        </div>`)}</div>`;
    }
    case 'isian':
      return html`<${TeksJawaban} key=${s.id} value=${jawaban || ''} onChange=${set} readOnly=${readOnly} baris=${1} placeholder="Ketik jawaban singkat" kunci=${kunci} />`;
    case 'uraian':
      return html`<${TeksJawaban} key=${s.id} value=${jawaban || ''} onChange=${set} readOnly=${readOnly} baris=${6} placeholder="Tulis jawabanmu di sini" kunci=${kunci} />`;
    default:
      return html`<p class="muted">Tipe soal tidak dikenal.</p>`;
  }
}

function TeksJawaban({ value, onChange, readOnly, baris, placeholder, kunci }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const Tag = baris > 1 ? 'textarea' : 'input';
  return html`<div class="col">
    <${Tag} class=${baris > 1 ? 'textarea' : 'input'} rows=${baris} value=${v} readOnly=${readOnly} placeholder=${placeholder}
      style="font-size:var(--soal-size)" aria-label="Jawaban" onInput=${(e) => { setV(e.target.value); onChange(e.target.value); }} />
    ${kunci != null && html`<div class="small" style="padding:10px 12px;border-radius:12px;background:var(--green-50);color:var(--green-700)">
      <strong>${baris > 1 ? 'Rubrik: ' : 'Kunci: '}</strong>${Array.isArray(kunci) ? kunci.join(' / ') || '(dikoreksi manual)' : kunci || '–'}</div>`}
  </div>`;
}

/** Kartu soal lengkap untuk pratinjau (pertanyaan + opsi + kunci). */
export function PratinjauSoal({ soal, nomor, tampilkanKunci = true }) {
  const { stimulus, pertanyaan } = pisahSoal(soal.pertanyaan);
  return html`<div class="col" style="gap:14px">
    ${stimulus && html`<${Rich} html=${stimulus} />`}
    <div class="card soal-tanya"><${Rich} html=${pertanyaan} /></div>
    <${SoalView} soal=${soal} jawaban=${null} readOnly=${true} kunci=${tampilkanKunci ? soal.kunci ?? null : null} />
  </div>`;
}
