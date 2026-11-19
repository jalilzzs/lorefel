import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { sb, live } from './lib/supabase'
import { tr } from './lib/i18n'

export const ADMIN_CODE = '010203'
const KEY = 'loreleaf_v1'
export const today = () => new Date().toISOString().slice(0, 10)
export const THEMES = ['midnight', 'sepia', 'oled', 'daylight']
export const ACCENTS = ['#8b9cff', '#ff8fb1', '#5fd3a5', '#ffb454', '#c084fc', '#38bdf8']

export const DEF_SITE = {
  toggles: { novel: true, manhwa: true, manga: true, news: true, tts: true, recs: true, gating: true, sounds: true, extras: true },
  themes: { midnight: true, sepia: true, oled: true, daylight: true },
  langs: { en: true, fr: true, ar: true, zh: true },
  weights: { genre: 3, format: 1.5, velocity: 1, rating: 1, completion: 2 },
  sources: [
    { id: 'md', name: 'Manga catalog API (REST)', url: 'https://api.example.com/manga', enabled: true, last: null, count: 0 },
    { id: 'ol', name: 'Open novel library', url: 'https://openlibrary.org', enabled: true, last: null, count: 0 },
    { id: 'csv', name: 'Bulk CSV / JSON drop', url: 'storage://catalog-imports', enabled: true, last: null, count: 0 },
  ],
}
const SEED_NEWS = [
  { id: 'n1', title: 'Loreleaf launches in four languages', category: 'Platform', body: 'Read in English, Français, العربية and 中文 — switch anytime from the header.', published: true, ts: Date.now() - 864e5 },
  { id: 'n2', title: 'Spotlight: the rise of system-and-dungeon manhwa', category: 'Editorial', body: 'Why LitRPG-flavoured manhwa keeps climbing the trending charts this season.', published: true, ts: Date.now() - 2 * 864e5 },
  { id: 'n3', title: 'Upcoming adaptation announced for a fan-favorite fantasy', category: 'Adaptations', body: 'A long-running web novel is heading to the screen next year.', published: true, ts: Date.now() - 3 * 864e5 },
  { id: 'n4', title: 'Release schedule: weekly chapter drops', category: 'Schedule', body: 'Check the Discover → Calendar tab for the next two weeks of releases.', published: true, ts: Date.now() - 4 * 864e5 },
  { id: 'n5', title: 'Author interview: building a world one chapter at a time', category: 'Authors', body: 'Three authors share how they pace tension across a 300-chapter arc.', published: true, ts: Date.now() - 5 * 864e5 },
]
const DEF = {
  lang: 'en', theme: 'midnight', accent: '#8b9cff', user: null,
  profile: { name: 'Guest Reader', handle: '', avatar: '', birthYear: '', langs: ['en'], genres: [], goal: 20, role: 'user', ageStatus: 'unverified' },
  library: {}, progress: {}, done: {}, meta: {}, minutes: 0, dayMinutes: {}, titleMinutes: {}, hl: [], reviews: [], ratings: {}, tagVotes: {},
  follows: [], collections: [], muted: [], searches: [], offline: [], events: [], discuss: {}, night: 0, langsRead: [], spoiler: true,
  reader: { size: 18, font: 'serif', width: 680, lh: 1.8, mode: 'strip', speed: 0, ver: 0 },
  filters: { q: '', genres: [], format: '', lang: '' }, site: DEF_SITE, news: SEED_NEWS, accounts: [], syncLogs: [],
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)
export function useTitle(s) {
  useEffect(() => { document.title = s ? `${s} · Loreleaf` : 'Loreleaf'; document.querySelector('meta[name=description]')?.setAttribute('content', s ? `${s} — read on Loreleaf` : 'Loreleaf') }, [s])
}
export const streakOf = (dm) => {
  let s = 0; const d = new Date()
  for (;;) {
    const k = d.toISOString().slice(0, 10)
    if ((dm[k] || 0) > 0) { s++; d.setDate(d.getDate() - 1) } else if (s === 0 && k === today()) d.setDate(d.getDate() - 1); else break
  }
  return s
}
const snap = (t) => ({ id: t.id, title: t.title, format: t.format, genres: t.genres, chapters: t.chapters, hue: t.hue, lang: t.lang, author: t.author, mature: t.mature })

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY)); if (!r) return DEF
    return { ...DEF, ...r, profile: { ...DEF.profile, ...(r.profile || {}) }, reader: { ...DEF.reader, ...(r.reader || {}) }, site: { ...DEF_SITE, ...(r.site || {}), toggles: { ...DEF_SITE.toggles, ...(r.site?.toggles || {}) }, themes: { ...DEF_SITE.themes, ...(r.site?.themes || {}) }, langs: { ...DEF_SITE.langs, ...(r.site?.langs || {}) }, weights: { ...DEF_SITE.weights, ...(r.site?.weights || {}) } } }
  } catch { return DEF }
}

async function cloudPush(S) {
  const u = S.user.id, p = S.profile
  await sb.from('profiles').upsert({ id: u, display_name: p.name, handle: p.handle || null, avatar_url: p.avatar || null, ui_lang: S.lang, content_langs: p.langs, birth_year: p.birthYear ? +p.birthYear : null, favorite_genres: p.genres, daily_goal: p.goal, theme: S.theme, accent: S.accent })
  const lib = Object.entries(S.library).map(([id, v]) => ({ user_id: u, title_id: +id, status: v.status }))
  if (lib.length) await sb.from('user_library').upsert(lib)
  const pr = Object.entries(S.progress).map(([id, v]) => ({ user_id: u, title_id: +id, chapter: v.ch, position: v.pos, updated_at: new Date(v.ts).toISOString() }))
  if (pr.length) await sb.from('reading_progress').upsert(pr)
  const st = Object.entries(S.dayMinutes).map(([day, m]) => ({ user_id: u, day, minutes: m }))
  if (st.length) await sb.from('reading_streaks').upsert(st)
  const hl = S.hl.map((h) => ({ id: h.id, user_id: u, title_id: h.tid, chapter: h.ch, kind: h.kind, text: h.text, note: h.note || null }))
  if (hl.length) await sb.from('highlights_notes').upsert(hl)
}
async function cloudPull(uid, set) {
  const [p, l, r, s, h] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(), sb.from('user_library').select('*').eq('user_id', uid),
    sb.from('reading_progress').select('*').eq('user_id', uid), sb.from('reading_streaks').select('*').eq('user_id', uid), sb.from('highlights_notes').select('*').eq('user_id', uid)])
  const ids = [...new Set([...(l.data || []).map((x) => x.title_id), ...(r.data || []).map((x) => x.title_id)])]
  const meta = {}
  if (ids.length) { const { data } = await sb.from('titles').select('id,title,format,genres,chapters_count,hue,lang,author,mature').in('id', ids.slice(0, 200)); (data || []).forEach((t) => { meta[t.id] = { ...t, chapters: t.chapters_count } }) }
  set((S) => ({
    meta: { ...S.meta, ...meta },
    ...(p.data ? { lang: p.data.ui_lang || S.lang, theme: p.data.theme || S.theme, accent: p.data.accent || S.accent, profile: { ...S.profile, name: p.data.display_name || S.profile.name, handle: p.data.handle || '', avatar: p.data.avatar_url || '', langs: p.data.content_langs || S.profile.langs, birthYear: p.data.birth_year || '', genres: p.data.favorite_genres || [], goal: p.data.daily_goal || 20, role: p.data.role, ageStatus: p.data.age_status || 'unverified' } } : {}),
    library: { ...S.library, ...Object.fromEntries((l.data || []).map((x) => [x.title_id, { status: x.status, ts: Date.parse(x.updated_at) || Date.now() }])) },
    progress: { ...S.progress, ...Object.fromEntries((r.data || []).map((x) => [x.title_id, { ch: x.chapter, pos: x.position, ts: Date.parse(x.updated_at) || 0 }])) },
    dayMinutes: { ...S.dayMinutes, ...Object.fromEntries((s.data || []).map((x) => [x.day, x.minutes])) },
    hl: [...S.hl, ...(h.data || []).filter((x) => !S.hl.find((y) => y.id === x.id)).map((x) => ({ id: x.id, tid: x.title_id, ch: x.chapter, kind: x.kind, text: x.text, note: x.note, ts: Date.parse(x.created_at) }))],
  }))
}

export function Provider({ children }) {
  const [S, setS] = useState(load)
  const [toasts, setToasts] = useState([])
  const [peek, setPeek] = useState(null)
  const [quick, setQuick] = useState(false)
  const [admin, setAdminState] = useState(() => sessionStorage.getItem('ll_admin') === '1')
  const ref = useRef(S); ref.current = S

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(S)) }, [S])
  useEffect(() => { const d = document.documentElement; d.dataset.theme = S.theme; d.style.setProperty('--accent', S.accent); d.lang = S.lang; d.dir = S.lang === 'ar' ? 'rtl' : 'ltr' }, [S.theme, S.accent, S.lang])
  const set = useCallback((p) => setS((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), [])
  const toast = useCallback((m) => { const id = Math.random(); setToasts((x) => [...x, { id, m }]); setTimeout(() => setToasts((x) => x.filter((i) => i.id !== id)), 2600) }, [])
  const t = useCallback((k) => tr(S.lang, k), [S.lang])

  // live mode: restore session, pull site settings + news
  useEffect(() => {
    if (!live) return
    sb.auth.getSession().then(({ data }) => { const u = data.session?.user; if (u) { set({ user: { id: u.id, email: u.email } }); cloudPull(u.id, set) } })
    const { data: sub } = sb.auth.onAuthStateChange((_e, sess) => { if (!sess) set({ user: null }) })
    sb.from('site_settings').select('value').eq('key', 'main').maybeSingle().then(({ data }) => { if (data?.value) set((s) => ({ site: { ...s.site, ...data.value, toggles: { ...s.site.toggles, ...(data.value.toggles || {}) } } })) })
    sb.from('news_posts').select('*').eq('published', true).order('created_at', { ascending: false }).limit(50).then(({ data }) => { if (data?.length) set({ news: data.map((n) => ({ id: n.id, title: n.title, body: n.body, category: n.category, published: n.published, ts: Date.parse(n.created_at) })) }) })
    return () => sub.subscription.unsubscribe()
  }, [set])
  // live mode: debounced cross-device sync
  useEffect(() => {
    if (!live || !S.user) return
    const id = setTimeout(() => cloudPush(ref.current).catch(console.warn), 2000)
    return () => clearTimeout(id)
  }, [S.profile, S.theme, S.accent, S.lang, S.library, S.progress, S.hl, S.dayMinutes, S.user])

  const age = S.profile.birthYear ? new Date().getFullYear() - +S.profile.birthYear : null
  const mature = !S.site.toggles.gating || admin || (S.profile.ageStatus !== 'denied' && age !== null && age >= 18)
  const base = useMemo(() => ({ mature, mute: S.muted, formats: ['novel', 'manhwa', 'manga'].filter((f) => S.site.toggles[f]) }), [mature, S.muted, S.site.toggles])

  const afterLogin = (u, name) => { set((s) => ({ user: { id: u.id, email: u.email }, profile: { ...s.profile, name: name || u.name || s.profile.name, role: u.role || s.profile.role, ageStatus: u.ageStatus || s.profile.ageStatus } })); if (live) cloudPull(u.id, set) }
  const auth = {
    async signUp(email, pw, name) {
      if (live) { const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { display_name: name } } }); if (error) throw error; if (data.session) afterLogin(data.user, name); else toast('Check your inbox to confirm your email.'); return }
      if (ref.current.accounts.find((a) => a.email === email)) throw new Error('Account exists')
      const u = { id: 'u_' + Date.now(), email, pw: btoa(pw), name: name || email.split('@')[0], role: 'user', ageStatus: 'unverified', suspended: false, created: Date.now() }
      set((s) => ({ accounts: [...s.accounts, u] })); afterLogin(u, u.name)
    },
    async signIn(email, pw) {
      if (live) { const { data, error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; afterLogin(data.user); return }
      const u = ref.current.accounts.find((a) => a.email === email && a.pw === btoa(pw)); if (!u) throw new Error('Invalid credentials'); if (u.suspended) throw new Error('Account suspended'); afterLogin(u)
    },
    async signOut() { if (live) await sb.auth.signOut(); set({ user: null }) },
  }
  const unlockAdmin = (code) => { if (code === ADMIN_CODE) { sessionStorage.setItem('ll_admin', '1'); setAdminState(true); return true } return false }
  const lockAdmin = () => { sessionStorage.removeItem('ll_admin'); setAdminState(false) }

  const act = {
    setStatus(x, status) { set((s) => { const lib = { ...s.library }; if (!status) delete lib[x.id]; else lib[x.id] = { status, ts: Date.now() }; return { library: lib, meta: { ...s.meta, [x.id]: snap(x) }, events: status ? [...s.events, { ts: Date.now(), type: status, tid: x.id, title: x.title }].slice(-300) : s.events } }) },
    saveProgress(x, ch, pos) { set((s) => ({ progress: { ...s.progress, [x.id]: { ch, pos, ts: Date.now() } }, meta: { ...s.meta, [x.id]: snap(x) }, langsRead: s.langsRead.includes(x.lang) ? s.langsRead : [...s.langsRead, x.lang], library: s.library[x.id] ? s.library : { ...s.library, [x.id]: { status: 'reading', ts: Date.now() } } })) },
    markDone(x, ch) { set((s) => { const d = s.done[x.id] || []; return d.includes(ch) ? null : { done: { ...s.done, [x.id]: [...d, ch] } } }) },
    addMinutes(tid, m) { set((s) => { const k = today(); return { minutes: s.minutes + m, dayMinutes: { ...s.dayMinutes, [k]: (s.dayMinutes[k] || 0) + m }, titleMinutes: { ...s.titleMinutes, [tid]: (s.titleMinutes[tid] || 0) + m }, night: new Date().getHours() < 5 ? s.night + m : s.night } }) },
    addHL(h) { set((s) => ({ hl: [...s.hl, { id: crypto.randomUUID(), ts: Date.now(), kind: 'hl', ...h }] })) },
    delHL(id) { set((s) => ({ hl: s.hl.filter((h) => h.id !== id) })) },
    toggleFollow(k) { set((s) => ({ follows: s.follows.includes(k) ? s.follows.filter((x) => x !== k) : [...s.follows, k] })) },
    search(q) { if (q) set((s) => ({ searches: [...s.searches.filter((x) => x !== q), q].slice(-30) })) },
    saveSite(site) { set({ site }); if (live) sb.from('site_settings').upsert({ key: 'main', value: site }).then(({ error }) => error && toast(error.message)) },
    async saveNews(p) { const post = { ...p, id: p.id || 'n' + Date.now(), ts: p.ts || Date.now() }; if (live) { const row = { title: post.title, body: post.body, category: post.category, published: post.published }; const q = p.id && !String(p.id).startsWith('n') ? sb.from('news_posts').update(row).eq('id', p.id) : sb.from('news_posts').insert(row); const { error } = await q; if (error) return toast(error.message) } set((s) => ({ news: s.news.find((n) => n.id === post.id) ? s.news.map((n) => (n.id === post.id ? post : n)) : [post, ...s.news] })) },
    async delNews(id) { if (live && !String(id).startsWith('n')) await sb.from('news_posts').delete().eq('id', id); set((s) => ({ news: s.news.filter((n) => n.id !== id) })) },
  }
  const v = { S, set, t, toast, toasts, peek, setPeek, quick, setQuick, admin, unlockAdmin, lockAdmin, mature, base, age, auth, act, live }
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
