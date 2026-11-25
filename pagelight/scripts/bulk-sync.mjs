import { createClient } from '@supabase/supabase-js'
import { FAST_SOURCE_IDS, fetchFromSource } from '../src/lib/sources.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Equal targets keep novels, manga and manhwa growing at the same pace.
// Override any target independently through the existing environment variables.
const QUOTAS = {
  manga: Number(process.env.QUOTA_MANGA || 400),
  manhwa: Number(process.env.QUOTA_MANHWA || 400),
  novel: Number(process.env.QUOTA_NOVEL || 400),
}
const PAGE_LIMIT = Math.max(4, Number(process.env.BULK_SYNC_PAGES || 10))
const INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 0) // 0 = run once & exit

// Entertainment-first discovery terms. Historical/educational terms are intentionally
// excluded from discovery without changing any source connector or scraping implementation.
const DISCOVERY_KEYWORDS = [
  'fantasy', 'dark romance', 'romance', 'romantic comedy', 'action', 'adventure',
  'mystery', 'thriller', 'supernatural', 'comedy', 'horror', 'science fiction',
  'isekai', 'reincarnation', 'regression', 'revenge', 'magic', 'dungeon',
  'system', 'cultivation', 'martial arts', 'psychological', 'paranormal',
  'monster', 'vampire', 'werewolf', 'academy', 'tower', 'survival',
]

const ALLOWED_GENRES = new Set([
  'fantasy', 'romance', 'action', 'adventure', 'mystery', 'thriller', 'scifi',
  'comedy', 'horror', 'supernatural', 'wuxia', 'xianxia', 'litrpg',
  'psychological', 'isekai', 'mecha', 'school', 'revenge', 'darkromance',
  'paranormal', 'martialarts', 'regression', 'reincarnation', 'cultivation',
])
const BLOCKED_GENRES = new Set([
  'historical', 'history', 'education', 'educational', 'academic', 'textbook',
  'nonfiction', 'biography', 'politics', 'political', 'scienceeducation',
  'reference', 'study', 'textbooks',
])
const BLOCKED_TEXT = /\b(textbook|text book|educational|academic|study guide|course material|historical nonfiction|biography|autobiography|encyclopedia|political science|nonfiction)\b/i

function normalizedGenre(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '')
}

function isEntertainmentItem(item, discoveryKeyword) {
  const genres = (Array.isArray(item.genres) ? item.genres : []).map(normalizedGenre).filter(Boolean)
  const text = `${item.title || ''} ${item.synopsis || ''}`
  if (BLOCKED_TEXT.test(text)) return false
  if (genres.some((genre) => BLOCKED_GENRES.has(genre) && !['historical', 'history'].includes(genre))) return false

  // A historical setting/tag does not disqualify a work when it is also clearly
  // tagged with one of the requested entertainment genres.
  const positiveGenre = genres.some((genre) => ALLOWED_GENRES.has(genre))
  if ((genres.includes('historical') || genres.includes('history')) && !positiveGenre) return false
  const positiveQuery = DISCOVERY_KEYWORDS.some((keyword) => keyword === discoveryKeyword)
  return positiveGenre || positiveQuery
}

function toDbRow(item) {
  const tags = [...(item.tags || []), ...(item.source ? [`src:${item.source}`] : [])]
  return {
    title: item.title,
    author: item.author || 'Unknown',
    format: item.format,
    status: item.status || 'ongoing',
    year: Number(item.year) || null,
    chapter_count: Number(item.chapters) || 0,
    language: item.lang || 'en',
    genres: Array.isArray(item.genres) && item.genres.length ? item.genres : ['fantasy'],
    tags,
    synopsis: item.synopsis || '',
    cover_url: item.cover || null,
    is_mature: !!item.mature,
    rating: 0,
    rating_count: 0,
  }
}

async function flushBatch(rows) {
  if (!rows.length) return 0
  const batchSize = 150
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const { data, error } = await supabase.from('titles').upsert(chunk, { onConflict: 'external_source,external_id', ignoreDuplicates: true }).select('id')
    if (!error) {
      inserted += data?.length || 0
    } else {
      for (const single of chunk) {
        const { error: oneErr } = await supabase.from('titles').upsert(single, { onConflict: 'external_source,external_id', ignoreDuplicates: true })
        if (!oneErr) inserted++
      }
    }
  }
  return inserted
}

async function runCycle() {
  const started = Date.now()
  const counts = { manga: 0, manhwa: 0, novel: 0 }
  const seen = new Set()
  const queue = []

  console.log('[bulk-sync] Entertainment-first balanced cycle | quotas:', QUOTAS, '| pages:', PAGE_LIMIT)

  // Rotate keyword order between formats so the first format returned by a source
  // cannot consume the whole discovery window before the other formats are seen.
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    for (let k = 0; k < DISCOVERY_KEYWORDS.length; k++) {
      const kw = DISCOVERY_KEYWORDS[(k + page - 1) % DISCOVERY_KEYWORDS.length]
      const neededFormats = ['manga', 'manhwa', 'novel'].filter((fmt) => counts[fmt] < QUOTAS[fmt])
      if (!neededFormats.length) break

      const batches = await Promise.allSettled(
        FAST_SOURCE_IDS.map((srcId) => fetchFromSource(srcId, { query: kw, page, limit: 30 }))
      )

      for (const res of batches) {
        if (res.status !== 'fulfilled') continue
        for (const item of res.value) {
          const fmt = item.format
          if (!['manga', 'manhwa', 'novel'].includes(fmt)) continue
          if (counts[fmt] >= QUOTAS[fmt]) continue
          if (!isEntertainmentItem(item, kw)) continue
          const dedupKey = `${String(item.title || '').trim().toLowerCase()}::${fmt}`
          if (!dedupKey || seen.has(dedupKey)) continue
          seen.add(dedupKey)
          counts[fmt]++
          queue.push(toDbRow(item))
        }
      }

      if (queue.length >= 150) {
        const saved = await flushBatch(queue.splice(0, queue.length))
        console.log(`[bulk-sync] Flushed ${saved} new rows | collected:`, counts)
      }
    }
  }

  if (queue.length > 0) {
    const saved = await flushBatch(queue)
    console.log(`[bulk-sync] Final flush ${saved} new rows`)
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[bulk-sync] Cycle finished in ${sec}s | collected by format:`, counts)
}

async function main() {
  await runCycle()
  if (INTERVAL_MINUTES > 0) {
    console.log(`[bulk-sync] Repeating every ${INTERVAL_MINUTES} minutes...`)
    setInterval(runCycle, INTERVAL_MINUTES * 60 * 1000)
  }
}

main().catch((err) => {
  console.error('[bulk-sync] Fatal error:', err)
  process.exit(1)
})
