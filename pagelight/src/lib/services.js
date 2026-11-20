// Site settings, news, community, users, sync logs and external catalog connectors.
// Each service works in demo mode (localStorage) and live mode (Supabase) with the same API.
import { isLive, supabase } from './supabase'
import { lsGet, lsSet, uid, dayKey } from './util'
import { DEFAULT_WEIGHTS } from './recommend'
import { seedComments } from './content'
import { GENRES } from './catalog'

export const FEATURES = ['novels', 'manhwa', 'manga', 'news', 'tts', 'recommendations', 'gating18', 'soundscapes', 'quotes', 'social', 'calendar']
export const THEMES = ['midnight', 'sepia', 'oled', 'daylight']
export const ACCENTS = ['violet', 'ember', 'teal', 'rose', 'gold', 'sky']
export const DEFAULT_SITE = {
  features: Object.fromEntries(FEATURES.map((f) => [f, true])),
  matureMode: 'blur', disabledThemes: [], disabledLangs: [], recWeights: DEFAULT_WEIGHTS,
}
const mergeSite = (v) => ({ ...DEFAULT_SITE, ...(v || {}), features: { ...DEFAULT_SITE.features, ...(v?.features || {}) }, recWeights: { ...DEFAULT_WEIGHTS, ...(v?.recWeights || {}) } })

export const siteService = {
  async load() {
    if (isLive) { try { const { data } = await supabase.from('site_settings').select('value').eq('key', 'global').maybeSingle(); if (data) return mergeSite(data.value) } catch { /* fallthrough */ } }
    return mergeSite(lsGet('pl:site', null))
  },
  async save(v) {
    lsSet('pl:site', v)
    if (isLive) { const { error } = await supabase.from('site_settings').upsert({ key: 'global', value: v, updated_at: new Date().toISOString() }); if (error) throw error }
  },
  subscribe(cb) {
    if (!isLive) return () => {}
    const ch = supabase.channel('site').on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, (p) => p.new?.value && cb(mergeSite(p.new.value))).subscribe()
    return () => supabase.removeChannel(ch)
  },
}

// ----------------------------------------------------------------- news
const inDays = (n) => dayKey(new Date(Date.now() + n * 864e5))
const SEED_NEWS = () => [
  { id: 'n1', title: { en: 'Welcome to Pagelight', fr: 'Bienvenue sur Pagelight', ar: 'مرحبًا بكم في بيج لايت', zh: '欢迎来到 Pagelight' }, excerpt: { en: 'A new reading home for novels, manhwa and manga in four languages.' }, body: { en: 'Pagelight brings novels, manhwa and manga together with synced progress, smart recommendations and a reader built for long sessions.\n\nExplore the Discover menu for the Spin-the-Wheel, Quote Card Studio, Lore Atlas and more.' }, category: 'platform', genres: [], hue: 265, author: 'Pagelight Team', ts: Date.now() - 864e5, published: true },
  { id: 'n2', title: { en: 'Season finales to watch this month', fr: 'Les finales de saison à suivre ce mois-ci', ar: 'نهايات المواسم التي يجب متابعتها هذا الشهر', zh: '本月值得关注的季终章' }, excerpt: { en: 'Three long-running series are closing their current arcs within weeks.' }, body: { en: 'Editors have flagged three series entering their season finales. Follow them to get finale alerts.' }, category: 'spotlight', genres: ['fantasy', 'action'], hue: 330, eventDate: inDays(6), author: 'Editorial', ts: Date.now() - 2 * 864e5, published: true },
  { id: 'n3', title: { en: 'Wuxia epic announced for animation', fr: 'Une épopée wuxia annoncée en animation', ar: 'الإعلان عن اقتباس ملحمة ووشيا', zh: '武侠史诗宣布动画化' }, excerpt: { en: 'A studio announces a 24-episode adaptation of a fan-favourite wuxia novel.' }, body: { en: 'The adaptation will premiere next year. Original author statement: "I am overwhelmed."' }, category: 'adaptation', genres: ['wuxia', 'xianxia'], hue: 20, eventDate: inDays(14), author: 'Editorial', ts: Date.now() - 3 * 864e5, published: true },
  { id: 'n4', title: { en: 'Translation complete: a cult mystery reaches its final chapter', fr: 'Traduction terminée : un mystère culte atteint son dernier chapitre', ar: 'اكتملت الترجمة: رواية غموض شهيرة تصل إلى فصلها الأخير', zh: '翻译完结：一部经典悬疑迎来最终章' }, excerpt: { en: 'After four years the community translation team has delivered the last chapter.' }, body: { en: 'The volunteers thank every reader who left a comment along the way.' }, category: 'news', genres: ['mystery', 'thriller'], hue: 200, author: 'Community Desk', ts: Date.now() - 5 * 864e5, published: true },
  { id: 'n5', title: { en: 'Release schedule update', fr: 'Mise à jour du calendrier de sorties', ar: 'تحديث جدول الإصدارات', zh: '更新计划调整' }, excerpt: { en: 'Weekly drops move to a Friday-first rhythm for most manhwa series.' }, body: { en: 'See the Release Calendar for exact dates.' }, category: 'schedule', genres: ['action', 'romance'], hue: 150, eventDate: inDays(3), author: 'Platform', ts: Date.now() - 6 * 864e5, published: true },
  { id: 'n6', title: { en: 'Editorial spotlight: five underrated manga', fr: 'Coup de projecteur : cinq mangas sous-estimés', ar: 'تسليط الضوء: خمس مانغا لا تحظى بالتقدير', zh: '编辑聚焦：五部被低估的漫画' }, excerpt: { en: 'Hidden gems our editors keep recommending.' }, body: { en: 'Visit Hidden Gems to see the full list.' }, category: 'spotlight', genres: ['school', 'sports', 'comedy'], hue: 90, author: 'Editorial', ts: Date.now() - 8 * 864e5, published: true },
]
const fromNewsRow = (r) => ({ id: r.id, title: r.title, excerpt: r.excerpt, body: r.body, category: r.category, genres: r.genres || [], hue: r.hue, eventDate: r.event_date, author: r.author, ts: new Date(r.created_at).getTime(), published: r.published })

export const newsService = {
  async list({ all = false } = {}) {
    if (isLive) {
      try {
        let q = supabase.from('news_posts').select('*').order('created_at', { ascending: false }).limit(100)
        if (!all) q = q.eq('published', true)
        const { data } = await q
        if (data?.length) return data.map(fromNewsRow)
      } catch { /* fallback */ }
    }
    const posts = lsGet('pl:news', null) || SEED_NEWS()
    return (all ? posts : posts.filter((p) => p.published)).sort((a, b) => b.ts - a.ts)
  },
  async save(p) {
    const post = { id: uid(), ts: Date.now(), published: true, category: 'news', genres: [], hue: 260, title: { en: '' }, excerpt: { en: '' }, body: { en: '' }, ...p }
    if (isLive) {
      const row = { title: post.title, excerpt: post.excerpt, body: post.body, category: post.category, genres: post.genres, hue: post.hue, event_date: post.eventDate || null, author: post.author || 'Admin', published: post.published }
      const q = p.id && /^[0-9a-f-]{36}$/.test(p.id) ? supabase.from('news_posts').update(row).eq('id', p.id) : supabase.from('news_posts').insert(row)
      const { error } = await q; if (error) throw error; return
    }
    const list = lsGet('pl:news', null) || SEED_NEWS()
    const i = list.findIndex((x) => x.id === post.id)
    if (i >= 0) list[i] = { ...list[i], ...p }; else list.unshift(post)
    lsSet('pl:news', list)
  },
  async remove(id) {
    if (isLive && /^[0-9a-f-]{36}$/.test(id)) { await supabase.from('news_posts').delete().eq('id', id); return }
    lsSet('pl:news', (lsGet('pl:news', null) || SEED_NEWS()).filter((p) => p.id !== id))
  },
  subscribe(cb) {
    if (!isLive) return () => {}
    const ch = supabase.channel('news').on('postgres_changes', { event: '*', schema: 'public', table: 'news_posts' }, cb).subscribe()
    return () => supabase.removeChannel(ch)
  },
}

// ----------------------------------------------------------------- community
export const socialService = {
  async comments(t, chapter, localOnes) {
    let remote = []
    if (isLive) {
      try {
        const { data } = await supabase.from('comments').select('id,body,spoiler,created_at,user_id,status').eq('title_id', t.id).eq('chapter', chapter).eq('status', 'visible').order('created_at', { ascending: false }).limit(60)
        const ids = [...new Set((data || []).map((c) => c.user_id))]
        const { data: ps } = ids.length ? await supabase.from('public_profiles').select('id,handle').in('id', ids) : { data: [] }
        const names = Object.fromEntries((ps || []).map((p) => [p.id, p.handle]))
        remote = (data || []).map((c) => ({ id: c.id, user: names[c.user_id] || 'reader', body: c.body, spoiler: c.spoiler, chapter, ts: new Date(c.created_at).getTime() }))
      } catch { /* ignore */ }
    }
    return [...localOnes.filter((c) => c.t === t.id && c.chapter === chapter), ...remote, ...seedComments(t, chapter)].sort((a, b) => b.ts - a.ts)
  },
  async addComment(t, chapter, body, spoiler, user) {
    const c = { id: uid(), t: t.id, chapter, body, spoiler, user: user || 'you', ts: Date.now(), mine: true }
    if (isLive && user) { const { error } = await supabase.from('comments').insert({ user_id: (await supabase.auth.getUser()).data.user.id, title_id: t.id, chapter, body, spoiler }); if (error) throw error; return null }
    return c
  },
  async report(type, targetId, reason) {
    if (isLive) { const u = (await supabase.auth.getUser()).data.user; if (u) { await supabase.from('reports').insert({ reporter_id: u.id, target_type: type, target_id: String(targetId), reason }); return } }
    const list = lsGet('pl:reports', DEMO_REPORTS()); list.unshift({ id: uid(), type, target: String(targetId), reason, status: 'open', ts: Date.now() }); lsSet('pl:reports', list)
  },
}
const DEMO_REPORTS = () => [
  { id: 'r1', type: 'review', target: 'Review on "Reborn as the Ashen Duke": "this is trash, authors should quit…"', reason: 'Harassment', status: 'open', ts: Date.now() - 36e5 },
  { id: 'r2', type: 'comment', target: 'Comment in "The Ink-Bound Crown" ch.12: spoilers without tag', reason: 'Unmarked spoiler', status: 'open', ts: Date.now() - 5 * 36e5 },
  { id: 'r3', type: 'review', target: 'Review on "Hollow Orchard": link to external site', reason: 'Spam', status: 'open', ts: Date.now() - 2 * 864e5 },
]
export const moderationService = {
  async list() {
    if (isLive) { try { const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100); if (data?.length) return data.map((r) => ({ id: r.id, type: r.target_type, target: `${r.target_type} ${r.target_id}`, reason: r.reason, status: r.status, ts: new Date(r.created_at).getTime(), targetId: r.target_id })) } catch { /* fallback */ } }
    return lsGet('pl:reports', DEMO_REPORTS())
  },
  async resolve(r, status) {
    if (isLive && /^[0-9a-f-]{36}$/.test(r.id)) {
      await supabase.from('reports').update({ status }).eq('id', r.id)
      if (status === 'resolved' && r.targetId) await supabase.from(r.type === 'review' ? 'reviews' : 'comments').update({ status: 'hidden' }).eq('id', r.targetId)
      return
    }
    lsSet('pl:reports', (lsGet('pl:reports', DEMO_REPORTS())).map((x) => (x.id === r.id ? { ...x, status } : x)))
  },
}

// ----------------------------------------------------------------- users (admin)
const SEED_USERS = () => [
  { id: 'u-demo-1', email: 'amina@example.com', display: 'Amina B.', handle: 'amina_reads', role: 'user', ageStatus: 'verified', birthDate: '1996-04-11', suspended: false, joined: Date.now() - 90 * 864e5 },
  { id: 'u-demo-2', email: 'leo@example.com', display: 'Léo M.', handle: 'leo_m', role: 'moderator', ageStatus: 'unverified', birthDate: '2001-09-02', suspended: false, joined: Date.now() - 40 * 864e5 },
  { id: 'u-demo-3', email: 'teen@example.com', display: 'Young Reader', handle: 'young_reader', role: 'user', ageStatus: 'unverified', birthDate: '2011-01-20', suspended: false, joined: Date.now() - 10 * 864e5 },
  { id: 'u-demo-4', email: 'wei@example.com', display: '李伟', handle: 'wei_li', role: 'user', ageStatus: 'rejected', birthDate: '2010-06-30', suspended: true, joined: Date.now() - 5 * 864e5 },
]
export const userAdminService = {
  async list() {
    if (isLive) {
      try {
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)
        if (data) return data.map((p) => ({ id: p.id, email: '—', display: p.display_name, handle: p.handle, role: p.role, ageStatus: p.age_status, birthDate: p.birth_date, suspended: p.suspended, joined: new Date(p.created_at).getTime() }))
      } catch { /* fallback */ }
    }
    return [...demoUsers().map((u) => ({ id: u.id, email: u.email, display: u.display, handle: u.handle, role: u.role, ageStatus: u.ageStatus, birthDate: u.birthDate, suspended: u.suspended, joined: u.joined })), ...lsGet('pl:seedusers', SEED_USERS())]
  },
  async update(id, patch) {
    if (isLive) { const m = { role: 'role', ageStatus: 'age_status', suspended: 'suspended' }; const row = {}; for (const k in patch) row[m[k]] = patch[k]; const { error } = await supabase.from('profiles').update(row).eq('id', id); if (error) throw error; return }
    const du = demoUsers(); const i = du.findIndex((u) => u.id === id)
    if (i >= 0) { du[i] = { ...du[i], ...patch }; lsSet('pl:demo:users', du); return }
    lsSet('pl:seedusers', lsGet('pl:seedusers', SEED_USERS()).map((u) => (u.id === id ? { ...u, ...patch } : u)))
  },
  async remove(id) {
    if (isLive) { await supabase.from('profiles').delete().eq('id', id); return }
    lsSet('pl:demo:users', demoUsers().filter((u) => u.id !== id)); lsSet('pl:seedusers', lsGet('pl:seedusers', SEED_USERS()).filter((u) => u.id !== id))
  },
}
export const demoUsers = () => lsGet('pl:demo:users', [])

// ----------------------------------------------------------------- catalog sources & sync logs
export const SOURCES = [
  { id: 'anilist', name: 'AniList (GraphQL)', kind: 'manga / manhwa / light novels', cors: true },
  { id: 'jikan', name: 'Jikan · MyAnimeList', kind: 'manga & novels', cors: true },
  { id: 'mangadex', name: 'MangaDex API', kind: 'manga / manhwa (proxy recommended)', cors: false },
  { id: 'gutendex', name: 'Gutendex · Project Gutenberg', kind: 'public-domain novels', cors: true },
  { id: 'custom', name: 'Custom REST / CSV feed', kind: 'your own library', cors: false },
]
const GMAP = { Action: 'action', Fantasy: 'fantasy', Romance: 'romance', Thriller: 'thriller', Mystery: 'mystery', 'Sci-Fi': 'scifi', 'Slice of Life': 'sliceoflife', Horror: 'horror', Drama: 'drama', Comedy: 'comedy', Sports: 'sports', Supernatural: 'supernatural', Psychological: 'psychological', Adventure: 'adventure', Mecha: 'mecha' }
export async function fetchConnectorPage(source, page = 1) {
  if (source === 'anilist') {
    const query = `query($page:Int){Page(page:$page,perPage:25){media(type:MANGA,sort:POPULARITY_DESC){id title{romaji english} description genres averageScore popularity chapters status format startDate{year} countryOfOrigin coverImage{large} isAdult}}}`
    const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { page } }) })
    const j = await r.json()
    return (j.data.Page.media || []).map((m) => ({
      title: m.title.english || m.title.romaji, author: '—', format: m.format === 'NOVEL' ? 'novel' : m.countryOfOrigin === 'JP' ? 'manga' : 'manhwa',
      status: m.status === 'FINISHED' ? 'completed' : m.status === 'HIATUS' ? 'hiatus' : 'ongoing', year: m.startDate?.year || 2020, rating: Math.round(((m.averageScore || 70) / 20) * 100) / 100,
      votes: m.popularity || 0, chapters: m.chapters || 50, lang: 'en', genres: (m.genres || []).map((g) => GMAP[g]).filter(Boolean).filter((g) => GENRES.includes(g)).slice(0, 4),
      synopsis: (m.description || '').replace(/<[^>]+>/g, '').slice(0, 600), cover: m.coverImage?.large, mature: !!m.isAdult, origin: m.countryOfOrigin,
    }))
  }
  if (source === 'jikan') {
    const r = await fetch(`https://api.jikan.moe/v4/top/manga?page=${page}&limit=25`); const j = await r.json()
    return (j.data || []).map((m) => ({ title: m.title_english || m.title, author: m.authors?.[0]?.name || '—', format: /novel/i.test(m.type || '') ? 'novel' : /manhwa/i.test(m.type || '') ? 'manhwa' : 'manga', status: m.publishing ? 'ongoing' : 'completed', year: m.published?.prop?.from?.year || 2015, rating: Math.round(((m.score || 7) / 2) * 100) / 100, votes: m.scored_by || 0, chapters: m.chapters || 50, lang: 'en', genres: (m.genres || []).map((g) => GMAP[g.name]).filter(Boolean).slice(0, 4), synopsis: (m.synopsis || '').slice(0, 600), cover: m.images?.jpg?.image_url, mature: (m.rating || '').includes('Rx'), origin: 'JP' }))
  }
  throw new Error('Connector needs a server-side proxy / edge function. See supabase/functions/catalog-sync.')
}
export const syncLogService = {
  async list() {
    if (isLive) { try { const { data } = await supabase.from('catalog_sync_logs').select('*').order('started_at', { ascending: false }).limit(50); if (data) return data.map((l) => ({ id: l.id, source: l.source, status: l.status, imported: l.imported, updated: l.updated, failed: l.failed, message: l.message, ts: new Date(l.started_at).getTime() })) } catch { /* fallback */ } }
    return lsGet('pl:synclogs', [])
  },
  async add(l) {
    const log = { id: uid(), ts: Date.now(), updated: 0, failed: 0, ...l }
    if (isLive) { await supabase.from('catalog_sync_logs').insert({ source: l.source, status: l.status, imported: l.imported || 0, updated: l.updated || 0, failed: l.failed || 0, message: l.message, finished_at: new Date().toISOString() }); return }
    lsSet('pl:synclogs', [log, ...lsGet('pl:synclogs', [])].slice(0, 50))
  },
}
