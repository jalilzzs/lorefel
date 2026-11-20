import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Shelf, TiltCover, SaveButton, TitleCard } from '../components/TitleCard'
import { Stars } from '../components/ui'
import { useApp } from '../lib/app'
import { catalog, coverOf, synopsisOf } from '../lib/catalog'
import { useUD } from '../lib/userdata'
import { useAsync, useDocTitle, useInView } from '../lib/hooks'
import { useCatalogFilters } from '../lib/useFilters'
import { buildProfile, recommend, shelves } from '../lib/recommend'
import { cx, timeAgo, fmtNum } from '../lib/util'

function Hero({ items }) {
  const { t, canView } = useApp()
  const nav = useNavigate()
  const [i, setI] = useState(0)
  useEffect(() => { if (items.length < 2) return; const id = setInterval(() => setI((x) => (x + 1) % items.length), 7000); return () => clearInterval(id) }, [items.length])
  const h = items[i]
  if (!h) return <div className="hero skeleton" style={{ height: 380 }} />
  const blocked = !canView(h)
  return (
    <section className="hero" style={{ '--hero': `url("${coverOf(h)}")` }}>
      <div className="hero-bg" />
      <div className="hero-in">
        <div className="hero-text" key={h.id}>
          <div className="row wrap"><span className="pill accent"><Icon name="flame" size={13} />{t('hero.trending')}</span><span className="pill">{t('f.' + h.format)}</span>{h.genres.slice(0, 2).map((g) => <span key={g} className="pill soft">{t('g.' + g)}</span>)}</div>
          <h1 className="serif">{h.title}</h1>
          <div className="row"><Stars value={Math.round(h.rating * 2) / 2} /><b>{h.rating.toFixed(1)}</b><span className="muted">{fmtNum(h.votes)} · {h.chapters} {t('chapters.short')}</span></div>
          <p className="clamp3">{blocked ? t('age.blocked.short') : synopsisOf(h)}</p>
          <div className="row wrap">
            <button className="btn primary lg" onClick={() => nav(blocked ? `/title/${h.id}` : `/read/${h.id}/1`)}><Icon name="play" size={16} fill />{t('read.now')}</button>
            <Link to={`/title/${h.id}`} className="btn ghost lg">{t('details')}</Link>
            <SaveButton t={h} />
          </div>
        </div>
        <TiltCover t={h} big blocked={blocked} />
      </div>
      <div className="hero-dots">{items.map((x, k) => <button key={x.id} className={cx(k === i && 'on')} onClick={() => setI(k)} aria-label={x.title} />)}</div>
    </section>
  )
}

function ResumeRow() {
  const { t, lang } = useApp()
  const progress = useUD((s) => s.progress)
  const nav = useNavigate()
  const items = useMemo(() => Object.entries(progress).filter(([, p]) => p.chapter).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, 8).map(([id, p]) => ({ t: catalog.local(+id), p })).filter((x) => x.t), [progress])
  if (!items.length) return null
  return (
    <section className="shelf-sec">
      <div className="sec-head"><h2><Icon name="clock" size={20} /> {t('resume')}</h2></div>
      <div className="shelf">
        {items.map(({ t: tt, p }) => (
          <button key={tt.id} className="resume glass" onClick={() => nav(`/read/${tt.id}/${p.chapter}`)}>
            <img src={coverOf(tt)} alt="" />
            <div><b className="clamp2">{tt.title}</b><small className="muted">{t('chapter')} {p.chapter} · {Math.round((p.pos || 0) * 100)}%</small><small className="muted">{timeAgo(p.ts || Date.now(), lang)}</small>
              <div className="mini-progress static"><i style={{ width: `${Math.min(100, (p.chapter / tt.chapters) * 100)}%` }} /></div></div>
            <Icon name="play" size={18} fill />
          </button>
        ))}
      </div>
    </section>
  )
}

function Lazy({ children }) {
  const [ref, seen] = useInView()
  return <div ref={ref} style={{ minHeight: seen ? 0 : 280 }}>{seen && children}</div>
}

function QueryShelf({ q, filters, ...rest }) {
  const { data, loading } = useAsync(() => catalog.query({ ...filters, ...q, pageSize: q.pageSize || 16 }), [JSON.stringify(filters), JSON.stringify(q)])
  return <Shelf {...rest} items={data?.items} loading={loading} />
}

export default function Home() {
  const { t, tx, site, profile, genreLabels, enabledFormats, filters, lang } = useApp()
  useDocTitle(t('nav.home'), t('footer.tag'))
  const f = useCatalogFilters()
  const ud = useUD((s) => s)
  const lib = ud.library, ratings = ud.ratings, searches = ud.searches, hist = ud.history.length, progress = ud.progress
  const [recs, setRecs] = useState(null)
  const favGenres = profile?.favGenres || []
  useEffect(() => {
    if (!site.features.recommendations) return
    const id = setTimeout(() => {
      const prof = buildProfile(ud, favGenres, genreLabels)
      setRecs({ prof, list: recommend(prof, site.recWeights, { formats: enabledFormats, hideMature: f.hideMature, muteTags: f.muteTags, lang: f.lang }) })
    }, 40)
    return () => clearTimeout(id)
  }, [lib, ratings, searches, hist, progress, favGenres.join(), site.recWeights, enabledFormats.join(), f.lang, f.hideMature]) // eslint-disable-line
  const sh = useMemo(() => (recs ? shelves(recs.list.filter((r) => !f.genres.length || f.genres.every((g) => r.t.genres.includes(g)) && (!f.format || r.t.format === f.format))) : null), [recs, f.genres.join(), f.format])
  const hero = useAsync(() => catalog.query({ ...f, sort: 'trending', pageSize: 5 }), [JSON.stringify(f)])
  const gens = f.genres.length ? f.genres.slice(0, 4) : favGenres.length ? favGenres.slice(0, 4) : ['fantasy', 'romance', 'action', 'mystery']
  const fmtOn = (x) => enabledFormats.includes(x) && (!f.format || f.format === x)
  return (
    <div className="page">
      <Hero items={hero.data?.items || []} />
      <ResumeRow />
      {site.features.recommendations && (
        <>
          <Shelf title={t('foryou')} subtitle={recs?.prof.cold ? t('foryou.cold') : t('foryou.sub')} icon="sparkles" items={sh?.forYou} loading={!sh} />
          {sh?.because.map((b) => <Shelf key={b.ref.id} title={t('because.read', { title: b.ref.title })} items={b.items} />)}
          <Shelf title={t('rising.genres')} icon="zap" items={sh?.rising} loading={false} />
          <Shelf title={t('completion.match')} icon="target" items={sh?.completion} loading={false} />
        </>
      )}
      <Lazy><QueryShelf title={t('trending')} subtitle={t('trending.sub')} icon="flame" filters={f} q={{ sort: 'trending' }} to="/browse?sort=trending" /></Lazy>
      <Lazy>
        <QueryShelf title={t('latest.drops')} icon="zap" filters={f} q={{ sort: 'updated', status: 'ongoing' }} to="/browse?sort=updated">
        </QueryShelf>
      </Lazy>
      {fmtOn('manhwa') && <Lazy><QueryShelf title={t('spotlight.manhwa')} icon="columns" filters={{ ...f, format: 'manhwa' }} q={{ sort: 'rating' }} to="/browse?format=manhwa" /></Lazy>}
      {fmtOn('manga') && <Lazy><QueryShelf title={t('spotlight.manga')} icon="columns" filters={{ ...f, format: 'manga' }} q={{ sort: 'rating' }} to="/browse?format=manga" /></Lazy>}
      {gens.map((g) => <Lazy key={g}><QueryShelf title={t('g.' + g)} filters={{ ...f, genres: [g] }} q={{ sort: 'popular' }} to="/browse" /></Lazy>)}
      <Lazy><QueryShelf title={t('hidden.gems')} subtitle={t('hidden.gems.sub')} icon="sparkles" filters={f} q={{ sort: 'rating', minRating: 4.5, maxVotes: 2000 }} to="/gems" /></Lazy>
      <Lazy><QueryShelf title={t('short.reads')} filters={f} q={{ sort: 'rating', maxChapters: 60, status: 'completed' }} /></Lazy>
      <section className="discover-strip">
        {[['/wheel', 'shuffle', 'wheel'], ['/compare', 'scale', 'compare'], ['/quotes', 'quote', 'quotes'], ['/magazine', 'book', 'magazine'], ['/matcher', 'users', 'matcher']].map(([to, ic, k]) => <Link key={to} to={to} className="tile glass"><Icon name={ic} size={22} /><b>{t('d.' + k)}</b><small className="muted">{t('d.' + k + '.sub')}</small></Link>)}
      </section>
    </div>
  )
}
