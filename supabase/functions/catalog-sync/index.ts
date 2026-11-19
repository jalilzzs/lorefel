// Supabase Edge Function: pulls titles from an external catalog API and upserts them in batches.
// Deploy: supabase functions deploy catalog-sync   (set CATALOG_API_URL as a secret)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { source } = await req.json().catch(() => ({ source: 'unknown' }))
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let imported = 0, status = 'ok', message = ''
  try {
    const api = Deno.env.get('CATALOG_API_URL')
    if (!api) throw new Error('CATALOG_API_URL not set')
    const items = await (await fetch(api)).json() // expected: [{title,author,format,genres,lang,status,year,rating,chapters_count,synopsis,mature}]
    for (let i = 0; i < items.length; i += 500) {
      const { error } = await sb.from('titles').insert(items.slice(i, i + 500).map((t: any) => ({ ...t, id: undefined })))
      if (error) throw error
      imported += Math.min(500, items.length - i)
    }
  } catch (e) { status = 'error'; message = String(e) }
  await sb.from('catalog_sync_logs').insert({ source, status, imported, message })
  return new Response(JSON.stringify({ status, imported, message }), { headers: { 'Content-Type': 'application/json' } })
})
