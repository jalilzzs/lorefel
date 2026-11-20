import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Chip, Field, Modal, Switch, Tabs } from '../components/ui'
import { useApp } from '../lib/app'
import { ADMIN_CODE, ADMIN_REQUIRE_ROLE, isLive } from '../lib/supabase'
import { GENRES, STORY_LANGS, STATUSES, FORMATS, adminCatalog, catalog } from '../lib/catalog'
import { DEFAULT_WEIGHTS } from '../lib/recommend'
import { FEATURES, SOURCES, THEMES, fetchConnectorPage, moderationService, newsService, syncLogService, userAdminService } from '../lib/services'
import { LANGS } from '../lib/i18n'
import { useAsync, useDocTitle } from '../lib/hooks'
import { fmtDate, cx, uid } from '../lib/util'
import { loc } from './News'
import { toast } from '../lib/toast'

function Gate({ onOk }) {
  const { t, profile } = useApp()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const roleBlocked = ADMIN_REQUIRE_ROLE && isLive && profile?.role !== 'admin'
  const submit = (e) => {
    e.preventDefault()
    if (roleBlocked) return setErr(t('admin.role.required'))
    if (code === ADMIN_CODE) { sessionStorage.setItem('pl:admin', '1'); onOk() } else setErr(t('admin.code.wrong'))
  }
  return (
    <div className="page narrow"><form className="glass pad stack center auth" onSubmit={submit}>
      <Icon name="shield" size={42} /><h2 className="serif">{t('admin.title')}</h2><p className="muted">{t('admin.code.prompt')}</p>
      <input type="password" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" aria-label={t('admin.code')} />
      {err && <div className="error">{err}</div>}<button className="btn primary">{t('admin.unlock')}</button>
    </form></div>
  )
}

function Overview() {
  const { t } = useApp()
  const h = catalog.health()
  const { data: users } = useAsync(() => userAdminService.list(), [])
  const { data: reports } = useAsync(() => moderationService.list(), [])
  const { data: logs } = useAsync(() => syncLogService.list(), [])
  const card = (k, v) => <div className="glass pad center" key={k}><h2>{v}</h2><small className="muted">{k}</small></div>
  return (
    <div className="stack">
      <div className="three">{card(t('admin.titles'), h.total.toLocaleString())}{card(t('admin.users'), users?.length ?? '…')}{card(t('admin.reports.open'), reports?.filter((r) => r.status === 'open').length ?? '…')}</div>
      <div className="three">{FORMATS.map((f) => card(t('f.' + f), h.by[f].toLocaleString()))}</div>
      <div className="glass pad stack"><h4>{t('admin.health')}</h4>
        <div className="row wrap"><span className="pill">18+: {h.mature.toLocaleString()}</span><span className="pill">{t('s.ongoing')}: {h.st.ongoing.toLocaleString()}</span><span className="pill">{t('s.completed')}: {h.st.completed.toLocaleString()}</span><span className="pill">{t('s.hiatus')}: {h.st.hiatus.toLocaleString()}</span><span className="pill">{t('admin.generated.covers')}: {h.noCover.toLocaleString()}</span><span className="pill accent">{t('admin.imported')}: {h.extras}</span><span className="pill">{isLive ? 'Supabase LIVE' : 'DEMO'}</span></div>
        <small className="muted">{t('admin.last.sync')}: {logs?.[0] ? `${logs[0].source} · ${logs[0].status} · ${fmtDate(logs[0].ts)}` : '—'}</small>
      </div>
    </div>
  )
}

function Features() {
  const { t, site, setSite } = useApp()
  const setF = (k, v) => setSite({ ...site, features: { ...site.features, [k]: v } })
  const flip = (key, v) => setSite({ ...site, [key]: site[key].includes(v) ? site[key].filter((x) => x !== v) : [...site[key], v] })
  return (
    <div className="stack">
      <div className="glass pad stack"><h4>{t('admin.modules')}</h4><div className="switch-grid">{FEATURES.map((f) => <Switch key={f} checked={site.features[f] !== false} onChange={(v) => setF(f, v)} label={t('feat.' + f)} />)}</div></div>
      <div className="glass pad stack"><h4>{t('admin.mature.mode')}</h4><div className="row"><Chip active={site.matureMode === 'blur'} onClick={() => setSite({ ...site, matureMode: 'blur' })}>{t('mature.blur')}</Chip><Chip active={site.matureMode === 'hide'} onClick={() => setSite({ ...site, matureMode: 'hide' })}>{t('mature.hide')}</Chip></div></div>
      <div className="glass pad stack"><h4>{t('theme')}</h4><div className="row wrap">{THEMES.map((x) => <Chip key={x} active={!site.disabledThemes.includes(x)} onClick={() => flip('disabledThemes', x)}>{t('theme.' + x)}</Chip>)}</div><h4>{t('language')}</h4><div className="row wrap">{LANGS.map((l) => <Chip key={l.code} active={!site.disabledLangs.includes(l.code)} onClick={() => flip('disabledLangs', l.code)}>{l.name}</Chip>)}</div><small className="muted">{t('admin.toggle.hint')}</small></div>
    </div>
  )
}

function Users() {
  const { t } = useApp()
  const [tick, setTick] = useState(0)
  const { data } = useAsync(() => userAdminService.list(), [tick])
  const upd = async (id, patch) => { try { await userAdminService.update(id, patch); setTick((x) => x + 1); toast(t('saved'), 'success') } catch (e) { toast(e.message, 'error') } }
  return (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>{t('profile.display')}</th><th>{t('profile.handle')}</th><th>{t('admin.role')}</th><th>{t('profile.age.status')}</th><th>{t('admin.status')}</th><th /></tr></thead>
      <tbody>{(data || []).map((u) => (
        <tr key={u.id} className={cx(u.suspended && 'dim')}>
          <td><b>{u.display}</b><br /><small className="muted">{u.email}</small></td><td>@{u.handle}</td>
          <td><select value={u.role} onChange={(e) => upd(u.id, { role: e.target.value })}>{['user', 'moderator', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></td>
          <td><select value={u.ageStatus} onChange={(e) => upd(u.id, { ageStatus: e.target.value })}>{['unverified', 'verified', 'rejected'].map((r) => <option key={r} value={r}>{t('age.' + r)}</option>)}</select><br /><small className="muted">{u.birthDate || '—'}</small></td>
          <td>{u.suspended ? <span className="pill danger">{t('admin.suspended')}</span> : <span className="pill">{t('admin.active')}</span>}</td>
          <td className="row"><button className="btn ghost sm" onClick={() => upd(u.id, { suspended: !u.suspended })}>{u.suspended ? t('admin.unsuspend') : t('admin.suspend')}</button><button className="btn ghost sm danger" onClick={async () => { if (confirm(t('confirm'))) { await userAdminService.remove(u.id); setTick((x) => x + 1) } }}><Icon name="trash" size={14} /></button></td>
        </tr>))}</tbody>
    </table></div>
  )
}

function TitleForm({ initial, onDone }) {
  const { t } = useApp()
  const [f, setF] = useState(initial || { title: '', author: '', format: 'novel', status: 'ongoing', year: new Date().getFullYear(), chapters: 10, lang: 'en', genres: ['fantasy'], synopsis: '', mature: false })
  const save = async () => {
    if (!f.title.trim()) return
    try { initial?.id ? await adminCatalog.update(initial.id, { ...f, year: +f.year, chapters: +f.chapters }) : await adminCatalog.add({ ...f, year: +f.year, chapters: +f.chapters }); toast(t('saved'), 'success'); onDone() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Modal onClose={onDone} title={initial?.id ? t('admin.edit.title') : t('admin.add.title')} wide>
      <div className="stack">
        <div className="two"><Field label={t('title')}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label={t('by')}><input value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} /></Field></div>
        <div className="three">
          <Field label={t('format')}><select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{FORMATS.map((x) => <option key={x} value={x}>{t('f.' + x)}</option>)}</select></Field>
          <Field label={t('status')}><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((x) => <option key={x} value={x}>{t('s.' + x)}</option>)}</select></Field>
          <Field label={t('story.language')}><select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}>{STORY_LANGS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="two"><Field label={t('year')}><input type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /></Field><Field label={t('chapters')}><input type="number" min="1" value={f.chapters} onChange={(e) => setF({ ...f, chapters: e.target.value })} /></Field></div>
        <div className="row wrap">{GENRES.map((g) => <Chip key={g} active={f.genres.includes(g)} onClick={() => setF({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] })}>{t('g.' + g)}</Chip>)}</div>
        <Field label={t('synopsis')}><textarea rows={3} value={f.synopsis || ''} onChange={(e) => setF({ ...f, synopsis: e.target.value })} /></Field>
        <Switch checked={f.mature} onChange={(v) => setF({ ...f, mature: v })} label={t('admin.flag.18')} />
        <button className="btn primary" onClick={save}>{t('save.changes')}</button>
      </div>
    </Modal>
  )
}

function ChapterManager({ title, onClose }) {
  const { t } = useApp()
  const [list, setList] = useState(catalog.customChapters(title.id))
  const [f, setF] = useState({ n: (list.at(-1)?.n || 0) + 1, name: '', content: '' })
  const refresh = () => setList([...catalog.customChapters(title.id)])
  return (
    <Modal onClose={onClose} title={`${t('admin.chapters')} · ${title.title}`} wide>
      <div className="stack">
        <small className="muted">{t('admin.chapters.hint')}</small>
        {list.map((c) => <div key={c.n} className="row between glass pad"><span>#{c.n} {c.name}</span><span className="row"><button className="btn ghost sm" onClick={() => setF(c)}>{t('edit')}</button><button className="btn ghost sm danger" onClick={async () => { await adminCatalog.removeChapter(title.id, c.n); refresh() }}><Icon name="trash" size={13} /></button></span></div>)}
        <div className="two"><Field label="#"><input type="number" min="1" value={f.n} onChange={(e) => setF({ ...f, n: +e.target.value })} /></Field><Field label={t('title')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
        <Field label={t('admin.chapter.text')}><textarea rows={8} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>
        <button className="btn primary" onClick={async () => { try { await adminCatalog.setChapter(title.id, { n: f.n, name: f.name, content: f.content }); refresh(); toast(t('saved'), 'success') } catch (e) { toast(e.message, 'error') } }}>{t('save.changes')}</button>
      </div>
    </Modal>
  )
}

function Catalog() {
  const { t } = useApp()
  const [q, setQ] = useState('')
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState(null)
  const [chap, setChap] = useState(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const { data } = useAsync(() => catalog.query({ q, pageSize: 8 }), [q, tick])
  const { data: logs } = useAsync(() => syncLogService.list(), [tick])
  const bump = () => setTick((x) => x + 1)
  const test = async (s, doImport) => {
    setBusy(s.id)
    try {
      const rows = await fetchConnectorPage(s.id, 1)
      if (doImport) { const n = await adminCatalog.importMany(rows); await syncLogService.add({ source: s.id, status: 'success', imported: n, message: 'Imported page 1' }); toast(t('admin.imported.n', { n }), 'success') } else toast(t('admin.connector.ok', { n: rows.length }), 'success')
    } catch (e) { await syncLogService.add({ source: s.id, status: 'failed', failed: 1, message: String(e.message || e) }); toast(String(e.message || e), 'error') }
    setBusy(''); bump()
  }
  const simulate = async (s) => {
    setBusy('sim:' + s.id); setProgress(0)
    for (let i = 1; i <= 20; i++) { await new Promise((r) => setTimeout(r, 120)); setProgress(i * 5) }
    const n = 4000 + Math.floor(Math.random() * 3000)
    await syncLogService.add({ source: s.id, status: 'success', imported: n, updated: Math.floor(n * 0.3), message: 'Simulated bulk sync (demo)' })
    setBusy(''); bump(); toast(t('admin.sim.done', { n: n.toLocaleString() }), 'success')
  }
  return (
    <div className="stack">
      <div className="glass pad stack"><h4>{t('admin.sources')}</h4>
        {SOURCES.map((s) => <div key={s.id} className="row between wrap source"><div><b>{s.name}</b><br /><small className="muted">{s.kind}</small></div>
          <div className="row wrap"><button className="btn ghost sm" disabled={!!busy} onClick={() => test(s, false)}>{t('admin.test')}</button><button className="btn ghost sm" disabled={!!busy} onClick={() => test(s, true)}><Icon name="download" size={13} />{t('admin.import.page')}</button><button className="btn primary sm" disabled={!!busy} onClick={() => simulate(s)}>{t('admin.simulate')}</button></div></div>)}
        {busy.startsWith('sim:') && <div className="mini-progress static big"><i style={{ width: progress + '%' }} /></div>}
        <small className="muted">{t('admin.edge.hint')}</small>
      </div>
      <div className="glass pad stack"><h4>{t('admin.sync.logs')}</h4>{!logs?.length && <small className="muted">—</small>}{logs?.slice(0, 6).map((l) => <div key={l.id} className="row between"><span><span className={cx('pill', l.status === 'failed' && 'danger')}>{l.status}</span> {l.source} · +{l.imported} {l.message && <small className="muted">· {l.message}</small>}</span><small className="muted">{fmtDate(l.ts, 'en', { dateStyle: 'short', timeStyle: 'short' })}</small></div>)}</div>
      <div className="row between wrap"><input className="grow" placeholder={t('search.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn primary" onClick={() => setEdit({})}><Icon name="plus" size={16} />{t('admin.add.title')}</button></div>
      <div className="table-wrap"><table className="tbl"><tbody>{(data?.items || []).map((x) => (
        <tr key={x.id}><td><b>{x.title}</b><br /><small className="muted">#{x.id} · {t('f.' + x.format)} · {x.chapters} ch · {x.author}</small></td>
          <td><Switch checked={x.mature} onChange={async (v) => { await adminCatalog.update(x.id, { mature: v }); bump() }} label="18+" /></td>
          <td className="row"><button className="btn ghost sm" onClick={() => setEdit({ ...x, lang: x.lang, synopsis: x.synopsis || '' })}><Icon name="edit" size={13} /></button><button className="btn ghost sm" onClick={() => setChap(x)}><Icon name="list" size={13} /></button><button className="btn ghost sm danger" onClick={async () => { if (confirm(t('confirm'))) { await adminCatalog.remove(x.id); bump() } }}><Icon name="trash" size={13} /></button></td></tr>))}</tbody></table></div>
      {!isLive && <button className="btn ghost danger" onClick={() => confirm(t('confirm')) && adminCatalog.resetOverlay()}>{t('admin.reset.catalog')}</button>}
      {edit && <TitleForm initial={edit.id ? edit : null} onDone={() => { setEdit(null); bump() }} />}
      {chap && <ChapterManager title={chap} onClose={() => setChap(null)} />}
    </div>
  )
}

function NewsAdmin() {
  const { t, lang } = useApp()
  const [tick, setTick] = useState(0)
  const [f, setF] = useState(null)
  const { data } = useAsync(() => newsService.list({ all: true }), [tick])
  const blank = () => ({ title: { en: '', fr: '', ar: '', zh: '' }, excerpt: { en: '' }, body: { en: '' }, category: 'news', genres: [], hue: 260, eventDate: '', published: true, author: 'Admin' })
  const save = async () => { if (!f.title.en.trim()) return toast(t('admin.news.en'), 'error'); try { await newsService.save(f); setF(null); setTick((x) => x + 1); toast(t('saved'), 'success') } catch (e) { toast(e.message, 'error') } }
  return (
    <div className="stack">
      <button className="btn primary" onClick={() => setF(blank())}><Icon name="plus" size={16} />{t('admin.news.new')}</button>
      {(data || []).map((p) => <div key={p.id} className="row between glass pad"><span><b>{loc(p.title, lang)}</b> <span className="pill soft">{p.category}</span> {!p.published && <span className="pill">draft</span>}</span><span className="row"><button className="btn ghost sm" onClick={() => setF({ ...blank(), ...p, eventDate: p.eventDate || '' })}><Icon name="edit" size={13} /></button><button className="btn ghost sm danger" onClick={async () => { if (confirm(t('confirm'))) { await newsService.remove(p.id); setTick((x) => x + 1) } }}><Icon name="trash" size={13} /></button></span></div>)}
      {f && (
        <Modal onClose={() => setF(null)} title={t('admin.news.new')} wide><div className="stack">
          {['en', 'fr', 'ar', 'zh'].map((l) => <Field key={l} label={`${t('title')} (${l.toUpperCase()})`}><input dir={l === 'ar' ? 'rtl' : 'ltr'} value={f.title[l] || ''} onChange={(e) => setF({ ...f, title: { ...f.title, [l]: e.target.value } })} /></Field>)}
          <Field label={t('admin.news.excerpt')}><input value={f.excerpt.en || ''} onChange={(e) => setF({ ...f, excerpt: { en: e.target.value } })} /></Field>
          <Field label={t('admin.news.body')}><textarea rows={6} value={f.body.en || ''} onChange={(e) => setF({ ...f, body: { en: e.target.value } })} /></Field>
          <div className="three"><Field label={t('admin.news.category')}><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['news', 'adaptation', 'schedule', 'spotlight', 'platform'].map((c) => <option key={c} value={c}>{t('news.' + c)}</option>)}</select></Field><Field label={t('admin.news.date')}><input type="date" value={f.eventDate || ''} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></Field><Field label="Hue"><input type="range" min="0" max="360" value={f.hue} onChange={(e) => setF({ ...f, hue: +e.target.value })} /></Field></div>
          <div className="row wrap">{GENRES.map((g) => <Chip key={g} active={f.genres.includes(g)} onClick={() => setF({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] })}>{t('g.' + g)}</Chip>)}</div>
          <Switch checked={f.published} onChange={(v) => setF({ ...f, published: v })} label={t('admin.news.publish')} />
          <button className="btn primary" onClick={save}>{t('save.changes')}</button>
        </div></Modal>
      )}
    </div>
  )
}

function Moderation() {
  const { t, site, setSite } = useApp()
  const [tick, setTick] = useState(0)
  const { data } = useAsync(() => moderationService.list(), [tick])
  const w = site.recWeights
  return (
    <div className="stack">
      <div className="glass pad stack"><h4>{t('admin.rec.weights')}</h4>
        {Object.keys(DEFAULT_WEIGHTS).map((k) => <label key={k} className="field"><span>{t('w.' + k)} · {(w[k] ?? 0).toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" value={w[k] ?? 0} onChange={(e) => setSite({ ...site, recWeights: { ...w, [k]: +e.target.value } })} /></label>)}
        <button className="btn ghost sm" onClick={() => setSite({ ...site, recWeights: DEFAULT_WEIGHTS })}>{t('reset')}</button></div>
      <h4>{t('admin.reports')}</h4>
      {(data || []).map((r) => <div key={r.id} className="glass pad row between wrap"><div><span className="pill soft">{r.type}</span> <span className={cx('pill', r.status === 'open' && 'accent')}>{r.status}</span><p>{r.target}</p><small className="muted">{r.reason}</small></div>{r.status === 'open' && <div className="row"><button className="btn ghost sm" onClick={async () => { await moderationService.resolve(r, 'resolved'); setTick((x) => x + 1) }}>{t('admin.hide.remove')}</button><button className="btn ghost sm" onClick={async () => { await moderationService.resolve(r, 'dismissed'); setTick((x) => x + 1) }}>{t('admin.dismiss')}</button></div>}</div>)}
    </div>
  )
}

export default function Admin() {
  const { t } = useApp()
  useDocTitle(t('admin.title'))
  const [ok, setOk] = useState(() => sessionStorage.getItem('pl:admin') === '1' && !(ADMIN_REQUIRE_ROLE && isLive))
  const [tab, setTab] = useState('overview')
  if (!ok) return <Gate onOk={() => setOk(true)} />
  const tabs = [['overview', 'chart'], ['features', 'settings'], ['users', 'users'], ['catalog', 'book'], ['news', 'news'], ['moderation', 'flag']].map(([id, icon]) => ({ id, icon, label: t('admin.tab.' + id) }))
  const body = { overview: <Overview />, features: <Features />, users: <Users />, catalog: <Catalog />, news: <NewsAdmin />, moderation: <Moderation /> }[tab]
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif"><Icon name="shield" size={26} /> {t('admin.title')}</h1><p className="muted">{t('admin.sub')}</p></div><button className="btn ghost" onClick={() => { sessionStorage.removeItem('pl:admin'); setOk(false) }}><Icon name="lock" size={15} />{t('admin.lock')}</button></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {body}
    </div>
  )
}
