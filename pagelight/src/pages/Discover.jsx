import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { Grid, SaveButton, TiltCover } from '../components/TitleCard'
import { Chip, Empty, Field, Stars } from '../components/ui'
import { Pager } from './Browse'
import { loc } from './News'
import { useApp } from '../lib/app'
import { ARCHETYPES, catalog, coverOf, synopsisOf } from '../lib/catalog'
import { BACKGROUNDS, CARD_FONTS, RATIOS, drawCard } from '../lib/cards'
import { pacingOf } from '../lib/content'
import { useAsync, useDebounced, useDocTitle } from '../lib/hooks'
import { newsService } from '../lib/services'
import { useCatalogFilters } from '../lib/useFilters'
import { actions, useUD } from '../lib/userdata'
import { cx, downloadFile, fmtNum } from '../lib/util'
import { toast } from '../lib/toast'

export function DiscoverHub() {
  const { t } = useApp()
  useDocTitle(t('nav.discover'))
  const items = [['/wheel', 'shuffle', 'wheel'], ['/compare', 'scale', 'compare'], ['/gems', 'sparkles', 'gems'], ['/magazine', 'book', 'magazine'], ['/calendar', 'calendar', 'calendar'], ['/quotes', 'quote', 'quotes'], ['/matcher', 'users', 'matcher']]
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('nav.discover')}</h1><p className="muted">{t('discover.desc')}</p></div></div>
      <div className="hub">{items.map(([to, ic, k]) => <Link key={to} to={to} className="tile glass big"><Icon name={ic} size={30} /><b>{t('d.' + k)}</b><small className="muted">{t('d.' + k + '.sub')}</small></Link>)}</div>
    </div>
  )
}

/* ------------------------------------------------------------ Spin the wheel */
const MOODS = { cozy: ['sliceoflife', 'comedy', 'romance'], thrilling: ['thriller', 'mystery', 'horror'], epic: ['fantasy', 'action', 'adventure'], emotional: ['drama', 'tragedy', 'romance'], mindbending: ['scifi', 'psychological', 'supernatural'] }
export function Wheel() {
  const { t, enabledFormats } = useApp()
  useDocTitle(t('d.wheel'))
  const nav = useNavigate()
  const [mood, setMood] = useState('epic')
  const [format, setFormat] = useState('')
  const [items, setItems] = useState([])
  const [rot, setRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [win, setWin] = useState(null)
  const load = async () => {
    const g = MOODS[mood][Math.floor(Math.random() * 3)]
    const r = await catalog.query({ genres: [g], format, disabledFormats: ['novel', 'manhwa', 'manga'].filter((x) => !enabledFormats.includes(x)), sort: 'rating', page: 1 + Math.floor(Math.random() * 15), pageSize: 8 })
    setItems(r.items.slice(0, 8)); setWin(null)
  }
  useEffect(() => { load() }, [mood, format]) // eslint-disable-line
  const spin = () => {
    if (spinning || !items.length) return
    const k = Math.floor(Math.random() * items.length), seg = 360 / items.length
    const target = 360 * 6 + (360 - (k * seg + seg / 2))
    setSpinning(true); setWin(null); setRot((r) => r - (r % 360) + target)
    setTimeout(() => { setSpinning(false); setWin(items[k]) }, 4200)
  }
  const n = items.length || 1, R = 150
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('d.wheel')}</h1><p className="muted">{t('d.wheel.sub')}</p></div></div>
      <div className="row wrap">{Object.keys(MOODS).map((m) => <Chip key={m} active={mood === m} onClick={() => setMood(m)}>{t('mood.' + m)}</Chip>)}</div>
      <div className="row wrap"><Chip active={!format} onClick={() => setFormat('')}>{t('all')}</Chip>{enabledFormats.map((f) => <Chip key={f} active={format === f} onClick={() => setFormat(f)}>{t('f.' + f)}</Chip>)}</div>
      <div className="wheel-wrap">
        <div className="wheel-pointer" />
        <svg viewBox="-160 -160 320 320" className="wheel" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? 'transform 4s cubic-bezier(.12,.7,.1,1)' : 'none' }}>
          {items.map((it, i) => {
            const a0 = (i / n) * 6.2832 - 1.5708, a1 = ((i + 1) / n) * 6.2832 - 1.5708, am = (a0 + a1) / 2
            const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r]
            const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [tx, ty] = p(am, R * 0.62)
            return <g key={it.id}><path d={`M0 0L${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}Z`} fill={`hsl(${it.hue} 60% ${i % 2 ? 38 : 45}%)`} stroke="#0003" /><text x={tx} y={ty} transform={`rotate(${(am * 180) / Math.PI + 90} ${tx} ${ty})`} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">{it.title.length > 18 ? it.title.slice(0, 17) + '…' : it.title}</text></g>
          })}
          <circle r="16" fill="var(--bg)" stroke="var(--accent)" strokeWidth="3" />
        </svg>
      </div>
      <div className="row center-row"><button className="btn primary lg" disabled={spinning} onClick={spin}><Icon name="shuffle" size={18} />{t('spin')}</button><button className="btn ghost" onClick={load} disabled={spinning}>{t('wheel.reroll')}</button></div>
      {win && (
        <div className="result glass pad row wrap"><TiltCover t={win} /><div className="stack"><h2 className="serif">{win.title}</h2><p className="muted">{win.author} · {t('f.' + win.format)}</p><p>{synopsisOf(win)}</p><div className="row wrap"><button className="btn primary" onClick={() => nav(`/title/${win.id}`)}>{t('open.title')}</button><SaveButton t={win} /></div></div></div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ Compare */
function Picker({ label, value, onPick }) {
  const { t } = useApp()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data } = useAsync(() => catalog.suggest(dq, 6), [dq])
  return (
    <div className="stack">
      <Field label={label}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} /></Field>
      {q.length >= 2 && <div className="suggest static glass">{(data || []).map((s) => <button key={s.id} className="suggest-item" onClick={() => { onPick(s); setQ('') }}><b>{s.title}</b><small>{t('f.' + s.format)} · {s.author}</small></button>)}</div>}
      {value && <div className="row"><img className="mini-cover" src={coverOf(value)} alt="" /><b>{value.title}</b></div>}
    </div>
  )
}
export function Compare() {
  const { t } = useApp()
  useDocTitle(t('d.compare'))
  const [sp] = useSearchParams()
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  useEffect(() => { if (sp.get('a')) catalog.get(sp.get('a')).then(setA) }, []) // eslint-disable-line
  const rows = a && b ? [
    ['rating', (x) => <><Stars value={Math.round(x.rating * 2) / 2} size={14} /> {x.rating.toFixed(2)}</>, (x) => x.rating],
    ['votes', (x) => fmtNum(x.votes), (x) => x.votes],
    ['chapters', (x) => x.chapters, (x) => x.chapters],
    ['format', (x) => t('f.' + x.format)], ['status', (x) => t('s.' + x.status)], ['year', (x) => x.year],
    ['pace', (x) => t('pace.' + pacingOf(x).label), (x) => pacingOf(x).avg],
    ['velocity', (x) => x.velocity, (x) => x.velocity],
    ['genres', (x) => x.genres.map((g) => t('g.' + g)).join(', ')],
    ['tags', (x) => x.tags.slice(0, 4).join(', ') || '—'],
  ] : []
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('d.compare')}</h1><p className="muted">{t('d.compare.sub')}</p></div></div>
      <div className="two"><Picker label="A" value={a} onPick={setA} /><Picker label="B" value={b} onPick={setB} /></div>
      {a && b ? (
        <table className="cmp glass"><tbody>{rows.map(([k, fmt, num]) => { const win = num ? (num(a) > num(b) ? 'a' : num(a) < num(b) ? 'b' : '') : ''; return <tr key={k}><td className={cx(win === 'a' && 'win')}>{fmt(a)}</td><th>{t('cmp.' + k)}</th><td className={cx(win === 'b' && 'win')}>{fmt(b)}</td></tr> })}</tbody></table>
      ) : <Empty icon="scale" title={t('compare.pick')} />}
    </div>
  )
}

/* ------------------------------------------------------------ Hidden gems */
export function Gems() {
  const { t } = useApp()
  useDocTitle(t('hidden.gems'), t('hidden.gems.sub'))
  const f = useCatalogFilters()
  const [page, setPage] = useState(1)
  const { data, loading } = useAsync(() => catalog.query({ ...f, sort: 'rating', minRating: 4.5, maxVotes: 2000, page, pageSize: 24 }), [JSON.stringify(f), page])
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif"><Icon name="sparkles" size={26} /> {t('hidden.gems')}</h1><p className="muted">{t('hidden.gems.sub')}</p></div></div>
      <Grid items={data?.items || []} loading={loading} n={24} />
      <Pager page={page} pages={Math.min(40, Math.ceil((data?.total || 0) / 24))} onChange={(p) => { setPage(p); window.scrollTo(0, 0) }} />
    </div>
  )
}

/* ------------------------------------------------------------ Editorial magazine */
export function Magazine() {
  const { t } = useApp()
  useDocTitle(t('d.magazine'))
  const f = useCatalogFilters()
  const [period, setPeriod] = useState('month')
  const { data, loading } = useAsync(() => catalog.query({ ...f, sort: period === 'month' ? 'trending' : 'rating', pageSize: 9, yearMin: period === 'year' ? 2023 : 0 }), [JSON.stringify(f), period])
  const [lead, ...rest] = data?.items || []
  const now = new Date()
  return (
    <div className="page magazine">
      <div className="mag-head"><small>{t('mag.issue')} · {now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</small><h1 className="serif">{t('mag.title')}</h1><div className="row center-row"><Chip active={period === 'month'} onClick={() => setPeriod('month')}>{t('mag.month')}</Chip><Chip active={period === 'year'} onClick={() => setPeriod('year')}>{t('mag.year')}</Chip></div></div>
      {loading && <div className="skeleton" style={{ height: 360, borderRadius: 20 }} />}
      {lead && (
        <Link to={`/title/${lead.id}`} className="mag-lead glass"><TiltCover t={lead} big /><div className="stack"><span className="pill accent">№1 · {t('mag.cover')}</span><h2 className="serif">{lead.title}</h2><p className="muted">{lead.author}</p><p className="dropcap">{synopsisOf(lead)}</p></div></Link>
      )}
      <div className="mag-cols">{rest.map((x, i) => <Link key={x.id} to={`/title/${x.id}`} className="mag-item"><span className="mag-num">{String(i + 2).padStart(2, '0')}</span><img src={coverOf(x)} alt="" loading="lazy" /><div><b>{x.title}</b><small className="muted">{x.author} · ★ {x.rating.toFixed(1)}</small></div></Link>)}</div>
    </div>
  )
}

/* ------------------------------------------------------------ Release calendar */
export function CalendarPage() {
  const { t, lang } = useApp()
  useDocTitle(t('nav.calendar'))
  const f = useCatalogFilters()
  const lib = useUD((s) => s.library)
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [mine, setMine] = useState(false)
  const { data } = useAsync(() => catalog.query({ ...f, sort: 'trending', status: 'ongoing', pageSize: 40 }), [JSON.stringify(f)])
  const { data: news } = useAsync(() => newsService.list(), [])
  const year = month.getFullYear(), mo = month.getMonth()
  const days = new Date(year, mo + 1, 0).getDate()
  const offset = month.getDay()
  const titles = (data?.items || []).filter((x) => !mine || lib[x.id])
  const events = (d) => {
    const dow = new Date(year, mo, d).getDay()
    const rel = titles.filter((x) => (x.id % 7) === dow).slice(0, 3)
    const key = `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return { rel, news: (news || []).filter((n) => n.eventDate === key) }
  }
  const dayNames = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(lang === 'zh' ? 'zh-CN' : lang, { weekday: 'short' }))
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('nav.calendar')}</h1><p className="muted">{t('calendar.desc')}</p></div>
        <div className="row"><button className="icon-btn" onClick={() => setMonth(new Date(year, mo - 1, 1))} aria-label="prev"><Icon name="left" className="flip" /></button><b>{month.toLocaleString(lang === 'zh' ? 'zh-CN' : lang, { month: 'long', year: 'numeric' })}</b><button className="icon-btn" onClick={() => setMonth(new Date(year, mo + 1, 1))} aria-label="next"><Icon name="right" className="flip" /></button><Chip active={mine} onClick={() => setMine(!mine)}>{t('calendar.mine')}</Chip></div></div>
      <div className="cal">
        {dayNames.map((d) => <div key={d} className="cal-h">{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={'o' + i} className="cal-c empty" />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => { const ev = events(d); const today = new Date().toDateString() === new Date(year, mo, d).toDateString(); return (
          <div key={d} className={cx('cal-c', today && 'today')}><span className="cal-d">{d}</span>
            {ev.news.map((n) => <Link key={n.id} to="/news" className="cal-ev news" title={loc(n.title, lang)}><Icon name="news" size={11} />{loc(n.title, lang)}</Link>)}
            {ev.rel.map((x) => <Link key={x.id} to={`/title/${x.id}`} className="cal-ev" title={x.title}>{x.title}</Link>)}
          </div>) })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Quote card studio */
export function QuoteStudio() {
  const { t } = useApp()
  useDocTitle(t('d.quotes'))
  const [sp] = useSearchParams()
  const saved = useUD((s) => s.notes.filter((n) => n.kind === 'quote'))
  const [text, setText] = useState(sp.get('text') || t('quote.sample'))
  const [source, setSource] = useState(sp.get('src') || '')
  const [ratio, setRatio] = useState('4:5')
  const [bg, setBg] = useState(0)
  const [custom, setCustom] = useState(null)
  const [font, setFont] = useState('display')
  const [align, setAlign] = useState('center')
  const [size, setSize] = useState(64)
  const cv = useRef(null)
  useEffect(() => { if (cv.current) drawCard(cv.current, { text: text || ' ', source, ratio, bg: BACKGROUNDS[bg], custom, font, align, size }) }, [text, source, ratio, bg, custom, font, align, size])
  const dl = () => cv.current.toBlob((b) => downloadFile('pagelight-quote.png', b))
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('d.quotes')}</h1><p className="muted">{t('d.quotes.sub')}</p></div></div>
      <div className="studio">
        <div className="stack">
          <Field label={t('quote.text')}><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <Field label={t('quote.source')}><input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
          {saved.length > 0 && <Field label={t('quote.saved')}><select onChange={(e) => { const n = saved.find((s) => s.id === e.target.value); if (n) { setText(n.text); setSource(catalog.local(n.t)?.title || '') } }}><option value="">—</option>{saved.map((n) => <option key={n.id} value={n.id}>{n.text.slice(0, 50)}</option>)}</select></Field>}
          <div><h4>{t('quote.ratio')}</h4><div className="row wrap">{Object.keys(RATIOS).map((r) => <Chip key={r} active={ratio === r} onClick={() => setRatio(r)}>{r}</Chip>)}</div></div>
          <div><h4>{t('quote.bg')}</h4><div className="row wrap">{BACKGROUNDS.map((b, i) => <button key={b.id} className={cx('bg-dot', bg === i && !custom && 'on')} style={{ background: `linear-gradient(135deg,${b.c[0]},${b.c[1]})` }} onClick={() => { setBg(i); setCustom(null) }} aria-label={b.id} />)}<input type="color" aria-label="custom 1" onChange={(e) => setCustom([e.target.value, custom?.[1] || '#000000'])} /><input type="color" aria-label="custom 2" onChange={(e) => setCustom([custom?.[0] || '#ffffff', e.target.value])} /></div></div>
          <div className="row wrap">{Object.keys(CARD_FONTS).map((k) => <Chip key={k} active={font === k} onClick={() => setFont(k)}>{t('font.' + (k === 'display' ? 'serif' : k === 'arabic' ? 'serif' : k))}{k === 'arabic' ? ' ع' : ''}</Chip>)}{['start', 'center', 'end'].map((a) => <Chip key={a} active={align === a} onClick={() => setAlign(a)}>{a === 'center' ? '≡' : a === 'start' ? '⇤' : '⇥'}</Chip>)}</div>
          <label className="field"><span>{t('text.size')} · {size}</span><input type="range" min="36" max="110" value={size} onChange={(e) => setSize(+e.target.value)} /></label>
          <button className="btn primary" onClick={dl}><Icon name="download" size={16} />{t('download')}</button>
        </div>
        <div className="studio-preview"><canvas ref={cv} /></div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Archetype matcher */
export function Matcher() {
  const { t } = useApp()
  useDocTitle(t('d.matcher'))
  const f = useCatalogFilters()
  const [sel, setSel] = useState(['reluctant-hero'])
  const { data, loading } = useAsync(() => catalog.query({ ...f, archetypes: sel, sort: 'rating', pageSize: 24 }), [JSON.stringify(f), sel.join()])
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('d.matcher')}</h1><p className="muted">{t('d.matcher.sub')}</p></div></div>
      <div className="row wrap">{ARCHETYPES.map((a) => <Chip key={a} active={sel.includes(a)} onClick={() => setSel(sel.includes(a) ? sel.filter((x) => x !== a) : [...sel, a])}>{t('arch.' + a)}</Chip>)}</div>
      {sel.length ? <Grid items={data?.items || []} loading={loading} n={12} /> : <Empty icon="users" title={t('matcher.pick')} />}
    </div>
  )
}

/* ------------------------------------------------------------ Gift landing page */
export function Gift() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { t } = useApp()
  const { data: title } = useAsync(() => catalog.get(id), [id])
  useDocTitle(t('gift'))
  if (!title) return <div className="page" />
  const ch = sp.get('ch')
  return (
    <div className="page narrow">
      <div className="gift glass pad center stack">
        <Icon name="gift" size={44} /><small className="muted">{t('gift.from.label', { name: sp.get('from') || '—' })}</small>
        <TiltCover t={title} big /><h2 className="serif">{title.title}</h2>
        {sp.get('msg') && <blockquote>“{sp.get('msg')}”</blockquote>}
        <div className="row center-row"><Link className="btn primary" to={ch ? `/read/${title.id}/${ch}` : `/title/${title.id}`}>{ch ? t('gift.open.chapter', { n: ch }) : t('open.title')}</Link><SaveButton t={title} /></div>
      </div>
    </div>
  )
}
