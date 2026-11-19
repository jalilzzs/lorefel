import { useEffect, useState } from 'react'
import { useApp, useTitle } from '../store'
import { sb, live } from '../lib/supabase'
import { queryTitles, addTitle, setFlag, deleteTitle, catalogState, GENRES } from '../lib/catalog'

function Gate() {
  const { unlockAdmin, t, toast, S } = useApp(); const [c, setC] = useState('')
  const need = live && import.meta.env.VITE_ADMIN_REQUIRE_ROLE === 'true' && S.profile.role !== 'admin'
  return <form className="form glass box" onSubmit={(e) => { e.preventDefault(); if (need) return toast('Admin role required'); unlockAdmin(c) ? toast('✓') : toast('✗') }}>
    <h2>🔐 {t('admin')}</h2><input type="password" inputMode="numeric" autoFocus placeholder={t('code')} value={c} onChange={(e) => setC(e.target.value)} /><button className="btn pri">{t('unlock')}</button></form>
}

function Toggles() {
  const { S, act } = useApp(); const s = S.site, up = (k, sub, v) => act.saveSite({ ...s, [k]: { ...s[k], [sub]: v } })
  return <div className="cols">{['toggles', 'themes', 'langs'].map((k) => <div key={k} className="glass box"><h3>{k}</h3>{Object.entries(s[k]).map(([n, v]) => <label key={n} style={{ display: 'block' }}><input type="checkbox" checked={v} onChange={(e) => up(k, n, e.target.checked)} /> {n}</label>)}</div>)}</div>
}

function Users() {
  const { S, set, toast } = useApp(); const [rows, setRows] = useState([])
  const load = async () => { if (live) { const { data } = await sb.from('profiles').select('*').limit(200); setRows((data || []).map((p) => ({ id: p.id, name: p.display_name, email: p.handle, role: p.role, ageStatus: p.age_status, suspended: p.suspended }))) } else setRows(S.accounts) }
  useEffect(() => { load() }, [S.accounts])
  const patch = async (u, p) => { if (live) { const m = { role: p.role, age_status: p.ageStatus, suspended: p.suspended }; Object.keys(m).forEach((k) => m[k] === undefined && delete m[k]); const { error } = await sb.from('profiles').update(m).eq('id', u.id); if (error) toast(error.message); load() } else set((s) => ({ accounts: s.accounts.map((a) => (a.id === u.id ? { ...a, ...p } : a)) })) }
  const del = async (u) => { if (!confirm('Delete ' + (u.name || u.email) + '?')) return; if (live) { await sb.from('profiles').delete().eq('id', u.id); load() } else set((s) => ({ accounts: s.accounts.filter((a) => a.id !== u.id) })) }
  return <table><thead><tr><th>User</th><th>Role</th><th>Age</th><th /></tr></thead><tbody>{rows.map((u) => <tr key={u.id}><td>{u.name} <small className="muted">{u.email}</small>{u.suspended && ' 🚫'}</td>
    <td><select value={u.role || 'user'} onChange={(e) => patch(u, { role: e.target.value })}>{['user', 'moderator', 'admin'].map((r) => <option key={r}>{r}</option>)}</select></td>
    <td><select value={u.ageStatus || 'unverified'} onChange={(e) => patch(u, { ageStatus: e.target.value })}>{['unverified', 'verified', 'denied'].map((r) => <option key={r}>{r}</option>)}</select></td>
    <td><button className="chip" onClick={() => patch(u, { suspended: !u.suspended })}>{u.suspended ? 'Unsuspend' : 'Suspend'}</button><button className="chip" onClick={() => del(u)}>🗑</button></td></tr>)}{!rows.length && <tr><td className="muted">No users yet (demo mode lists accounts created in this browser).</td></tr>}</tbody></table>
}

function Catalog() {
  const { S, set, act, toast, mature } = useApp(); const [q, setQ] = useState(''), [res, setRes] = useState([]), [prog, setProg] = useState(null), [h, setH] = useState({})
  const [f, setF] = useState({ title: '', author: '', format: 'novel', genres: ['Fantasy'], lang: 'en', status: 'ongoing', year: 2025, rating: 4, chapters: 10, mature: false })
  const cs = catalogState()
  useEffect(() => { Promise.all(['novel', 'manhwa', 'manga'].map((x) => queryTitles({ format: x, mature: true, size: 1 }))).then(([a, b, c]) => setH({ novel: a.total, manhwa: b.total, manga: c.total })) }, [S.syncLogs.length])
  useEffect(() => { queryTitles({ q, mature: true, size: 8 }).then((r) => setRes(r.items)) }, [q, cs.flags, cs.deleted.length])
  const sync = async (src) => {
    setProg(0); let p = 0
    if (live) { try { await sb.functions.invoke('catalog-sync', { body: { source: src.id } }) } catch { /* falls back to simulation */ } }
    const iv = setInterval(() => { p += 10; setProg(p); if (p >= 100) { clearInterval(iv); const n = 500 + Math.floor(Math.random() * 4500); set((s) => ({ syncLogs: [{ ts: Date.now(), source: src.name, status: 'ok', imported: n }, ...s.syncLogs].slice(0, 30), site: { ...s.site, sources: s.site.sources.map((x) => (x.id === src.id ? { ...x, last: Date.now(), count: x.count + n } : x)) } })); if (live) sb.from('catalog_sync_logs').insert({ source: src.name, status: 'ok', imported: n, message: 'simulated from admin UI' }); setProg(null); toast(`+${n} titles (simulated)`) } }, 200)
  }
  return <>
    <div className="stat"><div><b>{(h.novel + h.manhwa + h.manga || 0).toLocaleString()}</b>titles</div><div><b>{h.novel}</b>novels</div><div><b>{h.manhwa}</b>manhwa</div><div><b>{h.manga}</b>manga</div><div><b>{cs.extra.length}</b>added</div></div>
    <h3>Sources</h3>{S.site.sources.map((s) => <div key={s.id} className="flex"><label><input type="checkbox" checked={s.enabled} onChange={(e) => act.saveSite({ ...S.site, sources: S.site.sources.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) })} /> {s.name}</label><small className="muted">{s.last ? new Date(s.last).toLocaleString() : 'never'} · {s.count}</small><button className="btn" disabled={prog !== null || !s.enabled} onClick={() => sync(s)}>Sync</button></div>)}
    {prog !== null && <div className="meter"><i style={{ width: prog + '%' }} /></div>}
    {S.syncLogs.slice(0, 5).map((l, i) => <small key={i} className="muted" style={{ display: 'block' }}>{new Date(l.ts).toLocaleTimeString()} · {l.source} · {l.status} · {l.imported}</small>)}
    <h3>Add title</h3><form className="form" onSubmit={async (e) => { e.preventDefault(); try { await addTitle({ ...f, hue: Math.floor(Math.random() * 360), tags: [] }); toast('✓'); setQ(f.title) } catch (er) { toast(er.message) } }}>
      <input required placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><input required placeholder="Author" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
      <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{['novel', 'manhwa', 'manga'].map((x) => <option key={x}>{x}</option>)}</select>
      <select value={f.genres[0]} onChange={(e) => setF({ ...f, genres: [e.target.value] })}>{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
      <label><span><input type="checkbox" checked={f.mature} onChange={(e) => setF({ ...f, mature: e.target.checked })} /> 18+</span></label><button className="btn pri">＋</button></form>
    <h3>Edit / flag</h3><input placeholder="Search catalog…" value={q} onChange={(e) => setQ(e.target.value)} />
    <table><tbody>{res.map((x) => <tr key={x.id}><td>#{x.id} {x.title}</td><td><label><input type="checkbox" checked={!!x.mature} onChange={async (e) => { await setFlag(x.id, { mature: e.target.checked }); setQ(q + ' '); setQ(q) }} /> 18+</label></td><td><button className="chip" onClick={async () => { await deleteTitle(x.id); setQ(q + ' '); setQ(q) }}>🗑</button></td></tr>)}</tbody></table></>
}

function News() {
  const { S, act } = useApp(); const E = { title: '', body: '', category: 'Platform', published: true }, [f, setF] = useState(E)
  return <><form className="form" onSubmit={(e) => { e.preventDefault(); act.saveNews(f); setF(E) }}><input required placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><textarea rows="3" placeholder="Body" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
    <input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /><label><span><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> published</span></label><button className="btn pri">{f.id ? 'Update' : 'Publish'}</button></form>
    <table><tbody>{S.news.map((n) => <tr key={n.id}><td>{n.title} {!n.published && <span className="chip sm">draft</span>}</td><td><button className="chip" onClick={() => setF(n)}>✎</button><button className="chip" onClick={() => act.delNews(n.id)}>🗑</button></td></tr>)}</tbody></table></>
}

function Mod() {
  const { S, set, act } = useApp(); const W = S.site.weights
  const tot = Object.values(S.library).length, top = {}; Object.values(S.meta).forEach((m) => (top[m.format] = (top[m.format] || 0) + 1))
  return <><div className="stat"><div><b>{S.accounts.length}</b>accounts</div><div><b>{tot}</b>library saves</div><div><b>{Math.round(S.minutes)}</b>minutes read</div><div><b>{S.reviews.length}</b>reviews</div></div>
    <h3>Recommendation weights</h3><div className="cols">{Object.keys(W).map((k) => <label key={k}>{k}: {W[k]}<input type="range" min="0" max="5" step=".5" value={W[k]} onChange={(e) => act.saveSite({ ...S.site, weights: { ...W, [k]: +e.target.value } })} /></label>)}</div>
    <h3>Moderation — reviews</h3><table><tbody>{S.reviews.map((r) => <tr key={r.id}><td><b>{r.u}</b> on {r.title}: {r.body}</td><td><button className="chip" onClick={() => set((s) => ({ reviews: s.reviews.filter((x) => x.id !== r.id) }))}>Remove</button></td></tr>)}{!S.reviews.length && <tr><td className="muted">No reviews or reports.</td></tr>}</tbody></table></>
}

export default function Admin() {
  const { admin, lockAdmin, t } = useApp(); useTitle(t('admin')); const [tab, setTab] = useState('toggles')
  if (!admin) return <Gate />
  const T = { toggles: ['Site & features', Toggles], users: ['Users', Users], catalog: ['Catalog (100k+)', Catalog], news: ['News', News], mod: ['Analytics & moderation', Mod] }, C = T[tab][1]
  return <><div className="flex"><h1>{t('admin')}</h1><span className="grow" /><button className="btn" onClick={lockAdmin}>Lock</button></div>
    <div className="tabs">{Object.entries(T).map(([k, [l]]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div><C /></>
}
