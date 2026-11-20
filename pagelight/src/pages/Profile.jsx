import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { Grid } from '../components/TitleCard'
import { Avatar, Bars, Chip, Empty, Field, Ring, Switch, Tabs } from '../components/ui'
import { useApp, ageOf } from '../lib/app'
import { catalog, GENRES, LIST_STATUSES, STORY_LANGS, WARNING_TAGS } from '../lib/catalog'
import { analytics } from '../lib/chapters'
import { useDocTitle } from '../lib/hooks'
import { BADGES, actions, computeStreak, exportJSON, exportLibraryCSV, importCSVRows, importJSON, useUD } from '../lib/userdata'
import { persona } from '../lib/recommend'
import { LANGS } from '../lib/i18n'
import { THEMES, ACCENTS } from '../lib/services'
import { cx, downloadFile, fmtDate, fmtMinutes, parseCSV, dayKey } from '../lib/util'
import { toast } from '../lib/toast'

function Settings() {
  const { t, profile, updateProfile, uploadAvatar, signOut, theme, setTheme, accent, setAccent, site, lang, setLang } = useApp()
  const [f, setF] = useState({ display: profile.display || '', handle: profile.handle || '', birthDate: profile.birthDate || '', goalMinutes: profile.goalMinutes || 20, weeklyGoal: profile.weeklyGoal || 20 })
  const file = useRef(null)
  const tog = (key, v) => updateProfile({ [key]: profile[key].includes(v) ? profile[key].filter((x) => x !== v) : [...profile[key], v] })
  const age = ageOf(profile.birthDate)
  const save = () => { updateProfile({ ...f, handle: f.handle.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, ''), goalMinutes: +f.goalMinutes, weeklyGoal: +f.weeklyGoal, ageStatus: f.birthDate !== profile.birthDate && profile.ageStatus === 'verified' ? 'unverified' : profile.ageStatus }); toast(t('saved'), 'success') }
  return (
    <div className="stack">
      <div className="row"><Avatar profile={profile} size={72} /><div className="stack"><button className="btn ghost sm" onClick={() => file.current.click()}><Icon name="upload" size={14} />{t('profile.avatar')}</button><input ref={file} type="file" accept="image/*" hidden onChange={async (e) => { const fl = e.target.files[0]; if (fl) { try { updateProfile({ avatar: await uploadAvatar(fl) }) } catch (er) { toast(er.message, 'error') } } }} /></div></div>
      <div className="two"><Field label={t('profile.display')}><input value={f.display} onChange={(e) => setF({ ...f, display: e.target.value })} /></Field><Field label={t('profile.handle')}><input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@handle" /></Field></div>
      <div className="two">
        <Field label={t('profile.birthdate')} hint={`${t('profile.age.status')}: ${t('age.' + profile.ageStatus)}${age !== null ? ` · ${age}` : ''}`}><input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} max={dayKey()} /></Field>
        <Field label={t('profile.ui.lang')}><select value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.filter((l) => !site.disabledLangs.includes(l.code)).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
      </div>
      <div><h4>{t('profile.content.langs')}</h4><div className="row wrap">{STORY_LANGS.map((l) => <Chip key={l} active={profile.contentLangs.includes(l)} onClick={() => tog('contentLangs', l)}>{LANGS.find((x) => x.code === l).name}</Chip>)}</div></div>
      <div><h4>{t('profile.fav.genres')}</h4><div className="row wrap">{GENRES.map((g) => <Chip key={g} active={profile.favGenres.includes(g)} onClick={() => tog('favGenres', g)}>{t('g.' + g)}</Chip>)}</div></div>
      <div><h4>{t('profile.muted')}</h4><div className="row wrap">{WARNING_TAGS.map((g) => <Chip key={g} active={profile.mutedTags.includes(g)} onClick={() => tog('mutedTags', g)}>{t('tag.' + g)}</Chip>)}</div></div>
      <div className="two"><Field label={t('goal.daily')}><input type="number" min="1" max="600" value={f.goalMinutes} onChange={(e) => setF({ ...f, goalMinutes: e.target.value })} /></Field><Field label={t('goal.weekly')}><input type="number" min="1" max="1000" value={f.weeklyGoal} onChange={(e) => setF({ ...f, weeklyGoal: e.target.value })} /></Field></div>
      <div><h4>{t('theme')}</h4><div className="theme-grid">{THEMES.filter((x) => !site.disabledThemes.includes(x)).map((x) => <button key={x} data-preview={x} className={cx('theme-swatch', theme === x && 'on')} onClick={() => setTheme(x)}><i />{t('theme.' + x)}</button>)}</div><div className="row wrap" style={{ marginTop: 10 }}>{ACCENTS.map((a) => <button key={a} className={cx('accent-dot', accent === a && 'on')} data-a={a} onClick={() => setAccent(a)} aria-label={a} />)}</div></div>
      <div className="row between"><button className="btn primary" onClick={save}>{t('save.changes')}</button><button className="btn ghost danger" onClick={signOut}>{t('auth.signout')}</button></div>
    </div>
  )
}

function Library() {
  const { t } = useApp()
  const lib = useUD((s) => s.library)
  const cols = useUD((s) => s.collections)
  const [st, setSt] = useState('reading')
  const ids = Object.entries(lib).filter(([, v]) => v.status === st).sort((a, b) => b[1].ts - a[1].ts).map(([id]) => +id)
  const items = useMemo(() => catalog.byIds(ids), [lib, st]) // eslint-disable-line
  return (
    <div className="stack">
      <div className="row wrap">{LIST_STATUSES.map((s) => <Chip key={s} active={st === s} onClick={() => setSt(s)}>{t('list.' + s)} · {Object.values(lib).filter((v) => v.status === s).length}</Chip>)}</div>
      {items.length ? <Grid items={items} /> : <Empty icon="bookmark" title={t('empty.list')}><Link to="/browse" className="btn primary">{t('nav.browse')}</Link></Empty>}
      <div className="row between"><h3>{t('collections')}</h3><button className="btn ghost sm" onClick={() => { const n = prompt(t('collection.name')); if (n) actions.createCollection(n) }}><Icon name="plus" size={14} />{t('collection.new')}</button></div>
      {cols.map((c) => <div key={c.id} className="stack"><div className="row between"><b>{c.name} · {c.items.length}</b><button className="icon-btn" onClick={() => confirm(t('confirm')) && actions.deleteCollection(c.id)} aria-label="delete"><Icon name="trash" size={15} /></button></div>{c.items.length ? <Grid items={catalog.byIds(c.items)} /> : <p className="muted">{t('empty.list')}</p>}</div>)}
    </div>
  )
}

function Analytics() {
  const { t } = useApp()
  const ud = useUD((s) => s)
  const a = useMemo(() => analytics(ud), [ud.progress, ud.days])
  const max = Math.max(1, ...a.topGenres.map((x) => x[1]))
  const week = a.series.slice(-7).reduce((s, d) => s + (ud.days[d.key]?.chapters || 0), 0)
  return (
    <div className="stack">
      <div className="stat-row big"><div><b>{a.chaptersRead}</b><small>{t('chapters.read')}</small></div><div><b>{fmtMinutes(a.seconds / 60)}</b><small>{t('time.spent')}</small></div><div><b>{a.wpm}</b><small>{t('wpm')}</small></div><div><b>{week}</b><small>{t('this.week')}</small></div></div>
      <div className="glass pad"><h4>{t('minutes.14')}</h4><Bars data={a.series} fmt={(v) => v + 'm'} /></div>
      <div className="glass pad stack"><h4>{t('top.genres')}</h4>{a.topGenres.length ? a.topGenres.map(([g, v]) => <div key={g} className="hbar"><span>{t('g.' + g)}</span><i style={{ width: `${(v / max) * 100}%` }} /></div>) : <p className="muted">{t('empty.analytics')}</p>}</div>
    </div>
  )
}

function Moments() {
  const { t } = useApp()
  const notes = useUD((s) => s.notes)
  const [kind, setKind] = useState('')
  const nav = useNavigate()
  const list = notes.filter((n) => !kind || n.kind === kind).sort((a, b) => b.ts - a.ts)
  return (
    <div className="stack">
      <div className="row wrap"><Chip active={!kind} onClick={() => setKind('')}>{t('all')}</Chip>{['highlight', 'note', 'pin', 'quote'].map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{t('kind.' + k)}</Chip>)}</div>
      {!list.length && <Empty icon="pin" title={t('empty.moments')}>{t('empty.moments.sub')}</Empty>}
      {list.map((n) => { const ti = catalog.local(n.t); return (
        <div key={n.id} className="moment glass pad">
          <div className="row between"><b>{ti?.title} · {t('chapter')} {n.c}</b><span className="pill soft">{t('kind.' + n.kind)}</span></div>
          {n.text && <blockquote>{n.text}</blockquote>}{n.note && <p className="muted">✎ {n.note}</p>}
          <div className="row wrap"><button className="btn ghost sm" onClick={() => nav(`/read/${n.t}/${n.c}`)}>{t('open')}</button>{n.text && <Link className="btn ghost sm" to={`/quotes?text=${encodeURIComponent(n.text)}&src=${encodeURIComponent(ti?.title || '')}`}><Icon name="quote" size={13} />{t('d.quotes')}</Link>}<button className="btn ghost sm danger" onClick={() => actions.removeNote(n.id)}><Icon name="trash" size={13} /></button></div>
        </div>) })}
    </div>
  )
}

function Journey() {
  const { t, lang } = useApp()
  const ud = useUD((s) => s)
  const ev = []
  for (const [id, p] of Object.entries(ud.progress)) { const ti = catalog.local(+id); if (ti && p.started) ev.push({ ts: p.started, k: 'start', ti }) }
  for (const [id, v] of Object.entries(ud.library)) { const ti = catalog.local(+id); if (ti && v.status === 'completed') ev.push({ ts: v.ts, k: 'done', ti }) }
  for (const [b, ts] of Object.entries(ud.badges)) ev.push({ ts, k: 'badge', b })
  ev.sort((a, b) => b.ts - a.ts)
  if (!ev.length) return <Empty icon="clock" title={t('empty.journey')} />
  return <ol className="timeline">{ev.map((e, i) => <li key={i} className={e.k}><i /><div><small className="muted">{fmtDate(e.ts, lang)}</small><br />{e.k === 'badge' ? <b>🏅 {t('badge.' + e.b)}</b> : <><b>{t('journey.' + e.k)}</b> — <Link to={`/title/${e.ti.id}`}>{e.ti.title}</Link></>}</div></li>)}</ol>
}

function Badges() {
  const { t, lang } = useApp()
  const badges = useUD((s) => s.badges)
  const ICON = { 'first-chapter': 'book', 'night-owl': 'moon', marathon: 'zap', polyglot: 'globe', 'streak-7': 'flame', bookworm: 'bookmark', critic: 'star', annotator: 'pen', 'quiz-master': 'trophy', explorer: 'compass' }
  return <div className="badge-grid">{BADGES.map((b) => <div key={b} className={cx('badge glass', badges[b] && 'on')}><Icon name={ICON[b]} size={28} /><b>{t('badge.' + b)}</b><small className="muted">{t('badge.' + b + '.d')}</small>{badges[b] && <small>{fmtDate(badges[b], lang)}</small>}</div>)}</div>
}

function Data() {
  const { t } = useApp()
  const follows = useUD((s) => s.follows)
  const file = useRef(null)
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return
    const text = await f.text()
    try { const n = f.name.endsWith('.csv') ? importCSVRows(parseCSV(text)) : importJSON(text); toast(t('import.done', { n }), 'success') } catch (er) { toast(er.message, 'error') }
    e.target.value = ''
  }
  return (
    <div className="stack">
      <div className="row wrap"><button className="btn ghost" onClick={() => downloadFile('pagelight-export.json', exportJSON(), 'application/json')}><Icon name="download" size={16} />{t('export.json')}</button><button className="btn ghost" onClick={() => downloadFile('pagelight-library.csv', exportLibraryCSV(), 'text/csv')}><Icon name="download" size={16} />{t('export.csv')}</button><button className="btn ghost" onClick={() => file.current.click()}><Icon name="upload" size={16} />{t('import')}</button><input ref={file} type="file" accept=".json,.csv" hidden onChange={onFile} /></div>
      <h3>{t('following')}</h3>
      {!follows.length && <p className="muted">{t('empty.follows')}</p>}
      <div className="row wrap">{follows.map((f) => <Chip key={f.kind + f.name} active onClick={() => actions.toggleFollow(f.kind, f.name)}>{t('followk.' + f.kind)}: {f.kind === 'series' ? catalog.local(+f.name)?.title || f.name : f.name}<Icon name="x" size={12} /></Chip>)}</div>
      <button className="btn ghost danger" onClick={() => confirm(t('confirm')) && actions.clearAll()}><Icon name="trash" size={16} />{t('reset.data')}</button>
    </div>
  )
}

function Overview() {
  const { t, profile } = useApp()
  const ud = useUD((s) => s)
  const st = computeStreak(ud.days)
  const today = (ud.days[dayKey()]?.seconds || 0) / 60
  const weekCh = analytics(ud).series.slice(-7).reduce((s, d) => s + (ud.days[d.key]?.chapters || 0), 0)
  const per = persona(ud)
  return (
    <div className="stack">
      <div className="persona glass pad"><Icon name="sparkles" size={26} /><div><small className="muted">{t('persona')}</small><h2 className="serif">{t('persona.' + per.id)}</h2><p className="muted">{t('persona.' + per.id + '.d')}</p></div></div>
      <div className="three">
        <div className="glass pad center"><Icon name="flame" size={22} /><h2>{st.current}</h2><small className="muted">{t('streak')} · {t('best')} {st.longest}</small></div>
        <div className="glass pad center"><Ring value={today / (ud.goalMinutes || 20)} label={`${Math.round(today)}m`} sub={`/ ${ud.goalMinutes}m`} /><small className="muted">{t('goal.daily')}</small></div>
        <div className="glass pad center"><Ring value={weekCh / (ud.weeklyGoal || 20)} label={weekCh} sub={`/ ${ud.weeklyGoal}`} /><small className="muted">{t('goal.weekly')}</small></div>
      </div>
      {!profile && <div className="glass pad"><Link to="/auth" className="btn primary">{t('auth.signin')}</Link> <span className="muted">{t('guest.hint')}</span></div>}
    </div>
  )
}

export default function Profile() {
  const { t, profile } = useApp()
  useDocTitle(t('nav.profile'))
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'overview'
  const tabs = [{ id: 'overview', label: t('tab.overview'), icon: 'user' }, profile && { id: 'settings', label: t('settings'), icon: 'settings' }, { id: 'library', label: t('library'), icon: 'bookmark' }, { id: 'analytics', label: t('analytics'), icon: 'chart' }, { id: 'moments', label: t('moments'), icon: 'pin' }, { id: 'journey', label: t('journey'), icon: 'clock' }, { id: 'badges', label: t('badges'), icon: 'trophy' }, { id: 'data', label: t('data'), icon: 'download' }].filter(Boolean)
  const body = { overview: <Overview />, settings: profile && <Settings key={profile.id} />, library: <Library />, analytics: <Analytics />, moments: <Moments />, journey: <Journey />, badges: <Badges />, data: <Data /> }[tab]
  return (
    <div className="page">
      <div className="profile-head glass pad"><Avatar profile={profile} size={64} /><div><h1 className="serif">{profile?.display || t('guest')}</h1><p className="muted">{profile ? `@${profile.handle}` : t('guest.hint')}</p></div></div>
      <Tabs tabs={tabs} value={tab} onChange={(x) => setSp({ tab: x })} />
      {body}
    </div>
  )
}
