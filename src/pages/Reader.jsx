import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp, useTitle } from '../store'
import { getTitle, chapterText, chapterPages, chapterTitle } from '../lib/catalog'
import { Tension, Logo, QuickSettings, Peek } from '../components'
import { Sounds, Pomodoro, Quiz, Discussion } from '../widgets'

const PRESETS = {
  'Night Owl': { theme: 'oled', reader: { size: 19, font: 'serif', lh: 1.8, width: 640 } },
  'Cozy Paper': { theme: 'sepia', reader: { size: 20, font: 'serif', lh: 1.9, width: 620 } },
  'Speed Reader': { reader: { size: 17, font: 'sans', lh: 1.55, width: 780, speed: 4 } },
  'Comic Strip': { reader: { mode: 'strip', width: 820, speed: 0 } },
}
function Para({ p, hls }) {
  let parts = [p]
  hls.forEach((h) => { parts = parts.flatMap((x) => (typeof x !== 'string' ? [x] : x.split(h.text).flatMap((s, i, a) => (i < a.length - 1 ? [s, <mark key={h.id + i} title={h.note}>{h.text}</mark>] : [s])))) })
  return <p>{parts}</p>
}

export default function Reader() {
  const { id, ch: chp } = useParams(); const ch = Math.max(1, +chp || 1), nav = useNavigate()
  const { S, set, act, t, toast, mature, site: _s, toasts, setQuick } = useApp(); const site = S.site
  const [T, setT] = useState(null), [panel, setPanel] = useState(false), [zen, setZen] = useState(false), [cine, setCine] = useState(false), [page, setPage] = useState(0)
  const [sel, setSel] = useState(''), [note, setNote] = useState(''), [def, setDef] = useState(null)
  const [speaking, setSpeaking] = useState(false), [rate, setRate] = useState(1), [voices, setVoices] = useState([]), [voice, setVoice] = useState('')
  const R = S.reader, setR = (p) => set((s) => ({ reader: { ...s.reader, ...p } }))
  useEffect(() => { setT(null); getTitle(id).then(setT) }, [id])
  useTitle(T ? `${T.title} · ${t('chapter')} ${ch}` : '')
  const comic = T && T.format !== 'novel'
  const paras = useMemo(() => (T && !comic ? chapterText(T, ch, R.ver) : []), [T, ch, R.ver])
  const pages = useMemo(() => (T && comic ? chapterPages(T, ch) : []), [T, ch])
  const hls = S.hl.filter((h) => h.tid === +id && h.ch === ch && h.kind === 'hl')
  const pins = S.hl.filter((h) => h.tid === +id && h.kind === 'pin')
  const go = (n) => { if (T && n >= 1 && n <= T.chapters) nav(`/read/${id}/${n}`) }
  const flip = (d) => { const n = page + d; if (n < 0) return go(ch - 1); if (n >= pages.length) return go(ch + 1); setPage(n) }
  const rtl = T?.format === 'manga'

  // restore position once per chapter
  const restored = useRef('')
  useEffect(() => {
    if (!T || restored.current === T.id + ':' + ch) return; restored.current = T.id + ':' + ch
    const p = S.progress[T.id]
    if (p && p.ch === ch) { if (comic && R.mode === 'page') setPage(Math.round(p.pos * (pages.length - 1))); else requestAnimationFrame(() => scrollTo(0, p.pos * (document.documentElement.scrollHeight - innerHeight))) } else { scrollTo(0, 0); setPage(0) }
  }, [T, ch, pages.length])
  // autosave scroll
  useEffect(() => {
    if (!T || (comic && R.mode === 'page')) return
    let tm; const on = () => { clearTimeout(tm); tm = setTimeout(() => { const h = document.documentElement.scrollHeight - innerHeight, pos = h > 0 ? scrollY / h : 1; act.saveProgress(T, ch, pos); if (pos > 0.92) act.markDone(T, ch) }, 700) }
    addEventListener('scroll', on); return () => { removeEventListener('scroll', on); clearTimeout(tm) }
  }, [T, ch, R.mode])
  useEffect(() => { if (T && comic && R.mode === 'page') { act.saveProgress(T, ch, pages.length > 1 ? page / (pages.length - 1) : 1); if (page === pages.length - 1) act.markDone(T, ch) } }, [page])
  useEffect(() => { if (!T) return; const id2 = setInterval(() => !document.hidden && act.addMinutes(T.id, 0.25), 15000); return () => clearInterval(id2) }, [T])
  useEffect(() => { if (!R.speed) return; const i = setInterval(() => scrollBy(0, R.speed * 0.6), 30); return () => clearInterval(i) }, [R.speed])
  useEffect(() => { document.body.classList.toggle('zen', zen); return () => document.body.classList.remove('zen') }, [zen])
  useEffect(() => { const f = () => setVoices(speechSynthesis.getVoices()); f(); speechSynthesis.onvoiceschanged = f; return () => { speechSynthesis.cancel() } }, [])
  useEffect(() => { speechSynthesis.cancel(); setSpeaking(false) }, [ch])
  useEffect(() => {
    const f = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
      const k = e.key
      if (k === 'ArrowRight') comic && R.mode === 'page' ? flip(rtl ? -1 : 1) : go(ch + 1)
      else if (k === 'ArrowLeft') comic && R.mode === 'page' ? flip(rtl ? 1 : -1) : go(ch - 1)
      else if (k.toLowerCase() === 'b' && T) { act.setStatus(T, S.library[T.id] ? null : 'plan'); toast('✓') }
      else if (k.toLowerCase() === 't') setQuick((q) => !q)
      else if (k.toLowerCase() === 'z') setZen((z) => !z)
    }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  })

  if (!T) return <div className="empty">…</div>
  if (T.mature && !mature) return <div className="wrap"><div className="glass box"><h2>🔞 {t('agegate')}</h2><p>{t('agegateMsg')}</p><Link className="btn pri" to="/profile">{t('profile')}</Link></div></div>

  const speak = () => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(paras.join(' ')); u.rate = rate; const v = voices.find((x) => x.name === voice); if (v) u.voice = v; u.onend = () => setSpeaking(false); speechSynthesis.speak(u); setSpeaking(true) }
  const define = async (w) => {
    setDef({ w, d: '…' })
    try { const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w.toLowerCase())); const j = await r.json(); setDef({ w, d: j[0].meanings.map((m) => `${m.partOfSpeech}: ${m.definitions[0].definition}`).join(' • ') }) } catch { setDef({ w, d: 'No definition found (needs internet; English words).' }) }
  }
  const offline = async () => { try { const c = await caches.open('loreleaf-chapters'); await c.put(`/offline/${T.id}/${ch}`, new Response(JSON.stringify(comic ? pages : paras))); set((s) => ({ offline: [...s.offline.filter((o) => !(o.tid === T.id && o.ch === ch)), { tid: T.id, title: T.title, ch }] })); toast('✓ offline') } catch { toast('Offline cache unavailable') } }
  const preset = (k) => { const p = PRESETS[k]; set((s) => ({ ...(p.theme ? { theme: p.theme } : {}), reader: { ...s.reader, ...p.reader } })) }
  const remaining = Math.round(((T.chapters - ch + 1) * 1800) / 230)

  return (
    <div className={cine ? 'cine' : ''} style={{ '--fs': R.size + 'px', '--lh': R.lh, '--w': R.width + 'px' }}>
      {cine && <div className="vignette" />}
      <div className="rtop glass">
        <Link to={`/title/${T.id}`}><Logo size={26} text={false} /></Link><b style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{T.title}</b>
        <button className="btn" onClick={() => go(ch - 1)} disabled={ch <= 1}>‹</button>
        <select value={ch} onChange={(e) => go(+e.target.value)}>{Array.from({ length: Math.min(T.chapters, 600) }, (_, i) => <option key={i} value={i + 1}>{chapterTitle(T, i + 1)}</option>)}</select>
        <button className="btn" onClick={() => go(ch + 1)} disabled={ch >= T.chapters}>›</button>
        <span className="grow" />
        <button className="btn" onClick={() => setZen(true)} title="Z">{t('zen')}</button>
        <button className="btn" onClick={() => setCine(!cine)}>{t('cinematic')}</button>
        <button className="btn pri" onClick={() => setPanel(!panel)}>Aa</button>
      </div>
      {zen && <button className="btn" style={{ position: 'fixed', top: 8, insetInlineEnd: 8, zIndex: 40, opacity: 0.4 }} onClick={() => setZen(false)}>✕</button>}

      {!comic ? (
        <article className={'reader ' + R.font} onMouseUp={() => setSel(getSelection().toString().trim())} onTouchEnd={() => setTimeout(() => setSel(getSelection().toString().trim()), 50)} key={ch + R.ver}>
          <h2>{chapterTitle(T, ch)}</h2>{paras.map((p, i) => <Para key={i} p={p} hls={hls} />)}</article>
      ) : R.mode === 'strip' ? (
        <div className="strip" key={ch}>{pages.map((u, i) => <img key={i} src={u} loading="lazy" alt={`${i + 1}`} />)}</div>
      ) : (
        <div className="pg" style={{ '--w': R.width + 'px' }}><img src={pages[page]} alt={`${page + 1}`} /><div className="zl" onClick={() => flip(rtl ? 1 : -1)} /><div className="zr" onClick={() => flip(rtl ? -1 : 1)} /><p style={{ textAlign: 'center' }}>{page + 1} / {pages.length}</p></div>
      )}

      {sel && <div className="glass box" style={{ position: 'fixed', bottom: 12, insetInline: 0, margin: '0 auto', zIndex: 35, maxWidth: 420 }}>
        <small>“{sel.slice(0, 80)}”</small><div className="flex">
          <button className="btn pri" onClick={() => { act.addHL({ tid: T.id, ch, text: sel, note }); setSel(''); toast('✓') }}>{t('highlight')}</button>
          <button className="btn" onClick={() => { act.addHL({ tid: T.id, ch, text: sel, kind: 'quote' }); setSel('') ; toast('✓')}}>{t('quote')}</button>
          {sel.split(' ').length === 1 && <button className="btn" onClick={() => { define(sel); setPanel(true); setSel('') }}>{t('define')}</button>}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notes')} /></div></div>}

      <div className="wrap" style={{ maxWidth: R.width + 40 }}>
        <div className="flex"><button className="btn" onClick={() => go(ch - 1)} disabled={ch <= 1}>‹ {t('prev')}</button><span className="grow" /><button className="btn pri" onClick={() => go(ch + 1)} disabled={ch >= T.chapters}>{t('next')} ›</button></div>
        {!zen && !comic && <Quiz key={ch} title={T} ch={ch} />}
        {!zen && <Discussion tid={T.id} ch={ch} />}
      </div>

      {panel && !zen && (
        <aside className="rpanel glass">
          <h4>{t('presets')}</h4><div className="flex wrapf">{Object.keys(PRESETS).map((k) => <button key={k} className="chip" onClick={() => preset(k)}>{k}</button>)}</div>
          {!comic && <><label>{t('size')} {R.size}<input type="range" min="14" max="30" value={R.size} onChange={(e) => setR({ size: +e.target.value })} /></label>
            <select value={R.font} onChange={(e) => setR({ font: e.target.value })}>{['serif', 'sans', 'mono'].map((f) => <option key={f}>{f}</option>)}</select>
            <label>Line {R.lh}<input type="range" min="1.3" max="2.4" step=".1" value={R.lh} onChange={(e) => setR({ lh: +e.target.value })} /></label></>}
          <label>{t('zoom')} {R.width}<input type="range" min="420" max="1000" step="20" value={R.width} onChange={(e) => setR({ width: +e.target.value })} /></label>
          {comic && <div className="flex"><button className={'chip' + (R.mode === 'strip' ? ' on' : '')} onClick={() => setR({ mode: 'strip' })}>Vertical strip</button><button className={'chip' + (R.mode === 'page' ? ' on' : '')} onClick={() => setR({ mode: 'page' })}>Page flip {rtl ? '(RTL)' : ''}</button></div>}
          <label>{t('autoscroll')} {R.speed || 'off'}<input type="range" min="0" max="10" value={R.speed} onChange={(e) => setR({ speed: +e.target.value })} /></label>
          <label>Version<select value={R.ver} onChange={(e) => setR({ ver: +e.target.value })}><option value="0">Official EN</option><option value="1">Fan translation</option><option value="2">Alt. translation</option></select></label>
          <label><input type="checkbox" checked={S.spoiler} onChange={(e) => set({ spoiler: e.target.checked })} /> {t('spoilers')}</label>
          <p className="muted">{t('estimate')}: {Math.floor(remaining / 60)}h {remaining % 60}m</p>
          <Tension t={T} ch={ch} />
          {site.toggles.tts && !comic && <><h4>{t('listen')}</h4><div className="flex"><button className="btn pri" onClick={speaking ? () => { speechSynthesis.pause(); setSpeaking(false) } : () => (speechSynthesis.paused ? (speechSynthesis.resume(), setSpeaking(true)) : speak())}>{speaking ? '⏸' : '▶'}</button><button className="btn" onClick={() => { speechSynthesis.cancel(); setSpeaking(false) }}>■</button><input type="range" min=".5" max="2" step=".1" value={rate} onChange={(e) => setRate(+e.target.value)} /></div>
            <select value={voice} onChange={(e) => setVoice(e.target.value)}><option value="">Default voice</option>{voices.map((v) => <option key={v.name}>{v.name}</option>)}</select></>}
          <h4>{t('pin')}</h4><button className="btn" onClick={() => { const h = document.documentElement.scrollHeight - innerHeight; act.addHL({ tid: T.id, ch, kind: 'pin', text: `${t('chapter')} ${ch} @ ${Math.round((h > 0 ? scrollY / h : 0) * 100)}%`, pos: h > 0 ? scrollY / h : 0 }); toast('📌') }}>📌 {t('pin')}</button>
          {pins.map((p) => <p key={p.id}><a href="#" onClick={(e) => { e.preventDefault(); p.ch === ch ? scrollTo(0, p.pos * (document.documentElement.scrollHeight - innerHeight)) : go(p.ch) }}>{p.text}</a> <button className="chip" onClick={() => act.delHL(p.id)}>✕</button></p>)}
          <h4>{t('notes')}</h4>{hls.map((h) => <p key={h.id}><small>“{h.text.slice(0, 60)}” {h.note && `— ${h.note}`}</small> <button className="chip" onClick={() => act.delHL(h.id)}>✕</button></p>)}
          {def && <div className="glass box"><b>{def.w}</b><br />{def.d}</div>}
          <button className="btn" onClick={offline}>⬇ {t('offline')}</button>
          {site.toggles.sounds && <Sounds />}<Pomodoro />
        </aside>
      )}
      <QuickSettings /><Peek />
      <div className="toasts">{toasts.map((x) => <div key={x.id} className="toast">{x.m}</div>)}</div>
    </div>
  )
}
