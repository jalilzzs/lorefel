// Metadata enrichment (nothing is invented): provider ratings, descriptions, covers and subjects from Open Library (novels) and Jikan/MyAnimeList (manga, manhwa).
// A match requires the NORMALIZED title to be identical (and the author, when both sides have one). Unmatched works are simply left as they are.
import { RateLimiter, fetchJson, norm, normAuthor } from './core.mjs';

export const pickOpenLibrary = (w, docs = []) => docs.find((d) => norm(d.title || '') === w.title_norm
  && (!w.author_norm || (d.author_name || []).some((a) => normAuthor(a) === w.author_norm || norm(a) === w.author_norm))) || null;
export const pickJikan = (w, items = []) => items.find((m) => [m.title, m.title_english, ...(m.titles || []).map((t) => t.title)].filter(Boolean).some((t) => norm(t) === w.title_norm)) || null;
const clean = (s) => (s ? String(s).replace(/\[Written by[^\]]*\]/gi, '').replace(/\(Source:[^)]*\)/gi, '').trim().slice(0, 1500) : null);

async function openLibrary(w, lim) {
  const q = `https://openlibrary.org/search.json?title=${encodeURIComponent(w.title)}&limit=5&fields=key,title,author_name,ratings_average,ratings_count,cover_i,subject`;
  const d = pickOpenLibrary(w, (await fetchJson(q, lim)).docs);
  if (!d) return {};
  const out = {};
  if (d.ratings_average && d.ratings_count > 0) Object.assign(out, { rating: Math.round(d.ratings_average * 100) / 100, rating_count: d.ratings_count, rating_source: 'Open Library' });
  if (!w.cover_url && d.cover_i) out.cover_url = `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`;
  if (!w.subjects?.length && d.subject?.length) out.subjects = d.subject.slice(0, 8);
  if (!w.description) { try { const j = await fetchJson(`https://openlibrary.org${d.key}.json`, lim); const t = typeof j.description === 'string' ? j.description : j.description?.value; if (t) out.description = clean(t); } catch { /* optional */ } }
  return out;
}
async function jikan(w, lim) {
  const m = pickJikan(w, (await fetchJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(w.title)}&limit=5&sfw=true`, lim)).data);
  if (!m) return {};
  const out = {};
  if (m.score && m.scored_by > 0 && !w.provider_rating) Object.assign(out, { rating: Math.round((m.score / 2) * 100) / 100, rating_count: m.scored_by, rating_source: 'MyAnimeList (Jikan)' });
  if (!w.cover_url && m.images?.jpg?.large_image_url) out.cover_url = m.images.jpg.large_image_url;
  if (!w.description && m.synopsis) out.description = clean(m.synopsis);
  return out;
}

export async function enrich(db, limit = 120) {
  const ol = new RateLimiter(1), jk = new RateLimiter(0.4);
  const { data: rows, error } = await db.from('works').select('id,title_id,format,title,title_norm,author_norm,description,cover_url,subjects,provider_rating')
    .eq('readable_status', 'qualified').is('enriched_at', null).order('id').limit(limit);
  if (error) throw error;
  const res = { checked: 0, rated: 0, covers: 0, described: 0, failed: 0 }; let consec = 0;
  for (const w of rows || []) {
    try {
      const f = w.format === 'novel' ? await openLibrary(w, ol) : await jikan(w, jk);
      const wp = { enriched_at: new Date().toISOString() }, tp = {};
      if (f.rating) { Object.assign(wp, { provider_rating: f.rating, provider_rating_count: f.rating_count, provider_rating_source: f.rating_source }); Object.assign(tp, { rating: f.rating, rating_count: f.rating_count }); res.rated++; }
      if (f.cover_url) { wp.cover_url = f.cover_url; tp.cover_url = f.cover_url; res.covers++; }
      if (f.description) { wp.description = f.description; tp.synopsis = f.description; res.described++; }
      if (f.subjects) { wp.subjects = f.subjects; tp.tags = f.subjects; }
      await db.from('works').update(wp).eq('id', w.id);
      if (w.title_id && Object.keys(tp).length) await db.from('titles').update(tp).eq('id', w.title_id);
      res.checked++; consec = 0;
    } catch (e) { res.failed++; if (++consec >= 5) break; }   // not marked as enriched: retried next cycle
  }
  return res;
}

if (process.argv[1]?.endsWith('enrich.mjs')) {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const arg = (process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1];
  const r = await enrich(db, Number(arg || process.env.ENRICH_BATCH || 120));
  console.log('ENRICH', JSON.stringify(r));
  await db.from('import_logs').insert({ level: 'info', message: 'enrich', detail: r }).then(() => {}, () => {});
}
