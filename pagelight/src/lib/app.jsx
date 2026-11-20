import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LANGS, makeT } from './i18n'
import { isLive, supabase } from './supabase'
import { lsGet, lsSet, uid } from './util'
import { loadUserData, subscribeRealtime, useUD, actions } from './userdata'
import { siteService, DEFAULT_SITE, demoUsers } from './services'
import { GENRES } from './catalog'
import { toast } from './toast'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export const DEFAULT_RP = { font: 'serif', size: 19, lh: 1.8, width: 680, align: 'start', comic: 'strip', rtl: null, cinematic: false, autoSpeed: 3, spoilerShield: true, preset: '' }

export function ageOf(birthDate) {
  if (!birthDate) return null
  const b = new Date(birthDate), n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}
export function isAdultProfile(p) {
  if (!p) return false
  if (p.role === 'admin') return true
  if (p.ageStatus === 'rejected') return false
  if (p.ageStatus === 'verified') return true
  const a = ageOf(p.birthDate)
  return a !== null && a >= 18
}

const fromRow = (r, email) => ({
  id: r.id, email, display: r.display_name, handle: r.handle, avatar: r.avatar_url, uiLang: r.ui_lang, contentLangs: r.content_langs || ['en'], birthDate: r.birth_date,
  ageStatus: r.age_status, favGenres: r.favorite_genres || [], mutedTags: r.muted_tags || [], goalMinutes: r.daily_goal_minutes, weeklyGoal: r.weekly_goal_chapters,
  theme: r.theme, accent: r.accent, role: r.role, suspended: r.suspended,
})
const toRow = (p) => ({ id: p.id, display_name: p.display, handle: p.handle, avatar_url: p.avatar, ui_lang: p.uiLang, content_langs: p.contentLangs, birth_date: p.birthDate || null, favorite_genres: p.favGenres, muted_tags: p.mutedTags, daily_goal_minutes: p.goalMinutes, weekly_goal_chapters: p.weeklyGoal, theme: p.theme, accent: p.accent })

function guessLang() {
  const l = (navigator.language || 'en').slice(0, 2)
  return LANGS.some((x) => x.code === l) ? l : 'en'
}

export function AppProvider({ children }) {
  const [lang, setLangS] = useState(() => lsGet('pl:lang', guessLang()))
  const [theme, setThemeS] = useState(() => lsGet('pl:theme', 'midnight'))
  const [accent, setAccentS] = useState(() => lsGet('pl:accent', 'violet'))
  const [rp, setRpS] = useState(() => ({ ...DEFAULT_RP, ...lsGet('pl:rp', {}) }))
  const [site, setSiteS] = useState(DEFAULT_SITE)
  const [profile, setProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [filters, setFilters] = useState({ genres: [], lang: '', format: '' })
  const [peek, setPeek] = useState(null)
  const [quick, setQuick] = useState(false)
  const [help, setHelp] = useState(false)
  const [zen, setZen] = useState(false)

  const t = useMemo(() => makeT(lang), [lang])
  const dir = LANGS.find((l) => l.code === lang)?.dir || 'ltr'
  const genreLabels = useMemo(() => Object.fromEntries(GENRES.map((g) => [g, t('g.' + g)])), [t])
  const tx = useCallback((k, fb) => (t.has(k) ? t(k) : fb ?? k), [t])

  // ---------- apply global attributes
  const effTheme = site.disabledThemes.includes(theme) ? ['midnight', 'sepia', 'oled', 'daylight'].find((x) => !site.disabledThemes.includes(x)) || 'midnight' : theme
  useEffect(() => {
    const h = document.documentElement
    h.lang = lang; h.dir = dir; h.dataset.theme = effTheme; h.dataset.accent = accent
    h.dataset.reduce = lsGet('pl:reduce', false) ? '1' : '0'
    h.style.setProperty('--fs-scale', lsGet('pl:fs', 1))
  }, [lang, dir, effTheme, accent])

  const persistProfile = useCallback((p, patch) => {
    if (!p) return
    if (isLive) supabase.from('profiles').update(toRow({ ...p, ...patch })).eq('id', p.id).then(() => {}, () => {})
    else lsSet('pl:demo:users', demoUsers().map((u) => (u.id === p.id ? { ...u, ...patch } : u)))
  }, [])

  const updateProfile = useCallback(async (patch) => {
    if (!profile) return
    const np = { ...profile, ...patch }
    setProfile(np); persistProfile(profile, patch)
    if (patch.goalMinutes || patch.weeklyGoal) actions.setGoal(np.goalMinutes, np.weeklyGoal)
    if (patch.mutedTags) actions.setMutedTags(patch.mutedTags)
  }, [profile, persistProfile])

  const setLang = useCallback((l) => { setLangS(l); lsSet('pl:lang', l); if (profile) { setProfile({ ...profile, uiLang: l }); persistProfile(profile, { uiLang: l }) } }, [profile, persistProfile])
  const setTheme = useCallback((x) => { setThemeS(x); lsSet('pl:theme', x); if (profile) updateProfile({ theme: x }) }, [profile, updateProfile])
  const setAccent = useCallback((x) => { setAccentS(x); lsSet('pl:accent', x); if (profile) updateProfile({ accent: x }) }, [profile, updateProfile])
  const setRp = useCallback((patch) => setRpS((p) => { const n = { ...p, ...patch }; lsSet('pl:rp', n); return n }), [])

  // ---------- site settings (feature toggles) incl. realtime
  useEffect(() => { siteService.load().then(setSiteS); return siteService.subscribe(setSiteS) }, [])
  const setSite = useCallback(async (v) => { setSiteS(v); try { await siteService.save(v) } catch (e) { toast(e.message, 'error') } }, [])

  // ---------- auth
  const applySession = useCallback(async (u) => {
    if (!u) { setProfile(null); loadUserData(null); setAuthReady(true); return }
    let p = null
    if (isLive) {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle()
      p = data ? fromRow(data, u.email) : null
    } else p = demoUsers().find((x) => x.id === u.id) || null
    if (p?.suspended) { toast('This account is suspended.', 'error'); if (isLive) await supabase.auth.signOut(); else lsSet('pl:demo:session', null); setProfile(null); loadUserData(null); setAuthReady(true); return }
    setProfile(p)
    if (p) { setLangS(p.uiLang || lang); lsSet('pl:lang', p.uiLang || lang); if (p.theme) setThemeS(p.theme); if (p.accent) setAccentS(p.accent); actions.setGoal(p.goalMinutes || 20, p.weeklyGoal || 20) }
    loadUserData(u.id)
    setAuthReady(true)
  }, [lang])

  useEffect(() => {
    if (isLive) {
      supabase.auth.getSession().then(({ data }) => applySession(data.session?.user))
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => applySession(s?.user))
      return () => sub.subscription.unsubscribe()
    }
    const sid = lsGet('pl:demo:session', null)
    applySession(sid ? { id: sid } : null)
  }, []) // eslint-disable-line

  useEffect(() => (profile && isLive ? subscribeRealtime() : undefined), [profile?.id]) // eslint-disable-line

  const signUp = useCallback(async ({ email, password, display, birthDate }) => {
    if (isLive) {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: display, birth_date: birthDate, ui_lang: lang } } })
      return { error: error?.message }
    }
    const users = demoUsers()
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return { error: 'Email already registered' }
    const u = { id: 'u-' + uid(), email, password: btoa(unescape(encodeURIComponent(password))), display: display || email.split('@')[0], handle: email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.floor(Math.random() * 99), avatar: '', uiLang: lang, contentLangs: [lang], birthDate, ageStatus: 'unverified', favGenres: [], mutedTags: [], goalMinutes: 20, weeklyGoal: 20, theme, accent, role: 'user', suspended: false, joined: Date.now() }
    lsSet('pl:demo:users', [...users, u]); lsSet('pl:demo:session', u.id); await applySession(u)
    return {}
  }, [lang, theme, accent, applySession])

  const signIn = useCallback(async ({ email, password }) => {
    if (isLive) { const { error } = await supabase.auth.signInWithPassword({ email, password }); return { error: error?.message } }
    const u = demoUsers().find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === btoa(unescape(encodeURIComponent(password))))
    if (!u) return { error: 'Invalid email or password' }
    lsSet('pl:demo:session', u.id); await applySession(u); return {}
  }, [applySession])

  const signOut = useCallback(async () => {
    if (isLive) await supabase.auth.signOut(); else { lsSet('pl:demo:session', null); await applySession(null) }
  }, [applySession])

  const uploadAvatar = useCallback(async (file) => {
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas'); c.width = c.height = 192
    const s = Math.min(bmp.width, bmp.height)
    c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 192, 192)
    if (isLive && profile) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
      const path = `${profile.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now()
    }
    return c.toDataURL('image/jpeg', 0.85)
  }, [profile])

  // ---------- gating
  const adult = isAdultProfile(profile)
  const canView = useCallback((tt) => !site.features.gating18 || !tt.mature || adult, [site.features.gating18, adult])

  const toggleGenre = (g) => setFilters((f) => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] }))

  const value = {
    lang, setLang, t, tx, dir, genreLabels, theme: effTheme, setTheme, accent, setAccent, rp, setRp, site, setSite,
    profile, user: profile, authReady, signUp, signIn, signOut, updateProfile, uploadAvatar, adult, canView,
    filters, setFilters, toggleGenre, peek, setPeek, quick, setQuick, help, setHelp, zen, setZen,
    enabledFormats: ['novel', 'manhwa', 'manga'].filter((f) => site.features[f + 's'] !== false && site.features[f === 'novel' ? 'novels' : f] !== false),
    isLive,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Convenience: user-data slices */
export const useLibrary = () => useUD((s) => s.library)
export const useProgress = () => useUD((s) => s.progress)
