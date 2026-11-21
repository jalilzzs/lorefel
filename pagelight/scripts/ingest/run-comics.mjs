// Usage: node scripts/ingest/run-comics.mjs [--limit=20] [--chapters=5]   (service-role key, worker-side only)
import { createClient } from '@supabase/supabase-js';
import { RateLimiter, fetchJson } from './core.mjs';
import { listUrl, toRecord, fetchChapters, SOURCE_ID } from './mangadex.mjs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const LIMIT = Number(arg('limit', 20)), CH = Number(arg('chapters', 5)), CAMPAIGN = 'COMIC_LIBRARY_MANGADEX';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const lim = new RateLimiter(0.5);
let { data: job } = await db.from('import_jobs').select('*').eq('campaign', CAMPAIGN).in('status', ['queued', 'running', 'paused']).order('id', { ascending: false }).limit(1).maybeSingle();
if (!job) ({ data: job } = await db.from('import_jobs').insert({ campaign: CAMPAIGN, source_id: SOURCE_ID, status: 'running', started_at: new Date().toISOString(), cursor: { offset: 0 } }).select().single());
const c = { discovered: job.discovered, verified: job.verified, qualified: job.qualified, chapters_imported: job.chapters_imported, paragraphs_imported: 0, failed: job.failed, skipped: job.skipped };
let offset = job.cursor?.offset || 0, done = 0, more = true;
while (more && done < LIMIT) {
  const page = await fetchJson(listUrl(offset), lim);
  more = (page.data || []).length === 50; offset += 50;
  for (const m of page.data || []) {
    if (done >= LIMIT) break; c.discovered++;
    const r = toRecord(m); if (!r.format || !r.title) { c.skipped++; continue; }
    c.verified++; done++;
    try {
      const chapters = await fetchChapters(r, lim, { max: CH });
      const { data, error } = await db.rpc('import_comic', { p: { ...r, chapters } });
      if (error) throw error;
      if (data.status === 'imported') { c.qualified++; c.chapters_imported += data.chapters; } else c.skipped++;
      await db.from('import_logs').insert({ job_id: job.id, external_id: r.external_id, message: data.status, detail: data });
    } catch (e) { c.failed++; await db.from('import_logs').insert({ job_id: job.id, level: 'error', external_id: r.external_id, message: String(e.message || e) }); }
  }
  await db.from('import_jobs').update({ ...c, cursor: { offset }, status: more ? 'running' : 'done', heartbeat_at: new Date().toISOString() }).eq('id', job.id);
  console.log(JSON.stringify({ job: job.id, ...c }));
}
