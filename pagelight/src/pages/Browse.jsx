import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { Grid } from '../components/TitleCard'
import { Empty } from '../components/ui'
import { useApp } from '../lib/app'
import { catalog, SORTS, STATUSES } from '../lib/catalog'
import { useAsync, useDocTitle } from '../lib/hooks'
import { useCatalogFilters } from '../lib/useFilters'

const PAGE_SIZE = 24

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null
  const nums = new Set([1, 2, page - 1, page, page + 1, pages - 1, pages].filter((n) => n >= 1 && n <= pages))
  const arr = [...nums].sort((a, b) => a - b)
  return (
    <nav className="pager" aria-label="Pagination">
      <button className="btn ghost sm" disabled={page <= 1} onClick={() => onChange(page - 1)}><Icon name="left" size={14} className="flip" /></button>
      {arr.map((n, i) => <span key={n}>{i > 0 && n - arr[i - 1] > 1 && <span className="muted">…</span>}<button className={'btn sm ' + (n === page ? 'primary' : 'ghost')} onClick={() => onChange(n)}>{n}</button></span>)}
      <button className="btn ghost sm" disabled={page >= pages} onClick={() => onChange(page + 1)}><Icon name="right" size={14} className="flip" /></button>
    </nav>
  )
}

export default function Browse() {
  const { t, setFilters, filters } = useApp()
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || ''
  const sort = sp.get('sort') || 'popular'
  const page = Math.max(1, +sp.get('page') || 1)
  const status = sp.get('status') || ''
  const minRating = +sp.get('rating') || 0
  const yearMin = +sp.get('from') || 0
  const yearMax = +sp.get('to') || 0
  useDocTitle(q ? t('search.results', { q }) : t('nav.browse'), t('browse.desc'))
  useEffect(() => { const fm = sp.get('format'); if (fm && fm !== filters.format) setFilters((f) => ({ ...f, format: fm })) }, []) // eslint-disable-line
  const f = useCatalogFilters()
  const { data, loading } = useAsync(() => catalog.query({ ...f, q, sort, page, pageSize: PAGE_SIZE, status, minRating, yearMin, yearMax }), [JSON.stringify(f), q, sort, page, status, minRating, yearMin, yearMax])
  const set = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="serif">{q ? t('search.results', { q }) : t('nav.browse')}</h1>
          <p className="muted">{loading ? '…' : t('results.count', { n: (data?.total ?? 0).toLocaleString() })}{catalog.size ? ` · ${t('catalog.size', { n: catalog.size.toLocaleString() })}` : ''}</p>
        </div>
        <div className="facets">
          <select value={sort} onChange={(e) => set('sort', e.target.value)} aria-label={t('sort')}>{SORTS.map((s) => <option key={s} value={s}>{t('sort.' + s)}</option>)}</select>
          <select value={status} onChange={(e) => set('status', e.target.value)} aria-label={t('status')}><option value="">{t('status')}: {t('all')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t('s.' + s)}</option>)}</select>
          <select value={minRating} onChange={(e) => set('rating', e.target.value)} aria-label={t('rating')}>{[0, 3, 3.5, 4, 4.5].map((r) => <option key={r} value={r || ''}>{r ? `★ ${r}+` : t('rating') + ': ' + t('all')}</option>)}</select>
          <input type="number" placeholder={t('year.from')} value={yearMin || ''} onChange={(e) => set('from', e.target.value)} min="1990" max="2030" />
          <input type="number" placeholder={t('year.to')} value={yearMax || ''} onChange={(e) => set('to', e.target.value)} min="1990" max="2030" />
        </div>
      </div>
      {!loading && data && !data.items.length ? <Empty icon="search" title={t('empty.results')}>{t('empty.results.sub')}</Empty> : <Grid items={data?.items || []} loading={loading} n={PAGE_SIZE} />}
      <Pager page={page} pages={Math.min(pages, 4000)} onChange={(p) => { set('page', p > 1 ? p : ''); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
    </div>
  )
}
