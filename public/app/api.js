// Klien API + penyimpanan sesi
const KEY = 'tka2026.token';
const listeners = new Set();

function readToken() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export const session = {
  token: readToken(),
  user: null,
  sekolah: null,
  impersonator: null,
  info: null,
};

export function onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => f({ ...session })); }

export function setSession(d) {
  session.token = d.token ?? session.token;
  session.user = d.user ?? null;
  session.sekolah = d.sekolah ?? null;
  session.impersonator = d.impersonator ?? null;
  try {
    if (session.token) localStorage.setItem(KEY, session.token); else localStorage.removeItem(KEY);
  } catch { /* penyimpanan diblokir */ }
  emit();
}

export function clearSession() {
  session.token = null;
  setSession({ token: null });
}

export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export async function api(path, { method = 'GET', body, query, signal, silent401 } = {}) {
  let url = path.startsWith('/') ? path : `/api/${path}`;
  if (query) {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...q].length) url += `?${q}`;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi internet.', 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok || !json?.ok) {
    const msg = json?.error || `Terjadi kesalahan (${res.status}).`;
    if (res.status === 401 && !silent401 && session.token) {
      clearSession();
      location.hash = '#/masuk';
    }
    throw new ApiError(msg, res.status);
  }
  return json.data;
}

export const get = (p, query, opts) => api(p, { ...opts, query });
export const post = (p, body = {}, opts) => api(p, { ...opts, method: 'POST', body });
export const put = (p, body = {}, opts) => api(p, { ...opts, method: 'PUT', body });
export const del = (p, body, opts) => api(p, { ...opts, method: 'DELETE', body });

export async function loadInfo() {
  if (!session.info) session.info = await get('public/info');
  return session.info;
}

export function berandaPeran(peran) {
  return { superadmin: '#/pusat', supervisor: '#/supervisor', admin: '#/admin', guru: '#/guru', siswa: '#/ujian' }[peran] || '#/';
}
