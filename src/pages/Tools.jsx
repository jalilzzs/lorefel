import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useTitle } from '../store'
import { queryTitles, suggest, synopsis, GENRES, ARCH, tension, coverUrl } from '../lib/catalog'
import { Card, Row, Cover } from '../components'
import { Pomodoro, Sounds } from '../widgets'

const MOODS = { Cozy: ['Slice of Life', 'Romance', 'Comedy'], Epic: ['Fantasy', 'Action', 'Adventure'], Dark: ['Horror', 'Thriller', 'Psychological'], Mystic: ['Xianxia', 'Wuxia', 'Supernatural'], Futuristic: ['Sci-Fi', 'LitRPG', 'Isekai'] }
const ARCH_GENRE = { 'Stoic Swordsman': 'Wuxia', 'Cunning Strategist': 'Mystery', 'Reluctant Hero': 'Fantasy', Rival: 'Sports', 'Wise Mentor': 'Xianxia', Trickster: 'Comedy', 'Fallen Noble': 'Historical', 'Cold Villain': 'Psychological' }

function Wheel() {
  const { base, t } = useApp(); const [mood, setMood] = useState('Epic'), [fmt, setFmt] = useState(''), [deg, setDeg] = useState(0), [res, setRes] = useState(null), [busy, setBusy] = useState(false)
  const cols = Object.keys(MOODS).map((_, i) => `hsl(${i * 72},65%,55%) ${i * 20}% ${(i + 1) * 20}%`).join(',')
  const spin = async () => {
    setBusy(true); setRes(null); setDeg((d) => d + 1440 + Math.random() * 360)
    const g = MOODS[mood][Math.floor(Math.random() * 3)], first = await queryTitles({ ...base, genres: [g], format: fmt, size: 1 })
    const pick = await queryTitles({ ...base, genres: [g], format: fmt, size: 1, page: 1 + Math.floor(Math.random() * Math.max(1, first.total)) })
    setTimeout(() => { setRes(pick.items[0]); setBusy(false) }, 2300)
  }
  return <div style={{ textAlign: 'center' }}><div className="flex" style={{ justifyContent: 'center' }}>{Object.keys(MOODS).map((m) => <button key={m} className={'chip' + (mood === m ? ' on' : '')} onClick={() => setMood(m)}>{m}</button>)}
    <select value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="">{t('all')}</option>{['novel', 'manhwa', 'manga'].map((f) => <option key={f} value={f}>{t(f)}</option>)}</select></div>
    <div className="wheel" style={{ background: `conic-gradient(${cols})`, transform: `rotate(${deg}deg)` }} /><button className="btn pri" disabled={busy} onClick={spin}>{t('spin')} 🎡</button>
    {res && <div style={{ maxWidth: 160, margin: '12px auto' }}><Card t={res} /></div>}</div>
}

function Picker({ onPick, label }) {
  const { base } = useApp(); const [q, setQ] = useState(''), [s, setS] = useState([])
  useEffect(() => { suggest(q, base).then(setS) }, [q])
  return <div><input placeholder={label} value={q} onChange={(e) => setQ(e.target.value)} />{s.map((x) => <div key={x.id}><a href="#" onClick={(e) => { e.preventDefault(); onPick(x); setQ(''); setS([]) }}>{x.title}</a></div>)}</div>
}
function Compare() {
  const { t } = useApp(); const [a, setA] = useState(null), [b, setB] = useState(null)
  const pace = (x) => Math.round((Array.from({ length: 20 }, (_, i) => tension(x, i + 1)).reduce((s, v) => s + v, 0) / 20) * 100)
  const rows = [['format', (x) => t(x.format)], ['rating', (x) => '★ ' + x.rating], ['chapters', (x) => x.chapters], ['status', (x) => x.status], ['pace', (x) => pace(x) + '%'], ['tags', (x) => x.tags.join(', ')]]
  return <><div className="cols"><Picker onPick={setA} label="Title A" /><Picker onPick={setB} label="Title B" /></div>
    {a && b && <table><thead><tr><th /><th>{a.title}</th><th>{b.title}</th></tr></thead><tbody>{rows.map(([k, f]) => <tr key={k}><td>{k}</td><td>{f(a)}</td><td>{f(b)}</td></tr>)}</tbody></table>}</>
}

function Calendar() {
  const { base, S } = useApp(); const [items, setItems] = useState([])
  useEffect(() => { queryTitles({ ...base, status: 'ongoing', sort: 'trending', size: 28 }).then((r) => setItems(r.items)) }, [base])
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d })
  return <div className="cols">{days.map((d, i) => <div key={i} className="glass box"><b>{d.toLocaleDateString(S.lang, { weekday: 'long', month: 'short', day: 'numeric' })}</b>{items.filter((x) => (x.id + i) % 7 === 0).slice(0, 3).map((x) => <div key={x.id}><Link to={`/title/${x.id}`}>{x.title}</Link> <small className="muted">+ ch {x.chapters + 1}</small></div>)}
    {i === 3 && S.news[0] && <div className="chip sm">📰 {S.news[0].title}</div>}</div>)}</div>
}

function Gems() { const { base, t } = useApp(); const [i, setI] = useState(null); useEffect(() => { queryTitles({ ...base, gem: true, sort: 'rating', size: 24 }).then((r) => setI(r.items)) }, [base]); return <Row title={t('gems')} items={i} /> }
function Magazine() {
  const { base, t } = useApp(); const [i, setI] = useState([]); useEffect(() => { queryTitles({ ...base, sort: 'rating', size: 7, year: new Date().getFullYear() - 1 }).then((r) => setI(r.items)) }, [base])
  const [f, ...rest] = i
  return f ? <div className="cols"><Link to={`/title/${f.id}`} className="glass box" style={{ gridColumn: '1/-1', display: 'flex', gap: 20, flexWrap: 'wrap' }}><div style={{ width: 200 }}><Cover t={f} /></div><div style={{ flex: 1 }}><small className="muted">{t('magazine')} · #1</small><h1>{f.title}</h1><p>{synopsis(f)}</p></div></Link>{rest.map((x, k) => <Link key={x.id} to={`/title/${x.id}`} className="glass box flex"><b style={{ fontSize: 28 }}>#{k + 2}</b><span>{x.title}<br /><small className="muted">★ {x.rating}</small></span></Link>)}</div> : null
}
function Matcher() {
  const { base, t } = useApp(); const [sel, setSel] = useState([]), [items, setItems] = useState(null)
  useEffect(() => { if (!sel.length) return setItems(null); queryTitles({ ...base, genres: [ARCH_GENRE[sel[0]]], sort: 'rating', size: 12 }).then((r) => setItems(r.items)) }, [sel, base])
  return <><div>{ARCH.map((a) => <button key={a} className={'chip' + (sel.includes(a) ? ' on' : '')} onClick={() => setSel(sel.includes(a) ? sel.filter((x) => x !== a) : [a, ...sel])}>{a}</button>)}</div>{items && <Row title={t('matcher')} items={items} />}</>
}

export function Timeline() {
  const { S, t } = useApp()
  return <div className="timeline">{[...S.events].reverse().slice(0, 60).map((e, i) => <div key={i}><small className="muted">{new Date(e.ts).toLocaleDateString(S.lang)}</small><br /><Link to={`/title/${e.tid}`}>{e.title}</Link> <span className="chip sm">{t(e.type)}</span></div>)}{!S.events.length && <p className="muted">—</p>}</div>
}
export function Moments() {
  const { S, act } = useApp(); const list = S.hl.filter((h) => h.kind !== 'hl' || h.text)
  return <div className="cols">{list.map((h) => <div key={h.id} className="glass box"><span className="chip sm">{h.kind}</span><p className="sample">{h.text}</p><small className="muted">{S.meta[h.tid]?.title} · ch {h.ch}</small> <button className="chip" onClick={() => act.delHL(h.id)}>✕</button></div>)}{!list.length && <p className="muted">—</p>}</div>
}

function Quote() {
  const { S } = useApp(); const quotes = S.hl.filter((h) => h.kind === 'quote' || h.kind === 'hl')
  const [txt, setTxt] = useState('Every story is a door.'), [bg, setBg] = useState(0), [font, setFont] = useState('Georgia'), [ar, setAr] = useState('1:1'), cv = useRef()
  const BG = [['#4f5bd5', '#d6336c'], ['#0f2027', '#2c5364'], ['#f6d365', '#fda085'], ['#232526', '#414345']], AR = { '1:1': [900, 900], '4:5': [800, 1000], '16:9': [1280, 720] }
  useEffect(() => {
    const c = cv.current, [w, h] = AR[ar]; c.width = w; c.height = h; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, BG[bg][0]); g.addColorStop(1, BG[bg][1]); x.fillStyle = g; x.fillRect(0, 0, w, h)
    x.fillStyle = '#fff'; x.font = `italic ${Math.round(w / 18)}px ${font}`; x.textAlign = 'center'; const words = txt.split(' '); let line = '', y = h / 3; const lh = w / 14
    words.forEach((wd) => { if (x.measureText(line + wd).width > w * 0.8) { x.fillText(line, w / 2, y); y += lh; line = '' } line += wd + ' ' }); x.fillText(line, w / 2, y)
    x.font = `${Math.round(w / 38)}px sans-serif`; x.globalAlpha = 0.8; x.fillText('— Loreleaf', w / 2, h - 50)
  }, [txt, bg, font, ar])
  return <div className="cols"><div className="form"><textarea rows="4" value={txt} onChange={(e) => setTxt(e.target.value)} />
    {quotes.length > 0 && <select onChange={(e) => setTxt(e.target.value)}><option value="">Saved lines…</option>{quotes.map((q) => <option key={q.id}>{q.text}</option>)}</select>}
    <div className="flex">{BG.map((b, i) => <button key={i} className="dot" style={{ background: `linear-gradient(${b[0]},${b[1]})` }} onClick={() => setBg(i)} />)}</div>
    <select value={font} onChange={(e) => setFont(e.target.value)}>{['Georgia', 'system-ui', 'monospace', 'Impact'].map((f) => <option key={f}>{f}</option>)}</select>
    <select value={ar} onChange={(e) => setAr(e.target.value)}>{Object.keys(AR).map((k) => <option key={k}>{k}</option>)}</select>
    <button className="btn pri" onClick={() => { const a = document.createElement('a'); a.download = 'quote.png'; a.href = cv.current.toDataURL(); a.click() }}>⬇ PNG</button></div>
    <canvas ref={cv} style={{ width: '100%', borderRadius: 12 }} /></div>
}

export default function Tools() {
  const { t, S } = useApp(); useTitle(t('tools'))
  const tabs = { wheel: [t('wheel'), Wheel], compare: [t('compare'), Compare], calendar: [t('calendar'), Calendar], gems: [t('gems'), Gems], magazine: [t('magazine'), Magazine], matcher: [t('matcher'), Matcher], quote: ['Quote Studio', Quote], timeline: [t('timeline'), Timeline], moments: [t('moments'), Moments], focus: [t('focus') + ' / ' + t('sounds'), () => <div className="cols"><Pomodoro />{S.site.toggles.sounds && <Sounds />}</div>] }
  const [k, setK] = useState('wheel'); const C = tabs[k][1]
  return <><h1>{t('tools')}</h1><div className="tabs">{Object.entries(tabs).map(([id, [l]]) => <button key={id} className={k === id ? 'on' : ''} onClick={() => setK(id)}>{l}</button>)}</div><C /></>
}
