import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useTitle, streakOf, today, THEMES, ACCENTS } from '../store'
import { GENRES, WARNINGS, LANGS } from '../lib/catalog'
import { LANG_NAMES } from '../lib/i18n'
import { Timeline, Moments } from './Tools'
import { Card, Cover } from '../components'

const ST = ['reading', 'plan', 'completed', 'hold', 'dropped']
function Auth() {
  const { auth, t, toast } = useApp(); const [m, setM] = useState('in'), [f, setF] = useState({ email: '', pw: '', name: '' })
  const go = async (e) => { e.preventDefault(); try { m === 'in' ? await auth.signIn(f.email, f.pw) : await auth.signUp(f.email, f.pw, f.name) } catch (er) { toast(er.message) } }
  return <form className="form glass box" onSubmit={go}><div className="tabs"><button type="button" className={m === 'in' ? 'on' : ''} onClick={() => setM('in')}>{t('signin')}</button><button type="button" className={m === 'up' ? 'on' : ''} onClick={() => setM('up')}>{t('signup')}</button></div>
    {m === 'up' && <input placeholder={t('displayName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
    <input type="email" required placeholder={t('email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><input type="password" required minLength="6" placeholder={t('password')} value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} /><button className="btn pri">{m === 'in' ? t('signin') : t('signup')}</button></form>
}

function Badges({ S }) {
  const streak = streakOf(S.dayMinutes), big = Math.max(0, ...Object.values(S.dayMinutes))
  const B = [['🦉', 'Night Owl', S.night >= 10], ['🏃', 'Marathon Reader', big >= 120], ['🌍', 'Polyglot Explorer', S.langsRead.length >= 3], ['📖', 'First Chapter', Object.values(S.done).flat().length >= 1], ['📚', 'Collector', Object.keys(S.library).length >= 10], ['✍️', 'Critic', S.reviews.length >= 3], ['🔥', '7-Day Streak', streak >= 7], ['🏁', 'Finisher', Object.values(S.library).some((x) => x.status === 'completed')]]
  return <div className="flex wrapf">{B.map(([i, n, ok]) => <span key={n} className="chip" style={{ opacity: ok ? 1 : 0.35 }} title={ok ? 'Unlocked' : 'Locked'}>{i} {n}</span>)}</div>
}
function persona(S) {
  const g = {}; Object.keys(S.library).forEach((id) => S.meta[id]?.genres.forEach((x) => (g[x] = (g[x] || 0) + 1)))
  const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0]?.[0], ch = Object.values(S.done).flat().length
  if (ch > 100) return 'Binge Archivist'
  return { Mystery: 'Mystery Hunter', Thriller: 'Mystery Hunter', Fantasy: 'Fantasy Voyager', Isekai: 'Fantasy Voyager', Romance: 'Romantic Dreamer', Action: 'Battle Chronicler', Horror: 'Midnight Wanderer' }[top] || 'Curious Newcomer'
}

export default function Profile() {
  const { S, set, t, auth, toast, age, mature } = useApp(); const user = S.user; useTitle(t('profile'))
  const [tab, setTab] = useState('overview'), P = S.profile, setP = (p) => set((s) => ({ profile: { ...s.profile, ...p } }))
  const [lst, setLst] = useState('reading'), [cn, setCn] = useState('')
  const ch = Object.values(S.done).flat().length, streak = streakOf(S.dayMinutes), todayM = Math.round(S.dayMinutes[today()] || 0)
  const gc = {}; Object.keys(S.library).forEach((id) => S.meta[id]?.genres.forEach((x) => (gc[x] = (gc[x] || 0) + 1)))
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return S.dayMinutes[d.toISOString().slice(0, 10)] || 0 }), mx = Math.max(1, ...days)
  const exp = (fmt) => {
    const rows = Object.entries(S.library).map(([id, v]) => ({ id, title: S.meta[id]?.title, status: v.status, chapter: S.progress[id]?.ch, pos: S.progress[id]?.pos }))
    const data = fmt === 'json' ? JSON.stringify({ library: S.library, progress: S.progress, meta: S.meta, done: S.done, hl: S.hl }, null, 2) : 'id,title,status,chapter,position\n' + rows.map((r) => [r.id, `"${r.title}"`, r.status, r.chapter, r.pos].join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = `loreleaf.${fmt}`; a.click()
  }
  const imp = async (e) => { try { const j = JSON.parse(await e.target.files[0].text()); set((s) => ({ library: { ...s.library, ...j.library }, progress: { ...s.progress, ...j.progress }, meta: { ...s.meta, ...j.meta }, done: { ...s.done, ...j.done }, hl: [...s.hl, ...(j.hl || []).filter((h) => !s.hl.find((x) => x.id === h.id))] })); toast('✓ imported') } catch { toast('Invalid JSON file') } }
  const avatar = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setP({ avatar: r.result }); r.readAsDataURL(f) }
  const libItems = Object.entries(S.library).filter(([, v]) => v.status === lst).map(([id]) => S.meta[id]).filter(Boolean)
  const alerts = S.follows.filter((f) => f.startsWith('s:')).map((f) => S.meta[f.slice(2)]).filter(Boolean)

  return (
    <>
      <div className="flex">{P.avatar ? <img src={P.avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} /> : <div className="dot" style={{ width: 64, height: 64, background: 'var(--accent)' }} />}
        <div><h1 style={{ margin: 0 }}>{P.name}</h1><span className="muted">{P.handle && '@' + P.handle} · {persona(S)}</span></div><span className="grow" />
        {user ? <button className="btn" onClick={auth.signOut}>{t('signout')} ({user.email})</button> : null}</div>
      {!user && <Auth />}
      <div className="tabs">{['overview', 'settings', 'library', 'timeline', 'moments', 'data'].map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'overview' ? t('analytics') : k === 'settings' ? t('settings') : k === 'library' ? t('library') : k === 'timeline' ? t('timeline') : k === 'moments' ? t('moments') : t('importExp')}</button>)}</div>

      {tab === 'overview' && <>
        <div className="stat"><div><b>{ch}</b>{t('chaptersRead')}</div><div><b>{Math.round(S.minutes)}</b>{t('minutes')}</div><div><b>🔥 {streak}</b>{t('streak')}</div><div><b>{S.minutes > 1 ? Math.round((ch * 6) / (S.minutes / 60)) : 0}</b>{t('wpm')}</div></div>
        <h3>{t('goal')}: {todayM}/{P.goal}</h3><div className="meter"><i style={{ width: Math.min(100, (todayM / P.goal) * 100) + '%' }} /></div>
        <div className="bars" style={{ marginTop: 16 }}>{days.map((d, i) => <i key={i} style={{ height: (d / mx) * 100 + '%' }} title={Math.round(d) + ''} />)}</div>
        <h3>{t('topGenres')}</h3><p>{Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, n]) => <span key={g} className="chip">{g} · {n}</span>)}</p>
        <h3>{t('persona')}: {persona(S)}</h3><h3>{t('badges')}</h3><Badges S={S} />
        {alerts.length > 0 && <><h3>🔔 {t('alerts')}</h3>{alerts.map((m) => <p key={m.id}><Link to={`/title/${m.id}`}>{m.title}</Link> — new chapter {m.chapters + 1} soon</p>)}</>}</>}

      {tab === 'settings' && <div className="cols"><div className="form">
        <label>{t('displayName')}<input value={P.name} onChange={(e) => setP({ name: e.target.value })} /></label>
        <label>{t('username')}<input value={P.handle} onChange={(e) => setP({ handle: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })} /></label>
        <label>Avatar<input type="file" accept="image/*" onChange={avatar} /></label>
        <label>{t('birth')}<input type="number" min="1900" max={new Date().getFullYear()} value={P.birthYear} onChange={(e) => setP({ birthYear: e.target.value })} /></label>
        <small className="muted">{age !== null ? `${age}y · ${mature ? '18+ ✓' : '18+ ✗'}` : t('agegateMsg')}</small>
        <label>{t('goal')}<input type="number" min="5" value={P.goal} onChange={(e) => setP({ goal: +e.target.value || 20 })} /></label>
        <label>{t('language')} (UI)<select value={S.lang} onChange={(e) => set({ lang: e.target.value })}>{Object.entries(LANG_NAMES).map(([l, n]) => <option key={l} value={l}>{n}</option>)}</select></label>
        <div>{t('language')} (content)<br />{LANGS.map((l) => <button key={l} className={'chip' + (P.langs.includes(l) ? ' on' : '')} onClick={() => setP({ langs: P.langs.includes(l) ? P.langs.filter((x) => x !== l) : [...P.langs, l] })}>{l.toUpperCase()}</button>)}</div></div>
        <div><h3>{t('theme')}</h3><div className="flex">{THEMES.filter((x) => S.site.themes[x]).map((x) => <button key={x} className={'chip' + (S.theme === x ? ' on' : '')} onClick={() => set({ theme: x })}>{x}</button>)}</div>
          <h3>{t('accent')}</h3><div className="flex">{ACCENTS.map((c) => <button key={c} className="dot" style={{ background: c }} onClick={() => set({ accent: c })} />)}<input type="color" value={S.accent} onChange={(e) => set({ accent: e.target.value })} /></div>
          <h3>{t('genre')}</h3>{GENRES.map((g) => <button key={g} className={'chip' + (P.genres.includes(g) ? ' on' : '')} onClick={() => setP({ genres: P.genres.includes(g) ? P.genres.filter((x) => x !== g) : [...P.genres, g] })}>{g}</button>)}
          <h3>{t('unmute')}</h3>{WARNINGS.map((w) => <button key={w} className={'chip' + (S.muted.includes(w) ? ' on' : '')} onClick={() => set({ muted: S.muted.includes(w) ? S.muted.filter((x) => x !== w) : [...S.muted, w] })}>{w}</button>)}</div></div>}

      {tab === 'library' && <><div className="flex wrapf">{ST.map((s) => <button key={s} className={'chip' + (lst === s ? ' on' : '')} onClick={() => setLst(s)}>{t(s)} ({Object.values(S.library).filter((v) => v.status === s).length})</button>)}</div>
        <div className="grid" style={{ margin: '12px 0' }}>{libItems.map((m) => <Card key={m.id} t={m} />)}</div>
        <h3>Collections</h3><form className="flex" onSubmit={(e) => { e.preventDefault(); if (cn) { set((s) => ({ collections: [...s.collections, { id: Date.now(), name: cn, items: [] }] })); setCn('') } }}><input value={cn} onChange={(e) => setCn(e.target.value)} placeholder="New shelf…" /><button className="btn">＋</button></form>
        {S.collections.map((c) => <div key={c.id} className="glass box"><b>{c.name}</b> <select onChange={(e) => { if (e.target.value) set((s) => ({ collections: s.collections.map((x) => (x.id === c.id ? { ...x, items: [...new Set([...x.items, +e.target.value])] } : x)) })) }}><option value="">＋ add…</option>{Object.values(S.meta).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
          <div className="flex wrapf">{c.items.map((i) => <Link key={i} className="chip" to={`/title/${i}`}>{S.meta[i]?.title || i}</Link>)}</div></div>)}
        {S.offline.length > 0 && <><h3>⬇ {t('offline')}</h3>{S.offline.map((o) => <p key={o.tid + ':' + o.ch}><Link to={`/read/${o.tid}/${o.ch}`}>{o.title} — {t('chapter')} {o.ch}</Link></p>)}</>}</>}
      {tab === 'timeline' && <Timeline />}
      {tab === 'moments' && <Moments />}
      {tab === 'data' && <div className="flex"><button className="btn" onClick={() => exp('json')}>⬇ JSON</button><button className="btn" onClick={() => exp('csv')}>⬇ CSV</button><label className="btn">⬆ JSON<input type="file" accept=".json" hidden onChange={imp} /></label></div>}
    </>
  )
}
