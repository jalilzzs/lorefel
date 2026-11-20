import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { Avatar, Chip, Logo, Modal, Switch, ToastHost } from './ui'
import { QuickPeek } from './TitleCard'
import { useApp } from '../lib/app'
import { LANGS } from '../lib/i18n'
import { GENRES, FORMATS, STORY_LANGS, catalog } from '../lib/catalog'
import { useUD, actions } from '../lib/userdata'
import { THEMES, ACCENTS } from '../lib/services'
import { useDebounced } from '../lib/hooks'
import { cx, lsGet, lsSet } from '../lib/util'

const LIST_ROUTES = ['/', '/browse', '/news', '/calendar', '/gems', '/magazine']

function useOutsideClose(ref, open, setOpen) {
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [ref, open, setOpen])
}

function SearchBox() {
  const { t } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [idx, setIdx] = useState(-1)
  const wrapRef = useRef(null)
  const dq = useDebounced(q, 200)

  useOutsideClose(wrapRef, open, setOpen)

  useEffect(() => {
    let on = true
    catalog.suggest(dq).then((r) => on && setItems(r))
    return () => { on = false }
  }, [dq])

  const go = (query) => {
    actions.pushSearch(query)
    setOpen(false)
    nav(`/browse?q=${encodeURIComponent(query)}`)
  }

  return (
    <div className="search" role="search" ref={wrapRef}>
      <Icon name="search" size={16} />
      <input
        id="global-search"
        value={q}
        placeholder={t('search.placeholder')}
        aria-label={t('search')}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(-1, i - 1)) }
          else if (e.key === 'Enter') {
            if (idx >= 0 && items[idx]) { setOpen(false); nav(`/title/${items[idx].id}`) }
            else if (q.trim()) go(q.trim())
          } else if (e.key === 'Escape') {
            setOpen(false)
            e.target.blur()
          }
        }}
      />
      <kbd className="hide-mobile">/</kbd>
      {open && q.length >= 2 && (
        <div className="suggest glass">
          {items.map((s, i) => (
            <Link
              key={s.id}
              to={`/title/${s.id}`}
              className={cx('suggest-item', i === idx && 'on')}
              onClick={() => setOpen(false)}
            >
              <b>{s.title}</b>
              <small>{t('f.' + s.format)} · {s.author}</small>
            </Link>
          ))}
          <button
            type="button"
            className="suggest-item all"
            onMouseDown={(e) => { e.preventDefault(); go(q.trim()) }}
          >
            {t('search.all', { q })}
          </button>
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const { t } = useApp()
  const lib = useUD((s) => s.library)
  const follows = useUD((s) => s.follows)
  const prog = useUD((s) => s.progress)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useOutsideClose(wrapRef, open, setOpen)

  const items = useMemo(() => {
    const out = []
    const ids = Object.keys(lib).slice(0, 60)
    for (const t0 of catalog.byIds(ids)) {
      const st = lib[t0.id].status
      const p = prog[t0.id]
      const followed = follows.some((f) => (f.kind === 'author' && f.name === t0.author) || (f.kind === 'series' && f.name === String(t0.id)) || (f.kind === 'translator' && f.name === t0.translator))
      if ((st === 'reading' || followed) && t0.status === 'ongoing' && t0.updatedDays <= 3) out.push({ k: 'new', t: t0 })
      if ((st === 'reading' || followed) && t0.chapters - (p?.max || 0) <= 3 && t0.chapters > 20 && (p?.max || 0) > 0) out.push({ k: 'finale', t: t0 })
      if (followed && t0.status === 'completed' && t0.updatedDays < 40) out.push({ k: 'done', t: t0 })
    }
    return out.slice(0, 12)
  }, [lib, follows, prog])

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="icon-btn" onClick={() => setOpen(!open)} aria-label={t('notifications')}>
        <Icon name="bell" />
        {items.length > 0 && <i className="dot">{items.length}</i>}
      </button>
      {open && (
        <div className="menu glass wide-menu end">
          <div className="menu-sep">{t('notifications')}</div>
          {!items.length && <div className="menu-empty muted">{t('notifications.empty')}</div>}
          {items.map((n, i) => (
            <Link key={i} to={`/title/${n.t.id}`} className="menu-item" onClick={() => setOpen(false)}>
              <Icon name={n.k === 'new' ? 'zap' : n.k === 'finale' ? 'flag' : 'check'} size={14} />
              <span><b>{n.t.title}</b><br /><small className="muted">{t('notif.' + n.k)}</small></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function LangMenu() {
  const { lang, setLang, site } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useOutsideClose(wrapRef, open, setOpen)

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="icon-btn txt" onClick={() => setOpen(!open)} aria-label="Language">
        <Icon name="globe" />{lang.toUpperCase()}
      </button>
      {open && (
        <div className="menu glass end">
          {LANGS.filter((l) => !site.disabledLangs.includes(l.code)).map((l) => (
            <button
              key={l.code}
              type="button"
              className={cx('menu-item', lang === l.code && 'on')}
              onClick={() => { setLang(l.code); setOpen(false) }}
            >
              {lang === l.code && <Icon name="check" size={14} />}{l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Header() {
  const { t, profile, site, setQuick, theme, setTheme } = useApp()
  const [mobile, setMobile] = useState(false)
  const loc = useLocation()
  useEffect(() => setMobile(false), [loc.pathname])
  const f = site.features
  const links = [
    ['/', 'nav.home', 'home'],
    ['/browse', 'nav.browse', 'compass'],
    f.news && ['/news', 'nav.news', 'news'],
    f.calendar && ['/calendar', 'nav.calendar', 'calendar'],
    ['/discover', 'nav.discover', 'sparkles']
  ].filter(Boolean)

  return (
    <header className="header glass">
      <div className="header-in">
        <button type="button" className="icon-btn mobile-only" onClick={() => setMobile(!mobile)} aria-label="Menu" aria-expanded={mobile}>
          <Icon name="menu" />
        </button>
        <Link to="/" className="brand" aria-label="Pagelight"><Logo /></Link>
        <nav className={cx('nav', mobile && 'open')}>
          {links.map(([to, k, ic]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('nav-link', isActive && 'active')} onClick={() => setMobile(false)}>
              <Icon name={ic} size={16} />{t(k)}
            </NavLink>
          ))}
        </nav>
        <SearchBox />
        <div className="header-actions">
          <Notifications />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'daylight' || theme === 'sepia' ? 'midnight' : 'daylight')}
            aria-label={t('theme')}
          >
            <Icon name={theme === 'daylight' || theme === 'sepia' ? 'moon' : 'sun'} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setQuick(true)} aria-label={t('quick.settings')}>
            <Icon name="settings" />
          </button>
          <LangMenu />
          {profile
            ? <Link to="/profile" aria-label={t('nav.profile')}><Avatar profile={profile} /></Link>
            : <Link to="/auth" className="btn primary sm">{t('auth.signin')}</Link>}
        </div>
      </div>
    </header>
  )
}

export function FilterBar() {
  const { t, filters, setFilters, toggleGenre, enabledFormats } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  const [collapsed, setCollapsed] = useState(() => lsGet('pl:fbc', false))
  const apply = (fn) => { fn(); if (!LIST_ROUTES.includes(loc.pathname)) nav('/browse') }
  const active = filters.genres.length + (filters.lang ? 1 : 0) + (filters.format ? 1 : 0)

  return (
    <div className="filterbar">
      <div className="filterbar-in">
        <button type="button" className="chip" onClick={() => { setCollapsed(!collapsed); lsSet('pl:fbc', !collapsed) }} aria-expanded={!collapsed}>
          <Icon name="filter" size={14} />{t('filters')}{active > 0 && <b className="count">{active}</b>}
        </button>
        {!collapsed && (
          <>
            <div className="seg" role="group" aria-label={t('format')}>
              <button type="button" className={cx(!filters.format && 'on')} onClick={() => apply(() => setFilters({ ...filters, format: '' }))}>{t('all')}</button>
              {FORMATS.filter((f) => enabledFormats.includes(f)).map((f) => (
                <button key={f} type="button" className={cx(filters.format === f && 'on')} onClick={() => apply(() => setFilters({ ...filters, format: f }))}>
                  {t('f.' + f)}
                </button>
              ))}
            </div>
            <select value={filters.lang} onChange={(e) => apply(() => setFilters({ ...filters, lang: e.target.value }))} aria-label={t('story.language')}>
              <option value="">{t('story.language')}: {t('all')}</option>
              {STORY_LANGS.map((l) => <option key={l} value={l}>{LANGS.find((x) => x.code === l)?.name || l}</option>)}
            </select>
            <div className={cx('genre-row', more && 'wrap')}>
              {GENRES.map((g) => (
                <Chip key={g} active={filters.genres.includes(g)} onClick={() => apply(() => toggleGenre(g))}>
                  {t('g.' + g)}
                </Chip>
              ))}
            </div>
            <button type="button" className="chip ghost" onClick={() => setMore(!more)}>{more ? t('less') : t('more')}</button>
            {active > 0 && (
              <button type="button" className="chip danger" onClick={() => setFilters({ genres: [], lang: '', format: '' })}>
                <Icon name="x" size={14} />{t('clear')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function QuickSettings() {
  const { quick, setQuick, t, theme, setTheme, accent, setAccent, site, lang, setLang } = useApp()
  const [fs, setFs] = useState(lsGet('pl:fs', 1))
  const [red, setRed] = useState(lsGet('pl:reduce', false))
  if (!quick) return null

  return (
    <Modal onClose={() => setQuick(false)} title={t('quick.settings')}>
      <div className="stack">
        <div>
          <h4>{t('theme')}</h4>
          <div className="theme-grid">
            {THEMES.filter((x) => !site.disabledThemes.includes(x)).map((x) => (
              <button key={x} type="button" data-preview={x} className={cx('theme-swatch', theme === x && 'on')} onClick={() => setTheme(x)}>
                <i />{t('theme.' + x)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h4>{t('accent')}</h4>
          <div className="row wrap">
            {ACCENTS.map((a) => (
              <button key={a} type="button" className={cx('accent-dot', accent === a && 'on')} data-a={a} onClick={() => setAccent(a)} aria-label={a} />
            ))}
          </div>
        </div>
        <div>
          <h4>{t('language')}</h4>
          <div className="row wrap">
            {LANGS.map((l) => (
              <Chip key={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>{l.name}</Chip>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t('text.size')}</span>
          <input type="range" min="0.85" max="1.3" step="0.05" value={fs} onChange={(e) => { setFs(+e.target.value); lsSet('pl:fs', +e.target.value); document.documentElement.style.setProperty('--fs-scale', e.target.value) }} />
        </label>
        <Switch checked={red} onChange={(v) => { setRed(v); lsSet('pl:reduce', v); document.documentElement.dataset.reduce = v ? '1' : '0' }} label={t('reduce.motion')} />
        <Link to="/profile" className="btn ghost" onClick={() => setQuick(false)}>{t('nav.profile')}</Link>
      </div>
    </Modal>
  )
}

function HelpModal() {
  const { help, setHelp, t } = useApp()
  if (!help) return null
  const rows = [['/', t('kb.search')], ['T', t('kb.theme')], ['B', t('kb.bookmark')], ['← →', t('kb.chapters')], ['Z', t('kb.zen')], ['Space', t('kb.autoscroll')], ['?', t('kb.help')], ['Esc', t('kb.close')]]
  return (
    <Modal onClose={() => setHelp(false)} title={t('kb.title')}>
      <table className="kb">{rows.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</table>
    </Modal>
  )
}

export default function Layout() {
  const { t, zen, setZen, setQuick, setHelp, site, isLive } = useApp()
  const loc = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  useEffect(() => {
    const onKey = (e) => {
      const tg = e.target
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus() }
      else if (e.key === 't' || e.key === 'T') setQuick((q) => !q)
      else if (e.key === '?') setHelp((h) => !h)
      else if (e.key === 'b' || e.key === 'B') window.dispatchEvent(new CustomEvent('pl:bookmark'))
      else if (e.key === 'z' || e.key === 'Z') { if (loc.pathname.startsWith('/read')) setZen((z) => !z) }
      else if (e.key === 'Escape') setZen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loc.pathname, setQuick, setHelp, setZen])

  const hideChrome = zen && loc.pathname.startsWith('/read')

  return (
    <div className={cx('app', hideChrome && 'zen')}>
      <a href="#main" className="skip">{t('skip')}</a>
      {!hideChrome && <><Header /><FilterBar /></>}
      {!isLive && !hideChrome && <div className="demo-banner">{t('demo.banner')}</div>}
      <main id="main"><Outlet /></main>
      {!hideChrome && (
        <footer className="footer">
          <Logo size={26} /><span className="muted">{t('footer.tag')}</span>
          <span className="spacer" />
          <button type="button" className="link" onClick={() => setHelp(true)}>{t('kb.title')}</button>
          <Link to="/admin" className="link subtle">·</Link>
        </footer>
      )}
      <QuickSettings /><HelpModal /><QuickPeek /><ToastHost />
    </div>
  )
}
