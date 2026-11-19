import { useEffect, useState } from 'react'
import { useApp, useTitle } from '../store'
import { queryTitles } from '../lib/catalog'
import { Card, Empty, Skeleton } from '../components'

export default function Browse() {
  const { S, t, base } = useApp(); useTitle(t('browse'))
  const F = S.filters
  const [o, setO] = useState({ sort: 'trending', status: '', minRating: 0, year: 0 })
  const [items, setItems] = useState(null), [total, setTotal] = useState(0), [page, setPage] = useState(1), [busy, setBusy] = useState(false)
  const key = JSON.stringify([F, o, base])
  useEffect(() => { setPage(1); setItems(null) }, [key])
  useEffect(() => {
    let on = true; setBusy(true)
    queryTitles({ ...base, ...o, q: F.q, genres: F.genres, format: F.format, lang: F.lang, page, size: 24 }).then((r) => { if (!on) return; setItems((p) => (page === 1 ? r.items : [...(p || []), ...r.items])); setTotal(r.total); setBusy(false) }).catch((e) => { console.error(e); setItems([]); setBusy(false) })
    return () => { on = false }
  }, [key, page])
  return (
    <>
      <div className="flex">
        <select value={o.sort} onChange={(e) => setO({ ...o, sort: e.target.value })} aria-label={t('sort')}>{['trending', 'rating', 'popular', 'new'].map((x) => <option key={x} value={x}>{t('sort')}: {x}</option>)}</select>
        <select value={o.status} onChange={(e) => setO({ ...o, status: e.target.value })}><option value="">{t('status')}: {t('all')}</option>{['ongoing', 'completed', 'hiatus'].map((x) => <option key={x}>{x}</option>)}</select>
        <select value={o.minRating} onChange={(e) => setO({ ...o, minRating: +e.target.value })}><option value="0">{t('rating')}: {t('all')}</option>{[3, 4, 4.5].map((x) => <option key={x} value={x}>★ {x}+</option>)}</select>
        <select value={o.year} onChange={(e) => setO({ ...o, year: +e.target.value })}><option value="0">≥ year</option>{[2015, 2020, 2024].map((x) => <option key={x}>{x}</option>)}</select>
        <span className="muted">{total.toLocaleString()} ✦</span>
      </div>
      {items === null ? <Skeleton n={8} /> : items.length === 0 ? <Empty>{t('nomatch')}</Empty> : <div className="grid" style={{ marginTop: 16 }}>{items.map((x) => <Card key={x.id} t={x} />)}</div>}
      {items && items.length < total && <p style={{ textAlign: 'center' }}><button className="btn pri" disabled={busy} onClick={() => setPage(page + 1)}>{t('more')}</button></p>}
    </>
  )
}
