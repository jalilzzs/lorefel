import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Modal, Switch, Chip } from './ui'
import { useApp } from '../lib/app'
import { LANGS } from '../lib/i18n'
import { SCAPES, setScape } from '../lib/soundscape'
import { VOCAB } from '../lib/content'
import { cx, lsGet, lsSet } from '../lib/util'
import { toast } from '../lib/toast'

/* ------------------------------------------------------------ Text-to-speech */
export function useTTS(paras, lang) {
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(-1)
  const [rate, setRate] = useState(1)
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState('')
  const st = useRef({ playing: false, rate: 1, voiceURI: '', paras })
  const speech = LANGS.find((l) => l.code === lang)?.speech || 'en-US'
  st.current.paras = paras; st.current.rate = rate; st.current.voiceURI = voiceURI
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  useEffect(() => {
    if (!supported) return
    const load = () => setVoices(speechSynthesis.getVoices())
    load(); speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => { speechSynthesis.removeEventListener?.('voiceschanged', load); speechSynthesis.cancel() }
  }, [supported])
  const speak = useCallback((i) => {
    if (!supported) return
    speechSynthesis.cancel()
    const ps = st.current.paras
    if (!st.current.playing || i >= ps.length) { st.current.playing = false; setPlaying(false); setIdx(-1); return }
    const u = new SpeechSynthesisUtterance(ps[i])
    u.lang = speech; u.rate = st.current.rate
    const v = speechSynthesis.getVoices().find((x) => x.voiceURI === st.current.voiceURI)
    if (v) u.voice = v
    u.onend = () => { if (st.current.playing) speak(i + 1) }
    u.onerror = () => {}
    setIdx(i); speechSynthesis.speak(u)
  }, [speech, supported])
  const play = (from) => { st.current.playing = true; setPlaying(true); speak(from ?? Math.max(0, idx)) }
  const pause = () => { st.current.playing = false; setPlaying(false); if (supported) speechSynthesis.cancel() }
  const stop = () => { pause(); setIdx(-1) }
  const changeRate = (r) => { setRate(r); st.current.rate = r; if (st.current.playing) speak(idx) }
  const changeVoice = (v) => { setVoiceURI(v); st.current.voiceURI = v; if (st.current.playing) speak(idx) }
  useEffect(() => { stop() }, [paras]) // eslint-disable-line
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(speech.slice(0, 2).toLowerCase()))
  return { supported, playing, idx, rate, voices: langVoices, voiceURI, play, pause, stop, changeRate, changeVoice }
}

/* ------------------------------------------------------------ Pomodoro */
export function Pomodoro() {
  const { t } = useApp()
  const [mode, setMode] = useState('focus')
  const [left, setLeft] = useState(25 * 60)
  const [run, setRun] = useState(false)
  const [round, setRound] = useState(1)
  useEffect(() => {
    if (!run) return
    const id = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [run])
  useEffect(() => {
    if (left > 0) return
    if (mode === 'focus') { const long = round % 4 === 0; setMode('break'); setLeft((long ? 15 : 5) * 60); toast(t(long ? 'pomo.long' : 'pomo.break'), 'success') }
    else { setMode('focus'); setLeft(25 * 60); setRound((r) => r + 1); toast(t('pomo.focus'), 'success') }
  }, [left]) // eslint-disable-line
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0')
  return (
    <div className={cx('pomo', mode, run && 'run')}>
      <Icon name="timer" size={15} /><b>{mm}:{ss}</b><small>{t('pomo.' + mode)} · {round}</small>
      <button className="icon-btn sm" onClick={() => setRun(!run)} aria-label="toggle"><Icon name={run ? 'pause' : 'play'} size={13} fill /></button>
      <button className="icon-btn sm" onClick={() => { setRun(false); setMode('focus'); setLeft(25 * 60) }} aria-label="reset"><Icon name="x" size={13} /></button>
    </div>
  )
}

/* ------------------------------------------------------------ Ambient mixer */
export function MixPanel({ onClose }) {
  const { t } = useApp()
  const [vols, setVols] = useState(() => lsGet('pl:mix', {}))
  const set = (k, v) => { const n = { ...vols, [k]: v }; setVols(n); lsSet('pl:mix', n); setScape(k, v) }
  return (
    <Modal onClose={onClose} title={t('soundscapes')}>
      <div className="stack">
        <p className="muted">{t('soundscapes.sub')}</p>
        {SCAPES.map((k) => <label key={k} className="field"><span>{t('scape.' + k)}</span><input type="range" min="0" max="1" step="0.05" value={vols[k] || 0} onChange={(e) => set(k, +e.target.value)} /></label>)}
        <button className="btn ghost" onClick={() => SCAPES.forEach((k) => set(k, 0))}>{t('mute.all')}</button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ Vocabulary helper */
export function VocabModal({ word, lang, onClose }) {
  const { t } = useApp()
  const [state, setState] = useState({ loading: true })
  const w = word.toLowerCase().replace(/[^\p{L}'-]/gu, '')
  useEffect(() => {
    let on = true
    if (VOCAB[w]) { setState({ defs: [{ pos: '', text: VOCAB[w] }] }); return }
    if (lang !== 'en') { setState({ none: true }); return }
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`).then((r) => r.json()).then((j) => {
      if (!on) return
      if (!Array.isArray(j)) return setState({ none: true })
      setState({ phon: j[0].phonetic, defs: j[0].meanings.slice(0, 3).map((m) => ({ pos: m.partOfSpeech, text: m.definitions[0].definition })) })
    }).catch(() => on && setState({ none: true }))
    return () => { on = false }
  }, [w, lang])
  return (
    <Modal onClose={onClose} title={t('vocab')}>
      <div className="stack">
        <h2 className="serif">{word} {state.phon && <small className="muted">{state.phon}</small>}</h2>
        {state.loading && <p className="muted">…</p>}
        {state.defs?.map((d, i) => <p key={i}>{d.pos && <i className="muted">{d.pos} · </i>}{d.text}</p>)}
        {state.none && <p className="muted">{t('vocab.none')}</p>}
        <div className="row wrap">
          <a className="btn ghost sm" target="_blank" rel="noreferrer" href={`https://${lang}.wiktionary.org/wiki/${encodeURIComponent(w)}`}>Wiktionary</a>
          <a className="btn ghost sm" target="_blank" rel="noreferrer" href={`https://translate.google.com/?sl=auto&tl=${lang}&text=${encodeURIComponent(w)}`}>{t('vocab.translate')}</a>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ Chapter picker */
export function ChapterPicker({ title, current, onPick, onClose }) {
  const { t } = useApp()
  const [page, setPage] = useState(Math.floor((current - 1) / 100))
  const [jump, setJump] = useState('')
  const pages = Math.ceil(title.chapters / 100)
  const start = page * 100 + 1, end = Math.min(title.chapters, start + 99)
  return (
    <Modal onClose={onClose} title={t('chapters')} wide>
      <div className="stack">
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = +jump; if (n >= 1 && n <= title.chapters) onPick(n) }}><input type="number" min="1" max={title.chapters} placeholder={`1–${title.chapters}`} value={jump} onChange={(e) => setJump(e.target.value)} /><button className="btn primary">{t('go')}</button></form>
        {pages > 1 && <div className="row wrap">{Array.from({ length: pages }, (_, i) => <Chip key={i} active={page === i} onClick={() => setPage(i)}>{i * 100 + 1}</Chip>)}</div>}
        <div className="ch-grid">{Array.from({ length: end - start + 1 }, (_, i) => start + i).map((n) => <button key={n} className={cx('ch-cell', n === current && 'on')} onClick={() => onPick(n)}>{n}</button>)}</div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ Reader settings drawer */
export function ReaderSettings({ title, comic, tts, auto, setAuto, onClose, applyPreset, openMix, showMix }) {
  const { t, rp, setRp, site } = useApp()
  return (
    <aside className="drawer glass" aria-label={t('reader.settings')}>
      <div className="modal-head"><h3>{t('reader.settings')}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
      <div className="stack">
        <div><h4>{t('presets')}</h4><div className="row wrap">{['night-owl', 'cozy-paper', 'speed-reader', 'comic-strip'].map((p) => <Chip key={p} active={rp.preset === p} onClick={() => applyPreset(p)}>{t('preset.' + p)}</Chip>)}</div></div>
        {!comic && (
          <>
            <div><h4>{t('font')}</h4><div className="row wrap">{['serif', 'sans', 'mono'].map((f) => <Chip key={f} active={rp.font === f} onClick={() => setRp({ font: f, preset: '' })}>{t('font.' + f)}</Chip>)}</div></div>
            <label className="field"><span>{t('text.size')} · {rp.size}px</span><input type="range" min="14" max="30" value={rp.size} onChange={(e) => setRp({ size: +e.target.value, preset: '' })} /></label>
            <label className="field"><span>{t('line.height')} · {rp.lh}</span><input type="range" min="1.3" max="2.4" step="0.05" value={rp.lh} onChange={(e) => setRp({ lh: +e.target.value, preset: '' })} /></label>
            <label className="field"><span>{t('page.width')} · {rp.width}px</span><input type="range" min="440" max="980" step="10" value={rp.width} onChange={(e) => setRp({ width: +e.target.value, preset: '' })} /></label>
            <div><h4>{t('align')}</h4><div className="row">{['start', 'justify'].map((a) => <Chip key={a} active={rp.align === a} onClick={() => setRp({ align: a })}>{t('align.' + a)}</Chip>)}</div></div>
          </>
        )}
        {comic && (
          <>
            <div><h4>{t('comic.mode')}</h4><div className="row"><Chip active={rp.comic === 'strip'} onClick={() => setRp({ comic: 'strip' })}>{t('mode.strip')}</Chip><Chip active={rp.comic === 'page'} onClick={() => setRp({ comic: 'page' })}>{t('mode.page')}</Chip></div></div>
            {rp.comic === 'page' && <Switch checked={rp.rtl ?? title.format === 'manga'} onChange={(v) => setRp({ rtl: v })} label={t('mode.rtl')} />}
          </>
        )}
        <label className="field"><span>{t('autoscroll')} · {rp.autoSpeed}</span><input type="range" min="1" max="10" value={rp.autoSpeed} onChange={(e) => setRp({ autoSpeed: +e.target.value })} /></label>
        <button className={cx('btn', auto ? 'primary' : 'ghost')} onClick={() => setAuto(!auto)}><Icon name={auto ? 'pause' : 'play'} size={14} fill />{t('autoscroll')}</button>
        <Switch checked={rp.cinematic} onChange={(v) => setRp({ cinematic: v })} label={t('cinematic')} />
        <Switch checked={rp.spoilerShield} onChange={(v) => setRp({ spoilerShield: v })} label={t('spoiler.shield')} />
        {!comic && site.features.tts && tts.supported && (
          <div className="stack glass pad">
            <h4><Icon name="headphones" size={16} /> {t('tts')}</h4>
            <div className="row"><button className="btn primary sm" onClick={() => (tts.playing ? tts.pause() : tts.play())}><Icon name={tts.playing ? 'pause' : 'play'} size={14} fill />{tts.playing ? t('pause') : t('play')}</button><button className="btn ghost sm" onClick={tts.stop}><Icon name="stop" size={14} fill />{t('stop')}</button></div>
            <label className="field"><span>{t('tts.speed')} · {tts.rate}×</span><input type="range" min="0.6" max="2" step="0.1" value={tts.rate} onChange={(e) => tts.changeRate(+e.target.value)} /></label>
            <select value={tts.voiceURI} onChange={(e) => tts.changeVoice(e.target.value)} aria-label={t('tts.voice')}><option value="">{t('tts.voice')}: {t('default')}</option>{tts.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select>
          </div>
        )}
        {site.features.soundscapes && <button className="btn ghost" onClick={openMix}><Icon name="volume" size={16} />{t('soundscapes')}</button>}
      </div>
    </aside>
  )
}
