import { authenticate, httpError, readToken } from './auth.js';
import { catatLaju } from './redis.js';

const routes = [];

/** Daftarkan rute. opts.public = tanpa login. */
export function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, opts });
}

async function readBody(req, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, 'Data terlalu besar.');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Format data tidak valid.');
  }
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// batas umum: per akun yang masuk (siswa satu sekolah sering berbagi satu IP) dan per IP untuk akses tanpa login
const RL_USER = Number(process.env.RL_USER || 240);   // permintaan / menit / akun
const RL_IP = Number(process.env.RL_IP || 120);       // permintaan / menit / IP untuk API publik

const ipDari = (req) => (process.env.TRUST_PROXY === '0' ? null : req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

async function batasUmum(req, res, r, ip, url) {
  const h = req.headers.authorization || '';
  const tok = readToken(h.startsWith('Bearer ') ? h.slice(7) : r.opts.raw ? url.searchParams.get('token') : '');
  const kunci = tok ? `u:${tok.uid}` : `ip:${ip}`;
  const maks = tok ? RL_USER : RL_IP;
  const x = await catatLaju(kunci, maks, 60);
  res.setHeader('X-RateLimit-Limit', maks);
  res.setHeader('X-RateLimit-Remaining', x.sisa);
  if (!x.izin) {
    res.setHeader('Retry-After', x.ulangDalam);
    throw httpError(429, `Terlalu banyak permintaan. Tunggu ${x.ulangDalam} detik lalu coba lagi.`);
  }
}

export async function handleApi(req, res, url) {
  const path = url.pathname.replace(/\/+$/, '');
  let methodMatched = false;
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    methodMatched = true;
    if (r.method !== req.method) continue;
    try {
      const ctx = {
        req,
        url,
        params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])),
        query: Object.fromEntries(url.searchParams),
        body: !r.opts.bodyRaw && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req, r.opts.limit) : {},
        ip: ipDari(req),
      };
      if (!r.opts.noLimit) await batasUmum(req, res, r, ctx.ip, url);
      if (!r.opts.public) Object.assign(ctx, await authenticate(req, r.opts.raw ? ctx.query.token : undefined));
      if (r.opts.raw) { await r.handler(ctx, res); return; } // handler menulis respons sendiri (mis. SSE, unduhan)
      const data = await r.handler(ctx);
      return send(res, 200, { ok: true, data: data ?? null });
    } catch (e) {
      if (!e.status) console.error(new Date().toISOString(), req.method, path, e);
      return send(res, e.status || 500, { ok: false, error: e.status ? e.message : 'Terjadi kesalahan di server.' });
    }
  }
  send(res, methodMatched ? 405 : 404, { ok: false, error: 'Alamat API tidak ditemukan.' });
}
