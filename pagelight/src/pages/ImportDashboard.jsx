import { useCallback, useEffect, useState } from 'react'
import { supabase, isLive } from '../lib/supabase'
import { toast } from '../lib/toast'

const TESTS = { gutendex: 'https://gutendex.com/books/?ids=1342', mangadex: 'https://api.mangadex.org/ping', openlibrary: 'https://openlibrary.org/search.json?q=dune&limit=1', archive: 'https://archive.org/advancedsearch.php?q=dune&rows=1&output=json', wikisource: 'https://en.wikisource.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*', standardebooks: 'https://standardebooks.org/' }

export default function ImportDashboard() {
  const [d, setD] = useState({ sources: [], jobs: [], metrics: [], logs: [] })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    if (!isLive) { setErr('Supabase is not configured.'); return }
    const [s, j, m, l] = await Promise.all([
      supabase.from('content_sources').select('*').order('id'),
      supabase.from('import_jobs').select('*').order('id', { ascending: false }).limit(10),
      supabase.from('import_metrics').select('*'),
      supabase.from('import_logs').select('*').eq('level', 'error').order('id', { ascending: false }).limit(15),
    ])
    const e = s.error || j.error || m.error || l.error
    if (e) setErr(`${e.message} — sign in as an admin profile and apply the migration.`); else setErr('')
    setD({ sources: s.data || [], jobs: j.data || [], metrics: m.data || [], logs: l.data || [] })
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])

  const test = async (s) => {
    setBusy(s.id)
    let ok = false, msg = ''
    try { const r = await fetch(TESTS[s.id] || s.base_url, { signal: AbortSignal.timeout(10000) }); ok = r.ok; msg = ok ? '' : `HTTP ${r.status}` } catch (e) { msg = String(e.message || e) }
    await supabase.from('content_sources').update({ last_tested_at: new Date().toISOString(), last_test_ok: ok, last_error: msg || null }).eq('id', s.id)
    toast(ok ? `${s.name}: reachable` : `${s.name}: ${msg}`, ok ? 'success' : 'error'); setBusy(''); load()
  }
  const patch = async (id, p) => { const { error } = await supabase.from('content_sources').update(p).eq('id', id); if (error) toast(error.message, 'error'); load() }
  const queue = async (campaign, source_id) => {
    const { error } = await supabase.from('import_jobs').insert({ campaign, source_id, status: 'queued', target: campaign.includes('10000') ? 10000 : null, cursor: {} })
    toast(error ? error.message : 'Queued — the Railway worker picks it up on its next cycle', error ? 'error' : 'success'); load()
  }
  const tot = (st) => d.metrics.filter((x) => x.readable_status === st).reduce((a, x) => a + Number(x.works), 0)
  const qualNovels = d.metrics.find((x) => x.format === 'novel' && x.readable_status === 'qualified')

  return (
    <div className="stack">
      {err && <div className="glass pad" role="alert">{err}</div>}
      <div className="grid-stats">
        {[['Qualified works', tot('qualified')], ['Qualified novels (target 10,000)', qualNovels?.works || 0], ['Chapters', d.metrics.reduce((a, x) => a + Number(x.chapters), 0)], ['Paragraphs', d.metrics.reduce((a, x) => a + Number(x.paragraphs), 0)]].map(([k, v]) => (
          <div key={k} className="glass pad"><small className="muted">{k}</small><h2>{Number(v).toLocaleString()}</h2></div>))}
      </div>
      <div className="glass pad stack">
        <div className="row between"><b>Sources</b><span className="row">
          <button className="btn sm" onClick={() => queue('INITIAL_NOVEL_LIBRARY_10000', 'gutendex')}>Queue novel campaign</button>
          <button className="btn sm" onClick={() => queue('COMIC_LIBRARY_MANGADEX', 'mangadex')}>Queue comics</button></span></div>
        <table className="table"><thead><tr><th>Source</th><th>Text</th><th>Rate/s</th><th>Enabled</th><th>Last test</th><th /></tr></thead><tbody>
          {d.sources.map((s) => (
            <tr key={s.id}><td>{s.name}<br /><small className="muted">{s.license_policy}</small></td><td>{s.provides_text ? 'yes' : 'metadata only'}</td>
              <td><input type="number" step="0.5" min="0.1" max="10" defaultValue={s.rate_limit_rps} style={{ width: 64 }} onBlur={(e) => patch(s.id, { rate_limit_rps: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={s.enabled} onChange={(e) => patch(s.id, { enabled: e.target.checked })} /></td>
              <td>{s.last_tested_at ? (s.last_test_ok ? '✓ ok' : `✗ ${s.last_error || ''}`) : '—'}</td>
              <td><button className="btn ghost sm" disabled={busy === s.id} onClick={() => test(s)}>Test</button></td></tr>))}
        </tbody></table>
      </div>
      <div className="glass pad stack"><b>Jobs</b>
        <table className="table"><thead><tr><th>Campaign</th><th>Status</th><th>Found</th><th>Verified</th><th>Qualified</th><th>Chapters</th><th>Paragraphs</th><th>Failed</th><th>Remaining</th></tr></thead><tbody>
          {d.jobs.map((j) => <tr key={j.id}><td>{j.campaign}</td><td>{j.status}</td><td>{j.discovered}</td><td>{j.verified}</td><td>{j.qualified}</td><td>{j.chapters_imported}</td><td>{j.paragraphs_imported}</td><td>{j.failed}</td><td>{j.target ? Math.max(0, j.target - j.qualified) : '—'}</td></tr>)}
        </tbody></table>
      </div>
      <div className="glass pad stack"><b>Recent errors</b>
        {d.logs.length === 0 ? <small className="muted">No errors logged.</small> : d.logs.map((l) => <small key={l.id} className="muted">#{l.external_id} — {l.message}</small>)}
      </div>
    </div>
  )
}
