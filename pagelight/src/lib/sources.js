// Multi-source connectors (10 free/public libraries) unified into Pagelight's catalog shape.

export const SOURCES = [
  { id: 'anilist', name: 'AniList', formats: ['manga', 'manhwa'], needsKey: false },
  { id: 'jikan', name: 'Jikan (MAL)', formats: ['manga', 'manhwa', 'novel'], needsKey: false },
  { id: 'openlibrary', name: 'Open Library', formats: ['novel'], needsKey: false },
  { id: 'mangadex', name: 'MangaDex', formats: ['manga', 'manhwa'], needsKey: false },
  { id: 'gutendex', name: 'Gutendex', formats: ['novel'], needsKey: false },
  { id: 'archive', name: 'Internet Archive', formats: ['novel', 'manga'], needsKey: false },
  { id: 'mangaupdates', name: 'MangaUpdates', formats: ['manga', 'manhwa', 'novel'], needsKey: false },
  { id: 'googlebooks', name: 'Google Books', formats: ['novel', 'manga'], needsKey: true },
  { id: 'kitsu', name: 'Kitsu', formats: ['manga', 'manhwa'], needsKey: false },
  { id: 'comicvine', name: 'ComicVine', formats: ['manga', 'manhwa'], needsKey: true },
]

const SOURCE_GENRES = [
  'action', 'fantasy', 'romance', 'thriller', 'mystery', 'scifi',
  'historical', 'sliceoflife', 'horror', 'drama', 'wuxia', 'xianxia',
  'litrpg', 'psychological', 'comedy', 'sports', 'supernatural',
  'isekai', 'adventure', 'school', 'mecha', 'tragedy',
]
const GENRE_SET = new Set(SOURCE_GENRES)

function mapGenres(rawList = [], fallback = ['adventure']) {
  const out = []
  for (const item of rawList) {
    const s = String(item || '').toLowerCase().replace(/[^a-z]/g, '')
    if (!s) continue
    if (GENRE_SET.has(s)) out.push(s)
    else if (s.includes('science') || s.includes('scifi')) out.push('scifi')
    else if (s.includes('slice')) out.push('sliceoflife')
    else if (s.includes('super')) out.push('supernatural')
    else if (s.includes('psych')) out.push('psychological')
    else if (s.includes('hist')) out.push('historical')
    else if (s.includes('fant')) out.push('fantasy')
    else if (s.includes('act')) out.push('action')
    else if (s.includes('rom')) out.push('romance')
    else if (s.includes('myst')) out.push('mystery')
    else if (s.includes('thril')) out.push('thriller')
    else if (s.includes('horr')) out.push('horror')
    else if (s.includes('com')) out.push('comedy')
    else if (s.includes('dram')) out.push('drama')
    else if (s.includes('sport')) out.push('sports')
  }
  const uniq = [...new Set(out)].slice(0, 4)
  return uniq.length ? uniq : fallback
}

function cleanText(htmlOrText = '', maxLen = 420) {
  const txt = String(htmlOrText || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return txt.length > maxLen ? txt.slice(0, maxLen).trim() + '…' : txt
}

function normalizeItem(partial) {
  return {
    title: String(partial.title || '').trim(),
    author: String(partial.author || 'Unknown').trim(),
    format: ['novel', 'manhwa', 'manga'].includes(partial.format) ? partial.format : 'novel',
    status: ['ongoing', 'completed', 'hiatus'].includes(partial.status) ? partial.status : 'ongoing',
    year: Number(partial.year) || 2022,
    rating: Math.min(5, Math.max(1, Number(partial.rating) || 4.2)),
    votes: Math.max(0, Number(partial.votes) || 100),
    chapters: Math.max(1, Number(partial.chapters) || 12),
    lang: ['en', 'fr', 'ar', 'zh'].includes(partial.lang) ? partial.lang : 'en',
    origin: partial.origin || 'US',
    genres: mapGenres(partial.genres),
    tags: Array.isArray(partial.tags) ? partial.tags.slice(0, 6) : [],
    synopsis: cleanText(partial.synopsis) || 'Imported free catalog title.',
    cover: partial.cover || null,
    mature: !!partial.mature,
    source: partial.source,
    externalId: String(partial.externalId || ''),
  }
}

async function safeFetch(url, options = {}, timeoutMs = 9000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// 1. AniList (GraphQL)
async function fetchAniList({ query, page, limit }) {
  const gql = `
    query ($page: Int, $perPage: Int, $search: String) {
      Page(page: $page, perPage: $perPage) {
        media(type: MANGA, search: $search, sort: POPULARITY_DESC) {
          id
          title { english romaji native }
          description(asHtml: false)
          genres
          averageScore
          popularity
          chapters
          status
          startDate { year }
          countryOfOrigin
          isAdult
          coverImage { large extraLarge }
          staff(perPage: 1, sort: [RELEVANCE]) { nodes { name { full } } }
        }
      }
    }`
  const data = await safeFetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables: { page, perPage: limit, search: query || undefined } }),
  })
  const list = data?.data?.Page?.media || []
  return list.map((m) => {
    const origin = m.countryOfOrigin || 'JP'
    const format = origin === 'KR' || origin === 'CN' ? 'manhwa' : 'manga'
    const st = m.status === 'FINISHED' ? 'completed' : m.status === 'PAUSED' ? 'hiatus' : 'ongoing'
    return normalizeItem({
      externalId: m.id,
      source: 'anilist',
      title: m.title?.english || m.title?.romaji || m.title?.native,
      author: m.staff?.nodes?.[0]?.name?.full || 'AniList Creator',
      format,
      status: st,
      year: m.startDate?.year,
      rating: m.averageScore ? m.averageScore / 20 : 4.3,
      votes: m.popularity,
      chapters: m.chapters || 24,
      lang: origin === 'CN' ? 'zh' : 'en',
      origin,
      genres: m.genres,
      synopsis: m.description,
      cover: m.coverImage?.extraLarge || m.coverImage?.large,
      mature: m.isAdult,
    })
  })
}

// 2. Jikan (MyAnimeList REST)
async function fetchJikan({ query, page, limit }) {
  const q = query ? `&q=${encodeURIComponent(query)}` : ''
  const data = await safeFetch(`https://api.jikan.moe/v4/manga?page=${page}&limit=${Math.min(limit, 25)}${q}`)
  return (data?.data || []).map((m) => {
    const typeStr = String(m.type || '').toLowerCase()
    const format = typeStr.includes('novel') ? 'novel' : typeStr.includes('manhwa') ? 'manhwa' : 'manga'
    const st = m.status === 'Finished' ? 'completed' : m.status === 'On Hiatus' ? 'hiatus' : 'ongoing'
    const author = m.authors?.[0]?.name || 'MAL Author'
    return normalizeItem({
      externalId: m.mal_id,
      source: 'jikan',
      title: m.title_english || m.title,
      author,
      format,
      status: st,
      year: m.published?.prop?.from?.year,
      rating: m.score ? m.score / 2 : 4.2,
      votes: m.members || m.scored_by || 500,
      chapters: m.chapters || 30,
      genres: (m.genres || []).map((g) => g.name),
      synopsis: m.synopsis,
      cover: m.images?.jpg?.large_image_url || m.images?.jpg?.image_url,
    })
  })
}

// 3. Open Library
async function fetchOpenLibrary({ query, page, limit }) {
  const q = encodeURIComponent(query || 'fantasy novel')
  const data = await safeFetch(`https://openlibrary.org/search.json?q=${q}&page=${page}&limit=${Math.min(limit, 25)}`)
  return (data?.docs || []).map((d) => ({
    ...normalizeItem({
      externalId: d.key,
      source: 'openlibrary',
      title: d.title,
      author: d.author_name?.[0] || 'Open Library Author',
      format: 'novel',
      status: 'completed',
      year: d.first_publish_year,
      rating: d.ratings_average || 4.1,
      votes: d.ratings_count || 120,
      chapters: d.number_of_pages_median ? Math.max(10, Math.round(d.number_of_pages_median / 15)) : 20,
      lang: ['en', 'fr', 'ar', 'zh'].includes(d.language?.[0]) ? d.language[0] : 'en',
      genres: d.subject || ['fantasy'],
      synopsis: d.first_sentence?.[0] || `${d.title} by ${d.author_name?.[0] || 'Unknown'}.`,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    }),
  }))
}

// 4. MangaDex
async function fetchMangaDex({ query, page, limit }) {
  const offset = (page - 1) * Math.min(limit, 20)
  const titleParam = query ? `&title=${encodeURIComponent(query)}` : ''
  const data = await safeFetch(
    `https://api.mangadex.org/manga?limit=${Math.min(limit, 20)}&offset=${offset}${titleParam}&includes[]=cover_art&includes[]=author`
  )
  return (data?.data || []).map((m) => {
    const a = m.attributes || {}
    const title = a.title?.en || Object.values(a.title || {})[0] || 'MangaDex Title'
    const authorRel = (m.relationships || []).find((r) => r.type === 'author')
    const coverRel = (m.relationships || []).find((r) => r.type === 'cover_art')
    const fileName = coverRel?.attributes?.fileName
    const cover = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg` : null
    const origLang = a.originalLanguage || 'ja'
    const format = origLang === 'ko' || origLang === 'zh' ? 'manhwa' : 'manga'
    const st = a.status === 'completed' ? 'completed' : a.status === 'hiatus' ? 'hiatus' : 'ongoing'
    const tags = (a.tags || []).map((t) => t.attributes?.name?.en).filter(Boolean)
    return normalizeItem({
      externalId: m.id,
      source: 'mangadex',
      title,
      author: authorRel?.attributes?.name || 'MangaDex Author',
      format,
      status: st,
      year: a.year,
      rating: 4.3,
      votes: 400,
      chapters: Number(a.lastChapter) || 25,
      lang: ['en', 'fr', 'ar', 'zh'].includes(origLang) ? origLang : 'en',
      origin: origLang === 'ko' ? 'KR' : origLang === 'zh' ? 'CN' : 'JP',
      genres: tags,
      synopsis: a.description?.en || Object.values(a.description || {})[0] || '',
      cover,
      mature: a.contentRating === 'erotica' || a.contentRating === 'pornographic',
    })
  })
}

// 5. Gutendex (Project Gutenberg)
async function fetchGutendex({ query, page }) {
  const q = query ? `&search=${encodeURIComponent(query)}` : ''
  const data = await safeFetch(`https://gutendex.com/books/?page=${page}${q}`)
  return (data?.results || []).slice(0, 15).map((b) => normalizeItem({
    externalId: b.id,
    source: 'gutendex',
    title: b.title,
    author: b.authors?.[0]?.name || 'Gutenberg Author',
    format: 'novel',
    status: 'completed',
    year: b.authors?.[0]?.birth_year ? b.authors[0].birth_year + 35 : 1900,
    rating: 4.4,
    votes: b.download_count || 300,
    chapters: 18,
    lang: ['en', 'fr', 'ar', 'zh'].includes(b.languages?.[0]) ? b.languages[0] : 'en',
    genres: [...(b.bookshelves || []), ...(b.subjects || [])],
    synopsis: `Public domain classic: ${b.title}.`,
    cover: b.formats?.['image/jpeg'] || null,
  }))
}

// 6. Internet Archive
async function fetchArchive({ query, page, limit }) {
  const q = encodeURIComponent(query ? `${query} AND mediatype:texts` : 'novel OR fiction AND mediatype:texts')
  const data = await safeFetch(
    `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier,title,creator,year,description&rows=${Math.min(limit, 20)}&page=${page}&output=json`
  )
  return (data?.response?.docs || []).map((d) => normalizeItem({
    externalId: d.identifier,
    source: 'archive',
    title: d.title,
    author: Array.isArray(d.creator) ? d.creator[0] : d.creator || 'Internet Archive',
    format: 'novel',
    status: 'completed',
    year: d.year,
    rating: 4.1,
    votes: 150,
    chapters: 16,
    genres: ['historical', 'adventure'],
    synopsis: Array.isArray(d.description) ? d.description[0] : d.description,
    cover: d.identifier ? `https://archive.org/services/img/${d.identifier}` : null,
  }))
}

// 7. MangaUpdates
async function fetchMangaUpdates({ query, page, limit }) {
  const data = await safeFetch('https://api.mangaupdates.com/v1/series/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search: query || 'fantasy', page, perpage: Math.min(limit, 20) }),
  })
  return (data?.results || []).map((r) => {
    const rec = r.record || {}
    const t = String(rec.type || '').toLowerCase()
    const format = t.includes('novel') ? 'novel' : t.includes('manhwa') ? 'manhwa' : 'manga'
    return normalizeItem({
      externalId: rec.series_id,
      source: 'mangaupdates',
      title: rec.title,
      author: rec.authors?.[0]?.name || 'MangaUpdates Author',
      format,
      year: Number(rec.year),
      rating: rec.bayesian_rating ? Number(rec.bayesian_rating) / 2 : 4.2,
      votes: 250,
      chapters: 24,
      genres: (rec.genres || []).map((g) => g.genre),
      synopsis: rec.description,
      cover: rec.image?.url?.original || null,
    })
  })
}

// 8. Google Books (optional API key via env)
async function fetchGoogleBooks({ query, page, limit, apiKey }) {
  const startIndex = (page - 1) * Math.min(limit, 20)
  const q = encodeURIComponent(query || 'fantasy fiction')
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  const data = await safeFetch(
    `https://www.googleapis.com/books/v1/volumes?q=${q}&startIndex=${startIndex}&maxResults=${Math.min(limit, 20)}${keyParam}`
  )
  return (data?.items || []).map((it) => {
    const v = it.volumeInfo || {}
    const thumb = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null
    return normalizeItem({
      externalId: it.id,
      source: 'googlebooks',
      title: v.title,
      author: v.authors?.[0] || 'Google Books Author',
      format: 'novel',
      status: 'completed',
      year: v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) : 2021,
      rating: v.averageRating || 4.2,
      votes: v.ratingsCount || 180,
      chapters: v.pageCount ? Math.max(10, Math.round(v.pageCount / 14)) : 22,
      lang: ['en', 'fr', 'ar', 'zh'].includes(v.language) ? v.language : 'en',
      genres: v.categories || ['fantasy'],
      synopsis: v.description,
      cover: thumb ? thumb.replace(/^http:\/\//i, 'https://') : null,
    })
  })
}

// 9. Kitsu
async function fetchKitsu({ query, page, limit }) {
  const offset = (page - 1) * Math.min(limit, 20)
  const q = query ? `&filter[text]=${encodeURIComponent(query)}` : ''
  const data = await safeFetch(
    `https://kitsu.io/api/edge/manga?page[limit]=${Math.min(limit, 20)}&page[offset]=${offset}${q}`
  )
  return (data?.data || []).map((m) => {
    const a = m.attributes || {}
    const sub = String(a.subtype || '').toLowerCase()
    const format = sub.includes('novel') ? 'novel' : sub.includes('manhwa') ? 'manhwa' : 'manga'
    const st = a.status === 'finished' ? 'completed' : a.status === 'on_hiatus' ? 'hiatus' : 'ongoing'
    return normalizeItem({
      externalId: m.id,
      source: 'kitsu',
      title: a.canonicalTitle || a.titles?.en || a.titles?.en_jp,
      author: 'Kitsu Creator',
      format,
      status: st,
      year: a.startDate ? Number(String(a.startDate).slice(0, 4)) : 2020,
      rating: a.averageRating ? Number(a.averageRating) / 20 : 4.2,
      votes: a.userCount || 300,
      chapters: a.chapterCount || 24,
      synopsis: a.synopsis,
      cover: a.posterImage?.large || a.posterImage?.medium || null,
      mature: !!a.nsfw,
    })
  })
}

// 10. ComicVine (optional API key via env)
async function fetchComicVine({ query, page, limit, apiKey }) {
  if (!apiKey) throw new Error('Missing ComicVine API key')
  const q = encodeURIComponent(query || 'adventure')
  const data = await safeFetch(
    `https://comicvine.gamespot.com/api/volumes/?api_key=${encodeURIComponent(apiKey)}&format=json&filter=name:${q}&limit=${Math.min(limit, 15)}&offset=${(page - 1) * Math.min(limit, 15)}`
  )
  return (data?.results || []).map((v) => normalizeItem({
    externalId: v.id,
    source: 'comicvine',
    title: v.name,
    author: v.publisher?.name || 'ComicVine Publisher',
    format: 'manga',
    year: v.start_year ? Number(v.start_year) : 2019,
    rating: 4.1,
    votes: 140,
    chapters: v.count_of_issues || 12,
    genres: ['action', 'adventure'],
    synopsis: v.deck || v.description,
    cover: v.image?.medium_url || v.image?.super_url || null,
  }))
}

const CONNECTORS = {
  anilist: fetchAniList,
  jikan: fetchJikan,
  openlibrary: fetchOpenLibrary,
  mangadex: fetchMangaDex,
  gutendex: fetchGutendex,
  archive: fetchArchive,
  mangaupdates: fetchMangaUpdates,
  googlebooks: fetchGoogleBooks,
  kitsu: fetchKitsu,
  comicvine: fetchComicVine,
}

export async function fetchFromSource(sourceId, { query = '', page = 1, limit = 12, apiKeys = {} } = {}) {
  const fn = CONNECTORS[sourceId]
  if (!fn) throw new Error(`Unknown source: ${sourceId}`)
  const key =
    sourceId === 'googlebooks'
      ? apiKeys.googlebooks || import.meta.env.VITE_GOOGLE_BOOKS_KEY || ''
      : sourceId === 'comicvine'
        ? apiKeys.comicvine || import.meta.env.VITE_COMICVINE_KEY || ''
        : ''
  const rows = await fn({ query, page, limit, apiKey: key })
  return rows.filter((r) => r.title)
}

/**
 * Fetch from multiple sources in parallel/sequence and deduplicate by title + format.
 */
export async function importFromSources(
  sourceIds = SOURCES.map((s) => s.id),
  { query = '', page = 1, limit = 10, existingTitles = new Set(), apiKeys = {}, onProgress } = {}
) {
  const seen = new Set(existingTitles)
  const collected = []
  const report = []

  for (const id of sourceIds) {
    try {
      const items = await fetchFromSource(id, { query, page, limit, apiKeys })
      let addedCount = 0
      for (const item of items) {
        const key = `${item.title.toLowerCase()}::${item.format}`
        if (seen.has(key)) continue
        seen.add(key)
        collected.push(item)
        addedCount++
      }
      report.push({ source: id, ok: true, fetched: items.length, unique: addedCount })
    } catch (err) {
      report.push({ source: id, ok: false, fetched: 0, unique: 0, error: err?.message || 'Error' })
    }
    if (onProgress) onProgress([...report])
  }

  return { items: collected, report }
}
