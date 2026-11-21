import { createClient } from '@supabase/supabase-js'
import { AUTO_KEYWORDS, FAST_SOURCE_IDS, fetchFromSource } from '../src/lib/sources.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const QUOTAS = {
  manga: Number(process.env.QUOTA_MANGA || 400),
  manhwa: Number(process.env.QUOTA_MANHWA || 400),
  novel: Number(process.env.QUOTA_NOVEL || 400),
}
const INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 0) // 0 = run once & exit

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
      inserted += data?.length || chunk.length
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

  console.log('[bulk-sync] Starting cycle with quotas:', QUOTAS)

  for (let page = 1; page <= 4; page++) {
    for (const kw of AUTO_KEYWORDS) {
      const needMore =
        counts.manga < QUOTAS.manga ||
        counts.manhwa < QUOTAS.manhwa ||
        counts.novel < QUOTAS.novel
      if (!needMore) break

      const batches = await Promise.allSettled(
        FAST_SOURCE_IDS.map((srcId) => fetchFromSource(srcId, { query: kw, page, limit: 30 }))
      )

      for (const res of batches) {
        if (res.status !== 'fulfilled') continue
        for (const item of res.value) {
          const fmt = item.format
          if (!['manga', 'manhwa', 'novel'].includes(fmt)) continue
          if (counts[fmt] >= QUOTAS[fmt]) continue
          const dedupKey = `${item.title.toLowerCase()}::${fmt}`
          if (seen.has(dedupKey)) continue
          seen.add(dedupKey)
          counts[fmt]++
          queue.push(toDbRow(item))
        }
      }

      if (queue.length >= 150) {
        const saved = await flushBatch(queue.splice(0, queue.length))
        console.log(`[bulk-sync] Flushed ${saved} rows | progress:`, counts)
      }
    }
  }

  if (queue.length > 0) {
    const saved = await flushBatch(queue)
    console.log(`[bulk-sync] Final flush ${saved} rows`)
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[bulk-sync] Cycle finished in ${sec}s | total collected:`, counts)
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
