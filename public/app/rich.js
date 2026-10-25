import { html, useRef, useEffect, loadScript } from './lib.js';

// Hanya tag & atribut aman yang dipertahankan dari isi soal (mencegah skrip disisipkan).
const TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  'IMG', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'FIGURE', 'FIGCAPTION', 'CENTER', 'FONT', 'A']);
const STYLE_OK = /^(text-align|font-weight|font-style|text-decoration|vertical-align|width|height|max-width|border|border-collapse|padding|margin-left|list-style-type)$/i;

function cleanNode(node) {
  for (const el of [...node.children]) {
    if (!TAGS.has(el.tagName)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH'].includes(el.tagName)) { el.remove(); continue; }
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n === 'style') {
        const kept = a.value.split(';').map((d) => d.trim()).filter((d) => {
          const [p, v = ''] = d.split(':');
          return p && STYLE_OK.test(p.trim()) && !/url\(|expression/i.test(v);
        });
        if (kept.length) el.setAttribute('style', kept.join(';')); else el.removeAttribute('style');
      } else if (n === 'src' && el.tagName === 'IMG') {
        if (!/^(https?:|\/uploads\/|data:image\/(png|jpe?g|gif|webp);)/i.test(a.value.trim())) el.removeAttribute('src');
      } else if (n === 'href' && el.tagName === 'A') {
        if (!/^https?:/i.test(a.value.trim())) el.removeAttribute('href'); else { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      } else if (!['colspan', 'rowspan', 'alt', 'width', 'height', 'align', 'target', 'rel'].includes(n)) {
        el.removeAttribute(a.name);
      }
    }
    if (el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
    cleanNode(el);
  }
}

export function sanitize(htmlStr) {
  const doc = new DOMParser().parseFromString(`<div>${String(htmlStr ?? '')}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  cleanNode(root);
  return root.innerHTML;
}

export const plain = (h) => {
  const d = new DOMParser().parseFromString(String(h ?? ''), 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
};

let katexReady = null;
export function ensureKatex() {
  if (!katexReady) katexReady = loadScript('/vendor/katex/katex.min.js').then(() => loadScript('/vendor/katex/auto-render.min.js'));
  return katexReady;
}
export async function renderMath(el) {
  if (!el || !/[$\\]/.test(el.textContent)) return;
  try {
    await ensureKatex();
    window.renderMathInElement(el, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }],
      throwOnError: false,
    });
  } catch { /* biarkan teks apa adanya */ }
}

/** Tampilkan HTML soal yang sudah disaring + rumus matematika. */
export function Rich({ html: h, class: c = 'rich', style }) {
  const ref = useRef();
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = sanitize(h);
    renderMath(ref.current);
  }, [h]);
  return html`<div class=${c} style=${style} ref=${ref}></div>`;
}

// ---------- stimulus (bacaan/ilustrasi) vs pertanyaan ----------
// Soal disimpan sebagai satu HTML: bacaan lalu <div class="soal-text-2">pertanyaan</div> (format paket soal lama).
const tanpaIsi = (h) => !String(h || '').replace(/<(img|table|svg|iframe)\b/gi, 'X').replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').trim();

function rapikanUjung(root) {
  // buang <br>, spasi, dan elemen kosong di akhir bacaan
  for (let n = root.lastChild; n; n = root.lastChild) {
    const kosong = n.nodeType === 3 ? !n.textContent.trim() : n.nodeType === 1 && (n.tagName === 'BR' || (tanpaIsi(n.outerHTML) && !n.querySelector?.('img,table')));
    if (!kosong) break;
    n.remove();
  }
}

/** Pisahkan isi soal menjadi { stimulus, pertanyaan }. Soal tanpa bacaan → stimulus kosong. */
export function pisahSoal(src) {
  const raw = String(src ?? '');
  if (!/class=["'][^"']*soal-text-2/.test(raw)) return { stimulus: '', pertanyaan: raw };
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const q = root.querySelector('.soal-text-2');
  const tanya = q.innerHTML;
  q.remove();
  rapikanUjung(root);
  const bacaan = root.innerHTML;
  if (tanpaIsi(tanya)) return { stimulus: '', pertanyaan: bacaan };
  if (tanpaIsi(bacaan)) return { stimulus: '', pertanyaan: tanya };
  return { stimulus: bacaan, pertanyaan: tanya };
}

/** Gabungkan kembali stimulus + pertanyaan menjadi satu HTML untuk disimpan. */
export const gabungSoal = (stimulus, pertanyaan) => (tanpaIsi(stimulus) ? String(pertanyaan || '') : `${stimulus}<div class="soal-text-2">${pertanyaan || ''}</div>`);
export const isiKosong = tanpaIsi;
