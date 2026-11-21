import { catalog } from './catalog'
import { chapterParagraphs, chapterTitle, isComic, pageArt, pagesCount } from './content'
import { offlineDel, offlineGet, offlineKey, offlinePut } from './idb'
import { actions, getUD } from './userdata'
import { clamp } from './util'
import { DEMO_MODE } from './supabase'

/** Load a chapter: offline cache → DB/admin-authored → procedural demo content. */
export async function loadChapter(t, n, version = 'official') {
  const off = await offlineGet(offlineKey(t.id, n, version))
  if (off) return { ...off, offline: true }
  if (!DEMO_MODE) {
    // PRODUCTION: only real stored content. Never generate text or placeholder pages.
    try {
      const real = await catalog.loadRealChapter(t.id, n, version)
      if (real) return real
      return { n, name: chapterTitle(t, n), missing: true }
    } catch (e) {
      console.warn('[reader] chapter load failed', e)
      return { n, name: chapterTitle(t, n), error: true }
    }
  }
  const custom = await catalog.loadCustomChapter(t.id, n, version)
  if (custom) {
    if (custom.pages?.length) return { n, name: custom.name || chapterTitle(t, n), pages: custom.pages }
    if (custom.content) return { n, name: custom.name || chapterTitle(t, n), paras: custom.content.split(/\n{2,}/).filter(Boolean) }
  }
  const name = chapterTitle(t, n)
  if (isComic(t)) return { n, name, pages: Array.from({ length: pagesCount(t, n) }, (_, p) => pageArt(t, n, p)) }
  return { n, name, paras: chapterParagraphs(t, n, version) }
}

export const isOffline = (list, t, n, v = 'official') => (list || []).some((x) => x.t === t && x.c === n && x.v === v)

export async function queueOffline(t, n, version = 'official') {
  const c = await loadChapter(t, n, version)
  await offlinePut(offlineKey(t.id, n, version), { n: c.n, name: c.name, paras: c.paras, pages: c.pages })
  actions.setOffline([...(getUD()?.offline || []).filter((x) => !(x.t === t.id && x.c === n && x.v === version)), { t: t.id, c: n, v: version, ts: Date.now() }])
}
export async function removeOffline(t, n, version = 'official') {
  await offlineDel(offlineKey(t.id, n, version))
  actions.setOffline((getUD()?.offline || []).filter((x) => !(x.t === t && x.c === n && x.v === version)))
}

export function readingSpeed(ud) {
  let sec = 0, ch = 0
  const progressObj = ud?.progress || {}
  for (const p of Object.values(progressObj)) {
    if (!p) continue
    sec += p.seconds || 0
    ch += p.read?.length || 0
  }
  if (ch < 3 || sec < 600) return 230
  return clamp(Math.round((ch * 2600) / (sec / 60)), 120, 700)
}

export function analytics(ud, days = 14) {
  const g = {}, f = {}
  let seconds = 0
  const progressObj = ud?.progress || {}
  const daysObj = ud?.days || {}
  for (const [id, p] of Object.entries(progressObj)) {
    if (!p) continue
    const t = catalog.local(+id); if (!t) continue
    const s = p.seconds || 0; seconds += s
    ;(t.genres || []).forEach((x) => { g[x] = (g[x] || 0) + s + (p.read?.length || 0) * 60 })
    if (t.format) f[t.format] = (f[t.format] || 0) + s
  }
  const series = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    series.push({ label: String(d.getDate()), v: Math.round((daysObj[k]?.seconds || 0) / 60), key: k })
  }
  const chaptersRead = Object.values(progressObj).reduce((a, p) => a + (p?.read?.length || 0), 0)
  return { seconds, chaptersRead, topGenres: Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 6), formats: f, series, wpm: readingSpeed(ud) }
}
