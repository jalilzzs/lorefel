import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Chip, Empty, Modal, Skeleton } from '../components/ui'
import { useApp } from '../lib/app'
import { newsService } from '../lib/services'
import { useDocTitle } from '../lib/hooks'
import { fmtDate } from '../lib/util'

export const loc = (o, lang) => (o && (o[lang] || o.en || Object.values(o)[0])) || ''
const CATS = ['news', 'adaptation', 'schedule', 'spotlight', 'platform']

export default function News() {
  const { t, lang, filters } = useApp()
  useDocTitle(t('nav.news'), t('news.desc'))
  const [posts, setPosts] = useState(null)
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(null)
  const load = () => newsService.list().then(setPosts)
  useEffect(() => { load(); return newsService.subscribe(load) }, [])
  const list = (posts || []).filter((p) => (!cat || p.category === cat) && (!filters.genres.length || !p.genres.length || p.genres.some((g) => filters.genres.includes(g))))
  const [lead, ...rest] = list
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="serif">{t('nav.news')}</h1><p className="muted">{t('news.desc')}</p></div><div className="row wrap"><Chip active={!cat} onClick={() => setCat('')}>{t('all')}</Chip>{CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{t('news.' + c)}</Chip>)}</div></div>
      {!posts && <Skeleton h={240} r={20} />}
      {posts && !list.length && <Empty icon="news" title={t('empty.news')} />}
      {lead && (
        <article className="news-lead glass" style={{ '--hue': lead.hue }} onClick={() => setOpen(lead)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(lead)}>
          <span className="pill accent">{t('news.' + lead.category)}</span><h2 className="serif">{loc(lead.title, lang)}</h2><p>{loc(lead.excerpt, lang)}</p>
          <small className="muted">{lead.author} · {fmtDate(lead.ts, lang)}</small>
        </article>
      )}
      <div className="news-grid">
        {rest.map((p) => (
          <article key={p.id} className="news-card glass" style={{ '--hue': p.hue }} onClick={() => setOpen(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(p)}>
            <span className="pill soft">{t('news.' + p.category)}</span><h3>{loc(p.title, lang)}</h3><p className="clamp3 muted">{loc(p.excerpt, lang)}</p>
            <small className="muted">{p.eventDate && <><Icon name="calendar" size={12} /> {p.eventDate} · </>}{fmtDate(p.ts, lang)}</small>
          </article>
        ))}
      </div>
      {open && <Modal onClose={() => setOpen(null)} title={loc(open.title, lang)} wide><div className="stack"><span className="pill accent">{t('news.' + open.category)}</span>{loc(open.body, lang).split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}<small className="muted">{open.author} · {fmtDate(open.ts, lang)}</small></div></Modal>}
    </div>
  )
}
