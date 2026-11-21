// Recommendation engine: builds a taste profile from behaviour, then scores the catalog.
import { catalog } from './catalog'
import { mulberry32 } from './util'

export const DEFAULT_WEIGHTS = { genre: 1.0, format: 0.6, rating: 0.5, velocity: 0.35, tag: 0.4, completion: 0.5 }

export function buildProfile(ud, favGenres = [], genreLabels = {}) {
  const g = {}, f = {}, tg = {}
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v }
  const seen = new Set()
  const anchors = [] // titles that explain recommendations
  const bump = (t, w) => { t.genres.forEach((x) => add(g, x, w)); add(f, t.format, w); t.tags.forEach((x) => add(tg, x, w * 0.5)) }
  for (const [id, p] of Object.entries(ud.progress)) {
    const t = catalog.local(+id); if (!t) continue
    seen.add(t.id)
    const w = Math.log(1 + (p.seconds || 0) / 600) + (p.read?.length || 0) * 0.08 + (p.read?.length >= t.chapters * 0.9 ? 1.5 : 0)
    bump(t, w); anchors.push({ t, w })
  }
  const stW = { reading: 1.5, plan: 0.8, completed: 2, hold: 0.3, dropped: -1.5 }
  for (const [id, v] of Object.entries(ud.library)) {
    const t = catalog.local(+id); if (!t) continue
    seen.add(t.id); bump(t, stW[v.status] ?? 0)
    if (v.status === 'completed' || v.status === 'reading') anchors.push({ t, w: stW[v.status] })
  }
  for (const [id, r] of Object.entries(ud.ratings)) { const t = catalog.local(+id); if (t) bump(t, (r - 3) * 1.2) }
  for (const q of ud.searches.slice(0, 15)) {
    const ql = q.toLowerCase()
    for (const gid of Object.keys(genreLabels)) if ((genreLabels[gid] || '').toLowerCase().includes(ql) || gid.includes(ql)) add(g, gid, 0.6)
    if (['novel', 'manhwa', 'manga'].includes(ql)) add(f, ql, 0.6)
  }
  favGenres.forEach((x) => add(g, x, 2))
  const maxOf = (o) => Math.max(0.0001, ...Object.values(o).map(Math.abs))
  anchors.sort((a, b) => b.w - a.w)
  return { g, f, tg, gMax: maxOf(g), fMax: maxOf(f), tMax: maxOf(tg), seen, anchors: anchors.slice(0, 6).map((a) => a.t), cold: !Object.keys(g).length }
}

export function recommend(profile, weights = DEFAULT_WEIGHTS, opts = {}) {
  const { limit = 60, formats = ['novel', 'manhwa', 'manga'], hideMature = false, muteTags = [], lang = '', seed = 7 } = opts
  const all = catalog.allLocal(); const r = mulberry32(seed)
  const top = []
  for (let i = 0; i < all.length; i++) {
    const t = all[i]
    if (profile.seen.has(t.id) || !formats.includes(t.format)) continue
    if (hideMature && t.mature) continue
    if (lang && t.lang !== lang) continue
    if (muteTags.length && t.tags.some((x) => muteTags.includes(x))) continue
    let gs = 0
    for (const x of t.genres) gs += (profile.g[x] || 0) / profile.gMax
    gs /= Math.max(1, t.genres.length) ** 0.5
    let ts = 0
    for (const x of t.tags) ts += (profile.tg[x] || 0) / profile.tMax
    const fs = (profile.f[t.format] || 0) / profile.fMax
    const q = (t.rating - 3.4) / 1.5
    const comp = t.status === 'completed' && t.rating >= 4.2 ? 1 : 0
    const s = weights.genre * gs + weights.format * fs + weights.rating * q + weights.velocity * (t.velocity / 100) + weights.tag * ts * 0.5 + weights.completion * comp * Math.min(1, gs) + r() * 0.05 + Math.log10(t.votes + 1) * 0.06
    if (top.length < limit || s > top[top.length - 1].s) {
      top.push({ t, s }); top.sort((a, b) => b.s - a.s); if (top.length > limit) top.pop()
    }
  }
  return top.map(({ t, s }) => ({ t, s, reason: reasonFor(t, profile) }))
}

function reasonFor(t, profile) {
  if (profile.cold) return { kind: 'popular' }
  for (const a of profile.anchors) if (a.id !== t.id && a.genres.some((x) => t.genres.includes(x)) && (a.genres.filter((x) => t.genres.includes(x)).length >= 2 || a.format === t.format)) return { kind: 'because', ref: a }
  if (t.velocity >= 70) return { kind: 'rising', genre: t.genres.find((x) => profile.g[x]) || t.genres[0] }
  if (t.status === 'completed' && t.rating >= 4.2) return { kind: 'completion' }
  return { kind: 'genre', genre: t.genres.find((x) => profile.g[x]) || t.genres[0] }
}

export function shelves(recs) {
  const because = new Map()
  for (const x of recs) if (x.reason.kind === 'because') { const k = x.reason.ref.id; if (!because.has(k)) because.set(k, { ref: x.reason.ref, items: [] }); because.get(k).items.push(x.t) }
  return {
    forYou: recs.slice(0, 18).map((x) => x.t),
    because: [...because.values()].filter((b) => b.items.length >= 3).slice(0, 2),
    rising: recs.filter((x) => x.t.velocity >= 55).slice(0, 14).map((x) => x.t),
    completion: recs.filter((x) => x.t.status === 'completed' && x.t.rating >= 4.2).slice(0, 14).map((x) => x.t),
  }
}

export const PERSONAS = [
  { id: 'mystery-hunter', genres: ['mystery', 'thriller', 'psychological', 'horror'] },
  { id: 'fantasy-voyager', genres: ['fantasy', 'adventure', 'isekai', 'litrpg'] },
  { id: 'romantic-dreamer', genres: ['romance', 'drama', 'sliceoflife', 'tragedy'] },
  { id: 'action-seeker', genres: ['action', 'sports', 'mecha', 'school'] },
  { id: 'martial-sage', genres: ['wuxia', 'xianxia', 'historical', 'supernatural'] },
  { id: 'star-navigator', genres: ['scifi', 'comedy'] },
]
export function persona(ud) {
  const prof = buildProfile(ud)
  const chapters = ud.history.length
  const days = Object.keys(ud.days).length || 1
  if (chapters >= 12 && chapters / days >= 6) return { id: 'binge-archivist', score: 1 }
  if (prof.cold) return { id: 'newcomer', score: 0 }
  let best = null
  for (const p of PERSONAS) { const s = p.genres.reduce((a, g) => a + (prof.g[g] || 0), 0); if (!best || s > best.score) best = { id: p.id, score: s } }
  return best
}
