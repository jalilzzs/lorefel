import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { SaveButton, ShareModal, TiltCover, Shelf } from '../components/TitleCard'
import { AgeGate, CharacterMap, LoreAtlas, QuizModal, ReviewsPanel, SPOILER_TAGS, TensionMeter } from '../components/TitleParts'
import { Empty, Skeleton, Stars, Tabs } from '../components/ui'
import { useApp } from '../lib/app'
import { catalog, synopsisOf, WARNING_TAGS } from '../lib/catalog'
import { chapterMinutes, chapterTitle, pacingOf, recap, remainingMinutes, seasonEnd, tension } from '../lib/content'
import { isOffline, queueOffline, readingSpeed, removeOffline } from '../lib/chapters'
import { useAsync, useDocTitle } from '../lib/hooks'
import { actions, useUD } from '../lib/userdata'
import { cx, fmtMinutes, fmtNum, prettify } from '../lib/util'
import { toast } from '../lib/toast'

function ChapterList({ title }) {
  const { t } = useApp()
  const prog = useUD((s) => s.progress[title.id])
  const offline = useUD((s) => s.offline)
  const [page, setPage] = useState(0)
  const [jump, setJump] = useState('')
  const per = 50, pages = Math.ceil(title.chapters / per)
  const start = page * per + 1, end = Math.min(title.chapters, start + per - 1)
  const nav = useNavigate()
  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="row wrap">{Array.from({ length: Math.min(pages, 12) }, (_, i) => <button key={i} className={cx('chip', page === i && 'active')} onClick={() => setPage(i)}>{i * per + 1}–{Math.min(title.chapters, (i + 1) * per)}</button>)}{pages > 12 && <span className="muted">…</span>}</div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = +jump; if (n >= 1 && n <= title.chapters) nav(`/read/${title.id}/${n}`) }}><input type="number" min="1" max={title.chapters} placeholder={t('jump.chapter')} value={jump} onChange={(e) => setJump(e.target.value)} style={{ width: 130 }} /><button className="btn ghost sm">{t('go')}</button></form>
      </div>
      <ul className="chapter-list">
        {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((n) => {
          const read = prog?.read?.includes(n), off = isOffline(offline, title.id, n), v = tension(title, n)
          return (
            <li key={n} className={cx(read && 'read', prog?.chapter === n && 'current')}>
              <Link to={`/read/${title.id}/${n}`}><span className="num">{n}</span><span className="name">{chapterTitle(title, n)}</span><span className="muted">{chapterMinutes(title, n)}m</span><i className="tdot" style={{ '--v': v }} title={`${t('tension')} ${v}`} /></Link>
              <button className="icon-btn" aria-label={t('offline')} onClick={async () => { if (off) { await removeOffline(title.id, n); toast(t('offline.removed')) } else { await queueOffline(title, n); toast(t('offline.saved'), 'success') } }}><Icon name={off ? 'check' : 'download'} size={15} /></button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function Title() {
  const { id } = useParams()
  const { t, tx, canView, profile, rp, setRp, updateProfile } = useApp()
  const nav = useNavigate()
  const { data: title, loading } = useAsync(() => catalog.get(id), [id])
  const prog = useUD((s) => s.progress[+id])
  const status = useUD((s) => s.library[+id]?.status)
  const follows = useUD((s) => s.follows)
  const votes = useUD((s) => s.tagVotes[+id] || [])
  const muted = useUD((s) => s.mutedTags)
  const ud = useUD((s) => s)
  const [tab, setTab] = useState('overview')
  const [share, setShare] = useState(null)
  const [quiz, setQuiz] = useState(false)
  const [revealTags, setRevealTags] = useState(false)
  useDocTitle(title?.title, title ? synopsisOf(title).slice(0, 150) : '')
  useEffect(() => { setTab('overview') }, [id])
  useEffect(() => {
    const h = () => { if (title) { const s = status ? null : 'plan'; actions.setStatus(title.id, s); toast(s ? t('saved.to', { list: t('list.plan') }) : t('removed'), 'success') } }
    window.addEventListener('pl:bookmark', h); return () => window.removeEventListener('pl:bookmark', h)
  }, [title, status, t])
  const wpm = readingSpeed(ud)
  const related = useMemo(() => (title ? catalog.related(title, 14) : []), [title])
  const fans = useMemo(() => (title ? catalog.related(title, 14, true) : []), [title])
  if (loading) return <div className="page"><Skeleton h={320} r={20} /></div>
  if (!title) return <div className="page"><Empty icon="search" title={t('notfound')} action={<Link className="btn primary" to="/browse">{t('nav.browse')}</Link>} /></div>
  const blocked = !canView(title)
  const pace = pacingOf(title)
  const resumeCh = prog?.chapter || 1
  const following = (k, n) => follows.some((f) => f.kind === k && f.name === n)
  const toggle = (k, n) => { const on = actions.toggleFollow(k, n); toast(on ? t('following.on', { name: n }) : t('following.off', { name: n })) }
  const toggleMute = (tag) => { const next = muted.includes(tag) ? muted.filter((x) => x !== tag) : [...muted, tag]; actions.setMutedTags(next); if (profile) updateProfile({ mutedTags: next }) }
  const comeBack = prog && Date.now() - (prog.ts || 0) > 3 * 864e5
  const sEnd = seasonEnd(title)
  const left = sEnd - (prog?.max || 0)
  const warnings = title.tags.filter((x) => WARNING_TAGS.includes(x))
  const tropes = title.tags.filter((x) => !WARNING_TAGS.includes(x))
  const tabs = [{ id: 'overview', label: t('tab.overview') }, { id: 'chapters', label: t('tab.chapters') }, { id: 'characters', label: t('characters') }, { id: 'atlas', label: t('atlas') }, { id: 'reviews', label: t('tab.reviews') }, { id: 'related', label: t('tab.related') }]
  return (
    <div className="page title-page">
      <div className="title-hero" style={{ '--hue': title.hue }}>
        <TiltCover t={title} big blocked={blocked} />
        <div className="stack">
          <div className="row wrap"><span className={cx('pill', 'fmt', title.format)}>{t('f.' + title.format)}</span><span className="pill">{t('s.' + title.status)}</span><span className="pill">{title.year}</span><span className="pill">{t('lang.' + title.lang)}</span>{title.mature && <span className="pill danger">18+</span>}</div>
          <h1 className="serif">{title.title}</h1>
          <div className="row wrap muted">
            <span>{t('by')} <Link to={`/browse?q=${encodeURIComponent(title.author)}`}>{title.author}</Link></span>
            <button className={cx('chip sm', following('author', title.author) && 'active')} onClick={() => toggle('author', title.author)}><Icon name="bell" size={12} />{following('author', title.author) ? t('following') : t('follow')}</button>
            {title.translator && <><span>· {t('translator')} {title.translator}</span><button className={cx('chip sm', following('translator', title.translator) && 'active')} onClick={() => toggle('translator', title.translator)}><Icon name="bell" size={12} />{following('translator', title.translator) ? t('following') : t('follow')}</button></>}
            <button className={cx('chip sm', following('series', String(title.id)) && 'active')} onClick={() => toggle('series', String(title.id))}><Icon name="bell" size={12} />{t('follow.series')}</button>
          </div>
          <div className="row wrap"><Stars value={Math.round(title.rating * 2) / 2} /><b>{title.rating.toFixed(2)}</b><span className="muted">({fmtNum(title.votes)})</span><span className="pill accent"><Icon name="flame" size={12} />{t('velocity')} {title.velocity}</span><span className="pill soft">{t('pace.' + pace.label)}</span></div>
          <div className="row wrap">{title.genres.map((g) => <Link key={g} className="pill" to="/browse" onClick={() => {}}>{t('g.' + g)}</Link>)}</div>
          {blocked ? <AgeGate compact /> : <p className="synopsis">{synopsisOf(title)}</p>}
          {comeBack && !blocked && <div className="recap glass pad"><b><Icon name="sparkles" size={14} /> {t('previously')}</b><ul>{recap(title, prog.chapter).map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
          {left > 0 && left <= 3 && prog && <div className="pill accent"><Icon name="flag" size={12} /> {t('finale.near', { n: left })}</div>}
          <div className="row wrap">
            {!blocked && <button className="btn primary lg" onClick={() => nav(`/read/${title.id}/${resumeCh}`)}><Icon name="play" size={16} fill />{prog ? t('continue.ch', { n: resumeCh }) : t('read.first')}</button>}
            <SaveButton t={title} />
            <button className="btn ghost" onClick={() => setShare('share')}><Icon name="share" size={16} />{t('share')}</button>
            <button className="btn ghost" onClick={() => setShare('gift')}><Icon name="gift" size={16} />{t('gift')}</button>
            <Link className="btn ghost" to={`/compare?a=${title.id}`}><Icon name="scale" size={16} />{t('d.compare')}</Link>
          </div>
          <div className="stat-row">
            <div><b>{title.chapters}</b><small>{t('chapters')}</small></div>
            <div><b>{fmtMinutes(remainingMinutes(title, resumeCh, wpm))}</b><small>{t('time.left')}</small></div>
            <div><b>{wpm}</b><small>{t('wpm')}</small></div>
          </div>
        </div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <div className="two-col">
          <div className="stack">
            <h3>{t('content.warnings')}</h3>
            <div className="row wrap">{warnings.length ? warnings.map((w) => <button key={w} className={cx('pill warn', muted.includes(w) && 'muted-tag')} onClick={() => toggleMute(w)} title={t('mute.hint')}><Icon name={muted.includes(w) ? 'eyeoff' : 'flag'} size={12} />{tx('tag.' + w, prettify(w))}</button>) : <span className="muted">{t('none')}</span>}</div>
            <small className="muted">{t('mute.hint')}</small>
            <h3>{t('tags')}</h3>
            <div className="row wrap">
              {tropes.map((g) => {
                const spoiler = SPOILER_TAGS.includes(g) && rp.spoilerShield && !revealTags && (prog?.max || 0) < 10
                return <button key={g} className={cx('pill soft vote', votes.includes(g) && 'voted', spoiler && 'blur')} onClick={() => (spoiler ? setRevealTags(true) : actions.voteTag(title.id, g))} title={t('vote.hint')}>{spoiler ? '••••••' : tx('tag.' + g, prettify(g))}{votes.includes(g) && <Icon name="check" size={12} />}</button>
              })}
            </div>
            {!blocked && <button className="btn ghost" onClick={() => setQuiz(true)}><Icon name="trophy" size={16} />{t('quiz.start')}</button>}
          </div>
          <TensionMeter title={title} current={resumeCh} />
        </div>
      )}
      {tab === 'chapters' && (blocked ? <AgeGate /> : <ChapterList title={title} />)}
      {tab === 'characters' && <CharacterMap title={title} />}
      {tab === 'atlas' && <LoreAtlas title={title} />}
      {tab === 'reviews' && <ReviewsPanel title={title} />}
      {tab === 'related' && <><Shelf title={t('related.works')} items={related} /><Shelf title={t('fans.loved')} items={fans} /></>}
      {share && <ShareModal t={title} gift={share === 'gift'} onClose={() => setShare(null)} />}
      {quiz && <QuizModal title={title} chapter={null} onClose={() => setQuiz(false)} />}
    </div>
  )
}
