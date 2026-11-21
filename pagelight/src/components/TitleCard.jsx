import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { Modal, Stars, CardSkeletons } from './ui'
import { useApp } from '../lib/app'
import { useUD, actions } from '../lib/userdata'
import { coverOf, posterOf, synopsisOf, LIST_STATUSES } from '../lib/catalog'
import { chapterParagraphs, pageArt, isComic } from '../lib/content'
import { cx, fmtNum } from '../lib/util'
import { toast } from '../lib/toast'
import { drawCard, BACKGROUNDS } from '../lib/cards'

export function useBlocked(t) {
  const { canView } = useApp()
  return !canView(t)
}

/** Pointer-reactive cover with lighting sheen + parallax tilt. */
export function TiltCover({ t, className, big, blocked }) {
  const ref = useRef(null)
  const move = (e) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', x * 100 + '%'); el.style.setProperty('--my', y * 100 + '%')
    el.style.setProperty('--rx', (0.5 - y) * 10 + 'deg'); el.style.setProperty('--ry', (x - 0.5) * 12 + 'deg')
  }
  const leave = () => { const el = ref.current; if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg') } }
  return (
    <div ref={ref} className={cx('tilt', big && 'big', className)} onPointerMove={move} onPointerLeave={leave}>
      <img src={coverOf(t)} alt={t.title} loading="lazy" onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = 1; e.currentTarget.src = posterOf(t) } }} className={cx(blocked && 'blurred')} draggable="false" />
      <div className="sheen" />
      {blocked && <div className="lock"><Icon name="lock" size={28} /><b>18+</b></div>}
    </div>
  )
}

export function TitleCard({ t, onPeek, showProgress = true, badge }) {
  const { t: tr, canView, site, setPeek } = useApp()
  const prog = useUD((s) => s.progress[t.id])
  const blocked = !canView(t)
  if (blocked && site.matureMode === 'hide') return null
  const pct = prog && t.chapters ? Math.min(100, Math.round(((prog.chapter - 1 + (prog.pos || 0)) / t.chapters) * 100)) : 0
  return (
    <article className="card">
      <Link to={`/title/${t.id}`} className="card-link" aria-label={t.title}>
        <TiltCover t={t} blocked={blocked} />
        <span className={cx('fmt-chip', t.format)}>{tr('f.' + t.format)}</span>
        {t.mature && <span className="mature-chip">18+</span>}
        {t.velocity >= 75 && <span className="hot-chip"><Icon name="flame" size={12} />+{Math.round(t.velocity * 2.4)}%</span>}
        {showProgress && prog && <div className="mini-progress"><i style={{ width: pct + '%' }} /></div>}
      </Link>
      <button className="peek-btn glass" onClick={() => (onPeek || setPeek)(t)} aria-label={tr('peek')}><Icon name="eye" size={15} /></button>
      <div className="card-meta">
        <Link to={`/title/${t.id}`} className="card-title" title={t.title}>{t.title}</Link>
        <div className="card-sub"><span><Icon name="star" size={12} fill /> {t.rating.toFixed(1)}</span><span>·</span><span>{badge || `${t.chapters} ${tr('chapters.short')}`}</span></div>
      </div>
    </article>
  )
}

export function Grid({ items, loading, n = 12 }) {
  if (loading) return <CardSkeletons n={n} />
  return <div className="grid">{items.map((t) => <TitleCard key={t.id} t={t} />)}</div>
}

export function Shelf({ title, subtitle, items, loading, to, icon, children }) {
  const { t: tr } = useApp()
  const row = useRef(null)
  const scroll = (d) => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.85, behavior: 'smooth' })
  if (!loading && (!items || !items.length)) return null
  return (
    <section className="shelf-sec">
      <div className="sec-head">
        <div><h2>{icon && <Icon name={icon} size={20} />} {title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
        <div className="sec-actions">
          {to && <Link to={to} className="link">{tr('see.all')}</Link>}
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="Previous"><Icon name="left" className="flip" /></button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="Next"><Icon name="right" className="flip" /></button>
        </div>
      </div>
      <div className="shelf" ref={row}>
        {loading ? Array.from({ length: 8 }, (_, i) => <div key={i} className="shelf-item"><div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 14 }} /></div>) : items.map((x) => <div key={x.id} className="shelf-item">{children ? children(x) : <TitleCard t={x} />}</div>)}
      </div>
    </section>
  )
}

export function SaveButton({ t, size }) {
  const { t: tr } = useApp()
  const status = useUD((s) => s.library[t.id]?.status)
  const cols = useUD((s) => s.collections)
  const [open, setOpen] = useState(false)
  const set = (s) => { actions.setStatus(t.id, s); setOpen(false); toast(s ? tr('saved.to', { list: tr('list.' + s) }) : tr('removed'), 'success') }
  return (
    <div className="menu-wrap">
      <button className={cx('btn', status ? 'primary' : 'ghost')} onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="bookmark" size={size || 16} fill={!!status} />{status ? tr('list.' + status) : tr('save')}<Icon name="down" size={14} /></button>
      {open && (
        <div className="menu glass" onMouseLeave={() => setOpen(false)}>
          {LIST_STATUSES.map((s) => <button key={s} className={cx('menu-item', status === s && 'on')} onClick={() => set(s)}>{status === s && <Icon name="check" size={14} />}{tr('list.' + s)}</button>)}
          {cols.length > 0 && <div className="menu-sep">{tr('collections')}</div>}
          {cols.map((c) => <button key={c.id} className="menu-item" onClick={() => { c.items.includes(t.id) ? actions.removeFromCollection(c.id, t.id) : actions.addToCollection(c.id, t.id); toast(c.name) }}>{c.items.includes(t.id) && <Icon name="check" size={14} />}{c.name}</button>)}
          <button className="menu-item" onClick={() => { const n = prompt(tr('collection.name')); if (n) { const c = actions.createCollection(n); actions.addToCollection(c.id, t.id); setOpen(false) } }}><Icon name="plus" size={14} />{tr('collection.new')}</button>
          {status && <button className="menu-item danger" onClick={() => set(null)}><Icon name="trash" size={14} />{tr('remove')}</button>}
        </div>
      )}
    </div>
  )
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text) } catch { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove() }
}

/** Share (link / card) and Gift (personal message link + card) */
export function ShareModal({ t, chapter, gift, onClose }) {
  const { t: tr, profile } = useApp()
  const [from, setFrom] = useState(profile?.display || '')
  const [msg, setMsg] = useState('')
  const base = `${location.origin}${gift ? '/gift/' : '/title/'}${t.id}`
  const qs = gift ? `?${chapter ? `ch=${chapter}&` : ''}from=${encodeURIComponent(from)}&msg=${encodeURIComponent(msg)}` : chapter ? `?ch=${chapter}` : ''
  const url = base + qs
  const canvas = useRef(null)
  const makeCard = () => {
    drawCard(canvas.current, { text: gift ? (msg || tr('gift.default')) : t.title, source: gift ? `${from || '—'} → ${t.title}` : `${t.author} · ${tr('f.' + t.format)}`, ratio: '4:5', bg: BACKGROUNDS[t.id % BACKGROUNDS.length], kind: gift ? 'gift' : 'share', size: 62 })
    canvas.current.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `pagelight-${t.id}.png`; a.click() })
  }
  return (
    <Modal onClose={onClose} title={gift ? tr('gift') : tr('share')}>
      <div className="stack">
        {gift && <><input placeholder={tr('gift.from')} value={from} onChange={(e) => setFrom(e.target.value)} /><textarea rows={3} placeholder={tr('gift.msg')} value={msg} onChange={(e) => setMsg(e.target.value)} /></>}
        <div className="copy-row"><input readOnly value={url} onFocus={(e) => e.target.select()} /><button className="btn primary" onClick={async () => { await copyText(url); toast(tr('copied'), 'success') }}><Icon name="copy" size={16} />{tr('copy')}</button></div>
        <div className="row wrap">
          {navigator.share && <button className="btn ghost" onClick={() => navigator.share({ title: t.title, text: synopsisOf(t).slice(0, 120), url }).catch(() => {})}><Icon name="share" size={16} />{tr('share')}</button>}
          <button className="btn ghost" onClick={makeCard}><Icon name="download" size={16} />{tr('share.card')}</button>
        </div>
        <canvas ref={canvas} style={{ display: 'none' }} />
      </div>
    </Modal>
  )
}

export function QuickPeek() {
  const { peek, setPeek, t: tr, canView, tx } = useApp()
  const nav = useNavigate()
  if (!peek) return null
  const t = peek
  const blocked = !canView(t)
  const paras = !blocked && !isComic(t) ? chapterParagraphs(t, 1).slice(0, 3) : []
  return (
    <Modal onClose={() => setPeek(null)} title={tr('peek')} wide>
      <div className="peek">
        <TiltCover t={t} blocked={blocked} />
        <div className="stack">
          <h2 className="serif">{t.title}</h2>
          <div className="muted">{t.author} · {tr('f.' + t.format)} · {t.year} · {tr('s.' + t.status)}</div>
          <div className="row"><Stars value={Math.round(t.rating * 2) / 2} /><b>{t.rating.toFixed(2)}</b><span className="muted">({fmtNum(t.votes)})</span></div>
          <div className="row wrap">{t.genres.map((g) => <span key={g} className="pill">{tr('g.' + g)}</span>)}{t.tags.slice(0, 4).map((g) => <span key={g} className="pill soft">{tx('tag.' + g, g.replace(/-/g, ' '))}</span>)}</div>
          <p>{blocked ? tr('age.blocked.short') : synopsisOf(t)}</p>
          {!blocked && (isComic(t) ? <img className="peek-page" src={pageArt(t, 1, 0)} alt="" /> : <div className="peek-sample">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>)}
          <div className="row wrap">
            <button className="btn primary" onClick={() => { setPeek(null); nav(`/title/${t.id}`) }}>{tr('open.title')}</button>
            {!blocked && <button className="btn ghost" onClick={() => { setPeek(null); nav(`/read/${t.id}/1`) }}><Icon name="book" size={16} />{tr('read.first')}</button>}
            <SaveButton t={t} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
