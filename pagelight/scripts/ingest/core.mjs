// Ingestion core: rate limiter, retry/backoff, normalizer, dedup keys.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimiter {
  constructor(rps = 1) { this.gap = 1000 / rps; this.next = 0; }
  async wait() { const now = Date.now(); const at = Math.max(now, this.next); this.next = at + this.gap; if (at > now) await sleep(at - now); }
}

export async function withRetry(fn, { tries = 4, base = 800, label = '' } = {}) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); } catch (e) {
      err = e; if (e.noRetry) throw e;
      await sleep(base * 2 ** i + Math.random() * 250);
    }
  }
  throw new Error(`${label} failed after ${tries} tries: ${err?.message || err}`);
}

export async function fetchJson(url, limiter, { timeout = 20000 } = {}) {
  return withRetry(async () => {
    await limiter?.wait();
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'PageLightImporter/1.0 (contact: admin)' } });
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.noRetry = true; throw e; }
    return r.json();
  }, { label: url, tries: 5, base: 2500 });
}
export async function fetchText(url, limiter, { timeout = 40000, tries = 5 } = {}) {
  return withRetry(async () => {
    await limiter?.wait();
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'PageLightImporter/1.0 (contact: admin)' } });
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.noRetry = true; throw e; }
    return r.text();
  }, { label: url, tries, base: 2500 });
}

// Run async tasks with bounded concurrency.
export async function pool(items, n, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await worker(items[k], k); } }));
}

export const norm = (s = '') => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// "Austen, Jane" -> "jane austen"
export const normAuthor = (s = '') => norm(s.includes(',') ? s.split(',').slice(1).join(' ') + ' ' + s.split(',')[0] : s);

export const LANGS = { en: 'en', fr: 'fr', ar: 'ar', zh: 'zh' };
