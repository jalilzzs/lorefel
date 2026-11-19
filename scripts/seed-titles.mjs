// Seeds the 100,000 generated titles into Supabase.  Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
import { createClient } from '@supabase/supabase-js'
import { make, synopsis, TOTAL } from '../src/lib/gen.js'

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key)
for (let start = 1; start <= TOTAL; start += 1000) {
  const rows = []
  for (let id = start; id < start + 1000 && id <= TOTAL; id++) {
    const t = make(id)
    rows.push({ id, title: t.title, author: t.author, format: t.format, genres: t.genres, tags: t.tags, warnings: t.warnings, lang: t.lang, status: t.status, year: t.year, rating: t.rating, votes: t.votes, popularity: t.popularity, velocity: t.velocity, chapters_count: t.chapters, mature: t.mature, hue: t.hue, synopsis: synopsis(t) })
  }
  const { error } = await sb.from('titles').upsert(rows)
  if (error) { console.error(error); process.exit(1) }
  console.log(`seeded ${Math.min(start + 999, TOTAL)} / ${TOTAL}`)
}
