import { useState, useEffect } from './lib.js';

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(q)) };
}

export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const f = () => { setR(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export function go(path, query) {
  const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  location.hash = `#${path}${q ? `?${q}` : ''}`;
}

/** Cocokkan pola '/admin/ujian/:id' → { id } atau null. */
export function match(pattern, path) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  const m = path.match(re);
  return m ? Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) : null;
}

export function openPrint(path, query) {
  const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  window.open(`/#${path}${q ? `?${q}` : ''}`, '_blank');
}
