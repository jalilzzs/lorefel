// Catalog service layer: pagination + indexed filtering. Uses Supabase when configured, otherwise a 100k procedural catalog.
import { sb, live } from './supabase'
import { make, TOTAL } from './gen'
export * from './gen'

const KEY = 'loreleaf_catalog'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
export const catalogState = () => { const s = read(); return { extra: s.extra || [], flags: s.flags || {}, deleted: s.deleted || [], total: TOTAL } }
let ALL = null, SORTED = {}
const all = () => ALL || (ALL = Array.from({ length: TOTAL }, (_, i) => make(i + 1)))
export function saveCatalog(p) { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...p })); SORTED = {} }

const cmp = {
  trending: (a, b) => b.velocity - a.velocity || b.id - a.id,
  rating: (a, b) => b.rating - a.rating || b.votes - a.votes,
  popular: (a, b) => b.votes - a.votes,
  new: (a, b) => b.year - a.year || b.id - a.id,
}
function sorted(k) {
  if (SORTED[k]) return SORTED[k]
  const { extra, flags, deleted } = catalogState(), del = new Set(deleted)
  const ex = extra.map((e) => ({ ...e, s: (e.title + ' ' + e.author + ' ' + e.tags.join(' ') + ' ' + e.genres.join(' ') + ' ' + e.format).toLowerCase() }))
  return (SORTED[k] = all().concat(ex).filter((t) => !del.has(t.id)).map((t) => (flags[t.id] ? { ...t, ...flags[t.id] } : t)).sort(cmp[k] || cmp.trending))
}

const norm = (r) => ({ ...r, chapters: r.chapters_count ?? r.chapters ?? 0, warnings: r.warnings || [], tags: r.tags || [], genres: r.genres || [] })

async function remote(o) {
  const { q = '', genres = [], format = '', formats, lang = '', status = '', minRating = 0, year = 0, sort = 'trending', page = 1, size = 24, mature = false, mute = [], gem = false, exclude = 0 } = o
  let r = sb.from('titles').select('*', { count: 'exact' })
  if (!mature) r = r.eq('mature', false)
  if (format) r = r.eq('format', format)
  if (formats?.length) r = r.in('format', formats)
  if (lang) r = r.eq('lang', lang)
  if (status) r = r.eq('status', status)
  if (minRating) r = r.gte('rating', minRating)
  if (year) r = r.gte('year', year)
  if (gem) r = r.gte('rating', 4.5).lt('popularity', 0.25)
  if (exclude) r = r.neq('id', exclude)
  if (genres.length) r = r.contains('genres', genres)
  if (mute.length) r = r.not('warnings', 'ov', `{${mute.join(',')}}`)
  const qq = q.trim().replace(/[,%()*]/g, ' ')
  if (qq) r = r.or(`title.ilike.%${qq}%,author.ilike.%${qq}%,synopsis.ilike.%${qq}%`)
  const col = { trending: 'velocity', rating: 'rating', popular: 'popularity', new: 'year' }[sort] || 'velocity'
  const { data, count, error } = await r.order(col, { ascending: false }).range((page - 1) * size, page * size - 1)
  if (error) throw error
  return { items: data.map(norm), total: count || 0 }
}

export async function queryTitles(o = {}) {
  if (live) return remote(o)
  const { q = '', genres = [], format = '', formats, lang = '', status = '', minRating = 0, year = 0, sort = 'trending', page = 1, size = 24, mature = false, mute = [], gem = false, exclude = 0 } = o
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean), start = (page - 1) * size, items = []
  let total = 0
  for (const t of sorted(sort)) {
    if (t.mature && !mature) continue
    if (format && t.format !== format) continue
    if (formats && !formats.includes(t.format)) continue
    if (lang && t.lang !== lang) continue
    if (status && t.status !== status) continue
    if (minRating && t.rating < minRating) continue
    if (year && t.year < year) continue
    if (gem && !(t.rating >= 4.5 && t.popularity < 0.25)) continue
    if (exclude && t.id === exclude) continue
    if (genres.length && !genres.every((g) => t.genres.includes(g))) continue
    if (mute.length && t.warnings.some((w) => mute.includes(w))) continue
    if (words.length && !words.every((w) => t.s.includes(w))) continue
    if (total >= start && items.length < size) items.push(t)
    total++
  }
  return { items, total }
}

export async function getTitle(id) {
  id = +id
  if (live) { const { data } = await sb.from('titles').select('*').eq('id', id).maybeSingle(); return data ? norm(data) : null }
  const { extra, flags, deleted } = catalogState()
  if (deleted.includes(id)) return null
  const t = id >= 1e6 ? extra.find((e) => e.id === id) : id >= 1 && id <= TOTAL ? make(id) : null
  return t ? { ...t, ...(flags[id] || {}) } : null
}

export const suggest = async (q, o = {}) => (q.trim().length < 2 ? [] : (await queryTitles({ ...o, q, size: 6, sort: 'popular' })).items)

export async function addTitle(t) {
  if (live) { const { data, error } = await sb.from('titles').insert({ title: t.title, author: t.author, format: t.format, genres: t.genres, tags: t.tags || [], lang: t.lang, status: t.status, year: t.year, rating: t.rating, chapters_count: t.chapters, mature: t.mature, synopsis: t.synopsis || '', hue: t.hue }).select().single(); if (error) throw error; return norm(data) }
  const { extra } = catalogState(); const n = { ...t, id: 1e6 + extra.length + 1, warnings: t.mature ? ['Sexual Content'] : [], tags: t.tags || [], votes: 0, popularity: 0.5, velocity: 50 }
  saveCatalog({ extra: [...extra, n] }); return n
}
export async function setFlag(id, patch) {
  if (live) { const { error } = await sb.from('titles').update(patch).eq('id', id); if (error) throw error; return }
  const { flags } = catalogState(); saveCatalog({ flags: { ...flags, [id]: { ...(flags[id] || {}), ...patch } } })
}
export async function deleteTitle(id) {
  if (live) { const { error } = await sb.from('titles').delete().eq('id', id); if (error) throw error; return }
  const { deleted } = catalogState(); saveCatalog({ deleted: [...deleted, id] })
}
