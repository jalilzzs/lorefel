import { queryTitles } from './catalog'

// Builds genre/format affinity vectors from library status, completion, time spent, favorite genres and searches.
export function vectors(S) {
  const g = {}, f = {}, add = (o, k, v) => { o[k] = (o[k] || 0) + v }
  let comp = 0, n = 0
  S.profile.genres.forEach((x) => add(g, x, 3))
  Object.entries(S.library).forEach(([id, v]) => {
    const m = S.meta[id]; if (!m) return
    const wt = { reading: 2, completed: 3, plan: 1, hold: 0.5, dropped: -2 }[v.status] ?? 1
    const done = (S.done[id] || []).length / Math.max(1, m.chapters)
    const val = wt + done * 3 + Math.min(5, (S.titleMinutes[id] || 0) / 30)
    m.genres.forEach((x) => add(g, x, val)); add(f, m.format, val); comp += done; n++
  })
  S.searches.slice(-20).forEach((q) => Object.keys(g).concat(['Fantasy', 'Romance', 'Action', 'Mystery']).forEach((x) => { if (q.toLowerCase().includes(x.toLowerCase())) add(g, x, 0.5) }))
  return { g, f, avgCompletion: n ? comp / n : 0 }
}

export async function recommend(S, base, n = 12) {
  const { g, f, avgCompletion } = vectors(S), W = S.site.weights
  const gmax = Math.max(1, ...Object.values(g)), fmax = Math.max(1, ...Object.values(f))
  const [a, b] = await Promise.all([queryTitles({ ...base, sort: 'popular', size: 300 }), queryTitles({ ...base, sort: 'trending', size: 300 })])
  const seen = new Set(), pool = []
  ;[...a.items, ...b.items].forEach((t) => { if (!seen.has(t.id) && !S.library[t.id]) { seen.add(t.id); pool.push(t) } })
  const top = Object.entries(S.library).map(([id, v]) => ({ m: S.meta[id], v })).filter((x) => x.m).sort((x, y) => y.v.ts - x.v.ts)
  return pool.map((t) => {
    const gn = t.genres.reduce((s, x) => s + Math.max(0, g[x] || 0), 0) / t.genres.length / gmax
    const fn = Math.max(0, f[t.format] || 0) / fmax
    const cm = fn * avgCompletion * (t.chapters <= 150 ? 1 : 0.4)
    const score = W.genre * gn + W.format * fn + W.velocity * (t.velocity / 100) + W.rating * ((t.rating - 3) / 2) + W.completion * cm
    const src = top.find((x) => x.m.genres.some((x2) => t.genres.includes(x2)))
    const why = src && gn > 0.4 ? { k: 'because', x: src.m.title } : t.velocity > 60 && gn > 0.2 ? { k: 'rising' } : cm > 0.3 ? { k: 'completionMatch' } : { k: 'popularPick' }
    return { t, score, why }
  }).sort((x, y) => y.score - x.score).slice(0, n)
}
