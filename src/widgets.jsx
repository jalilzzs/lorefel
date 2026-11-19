import { useEffect, useRef, useState } from 'react'
import { useApp } from './store'
import { quiz } from './lib/catalog'

// ---- Ambient soundscapes: synthesized with WebAudio (no audio files needed) ----
const PRESETS = {
  rain: { t: 'highpass', f: 1400, q: 0.5, lfo: 0, d: 0 },
  fireplace: { t: 'lowpass', f: 650, q: 1, lfo: 7, d: 0.5 },
  'coffee shop': { t: 'bandpass', f: 600, q: 0.7, lfo: 2, d: 0.3 },
  forest: { t: 'bandpass', f: 3200, q: 2, lfo: 0.4, d: 0.4 },
  'night breeze': { t: 'lowpass', f: 400, q: 0.8, lfo: 0.15, d: 0.6 },
}
export function Sounds() {
  const { t } = useApp(); const ctx = useRef(), nodes = useRef({}), [on, setOn] = useState({}), [vol, setVol] = useState(0.4)
  const start = (k) => {
    const c = ctx.current || (ctx.current = new (window.AudioContext || window.webkitAudioContext)()); c.resume()
    const p = PRESETS[k], buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true
    const f = c.createBiquadFilter(); f.type = p.t; f.frequency.value = p.f; f.Q.value = p.q
    const g = c.createGain(); g.gain.value = vol * 0.5; src.connect(f); f.connect(g); g.connect(c.destination); src.start()
    let lfo
    if (p.lfo) { lfo = c.createOscillator(); lfo.frequency.value = p.lfo; const lg = c.createGain(); lg.gain.value = p.d * vol * 0.25; lfo.connect(lg); lg.connect(g.gain); lfo.start() }
    nodes.current[k] = { src, g, lfo }
  }
  const stop = (k) => { const n = nodes.current[k]; if (n) { n.src.stop(); n.lfo?.stop(); delete nodes.current[k] } }
  const toggle = (k) => { on[k] ? stop(k) : start(k); setOn({ ...on, [k]: !on[k] }) }
  useEffect(() => { Object.values(nodes.current).forEach((n) => { n.g.gain.value = vol * 0.5 }) }, [vol])
  useEffect(() => () => Object.keys(nodes.current).forEach(stop), [])
  return (
    <div><h4>{t('sounds')}</h4><div className="flex wrapf">{Object.keys(PRESETS).map((k) => <button key={k} className={'chip' + (on[k] ? ' on' : '')} onClick={() => toggle(k)}>{k}</button>)}</div>
      <input type="range" min="0.05" max="1" step="0.05" value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="volume" /></div>
  )
}

// ---- Pomodoro focus timer ----
export function Pomodoro() {
  const { t, toast } = useApp(); const [mode, setMode] = useState('focus'), [left, setLeft] = useState(25 * 60), [run, setRun] = useState(false), [n, setN] = useState(0)
  useEffect(() => {
    if (!run) return
    const id = setInterval(() => setLeft((l) => {
      if (l > 1) return l - 1
      if (mode === 'focus') { const c = n + 1; setN(c); const long = c % 4 === 0; setMode('break'); toast(long ? 'Long break — 15 min' : 'Break — 5 min'); return (long ? 15 : 5) * 60 }
      setMode('focus'); toast('Back to reading'); return 25 * 60
    }), 1000)
    return () => clearInterval(id)
  }, [run, mode, n])
  const m = String(Math.floor(left / 60)).padStart(2, '0'), s = String(left % 60).padStart(2, '0')
  return (
    <div className="pomo"><h4>{t('focus')} · {mode}</h4><div className="big">{m}:{s}</div>
      <div className="flex"><button className="btn pri" onClick={() => setRun(!run)}>{run ? '⏸' : '▶'}</button><button className="btn" onClick={() => { setRun(false); setMode('focus'); setLeft(25 * 60) }}>↺</button><small className="muted">#{n}</small></div></div>
  )
}

// ---- Post-read quiz ----
export function Quiz({ title, ch }) {
  const { t } = useApp(); const qs = quiz(title, ch), [ans, setAns] = useState({})
  const score = qs.filter((q, i) => ans[i] === q.a).length
  return (
    <div className="glass box"><h3>{t('quiz')}</h3>
      {qs.map((q, i) => <div key={i}><p><b>{q.q}</b></p><div className="flex wrapf">{q.o.map((o) => <button key={o} disabled={ans[i] !== undefined} className={'chip' + (ans[i] === o ? (o === q.a ? ' ok' : ' bad') : ans[i] !== undefined && o === q.a ? ' ok' : '')} onClick={() => setAns({ ...ans, [i]: o })}>{o}</button>)}</div></div>)}
      {Object.keys(ans).length === qs.length && <p><b>{score} / {qs.length}</b> {score === qs.length ? '🏆' : '✨'}</p>}
    </div>
  )
}

// ---- Per-chapter discussion thread + poll ----
export function Discussion({ tid, ch }) {
  const { S, set, t, profileName } = useApp(); const key = `${tid}:${ch}`, D = S.discuss[key] || { comments: [], poll: { q: 'How was this chapter?', opts: ['Epic', 'Solid', 'Slow'], votes: [0, 0, 0], mine: -1 } }
  const [txt, setTxt] = useState(''), [sp, setSp] = useState(false), [rev, setRev] = useState({})
  const save = (d) => set((s) => ({ discuss: { ...s.discuss, [key]: d } }))
  return (
    <div className="glass box"><h3>💬 {t('chapter')} {ch}</h3>
      <div className="poll"><b>{D.poll.q}</b>{D.poll.opts.map((o, i) => { const tot = D.poll.votes.reduce((a, b) => a + b, 0) || 1; return <button key={o} className={'bar' + (D.poll.mine === i ? ' on' : '')} onClick={() => { if (D.poll.mine >= 0) return; const v = [...D.poll.votes]; v[i]++; save({ ...D, poll: { ...D.poll, votes: v, mine: i } }) }}><i style={{ width: (D.poll.votes[i] / tot) * 100 + '%' }} /><span>{o} · {D.poll.votes[i]}</span></button> })}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; save({ ...D, comments: [{ id: Date.now(), u: S.profile.name, text: txt, spoiler: sp, ts: Date.now() }, ...D.comments] }); setTxt('') }} className="flex">
        <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="…" /><label><input type="checkbox" checked={sp} onChange={(e) => setSp(e.target.checked)} /> spoiler</label><button className="btn pri">{t('submit')}</button></form>
      {D.comments.map((c) => <p key={c.id} className="cmt"><b>{c.u}</b>: {c.spoiler && S.spoiler && !rev[c.id] ? <button className="chip" onClick={() => setRev({ ...rev, [c.id]: 1 })}>⚠ spoiler — {t('spoilers')}</button> : c.text}</p>)}
    </div>
  )
}
