import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { AgeGate, Discussion, QuizModal, TensionMeter } from '../components/TitleParts'
import { ChapterPicker, MixPanel, Pomodoro, ReaderSettings, VocabModal, useTTS } from '../components/ReaderTools'
import { Empty, Skeleton } from '../components/ui'
import { useApp } from '../lib/app'
import { catalog } from '../lib/catalog'
import { loadChapter, readingSpeed } from '../lib/chapters'
import { chapterMinutes, chapterTitle, isComic, recap, versionsOf } from '../lib/content'
import { useAsync, useDocTitle } from '../lib/hooks'
import { stopAllScapes } from '../lib/soundscape'
import { actions, getUD, useUD } from '../lib/userdata'
import { clamp, cx } from '../lib/util'
import { toast } from '../lib/toast'

const FONT = { serif: 'var(--font-serif)', sans: 'var(--font-sans)', mono: 'ui-monospace, Menlo, monospace' }

function renderPara(text, hls) {
  if (!hls.length) return text
  const sorted = [...hls].sort((a, b) => a.start - b.start)
  const out = []; let cur = 0
  sorted.forEach((h, i) => {
    if (h.start < cur || h.end > text.length) return
    if (h.start > cur) out.push(text.slice(cur, h.start))
    out.push(<mark key={i} className={cx('hl', h.kind === 'note' && 'has-note')} title={h.note || ''}>{text.slice(h.start, h.end)}</mark>)
    cur = h.end
  })
  if (cur < text.length) out.push(text.slice(cur))
  return out
}

export default function Reader() {
  const { id, ch } = useParams()
  const n0 = Math.max(1, parseInt(ch, 10) || 1)
  const { t, lang, rp, setRp, setTheme, zen, setZen, canView, site, dir } = useApp()
  const nav = useNavigate()
  const { data: title } = useAsync(() => catalog.get(id), [id])
  const n = title ? Math.min(n0, title.chapters) : n0
  const [version, setVersion] = useState('official')
  useEffect(() => setVersion('official'), [id])
  const blocked = title ? !canView(title) : false
  const { data: chap, loading } = useAsync(() => (title && !blocked ? loadChapter(title, n, version) : null), [title?.id, n, version, blocked])
  useDocTitle(title ? `${title.title} · ${t('chapter')} ${n}` : t('reader'), title?.title)

  const comic = title ? isComic(title) : false
  const paras = chap?.paras || []
  const pages = chap?.pages || []
  const allNotes = useUD((s) => s.notes)
  const notes = useMemo(() => allNotes.filter((x) => title && x.t === title.id && x.c === n), [allNotes, title?.id, n])
  const ud = useUD((s) => s)
  const wpm = readingSpeed(ud)

  const [settings, setSettings] = useState(false)
  const [picker, setPicker] = useState(false)
  const [mix, setMix] = useState(false)
  const [pomo, setPomo] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [auto, setAuto] = useState(false)
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState(null)
  const [vocab, setVocab] = useState(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const posRef = useRef(0), lineRef = useRef(null), lastAct = useRef(Date.now()), marked = useRef(false)
  const tts = useTTS(paras, lang)
  const rtl = rp.rtl ?? title?.format === 'manga'
  const pageMode = comic && rp.comic === 'page'

  const act = () => { lastAct.current = Date.now() }
  const setPos = (p) => { posRef.current = p; if (lineRef.current) lineRef.current.style.width = p * 100 + '%' }
  const save = () => { if (title) actions.saveProgress(title.id, { chapter: n, pos: posRef.current }) }
  const markDone = () => { if (!marked.current && title) { marked.current = true; actions.markRead(title.id, n) } }

  // ---- restore position when a chapter loads
  useEffect(() => {
    if (!chap || !title) return
    const saved = getUD().progress[title.id]
    const start = saved && saved.chapter === n ? saved.pos || 0 : 0
    setRecapOpen(!!saved && n > 5 && Date.now() - (saved.ts || 0) > 7 * 864e5)
    marked.current = false
    setPos(start)
    if (pageMode && chap.pages) setPage(Math.round(start * (chap.pages.length - 1)))
    else requestAnimationFrame(() => { const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo(0, start * Math.max(0, max)) })
    actions.saveProgress(title.id, { chapter: n, pos: start })
  }, [chap]) // eslint-disable-line

  // ---- scroll tracking (novel + strip)
  useEffect(() => {
    if (!title || !chap || pageMode) return
    let ticking = false, timer
    const onScroll = () => {
      if (ticking) return; ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 1
        setPos(p); act(); clearTimeout(timer); timer = setTimeout(save, 1200)
        if (p > 0.88) markDone()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(timer); save() }
  }, [chap, pageMode]) // eslint-disable-line

  // ---- page mode tracking
  useEffect(() => {
    if (!pageMode || !pages.length) return
    setPos(pages.length > 1 ? page / (pages.length - 1) : 1)
    const id2 = setTimeout(save, 900)
    if (page >= pages.length - 1) markDone()
    return () => clearTimeout(id2)
  }, [page, pageMode, pages.length]) // eslint-disable-line

  // ---- reading-time tracking (only while visible and active)
  useEffect(() => {
    if (!title) return
    const ev = ['keydown', 'mousemove', 'touchstart', 'wheel']
    ev.forEach((e) => window.addEventListener(e, act, { passive: true }))
    const iv = setInterval(() => { if (tts.playing || auto) act(); if (!document.hidden && Date.now() - lastAct.current < 60000) actions.addTime(title.id, 5) }, 5000)
    return () => { ev.forEach((e) => window.removeEventListener(e, act)); clearInterval(iv) }
  }, [title?.id, tts.playing, auto]) // eslint-disable-line
  useEffect(() => () => { stopAllScapes(); setZen(false) }, []) // eslint-disable-line

  // ---- auto-scroll
  useEffect(() => {
    if (!auto) return
    let raf, last = performance.now(), acc = 0
    const step = (now) => {
      acc += rp.autoSpeed * 20 * ((now - last) / 1000); last = now
      if (acc >= 1) { const px = Math.floor(acc); window.scrollBy(0, px); acc -= px }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { setAuto(false); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const stop = () => setAuto(false)
    window.addEventListener('wheel', stop, { passive: true }); window.addEventListener('touchstart', stop, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop) }
  }, [auto, rp.autoSpeed])

  // ---- TTS: keep the active paragraph in view
  useEffect(() => { if (tts.idx >= 0) document.querySelector(`[data-p="${tts.idx}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [tts.idx])

  // ---- navigation
  const go = (d) => {
    if (!title) return
    const m = n + d
    if (m < 1) return toast(t('first.chapter'))
    if (m > title.chapters) { markDone(); setQuiz(true); return toast(t('last.chapter'), 'success') }
    nav(`/read/${title.id}/${m}`)
  }
  useEffect(() => {
    const onKey = (e) => {
      const tg = e.target
      if (tg && (/INPUT|TEXTAREA|SELECT/.test(tg.tagName) || tg.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const fwd = pageMode && rtl ? e.key === 'ArrowLeft' : e.key === 'ArrowRight'
        if (pageMode) { if (fwd) (page >= pages.length - 1 ? go(1) : setPage(page + 1)); else (page <= 0 ? go(-1) : setPage(page - 1)) }
        else go(fwd ? 1 : -1)
      } else if (e.key === ' ' && tg === document.body) { e.preventDefault(); setAuto((a) => !a) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    const h = () => {
      if (!title) return
      let para = 0
      if (pageMode) para = page
      else { const els = [...document.querySelectorAll('[data-p]')]; const el = els.find((e) => e.getBoundingClientRect().top >= 0); para = el ? +el.dataset.p : 0 }
      const ex = getUD().notes.find((x) => x.t === title.id && x.c === n && x.kind === 'pin' && x.para === para)
      if (ex) { actions.removeNote(ex.id); toast(t('pin.removed')) } else { actions.addNote({ t: title.id, c: n, kind: 'pin', para, text: comic ? `${t('page')} ${para + 1}` : (paras[para] || '').slice(0, 90) }); toast(t('pin.added'), 'success') }
    }
    window.addEventListener('pl:bookmark', h); return () => window.removeEventListener('pl:bookmark', h)
  }, [title, n, page, pageMode, paras, comic, t])

  // ---- text selection toolbar (highlight / note / quote / define)
  useEffect(() => {
    if (comic) return
    const check = () => {
      const s = window.getSelection()
      if (!s || s.isCollapsed || !s.rangeCount) return setSel(null)
      const r = s.getRangeAt(0)
      const a = r.startContainer.parentElement?.closest('[data-p]'), b = r.endContainer.parentElement?.closest('[data-p]')
      if (!a || a !== b) return setSel(null)
      const pre = document.createRange(); pre.selectNodeContents(a); pre.setEnd(r.startContainer, r.startOffset)
      const start = pre.toString().length, text = r.toString()
      if (!text.trim()) return setSel(null)
      const box = r.getBoundingClientRect()
      setSel({ x: box.left + box.width / 2, y: box.top, para: +a.dataset.p, start, end: start + text.length, text })
    }
    const h = () => setTimeout(check, 10)
    document.addEventListener('pointerup', h); document.addEventListener('keyup', h)
    return () => { document.removeEventListener('pointerup', h); document.removeEventListener('keyup', h) }
  }, [comic, chap])
  const addAnn = (kind) => {
    if (!sel || !title) return
    let note
    if (kind === 'note') { note = prompt(t('note.prompt')); if (note === null) return }
    actions.addNote({ t: title.id, c: n, kind, para: sel.para, start: sel.start, end: sel.end, text: sel.text, note })
    toast(t(kind === 'quote' ? 'quote.saved.msg' : kind === 'note' ? 'note.saved' : 'highlight.saved'), 'success')
    window.getSelection()?.removeAllRanges(); setSel(null)
  }

  const applyPreset = (p) => {
    if (p === 'night-owl') { setTheme('midnight'); setRp({ preset: p, font: 'serif', size: 19, lh: 1.9, width: 640, cinematic: true }) }
    if (p === 'cozy-paper') { setTheme('sepia'); setRp({ preset: p, font: 'serif', size: 20, lh: 1.85, width: 680, cinematic: false }) }
    if (p === 'speed-reader') setRp({ preset: p, font: 'sans', size: 18, lh: 1.55, width: 780, autoSpeed: 5 })
    if (p === 'comic-strip') setRp({ preset: p, comic: 'strip' })
    toast(t('preset.' + p), 'success')
  }

  if (!title) return <div className="reader-wrap"><Skeleton h={300} style={{ margin: 40 }} /></div>
  if (blocked) return <div className="page"><AgeGate /></div>
  const versions = versionsOf(title)
  const pins = new Set(notes.filter((x) => x.kind === 'pin').map((x) => x.para))
  const hlByPara = (i) => notes.filter((x) => (x.kind === 'highlight' || x.kind === 'note') && x.para === i && x.end > x.start)
  const style = { '--r-size': rp.size + 'px', '--r-lh': rp.lh, '--r-width': rp.width + 'px', '--r-font': FONT[rp.font] || FONT.serif, '--r-align': rp.align === 'justify' ? 'justify' : 'start' }

  return (
    <div className={cx('reader', rp.cinematic && 'cinematic', zen && 'zen')} style={style}>
      <div className="progress-line"><i ref={lineRef} /></div>
      {rp.cinematic && <div className="cinema" aria-hidden="true" />}
      <div className="reader-bar glass">
        <Link to={`/title/${title.id}`} className="icon-btn" aria-label={t('back')}><Icon name="left" className="flip" /></Link>
        <button className="reader-title" onClick={() => setPicker(true)}><b className="clamp1">{title.title}</b><small>{t('chapter')} {n} / {title.chapters} · {chap?.name || chapterTitle(title, n)}</small></button>
        <div className="reader-actions">
          {versions.length > 1 && <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label={t('version')}>{versions.map((v) => <option key={v} value={v}>{t('ver.' + v)}</option>)}</select>}
          {pomo && <Pomodoro />}
          <button className="icon-btn" onClick={() => setPomo(!pomo)} aria-label={t('pomodoro')}><Icon name="timer" /></button>
          {!comic && site.features.tts && tts.supported && <button className={cx('icon-btn', tts.playing && 'on')} onClick={() => (tts.playing ? tts.pause() : tts.play(0))} aria-label={t('tts')}><Icon name="headphones" /></button>}
          <button className="icon-btn" onClick={() => window.dispatchEvent(new CustomEvent('pl:bookmark'))} aria-label={t('pin.add')}><Icon name="pin" /></button>
          <button className="icon-btn" onClick={() => setZen(true)} aria-label={t('zen')}><Icon name="zen" /></button>
          <button className="icon-btn" onClick={() => setSettings(!settings)} aria-label={t('reader.settings')}><Icon name="settings" /></button>
          <button className="icon-btn" disabled={n <= 1} onClick={() => go(-1)} aria-label={t('prev')}><Icon name="left" className="flip" /></button>
          <button className="icon-btn" onClick={() => go(1)} aria-label={t('next')}><Icon name="right" className="flip" /></button>
        </div>
      </div>
      {zen && <button className="zen-exit glass" onClick={() => setZen(false)}><Icon name="x" size={14} />{t('zen.exit')}</button>}
      {settings && <ReaderSettings title={title} comic={comic} tts={tts} auto={auto} setAuto={setAuto} onClose={() => setSettings(false)} applyPreset={applyPreset} openMix={() => setMix(true)} />}

      <article className={cx('reader-body', comic ? 'comic' : 'novel')} dir={comic ? 'ltr' : dir}>
        {chap?.offline && <span className="pill soft"><Icon name="download" size={12} />{t('offline.available')}</span>}
        {recapOpen && !comic && <div className="recap glass pad"><div className="row between"><b><Icon name="sparkles" size={14} /> {t('previously')}</b><button className="icon-btn sm" onClick={() => setRecapOpen(false)} aria-label="close"><Icon name="x" size={13} /></button></div><ul>{recap(title, n - 1).map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
        <header className="chapter-head"><small className="muted">{t('chapter')} {n}</small><h1 className="serif">{chap?.name || chapterTitle(title, n)}</h1><small className="muted">{chapterMinutes(title, n, wpm)} {t('min')}</small></header>
        {loading && <div className="stack">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={18} w={`${70 + ((i * 13) % 30)}%`} />)}</div>}
        {!loading && !chap && <Empty icon="book" title={t('chapter.missing')} />}
        {!comic && paras.map((p, i) => (
          <p key={i} data-p={i} className={cx('para', tts.idx === i && 'tts-on', pins.has(i) && 'pinned')} lang={title.lang}>
            {pins.has(i) && <Icon name="pin" size={13} className="pin-mark" />}
            {renderPara(p, hlByPara(i))}
          </p>
        ))}
        {comic && !pageMode && pages.map((src, i) => <img key={i} data-p={i} className={cx('comic-img', pins.has(i) && 'pinned')} src={src} alt={`${t('page')} ${i + 1}`} loading={i < 3 ? 'eager' : 'lazy'} />)}
        {comic && pageMode && pages.length > 0 && (
          <div className="pager-view">
            <img className="comic-img single" data-p={page} src={pages[page]} alt={`${t('page')} ${page + 1}`} />
            <button className="zone left" aria-label="left" onClick={() => { const fwd = rtl; if (fwd) (page >= pages.length - 1 ? go(1) : setPage(page + 1)); else (page <= 0 ? go(-1) : setPage(page - 1)) }} />
            <button className="zone right" aria-label="right" onClick={() => { const fwd = !rtl; if (fwd) (page >= pages.length - 1 ? go(1) : setPage(page + 1)); else (page <= 0 ? go(-1) : setPage(page - 1)) }} />
            <div className="page-ind glass">{page + 1} / {pages.length}</div>
          </div>
        )}
        {!loading && chap && (
          <footer className="chapter-end stack">
            <div className="row between">
              <button className="btn ghost" disabled={n <= 1} onClick={() => go(-1)}><Icon name="left" size={16} className="flip" />{t('prev')}</button>
              <button className="btn primary" onClick={() => go(1)}>{n >= title.chapters ? t('finish.story') : t('next.chapter')}<Icon name="right" size={16} className="flip" /></button>
            </div>
            <TensionMeter title={title} current={n} span={20} />
            <div className="row wrap"><button className="btn ghost" onClick={() => setQuiz(true)}><Icon name="trophy" size={16} />{t('quiz.chapter')}</button><Link className="btn ghost" to={`/title/${title.id}`}>{t('back.title')}</Link></div>
            {site.features.social && <Discussion title={title} chapter={n} />}
          </footer>
        )}
      </article>

      {sel && (
        <div className="sel-toolbar glass" style={{ left: clamp(sel.x, 120, window.innerWidth - 120), top: Math.max(8, sel.y - 52) }} onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => addAnn('highlight')} aria-label={t('highlight')}><Icon name="pen" size={16} /></button>
          <button onClick={() => addAnn('note')} aria-label={t('note')}><Icon name="note" size={16} /></button>
          {site.features.quotes && <button onClick={() => addAnn('quote')} aria-label={t('quote')}><Icon name="quote" size={16} /></button>}
          {!/\s/.test(sel.text.trim()) && <button onClick={() => { setVocab(sel.text.trim()); setSel(null) }} aria-label={t('vocab')}><Icon name="search" size={16} /></button>}
        </div>
      )}
      {mix && <MixPanel onClose={() => setMix(false)} />}
      {picker && <ChapterPicker title={title} current={n} onClose={() => setPicker(false)} onPick={(c) => { setPicker(false); nav(`/read/${title.id}/${c}`) }} />}
      {vocab && <VocabModal word={vocab} lang={title.lang === 'en' ? 'en' : lang} onClose={() => setVocab(null)} />}
      {quiz && <QuizModal title={title} chapter={n >= title.chapters ? null : n} onClose={() => setQuiz(false)} />}
    </div>
  )
}
