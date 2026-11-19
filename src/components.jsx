import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from './store'
import { coverUrl, GENRES, LANGS, suggest, synopsis, chapterText, tension } from './lib/catalog'
import { LANG_NAMES } from './lib/i18n'
import { THEMES, ACCENTS } from './store'

export const Logo = ({ size = 32, text = true }) => {
  const { S } = useApp(); const dark = S.theme === 'midnight' || S.theme === 'oled'
  const a = dark ? ['#8b9cff', '#ff8fb1', '#10122b'] : ['#4f5bd5', '#d6336c', '#fff']
  return (
    <span className="logo" aria-label="Loreleaf">
      <svg width={size} height={size} viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a[0]} /><stop offset="1" stopColor={a[1]} /></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg)" /><path d="M14 18c6-2 13-1 18 3 5-4 12-5 18-3v28c-6-2-13-1-18 3-5-4-12-5-18-3z" fill={a[2]} /><path d="M32 21v28" stroke={a[0]} strokeWidth="2" /><path d="M42 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={a[2]} /></svg>
      {text && <b>Loreleaf</b>}
    </span>
  )
}

export const Cover = ({ t }) => <img className="cover" src={coverUrl(t)} alt={t.title} loading="lazy" />
export const Stars = ({ v, set }) => (
  <span className="stars" aria-label={`${v} / 5`}>{[1, 2, 3, 4, 5].map((i) => <button key={i} type="button" className={i <= Math.round(v) ? 'on' : ''} onClick={() => set && set(i)} disabled={!set}>★</button>)}</span>
)
export const Tension = ({ t, ch }) => {
  const a = Math.max(1, ch - 6), arr = Array.from({ length: 13 }, (_, i) => a + i).filter((n) => n <= t.chapters)
  return <div className="tension">{arr.map((n) => <i key={n} className={n === ch ? 'cur' : ''} style={{ height: 6 + tension(t, n) * 40 }} title={`${n}`} />)}</div>
}

export function Parallax({ t, w = 220 }) {
  const ref = useRef()
  const mv = (e) => { const r = ref.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5, s = ref.current.style; s.setProperty('--rx', -y * 12 + 'deg'); s.setProperty('--ry', x * 12 + 'deg'); s.setProperty('--mx', (x + 0.5) * 100 + '%'); s.setProperty('--my', (y + 0.5) * 100 + '%') }
  const lv = () => { const s = ref.current.style; s.setProperty('--rx', '0deg'); s.setProperty('--ry', '0deg') }
  return <div ref={ref} className="parallax" style={{ width: w }} onMouseMove={mv} onMouseLeave={lv}><img src={coverUrl(t)} alt={t.title} /><i className="sheen" /></div>
}

export function Card({ t: x }) {
  const { t, setPeek } = useApp()
  return (
    <Link to={`/title/${x.id}`} className="card">
      <div className="cw"><Cover t={x} /><span className="fmt">{t(x.format)}</span>{x.mature && <span className="m18">18+</span>}
        <button className="peekb" onClick={(e) => { e.preventDefault(); setPeek(x) }} aria-label={t('peek')}>👁</button></div>
      <b>{x.title}</b><small>★ {x.rating} · {x.chapters} {t('chapters')}</small>
    </Link>
  )
}
export const Skeleton = ({ n = 6 }) => <div className="row">{Array.from({ length: n }, (_, i) => <div key={i} className="card"><div className="cw skel" /><div className="skel line" /></div>)}</div>
export const Row = ({ title, items, extra }) => (
  <section className="sec"><h2>{title}</h2>{!items ? <Skeleton /> : !items.length ? <p className="muted">—</p> : <div className="row">{items.map((x) => (x.t ? <div key={x.t.id} className="rc"><Card t={x.t} />{extra && extra(x)}</div> : <Card key={x.id} t={x} />))}</div>}</section>
)
export const Empty = ({ children }) => <div className="empty"><Logo size={44} text={false} /><p>{children}</p></div>

export function Peek() {
  const { peek, setPeek, t } = useApp()
  useEffect(() => { const f = (e) => e.key === 'Escape' && setPeek(null); addEventListener('keydown', f); return () => removeEventListener('keydown', f) }, [setPeek])
  if (!peek) return null
  return (
    <div className="modal" onClick={() => setPeek(null)}>
      <div className="glass box" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex"><div style={{ width: 120 }}><Cover t={peek} /></div>
          <div><h3>{peek.title}</h3><p className="muted">{peek.author} · ★ {peek.rating} · {t(peek.format)}</p>
            <p>{synopsis(peek)}</p><p>{peek.genres.concat(peek.tags).map((g) => <span key={g} className="chip sm">{g}</span>)}</p></div></div>
        <blockquote className="sample">{chapterText(peek, 1)[0]}</blockquote>
        <div className="flex"><Link className="btn pri" to={`/read/${peek.id}/1`} onClick={() => setPeek(null)}>{t('startReading')}</Link><Link className="btn" to={`/title/${peek.id}`} onClick={() => setPeek(null)}>{t('overview')}</Link><button className="btn" onClick={() => setPeek(null)}>{t('close')}</button></div>
      </div>
    </div>
  )
}

function FilterBar() {
  const { S, set, t, base, act } = useApp(); const nav = useNavigate(), loc = useLocation()
  const F = S.filters, [open, setOpen] = useState(false), [sug, setSug] = useState([]), [q, setQ] = useState(F.q)
  useEffect(() => setQ(F.q), [F.q])
  const upd = (p) => { set((s) => ({ filters: { ...s.filters, ...p } })); if (loc.pathname !== '/browse') nav('/browse') }
  useEffect(() => { const id = setTimeout(() => suggest(q, base).then(setSug).catch(() => {}), 200); return () => clearTimeout(id) }, [q])
  const submit = (e) => { e.preventDefault(); act.search(q); setSug([]); upd({ q }) }
  return (
    <div className="fbar glass">
      <form onSubmit={submit} className="sbox"><input id="gsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchph')} aria-label={t('search')} />
        <button className="btn pri">{t('search')}</button>
        {sug.length > 0 && <ul className="sug" onMouseLeave={() => setSug([])}>{sug.map((x) => <li key={x.id}><Link to={`/title/${x.id}`} onClick={() => setSug([])}>{x.title} <small>{t(x.format)}</small></Link></li>)}</ul>}</form>
      <select value={F.format} onChange={(e) => upd({ format: e.target.value })} aria-label={t('format')}><option value="">{t('format')}: {t('all')}</option>{['novel', 'manhwa', 'manga'].map((f) => <option key={f} value={f}>{t(f)}</option>)}</select>
      <select value={F.lang} onChange={(e) => upd({ lang: e.target.value })} aria-label={t('language')}><option value="">{t('language')}: {t('all')}</option>{LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{t('genre')} {F.genres.length ? `(${F.genres.length})` : ''}</button>
      {open && <div className="genres">{GENRES.map((g) => <button key={g} className={'chip' + (F.genres.includes(g) ? ' on' : '')} onClick={() => upd({ genres: F.genres.includes(g) ? F.genres.filter((x) => x !== g) : [...F.genres, g] })}>{g}</button>)}
        {(F.genres.length > 0 || F.q || F.format || F.lang) && <button className="chip" onClick={() => { set({ filters: { q: '', genres: [], format: '', lang: '' } }) }}>✕ {t('remove')}</button>}</div>}
    </div>
  )
}

export function QuickSettings() {
  const { S, set, t, quick, setQuick } = useApp()
  if (!quick) return null
  return (
    <aside className="drawer glass" role="dialog"><button className="btn" onClick={() => setQuick(false)}>{t('close')}</button>
      <h3>{t('theme')}</h3><div className="flex">{THEMES.filter((x) => S.site.themes[x]).map((x) => <button key={x} className={'chip' + (S.theme === x ? ' on' : '')} onClick={() => set({ theme: x })}>{x}</button>)}</div>
      <h3>{t('accent')}</h3><div className="flex">{ACCENTS.map((c) => <button key={c} className="dot" style={{ background: c }} onClick={() => set({ accent: c })} aria-label={c} />)}</div>
      <h3>{t('language')}</h3><div className="flex">{Object.keys(LANG_NAMES).filter((l) => S.site.langs[l]).map((l) => <button key={l} className={'chip' + (S.lang === l ? ' on' : '')} onClick={() => set({ lang: l })}>{LANG_NAMES[l]}</button>)}</div>
    </aside>
  )
}

export function Layout() {
  const { S, set, t, toasts, setQuick, quick, live, admin } = useApp(); const nav = useNavigate()
  useEffect(() => {
    const f = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      if (e.key === '/') { e.preventDefault(); document.getElementById('gsearch')?.focus() }
      if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) setQuick((q) => !q)
    }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  }, [setQuick])
  const links = [['/', 'home'], ['/browse', 'browse'], S.site.toggles.news && ['/news', 'news'], S.site.toggles.extras && ['/discover', 'tools'], ['/profile', 'profile']].filter(Boolean)
  return (
    <>
      <header className="top glass">
        <Link to="/"><Logo /></Link>
        <nav>{links.map(([to, k]) => <NavLink key={to} to={to} end={to === '/'}>{t(k)}</NavLink>)}{admin && <NavLink to="/admin">{t('admin')}</NavLink>}</nav>
        <div className="flex">
          <select value={S.lang} onChange={(e) => set({ lang: e.target.value })} aria-label={t('language')}>{Object.entries(LANG_NAMES).filter(([l]) => S.site.langs[l]).map(([l, n]) => <option key={l} value={l}>{n}</option>)}</select>
          <button className="btn" onClick={() => setQuick(!quick)} title="T" aria-label={t('settings')}>⚙</button>
        </div>
      </header>
      <FilterBar />
      <QuickSettings />
      {!live && <div className="demo">{t('demo')}</div>}
      <main className="wrap" key={S.lang}><Outlet /></main>
      <footer className="foot"><Logo size={22} /> <span className="muted">{t('tagline')}</span> <a href="/admin" onClick={(e) => { e.preventDefault(); nav('/admin') }} className="ghost">·</a></footer>
      <Peek />
      <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className="toast">{x.m}</div>)}</div>
    </>
  )
}
