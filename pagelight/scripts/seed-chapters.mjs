import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// استبدل هذه الروابط بصور صفحات حقيقية للمانجا/المانهوا حسب حاجتك
const SAMPLE_COMIC_PAGES = [
  'https://placehold.co/800x1200/1e1b4b/ffffff?text=Page+1',
  'https://placehold.co/800x1200/312e81/ffffff?text=Page+2',
  'https://placehold.co/800x1200/4338ca/ffffff?text=Page+3',
]

// نص حقيقي أو مقتطف كتاب مقسّم بفقرات (\n\n)
const SAMPLE_NOVEL_CONTENT = [
  'The rain tapped steadily against the narrow window of the archive as the lantern flickered on the oak desk.',
  'For three centuries, the ledger had remained closed, holding names that no longer lived in the city records.',
  'When she turned the first brittle page, the ink shifted subtly beneath the warm light, forming a path no map had ever shown.',
].join('\n\n')

async function seed() {
  const { data: comics, error: cErr } = await supabase
    .from('titles')
    .select('id, title, format')
    .in('format', ['manga', 'manhwa'])
    .limit(3)

  if (cErr) throw cErr

  const { data: novels, error: nErr } = await supabase
    .from('titles')
    .select('id, title, format')
    .eq('format', 'novel')
    .limit(3)

  if (nErr) throw nErr

  const rows = []

  for (const t of comics || []) {
    rows.push({
      title_id: t.id,
      number: 1,
      version: 'official',
      name: `${t.title} — Chapter 1`,
      content: null,
      pages: SAMPLE_COMIC_PAGES,
    })
  }

  for (const t of novels || []) {
    rows.push({
      title_id: t.id,
      number: 1,
      version: 'official',
      name: `${t.title} — Chapter 1`,
      content: SAMPLE_NOVEL_CONTENT,
      pages: null,
    })
  }

  if (!rows.length) {
    console.log('No titles found in `titles` table to seed chapters for.')
    return
  }

  const { data, error } = await supabase
    .from('chapters')
    .upsert(rows, { onConflict: 'title_id,number,version' })
    .select('id, title_id, number')

  if (error) throw error
  console.log(`Seeded ${data?.length || 0} chapters successfully:`, data)
}

seed().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})
