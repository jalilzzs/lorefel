// Per-user reading data: external store (so reader progress ticks never re-render the whole app).
// Local-first: always persisted to localStorage; mirrored to Supabase tables when live + signed in.
import { useSyncExternalStore } from 'react'
import { lsGet, lsSet, dayKey, debounce, uid, toCSV } from './util'
import { isLive, supabase } from './supabase'
import { toast } from './toast'
import { catalog } from './catalog'

const empty = () => ({
  library: {}, progress: {}, notes: [], ratings: {}, reviews: [], tagVotes: {}, follows: [], collections: [],
  days: {}, history: [], goalMinutes: 20, weeklyGoal: 20, searches: [], badges: {}, pollVotes: {}, comments: [],
  offline: [], quizzes: {}, mutedTags: [], nightReads: 0,
})

export const BADGES = ['first-chapter', 'night-owl', 'marathon', 'polyglot', 'streak-7', 'bookworm', 'critic', 'annotator', 'quiz-master', 'explorer']

let state = empty()
let storeKey = 'guest'
let syncUser = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const persist = debounce(() => lsSet('pl:ud:' + storeKey, state), 300)

export const getUD = () => state
export const useUD = (sel) => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => sel(state))

function set(fn) { state = fn(state); persist(); emit() }

export function loadUserData(userId) {
  storeKey = userId || 'guest'
  state = { ...empty(), ...lsGet('pl:ud:' + storeKey, {}) }
  if (userId && !Object.keys(state.library).length && !Object.keys(state.progress).length) {
    const guest = lsGet('pl:ud:guest', null)   // adopt anonymous activity on first sign-in
    if (guest) state = { ...state, ...guest }
  }
  syncUser = userId && isLive ? userId : null
  emit()
  if (syncUser) pullRemote()
}

// ------------------------------------------------------------ remote sync (live mode)
const safe = (p) => Promise.resolve(p).catch((e) => console.warn('[sync]', e?.message || e))
const push = (table, row, onConflict) => syncUser && safe(supabase.from(table).upsert({ user_id: syncUser, ...row }, onConflict ? { onConflict } : undefined))
const pushStreak = debounce(() => {
  if (!syncUser) return
  const s = computeStreak(state.days)
  safe(supabase.from('reading_streaks').upsert({ user_id: syncUser, current_streak: s.current, longest_streak: s.longest, last_read_date: dayKey(), days: state.days, goal_minutes: state.goalMinutes, updated_at: new Date().toISOString() }))
}, 4000)
const pushProgress = {}
function scheduleProgress(id) {
  if (!syncUser) return
  clearTimeout(pushProgress[id])
  pushProgress[id] = setTimeout(() => {
    const p = state.progress[id]; if (!p) return
    safe(supabase.from('reading_progress').upsert({ user_id: syncUser, title_id: id, chapter: p.chapter, position: Math.min(0.99999, p.pos || 0), max_chapter: p.max || p.chapter, seconds_read: Math.round(p.seconds || 0), updated_at: new Date().toISOString() }))
  }, 2500)
}

export async function pullRemote() {
  if (!syncUser) return
  try {
    const [lib, prog, notes, revs, cols, strk, fol, badges, votes] = await Promise.all([
      supabase.from('user_library').select('*'), supabase.from('reading_progress').select('*'), supabase.from('highlights_notes').select('*'),
      supabase.from('reviews').select('*').eq('user_id', syncUser), supabase.from('collections').select('*'), supabase.from('reading_streaks').select('*').maybeSingle(),
      supabase.from('follows').select('*'), supabase.from('user_badges').select('*'), supabase.from('tag_votes').select('*'),
    ])
    set((s) => {
      const n = { ...s }
      if (lib.data) for (const r of lib.data) n.library = { ...n.library, [r.title_id]: { status: r.status, ts: new Date(r.updated_at).getTime() } }
      if (prog.data) for (const r of prog.data) applyRemoteProgress(n, r)
      if (notes.data) n.notes = notes.data.map((r) => ({ id: r.id, t: r.title_id, c: r.chapter, kind: r.kind, para: r.para, start: r.start_off, end: r.end_off, text: r.text, note: r.note, ts: new Date(r.created_at).getTime() }))
      if (revs.data) n.reviews = revs.data.map((r) => ({ id: r.id, t: r.title_id, rating: Number(r.rating), body: r.body, pros: r.pros, cons: r.cons, spoiler: r.spoiler, ts: new Date(r.created_at).getTime(), mine: true }))
      if (cols.data) n.collections = cols.data.map((r) => ({ id: r.id, name: r.name, items: (r.items || []).map(Number), pub: r.is_public }))
      if (strk.data) { n.days = { ...(strk.data.days || {}), ...n.days }; n.goalMinutes = strk.data.goal_minutes || n.goalMinutes }
      if (fol.data) n.follows = fol.data.map((r) => ({ kind: r.kind, name: r.name }))
      if (badges.data) for (const r of badges.data) n.badges = { ...n.badges, [r.badge]: new Date(r.unlocked_at).getTime() }
      if (votes.data) { n.tagVotes = {}; for (const r of votes.data) (n.tagVotes[r.title_id] = n.tagVotes[r.title_id] || []).push(r.tag) }
      return n
    })
  } catch (e) { console.warn('[sync] pull failed', e) }
}
function applyRemoteProgress(n, r) {
  const local = n.progress[r.title_id]
  const rts = new Date(r.updated_at).getTime()
  if (!local || rts > (local.ts || 0)) n.progress = { ...n.progress, [r.title_id]: { ...(local || {}), chapter: r.chapter, pos: Number(r.position), max: r.max_chapter, seconds: r.seconds_read, ts: rts } }
}
/** Realtime: cross-device progress sync. Returns an unsubscribe function. */
export function subscribeRealtime() {
  if (!syncUser) return () => {}
  const ch = supabase.channel('progress-' + syncUser)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reading_progress', filter: `user_id=eq.${syncUser}` }, (p) => {
      if (p.new && p.new.title_id) set((s) => { const n = { ...s }; applyRemoteProgress(n, p.new); return n })
    }).subscribe()
  return () => supabase.removeChannel(ch)
}

// ------------------------------------------------------------ streak helpers
export function computeStreak(days) {
  const active = (k) => days[k] && (days[k].seconds >= 60 || days[k].chapters >= 1)
  const d = new Date()
  let cur = 0
  if (!active(dayKey(d))) d.setDate(d.getDate() - 1)
  while (active(dayKey(d))) { cur++; d.setDate(d.getDate() - 1) }
  const keys = Object.keys(days).filter(active).sort()
  let longest = 0, run = 0, prev = null
  for (const k of keys) {
    if (prev) { const diff = (new Date(k) - new Date(prev)) / 864e5; run = diff === 1 ? run + 1 : 1 } else run = 1
    longest = Math.max(longest, run); prev = k
  }
  return { current: cur, longest: Math.max(longest, cur) }
}

// ------------------------------------------------------------ actions
export const actions = {
  setStatus(id, status) {
    set((s) => { const lib = { ...s.library }; if (status) lib[id] = { status, ts: Date.now() }; else delete lib[id]; return { ...s, library: lib } })
    if (syncUser) status ? push('user_library', { title_id: id, status, updated_at: new Date().toISOString() }, 'user_id,title_id') : safe(supabase.from('user_library').delete().eq('user_id', syncUser).eq('title_id', id))
    checkBadges()
  },
  saveProgress(id, patch) {
    set((s) => {
      const p = s.progress[id] || { started: Date.now(), seconds: 0, read: [] }
      const np = { ...p, ...patch, ts: Date.now() }
      np.max = Math.max(p.max || 0, np.chapter || 0)
      return { ...s, progress: { ...s.progress, [id]: np } }
    })
    scheduleProgress(id)
  },
  addTime(id, seconds) {
    const today = dayKey()
    const before = (state.days[today]?.seconds || 0) / 60
    set((s) => {
      const p = s.progress[id] || { started: Date.now(), seconds: 0, read: [] }
      const d = s.days[today] || { seconds: 0, chapters: 0 }
      return { ...s, progress: { ...s.progress, [id]: { ...p, seconds: (p.seconds || 0) + seconds } }, days: { ...s.days, [today]: { ...d, seconds: d.seconds + seconds } } }
    })
    const after = (state.days[today].seconds) / 60
    if (before < state.goalMinutes && after >= state.goalMinutes) toast('🎯 Daily goal reached!', 'success')
    pushStreak(); scheduleProgress(id)
  },
  markRead(id, chapter) {
    const p = state.progress[id]
    if (p?.read?.includes(chapter)) return
    const today = dayKey()
    const h = new Date().getHours()
    set((s) => {
      const pp = s.progress[id] || { started: Date.now(), seconds: 0, read: [] }
      const d = s.days[today] || { seconds: 0, chapters: 0 }
      return {
        ...s,
        progress: { ...s.progress, [id]: { ...pp, read: [...(pp.read || []), chapter] } },
        days: { ...s.days, [today]: { ...d, chapters: d.chapters + 1 } },
        history: [...s.history, { t: id, c: chapter, ts: Date.now() }].slice(-800),
        nightReads: s.nightReads + (h < 5 ? 1 : 0),
      }
    })
    const t = catalog.local(id)
    if (t && chapter >= t.chapters && t.status === 'completed' && state.library[id]?.status !== 'completed') { actions.setStatus(id, 'completed'); toast('Marked as completed 🎉', 'success') }
    else if (!state.library[id]) actions.setStatus(id, 'reading')
    pushStreak(); checkBadges()
  },
  addNote(n) {
    const note = { id: uid(), ts: Date.now(), ...n }
    set((s) => ({ ...s, notes: [...s.notes, note] }))
    push('highlights_notes', { id: note.id, title_id: note.t, chapter: note.c, kind: note.kind, para: note.para ?? null, start_off: note.start ?? null, end_off: note.end ?? null, text: note.text ?? null, note: note.note ?? null })
    checkBadges(); return note
  },
  removeNote(id) {
    set((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }))
    if (syncUser) safe(supabase.from('highlights_notes').delete().eq('id', id))
  },
  rate(id, value) { set((s) => ({ ...s, ratings: { ...s.ratings, [id]: value } })) },
  addReview(r) {
    const review = { id: uid(), ts: Date.now(), mine: true, ...r }
    set((s) => ({ ...s, ratings: { ...s.ratings, [r.t]: r.rating }, reviews: [...s.reviews.filter((x) => x.t !== r.t), review] }))
    push('reviews', { title_id: r.t, rating: r.rating, body: r.body, pros: r.pros, cons: r.cons, spoiler: !!r.spoiler }, 'user_id,title_id')
    checkBadges()
  },
  voteTag(id, tag) {
    const has = (state.tagVotes[id] || []).includes(tag)
    set((s) => { const cur = s.tagVotes[id] || []; return { ...s, tagVotes: { ...s.tagVotes, [id]: has ? cur.filter((x) => x !== tag) : [...cur, tag] } } })
    if (syncUser) has ? safe(supabase.from('tag_votes').delete().eq('user_id', syncUser).eq('title_id', id).eq('tag', tag)) : push('tag_votes', { title_id: id, tag }, 'user_id,title_id,tag')
  },
  toggleFollow(kind, name) {
    const has = state.follows.some((f) => f.kind === kind && f.name === name)
    set((s) => ({ ...s, follows: has ? s.follows.filter((f) => !(f.kind === kind && f.name === name)) : [...s.follows, { kind, name }] }))
    if (syncUser) has ? safe(supabase.from('follows').delete().eq('user_id', syncUser).eq('kind', kind).eq('name', name)) : push('follows', { kind, name }, 'user_id,kind,name')
    return !has
  },
  createCollection(name) {
    const c = { id: uid(), name, items: [], pub: false }
    set((s) => ({ ...s, collections: [...s.collections, c] })); syncCollection(c); return c
  },
  addToCollection(cid, tid) {
    set((s) => ({ ...s, collections: s.collections.map((c) => (c.id === cid && !c.items.includes(tid) ? { ...c, items: [...c.items, tid] } : c)) }))
    syncCollection(state.collections.find((c) => c.id === cid))
  },
  removeFromCollection(cid, tid) {
    set((s) => ({ ...s, collections: s.collections.map((c) => (c.id === cid ? { ...c, items: c.items.filter((i) => i !== tid) } : c)) }))
    syncCollection(state.collections.find((c) => c.id === cid))
  },
  deleteCollection(cid) {
    set((s) => ({ ...s, collections: s.collections.filter((c) => c.id !== cid) }))
    if (syncUser) safe(supabase.from('collections').delete().eq('id', cid))
  },
  pushSearch(q) { if (q && q.length > 1) set((s) => ({ ...s, searches: [q, ...s.searches.filter((x) => x !== q)].slice(0, 30) })) },
  votePoll(pid, idx) { set((s) => ({ ...s, pollVotes: { ...s.pollVotes, [pid]: idx } })) },
  setGoal(minutes, weekly) { set((s) => ({ ...s, goalMinutes: minutes, weeklyGoal: weekly ?? s.weeklyGoal })); pushStreak() },
  setMutedTags(tags) { set((s) => ({ ...s, mutedTags: tags })) },
  quizDone(key, score, total) {
    set((s) => ({ ...s, quizzes: { ...s.quizzes, [key]: { score, total, ts: Date.now() } } })); checkBadges()
  },
  setOffline(list) { set((s) => ({ ...s, offline: list })) },
  addLocalComment(c) { set((s) => ({ ...s, comments: [...s.comments, c] })) },
  clearAll() { state = empty(); persist(); emit() },
}
function syncCollection(c) {
  if (c) push('collections', { id: c.id, name: c.name, items: c.items, is_public: !!c.pub }, 'id')
}

function checkBadges() {
  const s = state
  const unlocked = (id) => s.badges[id]
  const grant = (id) => {
    if (unlocked(id)) return
    set((x) => ({ ...x, badges: { ...x.badges, [id]: Date.now() } }))
    toast(`🏅 Badge unlocked: ${id}`, 'success'); push('user_badges', { badge: id }, 'user_id,badge')
  }
  const totalRead = s.history.length
  if (totalRead >= 1) grant('first-chapter')
  if (s.nightReads >= 3) grant('night-owl')
  if ((s.days[dayKey()]?.chapters || 0) >= 10) grant('marathon')
  const langs = new Set(Object.keys(s.progress).map((id) => catalog.local(+id)?.lang).filter(Boolean))
  if (langs.size >= 3) grant('polyglot')
  if (computeStreak(s.days).current >= 7) grant('streak-7')
  const lib = Object.entries(s.library)
  if (lib.filter(([, v]) => v.status === 'completed').length >= 5) grant('bookworm')
  if (s.reviews.length >= 3) grant('critic')
  if (s.notes.length >= 10) grant('annotator')
  if (Object.values(s.quizzes).some((q) => q.score === q.total && q.total >= 3)) grant('quiz-master')
  const fm = new Set(lib.map(([id]) => catalog.local(+id)?.format).filter(Boolean))
  if (fm.size >= 3) grant('explorer')
}

// ------------------------------------------------------------ import / export
export function exportJSON() { return JSON.stringify({ app: 'pagelight', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2) }
export function exportLibraryCSV() {
  const rows = [['id', 'title', 'format', 'status', 'chapter', 'position', 'rating']]
  for (const [id, v] of Object.entries(state.library)) {
    const t = catalog.local(+id); const p = state.progress[id]
    rows.push([id, t?.title || '', t?.format || '', v.status, p?.chapter || '', p ? (p.pos || 0).toFixed(3) : '', state.ratings[id] || ''])
  }
  return toCSV(rows)
}
export function importJSON(text) {
  const o = JSON.parse(text)
  if (o.app !== 'pagelight' || !o.data) throw new Error('Not a Pagelight export')
  set((s) => ({ ...s, ...o.data }))
  if (syncUser) { Object.entries(state.library).forEach(([id, v]) => push('user_library', { title_id: +id, status: v.status }, 'user_id,title_id')); Object.keys(state.progress).forEach((id) => scheduleProgress(+id)) }
  return Object.keys(o.data.library || {}).length
}
export function importCSVRows(rows) {
  const [head, ...body] = rows; const ix = (n) => head.indexOf(n); let n = 0
  for (const r of body) {
    const id = +r[ix('id')]; const status = r[ix('status')]
    if (id && ['reading', 'plan', 'completed', 'hold', 'dropped'].includes(status)) {
      actions.setStatus(id, status)
      const ch = +r[ix('chapter')]; if (ch) actions.saveProgress(id, { chapter: ch, pos: +r[ix('position')] || 0 })
      n++
    }
  }
  return n
}
