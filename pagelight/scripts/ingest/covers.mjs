// Real covers: re-host Gutenberg covers from mirrors into the `covers` bucket; backfill works that have no (usable) cover.
import { RateLimiter } from './core.mjs';
import { cover as gutCover } from './gutenberg-adapter.mjs';
import { pageImages } from './wikisource.mjs';

export async function uploadCover(db, source, extId, { buf, type }) {
  const path = `${source}/${String(extId).replace(/[^\w.-]+/g, '_')}.jpg`;
  const { error } = await db.storage.from('covers').upload(path, buf, { contentType: type, upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return db.storage.from('covers').getPublicUrl(path).data.publicUrl;
}

/** Fill covers for already-imported works. Safe to run repeatedly; limited per call to protect free tiers. */
export async function backfillCovers(db, limit = 60) {
  const lim = new RateLimiter(1);
  const { data: rows } = await db.from('works').select('id,title_id,title,language,cover_url,work_sources(source_id,external_id)')
    .or('cover_url.is.null,cover_url.like.*gutenberg.org*').eq('readable_status', 'qualified').limit(limit);
  let done = 0, miss = 0;
  for (const w of rows || []) {
    const ws = w.work_sources?.[0]; if (!ws) continue;
    let url = null;
    try {
      if (ws.source_id === 'archive') url = `https://archive.org/services/img/${ws.external_id}`;
      else if (ws.source_id === 'gutendex') { const img = await gutCover({ external_id: ws.external_id }, lim); if (img) url = await uploadCover(db, 'gutendex', ws.external_id, img); }
      else if (ws.source_id === 'wikisource') { const [lang, ...t] = ws.external_id.split(':'); const title = t.join(':'); url = (await pageImages(lang, [title], lim))[title] || null; }
    } catch { url = null; }
    if (url) { await db.from('works').update({ cover_url: url }).eq('id', w.id); if (w.title_id) await db.from('titles').update({ cover_url: url }).eq('id', w.title_id); done++; }
    else { miss++; /* '' = checked, none available (not retried) */ if (w.cover_url !== '') { await db.from('works').update({ cover_url: '' }).eq('id', w.id); if (w.title_id) await db.from('titles').update({ cover_url: null }).eq('id', w.title_id); } }
  }
  return { checked: (rows || []).length, covered: done, noCover: miss };
}

if (process.argv[1]?.endsWith('covers.mjs')) {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  console.log(JSON.stringify(await backfillCovers(db, Number(process.argv[2] || 200))));
}
