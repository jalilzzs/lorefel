// Multi-source novel importer (metadata only: no chapter text is written to the database). One cycle = a quota of works spread over languages (Arabic first) and sources.
// A source that errors out is SKIPPED for the cycle (logged, flagged in content_sources); the others continue.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CYCLE_TARGET=400, CYCLE_MAX_MIN=90, WORKER_LANGS=ar,fr,zh,en, SOURCES=wikisource,archive,gutendex,openfiction
import { createClient } from '@supabase/supabase-js';
import { RateLimiter, pool, withRetry } from './core.mjs';
import * as wikisource from './wikisource.mjs';
import * as archive from './archive.mjs';
import * as gutenberg from './gutenberg-adapter.mjs';
import * as openfiction from './openfiction.mjs';
import { uploadCover, backfillCovers } from './covers.mjs';

const ALL = { wikisource, archive, gutendex: gutenberg, openfiction };
const TARGET = Number(process.env.CYCLE_TARGET || 400), MAX_MIN = Number(process.env.CYCLE_MAX_MIN || 90);
const LANGS = (process.env.WORKER_LANGS || 'ar,en,fr,zh').split(',').map((s) => s.trim()).filter(Boolean);
const SRC = (process.env.SOURCES || 'wikisource,archive,gutendex,openfiction').split(',').map((s) => s.trim()).filter((s) => ALL[s]);
const WEIGHT = { ar: 0.4, fr: 0.2, zh: 0.15, en: 0.25 };
const deadline = Date.now() + MAX_MIN * 60000;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const limiters = {}; const lim = (a) => (limiters[a.id] ||= new RateLimiter(a.rps));
const campaignOf = (a, lang) => (a.id === 'gutendex' ? (lang === 'en' ? 'INITIAL_NOVEL_LIBRARY_10000' : `NOVEL_LIBRARY_${lang.toUpperCase()}`) : `${a.id.toUpperCase()}_${lang.toUpperCase()}`);

async function getJob(a, lang) {
  const campaign = campaignOf(a, lang);
  const { data } = await db.from('import_jobs').select('*').eq('campaign', campaign).eq('source_id', a.id).order('id', { ascending: false }).limit(1);
  if (data?.[0]) return data[0];
  const { data: j, error } = await db.from('import_jobs').insert({ campaign, source_id: a.id, status: 'running', started_at: new Date().toISOString(), cursor: {} }).select().single();
  if (error) throw error; return j;
}
const log = (job, level, ext, message, detail) => db.from('import_logs').insert({ job_id: job?.id ?? null, level, external_id: ext, message: String(message).slice(0, 500), detail }).then(() => {}, () => {});

// NOTHING of the text is stored: the chapter was fetched only to VERIFY it is readable; we keep the list (number, name, word/paragraph counts, source ref).
async function send(a, r, chs) {
  const list = chs.map((c) => ({ number: c.number, name: c.name, words: c.words, paragraph_count: c.paragraphs.length, split_method: c.split_method, ref: c.ref || null }));
  return withRetry(async () => {
    const { data, error } = await db.rpc('import_work', { p: { ...r, raw_meta: { source: a.id, ocr: a.id === 'archive' ? (r.ocr || true) : false }, chapters: list } });
    if (error) throw error; return data;
  }, { tries: 4, base: 1500, label: 'rpc' });
}

async function runSource(a, lang, want) {
  const s = { source: a.id, lang, want, found: 0, imported: 0, chapters: 0, paragraphs: 0, skipped: {}, failed: 0, status: 'ok', error: null };
  const skip = (why) => { s.skipped[why] = (s.skipped[why] || 0) + 1; };
  const job = await getJob(a, lang);
  if (job.status === 'done') { s.status = 'exhausted'; return s; }
  let cursor = job.cursor && Object.keys(job.cursor).length ? job.cursor : {}, attempts = 0, consecFail = 0;   // {} = start of the source
  const maxAttempts = want * 5;
  try {
    while (s.imported < want && attempts < maxAttempts && Date.now() < deadline) {
      const page = await a.list(lang, Object.keys(cursor).length ? cursor : null, lim(a));
      if (!page.items.length && !page.next) { await db.from('import_jobs').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', job.id); s.status = 'exhausted'; break; }
      s.found += page.items.length;
      let pageDone = true;
      await pool(page.items, 2, async (r) => {
        if (s.imported >= want || Date.now() >= deadline || consecFail >= 8) { pageDone = false; return; }
        attempts++;
        try {
          const why = a.qualify(r); if (why) return skip(why);
          const { data: ex } = await db.from('work_sources').select('id').eq('source_id', a.id).eq('external_id', r.external_id).limit(1);
          if (ex?.length) return skip('already_imported');
          const chs = (await a.chapters(r, lim(a))).map((c) => ({ ...c, words: c.paragraphs.join(' ').split(/\s+/).filter(Boolean).length }));
          const words = chs.reduce((n, c) => n + c.words, 0);
          if (!chs.length || words < a.minWords) return skip('too_short_or_empty');
          if (a.cover) { try { const img = await a.cover(r, lim(a)); if (img) r.cover_url = await uploadCover(db, a.id, r.external_id, img); } catch { /* generated poster is used */ } }
          const res = await send(a, r, chs);
          if (res.status === 'imported') { s.imported++; s.chapters += res.chapters; s.paragraphs += res.paragraphs; consecFail = 0; await log(job, 'info', r.external_id, 'imported', res); }
          else skip(res.status === 'duplicate' ? 'duplicate_work' : res.reason || res.status);
        } catch (e) {
          if (e.skip) return skip(e.message);
          s.failed++; consecFail++; await log(job, 'error', r.external_id, e.message || e);
        }
      });
      if (consecFail >= 8) throw new Error(`source unhealthy: ${consecFail} consecutive failures`);
      const finished = pageDone && page.next === null;     // exhausted only when the LAST page was fully processed
      if (pageDone && !finished) cursor = page.next;       // advance only past fully processed pages
      await db.from('import_jobs').update({ cursor, status: finished ? 'done' : 'running', discovered: job.discovered + s.found, qualified: job.qualified + s.imported,
        chapters_imported: job.chapters_imported + s.chapters, paragraphs_imported: job.paragraphs_imported + s.paragraphs, failed: job.failed + s.failed, heartbeat_at: new Date().toISOString() }).eq('id', job.id);
      if (finished) { s.status = 'exhausted'; break; }
    }
    await db.from('content_sources').update({ last_tested_at: new Date().toISOString(), last_test_ok: true, last_error: null }).eq('id', a.id);
  } catch (e) {
    s.status = 'SKIPPED'; s.error = String(e.message || e).slice(0, 200);       // source failed: skip it, keep going
    await log(job, 'warn', null, `source skipped: ${s.error}`);
    await db.from('content_sources').update({ last_tested_at: new Date().toISOString(), last_test_ok: false, last_error: s.error }).eq('id', a.id);
  }
  return s;
}

const wsum = LANGS.reduce((n, l) => n + (WEIGHT[l] || 0.1), 0);
const report = []; let carry = 0;
for (const lang of LANGS) {
  let left = Math.round((TARGET * (WEIGHT[lang] || 0.1)) / wsum) + carry; carry = 0;
  for (let i = 0; i < SRC.length; i++) {
    if (left <= 0 || Date.now() >= deadline) break;
    const want = Math.ceil(left / (SRC.length - i));
    const s = await runSource(ALL[SRC[i]], lang, want); report.push(s); left -= s.imported;
    console.log(JSON.stringify(s));
  }
  carry = Math.max(0, left);       // unmet quota rolls to the next language (so the cycle still approaches the target)
}
let covers = null; try { covers = await backfillCovers(db, Number(process.env.COVER_BACKFILL || 150)); console.log('COVERS', JSON.stringify(covers)); } catch (e) { console.log('covers skipped:', e.message); }
const tot = report.reduce((t, s) => ({ imported: t.imported + s.imported, chapters: t.chapters + s.chapters, paragraphs: t.paragraphs + s.paragraphs, failed: t.failed + s.failed }), { imported: 0, chapters: 0, paragraphs: 0, failed: 0 });
console.log('CYCLE SUMMARY', JSON.stringify({ target: TARGET, ...tot, skippedSources: report.filter((s) => s.status === 'SKIPPED').map((s) => `${s.source}/${s.lang}`) }));
await log(null, 'info', null, 'cycle summary', { target: TARGET, ...tot, covers, report });
