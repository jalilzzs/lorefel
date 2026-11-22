// Reader API: GET /api/chapter?title=<titles.id>&n=<chapter number>&v=official  ->  { n, name, paras } | { n, name, pages }
// Runs inside the Railway worker service (see worker.mjs) or standalone: node scripts/reader-api.mjs
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server side only), PORT, READER_ORIGINS (default *), READER_RPM (default 90 per IP), READER_CACHE_MB, READER_CACHE_MIN
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { readChapter, cacheStats } from './ingest/reader.mjs';

const RPM = Number(process.env.READER_RPM || 90);
const hits = new Map();
const limited = (ip) => { const now = Date.now(); let h = hits.get(ip); if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(ip, h); } return ++h.n > RPM; };
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, 60000).unref();

export function startReaderServer(port = Number(process.env.PORT || 8080)) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const send = (res, code, body, extra = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': process.env.READER_ORIGINS || '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', ...extra });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (u.pathname === '/health') return send(res, 200, { ok: true, cache: cacheStats() });
      if (u.pathname !== '/api/chapter' || req.method !== 'GET') return send(res, 404, { error: 'not_found' });
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip)) return send(res, 429, { error: 'rate_limited' }, { 'Retry-After': '30' });
      const title = Number(u.searchParams.get('title')), n = Number(u.searchParams.get('n')), v = (u.searchParams.get('v') || 'official').slice(0, 40);
      if (!Number.isInteger(title) || !Number.isInteger(n) || title < 1 || n < 1) return send(res, 400, { error: 'bad_params' });
      const out = await readChapter(db, title, n, v);
      if (!out) return send(res, 404, { error: 'chapter_not_found' }, { 'Cache-Control': 'public, max-age=60' });
      const body = out;
      return send(res, 200, body, { 'Cache-Control': `public, max-age=${body.pages ? 120 : 1800}` });
    } catch (e) {
      console.error('[reader]', e.message || e);
      return send(res, 502, { error: 'source_unavailable' });
    }
  });
  server.listen(port, () => console.log(`reader API listening on :${port}`));
  return server;
}
if (process.argv[1]?.endsWith('reader-api.mjs')) startReaderServer();
