// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ingest/run-novels.mjs [--limit=50] [--lang=en] [--campaign=INITIAL_NOVEL_LIBRARY_10000]
// Resumable: cursor (next Gutendex page URL) + counters are checkpointed in import_jobs after every page.
import { createClient } from '@supabase/supabase-js';
import { RateLimiter, pool, withRetry } from './core.mjs';
import { firstPageUrl, listPage, qualifyMeta, fetchChapters, SOURCE_ID } from './gutendex.mjs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const LIMIT = Number(arg('limit', 50)), LANG = arg('lang', 'en'), CAMPAIGN = arg('campaign', 'INITIAL_NOVEL_LIBRARY_10000');
const CONC = Number(arg('concurrency', 2));
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (worker-side only).'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const limiter = new RateLimiter(0.5);

async function getJob() {
  const { data } = await db.from('import_jobs').select('*').eq('campaign', CAMPAIGN).eq('source_id', SOURCE_ID)
    .in('status', ['queued', 'running', 'paused']).order('id', { ascending: false }).limit(1);
  if (data?.[0]) return data[0];
  const { data: j, error } = await db.from('import_jobs').insert({ campaign: CAMPAIGN, source_id: SOURCE_ID, status: 'running', target: 10000, started_at: new Date().toISOString(), cursor: { next: `${firstPageUrl(LANG)}` } }).select().single();
  if (error) throw error; return j;
}
const log = (job, level, external_id, message, detail) => db.from('import_logs').insert({ job_id: job.id, level, external_id, message, detail });

const job = await getJob();
const c = { discovered: job.discovered, verified: job.verified, qualified: job.qualified, chapters_imported: job.chapters_imported, paragraphs_imported: job.paragraphs_imported, failed: job.failed, skipped: job.skipped };
let next = job.cursor?.next || firstPageUrl(LANG), processed = 0;

while (next && processed < LIMIT) {
  const page = await listPage(next, limiter);
  c.discovered += page.items.length;
  const todo = [];
  for (const r of page.items) { const why = qualifyMeta(r); if (why) { c.skipped++; await log(job, 'info', r.external_id, `skipped: ${why}`); } else { c.verified++; todo.push(r); } }
  await pool(todo.slice(0, LIMIT - processed), CONC, async (r) => {
    try {
      const chapters = (await fetchChapters(r, limiter)).map((ch) => ({ ...ch, words: ch.paragraphs.join(' ').split(/\s+/).length }));
      // Send in batches (<= ~300k chars each) so large books never hit gateway size/time limits (502/413).
      const groups = []; let cur = [], size = 0;
      for (const ch of chapters) { const sz = ch.paragraphs.reduce((n, x) => n + x.length, 0); if (cur.length && size + sz > 300000) { groups.push(cur); cur = []; size = 0; } cur.push(ch); size += sz; }
      if (cur.length) groups.push(cur);
      let data = null, chTotal = 0, paTotal = 0;
      for (let g = 0; g < groups.length; g++) {
        const res = await withRetry(async () => { const { data: d, error } = await db.rpc('import_work', { p: { ...r, license: 'Public domain in the USA (Project Gutenberg)', raw_meta: { downloads: r.downloads }, chapters: groups[g], append: g > 0, final: g === groups.length - 1 } }); if (error) throw error; return d; }, { tries: 4, base: 1500, label: 'rpc' });
        if (res.status !== 'imported') { data = res; break; }
        chTotal += res.chapters; paTotal += res.paragraphs; data = { ...res, chapters: chTotal, paragraphs: paTotal };
      }
      if (!data) data = { status: 'rejected', reason: 'no_chapters' };
      if (data.status === 'imported') { c.qualified++; c.chapters_imported += data.chapters; c.paragraphs_imported += data.paragraphs; }
      else c.skipped++;
      await log(job, 'info', r.external_id, data.status, data);
    } catch (e) { c.failed++; await log(job, 'error', r.external_id, String(e.message || e)); }
    processed++;
  });
  next = page.next;
  await db.from('import_jobs').update({ ...c, cursor: { next }, status: next ? 'running' : 'done', heartbeat_at: new Date().toISOString(), finished_at: next ? null : new Date().toISOString() }).eq('id', job.id);
  console.log(JSON.stringify({ job: job.id, ...c, remaining: Math.max(0, 10000 - c.qualified) }));
}
