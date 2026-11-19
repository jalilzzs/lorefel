import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApp, useTitle } from '../store'
import { getTitle, queryTitles, synopsis, characters, relations, lore, chapterTitle, WARNINGS } from '../lib/catalog'
import { Parallax, Row, Stars, Tension } from '../components'

const STAT = ['reading', 'plan', 'completed', 'hold', 'dropped']
const WPM = 230, WORDS = 1800

function Relmap({ title }) {
  const c = characters(title), rel = relations(title), pts = c.map((_, i) => [150 + 110 * Math.cos((i / c.length) * 6.28), 130 + 100 * Math.sin((i / c.length) * 6.28)])
  return <svg viewBox="0 0 300 260" style={{ maxWidth: 420, width: '100%' }}>
    {rel.map(([a, b, l], i) => <g key={i}><line x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="var(--bd)" strokeWidth="2" /><text x={(pts[a][0] + pts[b][0]) / 2} y={(pts[a][1] + pts[b][1]) / 2} fontSize="8" fill="var(--mut)" textAnchor="middle">{l}</text></g>)}
    {c.map((x, i) => <g key={i}><circle cx={pts[i][0]} cy={pts[i][1]} r="14" fill="var(--accent)" /><text x={pts[i][0]} y={pts[i][1] + 26} fontSize="8" textAnchor="middle" fill="var(--fg)">{x.name.split(' ')[0]}</text></g>)}</svg>
}

export default function Detail() {
  const { id } = useParams(); const [sp] = useSearchParams()
  const { S, set, t, toast, act, mature, base } = useApp()
  const [x, setX] = useState(undefined), [tab, setTab] = useState('overview'), [pg, setPg] = useState(0), [rel, setRel] = useState({}), [rv, setRv] = useState({ body: '', spoiler: false }), [gift, setGift] = useState(false), [msg, setMsg] = useState('')
  useEffect(() => { setX(undefined); getTitle(id).then(setX) }, [id])
  useTitle(x?.title)
  useEffect(() => {
    if (!x) return
    Promise.all([queryTitles({ ...base, genres: [x.genres[0]], sort: 'rating', size: 12, exclude: x.id }), queryTitles({ ...base, format: x.format, genres: x.genres.slice(1, 2), sort: 'popular', size: 12, exclude: x.id })]).then(([a, b]) => setRel({ a: a.items, b: b.items })).catch(() => {})
  }, [x?.id])
  useEffect(() => {
    const f = (e) => { if (e.key.toLowerCase() === 'b' && x && !/INPUT|TEXTAREA/.test(e.target.tagName)) { const on = !!S.library[x.id]; act.setStatus(x, on ? null : 'plan'); toast(on ? t('remove') : t('plan')) } }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  })
  const cl = useMemo(() => (x ? Array.from({ length: Math.min(50, x.chapters - pg * 50) }, (_, i) => pg * 50 + i + 1) : []), [x, pg])
  if (x === undefined) return <div className="empty">…</div>
  if (!x) return <div className="empty">404</div>
  if (x.mature && !mature) return <div className="glass box"><h2>🔞 {t('agegate')}</h2><p>{t('agegateMsg')}</p><Link className="btn pri" to="/profile">{t('profile')}</Link></div>
  const lib = S.library[x.id], prog = S.progress[x.id], done = (S.done[x.id] || []).length
  const mins = Math.round(((x.chapters - (prog?.ch || 0)) * WORDS) / WPM)
  const reviews = S.reviews.filter((r) => r.tid === x.id), myR = S.ratings[x.id] || 0, votes = S.tagVotes[x.id] || {}
  const link = `${location.origin}/title/${x.id}`
  const share = async () => { try { if (navigator.share) await navigator.share({ title: x.title, url: link }); else throw 0 } catch { await navigator.clipboard?.writeText(link); toast(t('copied')) } }
  const giftLink = `${link}?gift=${encodeURIComponent(msg || 'You will love this!')}&from=${encodeURIComponent(S.profile.name)}`
  const stale = prog && Date.now() - prog.ts > 7 * 864e5
  return (
    <>
      {sp.get('gift') && <div className="glass box">🎁 <b>{sp.get('from')}</b>: “{sp.get('gift')}”</div>}
      <section className="hero glass"><Parallax t={x} w={210} />
        <div className="grow"><h1>{x.title}</h1><p className="muted">{x.author} · {t(x.format)} · {x.lang.toUpperCase()} · {x.status} · {x.year}</p>
          <p><Stars v={x.rating} /> {x.rating} ({x.votes.toLocaleString()})</p>
          <p>{x.genres.map((g) => <span key={g} className="chip sm">{g}</span>)}{x.warnings.map((w) => <span key={w} className="chip sm" style={{ borderColor: '#e55' }}>⚠ {w}</span>)}</p>
          <div className="flex">
            <Link className="btn pri" to={`/read/${x.id}/${prog?.ch || 1}`}>{prog ? `${t('continue')} · ${prog.ch}` : t('startReading')}</Link>
            <select value={lib?.status || ''} onChange={(e) => act.setStatus(x, e.target.value || null)} aria-label={t('save')}><option value="">＋ {t('save')} (B)</option>{STAT.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
            <button className="btn" onClick={share}>{t('share')}</button><button className="btn" onClick={() => setGift(!gift)}>🎁 {t('gift')}</button>
            <button className="btn" onClick={() => { act.toggleFollow('a:' + x.author); toast('✓') }}>{S.follows.includes('a:' + x.author) ? t('following') : t('follow')} {x.author}</button>
            <button className="btn" onClick={() => { act.toggleFollow('s:' + x.id); toast('✓') }}>🔔 {S.follows.includes('s:' + x.id) ? t('following') : t('follow')}</button></div>
          {gift && <div className="glass box"><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Personal message…" style={{ width: '100%' }} /><p className="sample">🎁 {S.profile.name}: {msg || 'You will love this!'} — <b>{x.title}</b></p><button className="btn pri" onClick={() => { navigator.clipboard?.writeText(giftLink); toast(t('copied')) }}>{t('share')}</button></div>}
          <p className="muted">{t('estimate')}: {Math.floor(mins / 60)}h {mins % 60}m · {done}/{x.chapters} ✓</p>
        </div></section>
      {stale && <div className="glass box"><b>{t('recap')}</b><p>{synopsis(x)} — {t('chapter')} {prog.ch}.</p></div>}
      <div className="tabs">{['overview', 'chapters', 'characters', 'atlas', 'review', 'related'].map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>)}</div>
      {tab === 'overview' && <><p>{synopsis(x)}</p><h3>Tags ({t('vote')})</h3><p>{x.tags.concat(['Slow Burn', 'Tragedy']).map((g) => <button key={g} className="chip" onClick={() => set((s) => ({ tagVotes: { ...s.tagVotes, [x.id]: { ...(s.tagVotes[x.id] || {}), [g]: (s.tagVotes[x.id]?.[g] || 0) + 1 } } }))}>{g} · {votes[g] || 0}</button>)}</p>
        <h3>Pacing</h3><Tension t={x} ch={prog?.ch || 1} /></>}
      {tab === 'chapters' && <><div className="flex">{Array.from({ length: Math.ceil(x.chapters / 50) }, (_, i) => <button key={i} className={'chip' + (pg === i ? ' on' : '')} onClick={() => setPg(i)}>{i * 50 + 1}–{Math.min(x.chapters, i * 50 + 50)}</button>)}</div>
        <table><tbody>{cl.map((n) => <tr key={n}><td><Link to={`/read/${x.id}/${n}`}>{chapterTitle(x, n)}</Link></td><td>{(S.done[x.id] || []).includes(n) ? '✓' : ''}</td></tr>)}</tbody></table></>}
      {tab === 'characters' && <div className="cols"><div>{characters(x).map((c) => <p key={c.name}><b>{c.name}</b> <span className="chip sm">{c.arch}</span></p>)}</div><Relmap title={x} /></div>}
      {tab === 'atlas' && <div className="cols">{lore(x).map((l) => <div key={l.name} className="glass box"><span className="chip sm">{l.kind}</span><h3>{l.name}</h3><p>{l.text}</p></div>)}</div>}
      {tab === 'review' && <>
        <p>{t('rating')}: <Stars v={myR} set={(v) => set((s) => ({ ratings: { ...s.ratings, [x.id]: v } }))} /></p>
        <form className="form" onSubmit={(e) => { e.preventDefault(); if (!rv.body.trim()) return; set((s) => ({ reviews: [{ id: Date.now(), tid: x.id, title: x.title, u: s.profile.name, rating: myR || 4, ...rv, ts: Date.now() }, ...s.reviews] })); setRv({ body: '', spoiler: false }); toast('✓') }}>
          <textarea rows="3" placeholder={t('write')} value={rv.body} onChange={(e) => setRv({ ...rv, body: e.target.value })} /><label><span><input type="checkbox" checked={rv.spoiler} onChange={(e) => setRv({ ...rv, spoiler: e.target.checked })} /> spoiler</span></label><button className="btn pri">{t('submit')}</button></form>
        {reviews.map((r) => <div key={r.id} className="glass box"><b>{r.u}</b> <Stars v={r.rating} />{r.spoiler && S.spoiler ? <details><summary>⚠ spoiler</summary>{r.body}</details> : <p>{r.body}</p>}</div>)}</>}
      {tab === 'related' && <><Row title={t('related')} items={rel.a} /><Row title={t('fans')} items={rel.b} /></>}
    </>
  )
}
