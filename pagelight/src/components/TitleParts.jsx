import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { Modal, Stars, Switch } from './ui'
import { useApp } from '../lib/app'
import { useUD, actions } from '../lib/userdata'
import { characters, lore, tensionSeries, tension, quiz as makeQuiz, pollFor, seedVotes } from '../lib/content'
import { socialService } from '../lib/services'
import { mulberry32, timeAgo, cx, fmtNum } from '../lib/util'
import { toast } from '../lib/toast'

export const SPOILER_TAGS = ['time-travel', 'reincarnation', 'revenge']

export function AgeGate({ compact }) {
  const { t, profile } = useApp()
  return (
    <div className={cx('age-gate glass', compact && 'compact')}>
      <Icon name="lock" size={34} />
      <h3>{t('age.blocked.title')}</h3>
      <p className="muted">{profile ? (profile.ageStatus === 'rejected' ? t('age.rejected.msg') : t('age.blocked.profile')) : t('age.blocked.signin')}</p>
      <Link className="btn primary" to={profile ? '/profile?tab=settings' : '/auth'}>{profile ? t('age.set') : t('auth.signin')}</Link>
    </div>
  )
}

export function TensionMeter({ title, current = 1, span = 30 }) {
  const { t } = useApp()
  const from = Math.max(1, current - Math.floor(span / 2)), to = Math.min(title.chapters, from + span - 1)
  const data = tensionSeries(title, from, to)
  const w = 560, h = 120, bw = w / data.length
  return (
    <div className="tension">
      <div className="row between"><b>{t('tension')}</b><small className="muted">{t('chapter')} {from}–{to}</small></div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={t('tension')}>
        {data.map((d, i) => <rect key={d.n} x={i * bw + 1} y={h - (d.v / 100) * (h - 8)} width={bw - 2} height={(d.v / 100) * (h - 8)} rx="2" className={cx('tbar', d.n === current && 'cur', d.v >= 75 && 'hot')}><title>{`${t('chapter')} ${d.n}: ${d.v}`}</title></rect>)}
      </svg>
      <div className="row between muted"><small>{t('tension.calm')}</small><small>{t('tension.peak')}</small></div>
    </div>
  )
}

const REL_COLOR = { ally: '#34d399', rival: '#fbbf24', mentor: '#60a5fa', family: '#a78bfa', romance: '#f472b6', enemy: '#f87171', secret: '#94a3b8' }
export function CharacterMap({ title }) {
  const { t, tx } = useApp()
  const { list, edges } = useMemo(() => characters(title), [title.id])
  const [sel, setSel] = useState(0)
  const W = 560, H = 420, cx0 = W / 2, cy0 = H / 2
  const pos = list.map((c, i) => (i === 0 ? [cx0, cy0] : [cx0 + Math.cos(((i - 1) / (list.length - 1)) * 6.283 - 1.57) * 170, cy0 + Math.sin(((i - 1) / (list.length - 1)) * 6.283 - 1.57) * 150]))
  const c = list[sel]
  return (
    <div className="chars">
      <svg viewBox={`0 0 ${W} ${H}`} className="relmap" role="img" aria-label={t('characters')}>
        {edges.map((e, i) => <line key={i} x1={pos[e.a][0]} y1={pos[e.a][1]} x2={pos[e.b][0]} y2={pos[e.b][1]} stroke={REL_COLOR[e.type]} strokeWidth={sel === e.a || sel === e.b ? 3 : 1.5} opacity={sel === e.a || sel === e.b ? 1 : 0.4} />)}
        {list.map((n, i) => (
          <g key={n.id} onClick={() => setSel(i)} className="node" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(i)} role="button" aria-label={n.name}>
            <circle cx={pos[i][0]} cy={pos[i][1]} r={i === 0 ? 34 : 26} fill={`hsl(${n.hue} 65% 50%)`} stroke={sel === i ? '#fff' : 'transparent'} strokeWidth="3" />
            <text x={pos[i][0]} y={pos[i][1] + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">{n.name.split(' ').map((w) => w[0]).join('')}</text>
            <text x={pos[i][0]} y={pos[i][1] + (i === 0 ? 52 : 42)} textAnchor="middle" fontSize="11" className="nodelabel">{n.name}</text>
          </g>
        ))}
      </svg>
      <div className="char-panel glass">
        <h3>{c.name}</h3>
        <div className="row wrap"><span className="pill accent">{tx('role.' + c.role, c.role)}</span><span className="pill">{tx('arch.' + c.archetype, c.archetype)}</span><span className="pill soft">{c.age}</span></div>
        <p>{c.bio}</p>
        <div className="row wrap">{c.traits.map((x) => <span key={x} className="pill soft">{x}</span>)}</div>
        <h4>{t('relationships')}</h4>
        <ul className="rel-list">{edges.filter((e) => e.a === sel || e.b === sel).map((e, i) => { const o = list[e.a === sel ? e.b : e.a]; return <li key={i}><i style={{ background: REL_COLOR[e.type] }} />{tx('rel.' + e.type, e.type)} — <button className="link" onClick={() => setSel(o.id)}>{o.name}</button></li> })}</ul>
      </div>
    </div>
  )
}

export function LoreAtlas({ title }) {
  const { t } = useApp()
  const L = useMemo(() => lore(title), [title.id])
  const [sel, setSel] = useState(null)
  const hue = title.hue
  return (
    <div className="atlas">
      <div className="map-wrap">
        <svg viewBox="0 0 100 100" className="worldmap" role="img" aria-label={t('atlas')}>
          <rect width="100" height="100" fill={`hsl(${hue} 40% 14%)`} />
          {L.blobs.map((b, i) => <polygon key={i} points={b.map((p) => p.join(',')).join(' ')} fill={`hsl(${(hue + 30) % 360} 35% ${26 + i * 3}%)`} stroke={`hsl(${hue} 50% 60%)`} strokeWidth="0.3" />)}
          {L.places.map((p) => <g key={p.id} onClick={() => setSel(p)} className="node" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(p)}><circle cx={p.x} cy={p.y} r="2" fill="#fbbf24" stroke="#fff" strokeWidth="0.4" /><text x={p.x} y={p.y - 3.4} textAnchor="middle" fontSize="3.2" fill="#fff">{p.name}</text></g>)}
        </svg>
      </div>
      <div className="stack">
        {sel && <div className="glass pad"><h4>{sel.name}</h4><p>{sel.text}</p></div>}
        <h4>{t('factions')}</h4>
        {L.factions.map((f) => <button key={f.id} className="lore-item" onClick={() => setSel(f)}><b>{f.name}</b><small className="muted">{f.base}</small></button>)}
        <h4>{t('artifacts')}</h4>
        {L.artifacts.map((f) => <button key={f.id} className="lore-item" onClick={() => setSel(f)}><b>{f.name}</b><small className="muted">{f.owner}</small></button>)}
      </div>
    </div>
  )
}

export function QuizModal({ title, chapter, onClose }) {
  const { t } = useApp()
  const qs = useMemo(() => makeQuiz(title, chapter), [title.id, chapter])
  const [i, setI] = useState(0)
  const [pick, setPick] = useState(null)
  const [score, setScore] = useState(0)
  const done = i >= qs.length
  useEffect(() => { if (done) actions.quizDone(`${title.id}:${chapter ?? 'all'}`, score, qs.length) }, [done]) // eslint-disable-line
  const q = qs[i]
  return (
    <Modal onClose={onClose} title={t('quiz')}>
      {done ? (
        <div className="stack center"><Icon name="trophy" size={44} /><h2>{score} / {qs.length}</h2><p className="muted">{score === qs.length ? t('quiz.perfect') : t('quiz.try')}</p><button className="btn primary" onClick={onClose}>{t('close')}</button></div>
      ) : (
        <div className="stack">
          <small className="muted">{i + 1} / {qs.length}</small>
          <h3>{q.q}</h3>
          {q.opts.map((o, k) => <button key={k} disabled={pick !== null} className={cx('quiz-opt', pick !== null && k === q.answer && 'right', pick === k && k !== q.answer && 'wrong')} onClick={() => { setPick(k); if (k === q.answer) setScore((s) => s + 1) }}>{o}</button>)}
          {pick !== null && <button className="btn primary" onClick={() => { setI(i + 1); setPick(null) }}>{i + 1 >= qs.length ? t('finish') : t('next')}</button>}
        </div>
      )}
    </Modal>
  )
}

const SEED_REVIEWS = (title) => {
  const r = mulberry32(title.id * 17)
  const who = ['pagefox', 'inkandtea', 'noor_reads', 'kenji_k']
  const txt = ['Gripping from the first chapter. The pacing never lets up.', 'Beautiful world-building, a little slow in the middle.', 'Characters feel real and the dialogue is sharp.', 'Not for everyone, but it worked for me.']
  return who.slice(0, 2 + Math.floor(r() * 3)).map((u, i) => ({ id: 's' + i, user: u, rating: 3 + Math.round(r() * 4) / 2, body: txt[i % 4], ts: Date.now() - (i + 1) * 3e8, spoiler: i === 1 && r() > 0.4, seed: true }))
}

export function ReviewsPanel({ title }) {
  const { t, rp, lang } = useApp()
  const mine = useUD((s) => s.reviews.find((r) => r.t === title.id))
  const [rating, setRating] = useState(mine?.rating || 0)
  const [body, setBody] = useState(mine?.body || '')
  const [pros, setPros] = useState(mine?.pros || '')
  const [cons, setCons] = useState(mine?.cons || '')
  const [spoiler, setSpoiler] = useState(!!mine?.spoiler)
  const [shown, setShown] = useState({})
  const list = [...(mine ? [mine] : []), ...SEED_REVIEWS(title)]
  const submit = () => { if (!rating) return toast(t('review.rating.required'), 'error'); actions.addReview({ t: title.id, rating, body, pros, cons, spoiler }); toast(t('review.saved'), 'success') }
  return (
    <div className="stack">
      <div className="glass pad stack">
        <h4>{t('review.write')}</h4>
        <Stars value={rating} onChange={setRating} size={24} />
        <div className="two"><input placeholder={t('review.pros')} value={pros} onChange={(e) => setPros(e.target.value)} /><input placeholder={t('review.cons')} value={cons} onChange={(e) => setCons(e.target.value)} /></div>
        <textarea rows={3} placeholder={t('review.body')} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="row between"><Switch checked={spoiler} onChange={setSpoiler} label={t('review.spoiler')} /><button className="btn primary" onClick={submit}>{t('review.submit')}</button></div>
      </div>
      {list.map((r) => {
        const hide = r.spoiler && rp.spoilerShield && !shown[r.id]
        return (
          <article key={r.id} className="review glass pad">
            <div className="row between"><b>{r.mine ? t('you') : '@' + r.user}</b><Stars value={r.rating} size={14} /></div>
            <small className="muted">{timeAgo(r.ts, lang)}</small>
            {hide ? <button className="spoiler-cover" onClick={() => setShown({ ...shown, [r.id]: 1 })}><Icon name="eyeoff" size={16} />{t('spoiler.reveal')}</button> : <p>{r.body}</p>}
            {!hide && r.pros && <p className="pros">+ {r.pros}</p>}
            {!hide && r.cons && <p className="cons">− {r.cons}</p>}
            {!r.mine && <button className="link subtle" onClick={() => { socialService.report('review', r.id, 'user report'); toast(t('reported')) }}><Icon name="flag" size={12} /> {t('report')}</button>}
          </article>
        )
      })}
    </div>
  )
}

/** Per-chapter community: poll + discussion thread with spoiler shield. */
export function Discussion({ title, chapter }) {
  const { t, rp, profile, lang } = useApp()
  const local = useUD((s) => s.comments)
  const maxRead = useUD((s) => s.progress[title.id]?.max || 0)
  const voted = useUD((s) => s.pollVotes)
  const poll = useMemo(() => pollFor(title, chapter), [title.id, chapter])
  const base = useMemo(() => seedVotes(poll), [poll.id])
  const [items, setItems] = useState([])
  const [body, setBody] = useState('')
  const [sp, setSp] = useState(false)
  const [open, setOpen] = useState({})
  useEffect(() => { let on = true; socialService.comments(title, chapter, local).then((r) => on && setItems(r)); return () => { on = false } }, [title.id, chapter, local.length])
  const myVote = voted[poll.id]
  const votes = base.map((v, i) => v + (myVote === i ? 1 : 0)), total = votes.reduce((a, b) => a + b, 0)
  const post = async () => {
    if (!body.trim()) return
    try { const c = await socialService.addComment(title, chapter, body.trim(), sp, profile?.handle); if (c) actions.addLocalComment(c); setBody(''); setSp(false); if (!c) socialService.comments(title, chapter, local).then(setItems) } catch (e) { toast(e.message, 'error') }
  }
  return (
    <section className="discussion stack">
      <div className="glass pad stack">
        <h4>{t('poll')}</h4><b>{poll.q}</b>
        {poll.options.map((o, i) => (
          <button key={i} className={cx('poll-opt', myVote === i && 'on')} disabled={myVote !== undefined} onClick={() => actions.votePoll(poll.id, i)}>
            <i style={{ width: myVote !== undefined ? `${(votes[i] / total) * 100}%` : 0 }} /><span>{o}</span>{myVote !== undefined && <em>{Math.round((votes[i] / total) * 100)}%</em>}
          </button>
        ))}
      </div>
      <h4>{t('discussion')} · {t('chapter')} {chapter}</h4>
      <div className="stack">
        <textarea rows={2} placeholder={profile ? t('comment.placeholder') : t('comment.signin')} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="row between"><Switch checked={sp} onChange={setSp} label={t('review.spoiler')} /><button className="btn primary sm" onClick={post}>{t('post')}</button></div>
      </div>
      {items.map((c) => {
        const future = (c.chapter || chapter) > Math.max(maxRead, chapter)
        const hide = rp.spoilerShield && (c.spoiler || future) && !open[c.id] && !c.mine
        return (
          <div key={c.id} className="comment">
            <b>@{c.user}</b> <small className="muted">{timeAgo(c.ts, lang)}</small>
            {hide ? <button className="spoiler-cover" onClick={() => setOpen({ ...open, [c.id]: 1 })}><Icon name="eyeoff" size={14} />{t('spoiler.reveal')}</button> : <p>{c.body}</p>}
          </div>
        )
      })}
    </section>
  )
}
export { tension, fmtNum }
