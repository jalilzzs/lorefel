// On-demand chapter reader. NOTHING is persisted: text/pages are fetched from the original source when a person opens a chapter,
// then kept only in a small in-memory cache (bounded by bytes + TTL) so repeat reads do not hit the source again.
import { RateLimiter } from './core.mjs';
import * as wikisource from './wikisource.mjs';
import * as archive from './archive.mjs';
import * as gutenberg from './gutenberg-adapter.mjs';
import * as mangadex from './mangadex.mjs';

const MAX_BYTES = Number(process.env.READER_CACHE_MB || 64) * 1048576;
const TTL = Number(process.env.READER_CACHE_MIN || 30) * 60000;
const cache = new Map();      // key -> { at, ttl, size, value }
const inflight = new Map();   // key -> Promise (collapse concurrent requests for the same book/chapter)
let total = 0;

export const cacheStats = () => ({ entries: cache.size, mb: Math.round(total / 1048576 * 10) / 10 });
function put(key, value, size, ttl) {
  const old = cache.get(key); if (old) total -= old.size;
  cache.set(key, { at: Date.now(), ttl: typeof ttl === 'function' ? ttl(value) : ttl, size, value }); total += size;
  for (const [k, v] of cache) {       // Map keeps insertion order: evict oldest first
    if (total <= MAX_BYTES && Date.now() - v.at < v.ttl) break;
    if (k !== key) { cache.delete(k); total -= v.size; }
  }
}
export async function cached(key, fn, { ttl = TTL, sizeOf = () => 2000 } = {}) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) { cache.delete(key); cache.set(key, hit); return hit.value; }   // refresh LRU position
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => { const v = await fn(); put(key, v, sizeOf(v), ttl); return v; })().finally(() => inflight.delete(key));
  inflight.set(key, p); return p;
}

const limiters = {};
const lim = (id) => (limiters[id] ||= new RateLimiter({ mangadex: 2, wikisource: 3 }[id] || 1));
const BOOK = { gutendex: gutenberg, archive };
const bookSize = (chs) => chs.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + p.length * 2, 0), 0);

/** Returns { n, name, paras } | { n, name, pages } | null (chapter unknown). Throws on source failure. */
export async function readChapter(db, titleId, number, version = 'official') {
  return cached(`c:${titleId}:${number}:${version}`, async () => {
    const { data: ch, error } = await db.from('chapters').select('id,name,number,is_real,source_id,ref,work_id').eq('title_id', titleId).eq('number', number).eq('version', version).maybeSingle();
    if (error) throw error;
    if (!ch || !ch.is_real || !ch.work_id) return null;
    const { data: w, error: e2 } = await db.from('works').select('language,work_sources(source_id,external_id)').eq('id', ch.work_id).maybeSingle();
    if (e2) throw e2;
    const ws = (w?.work_sources || []).find((x) => x.source_id === ch.source_id);
    if (!ws) return null;
    const base = { n: number, name: ch.name };
    if (ch.source_id === 'mangadex') {
      if (!ch.ref?.u) return null;
      const pages = await mangadex.readPages(ch.ref.u, lim('mangadex'));
      return pages.length ? { ...base, pages } : null;      // at-home URLs expire: short cache (see ttl below)
    }
    if (ch.source_id === 'wikisource') {
      const r = wikisource.recordFromSource(ws, w.language);
      const { paragraphs } = await wikisource.readChapter(r, ch, lim('wikisource'));
      return paragraphs.length ? { ...base, paras: paragraphs } : null;
    }
    const ad = BOOK[ch.source_id]; if (!ad) return null;
    const r = ad.recordFromSource(ws, w.language);
    const book = await cached(`b:${ch.source_id}:${ws.external_id}`, () => ad.readBook(r, lim(ch.source_id)), { sizeOf: bookSize });
    const c = book.find((x) => x.number === number);
    return c ? { ...base, paras: c.paragraphs } : null;
  }, { sizeOf: (v) => (v ? (v.paras ? v.paras.reduce((n, p) => n + p.length * 2, 0) : 4000) : 200), ttl: (v) => (!v ? 60000 : v.pages ? 5 * 60000 : TTL) });
}
