import { authenticate, httpError } from './auth.js';

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
        ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
      };
      if (!r.opts.public) Object.assign(ctx, authenticate(req, r.opts.raw ? ctx.query.token : undefined));
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
