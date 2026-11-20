// Supabase Edge Function: catalog-sync
// Pulls a page of titles from an external catalog and upserts them into public.titles.
// Deploy:  supabase functions deploy catalog-sync
// Invoke:  supabase.functions.invoke('catalog-sync', { body: { source: 'anilist', page: 1 } })
// Only admins may call it (checked via the caller's JWT + profiles.role).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GENRE_MAP: Record<string, string> = {
  Action: 'action', Fantasy: 'fantasy', Romance: 'romance', Thriller: 'thriller', Mystery: 'mystery',
  'Sci-Fi': 'scifi', 'Slice of Life': 'sliceoflife', Horror: 'horror', Drama: 'drama', Comedy: 'comedy',
  Sports: 'sports', Supernatural: 'supernatural', Psychological: 'psychological', Adventure: 'adventure',
  Mecha: 'mecha', 'Mahou Shoujo': 'fantasy',
}

const ANILIST = `query($page:Int){ Page(page:$page, perPage:50){ media(type:MANGA, sort:POPULARITY_DESC){
  id title{romaji english} description(asHtml:false) genres averageScore popularity chapters status format
  startDate{year} countryOfOrigin coverImage{large} isAdult staff(perPage:1){edges{node{name{full}}}} } } }`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

  const admin = createClient(url, service)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: cors })

  const { source = 'anilist', page = 1 } = await req.json().catch(() => ({}))
  const { data: log } = await admin.from('catalog_sync_logs').insert({ source, status: 'running' }).select().single()

  try {
    if (source !== 'anilist') throw new Error(`Connector "${source}" is not implemented in this function yet`)
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANILIST, variables: { page } }),
    })
    const json = await res.json()
    const media = json?.data?.Page?.media ?? []
    const rows = media.map((m: any) => ({
      external_source: 'anilist',
      external_id: String(m.id),
      title: m.title.english || m.title.romaji,
      author: m.staff?.edges?.[0]?.node?.name?.full ?? null,
      format: m.format === 'NOVEL' ? 'novel' : m.countryOfOrigin === 'JP' ? 'manga' : 'manhwa',
      status: m.status === 'FINISHED' ? 'completed' : m.status === 'HIATUS' ? 'hiatus' : 'ongoing',
      year: m.startDate?.year ?? null,
      rating: Math.round(((m.averageScore ?? 70) / 20) * 100) / 100,
      rating_count: m.popularity ?? 0,
      chapter_count: m.chapters ?? 0,
      language: 'en',
      origin: m.countryOfOrigin,
      genres: (m.genres ?? []).map((g: string) => GENRE_MAP[g]).filter(Boolean),
      synopsis: (m.description ?? '').replace(/<[^>]+>/g, '').slice(0, 900),
      cover_url: m.coverImage?.large ?? null,
      is_mature: !!m.isAdult,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await admin.from('titles').upsert(rows, { onConflict: 'external_source,external_id' })
    if (error) throw error
    await admin.from('catalog_sync_logs').update({ status: 'success', imported: rows.length, finished_at: new Date().toISOString() }).eq('id', log!.id)
    return new Response(JSON.stringify({ imported: rows.length }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    await admin.from('catalog_sync_logs').update({ status: 'failed', message: String(e), finished_at: new Date().toISOString() }).eq('id', log!.id)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
