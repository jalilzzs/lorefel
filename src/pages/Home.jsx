import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp, useTitle } from '../store'
import { queryTitles, synopsis } from '../lib/catalog'
import { recommend } from '../lib/recommend'
import { Parallax, Row, Cover } from '../components'

export default function Home() {
  const { S, t, base } = useApp(); useTitle('')
  const [d, setD] = useState(null)
  const gk = S.profile.genres.join()
  useEffect(() => {
    let on = true
    ;(async () => {
      const q = (o) => queryTitles({ ...base, size: 12, ...o }).then((r) => r.items)
      const g = S.profile.genres.length ? S.profile.genres.slice(0, 3) : ['Fantasy', 'Romance', 'Thriller']
      const [trend, latest, manhwa, manga, gems, ...gr] = await Promise.all([q({ sort: 'trending' }), q({ sort: 'new' }), q({ format: 'manhwa', sort: 'rating' }), q({ format: 'manga', sort: 'rating' }), q({ gem: true, sort: 'rating' }), ...g.map((x) => q({ genres: [x], sort: 'popular' }))])
      const rec = S.site.toggles.recs ? await recommend(S, base, 12) : []
      on && setD({ trend, latest, manhwa, manga, gems, gr: g.map((x, i) => [x, gr[i]]), rec })
    })().catch(console.error)
    return () => { on = false }
  }, [base, gk])
  const resume = Object.entries(S.progress).sort((a, b) => b[1].ts - a[1].ts).slice(0, 8).map(([id, p]) => ({ id, p, m: S.meta[id] })).filter((x) => x.m)
  const hero = d?.trend[0]
  return (
    <>
      {hero && <section className="hero glass"><Parallax t={hero} w={200} /><div className="grow"><span className="chip sm">{t('trending')}</span><h1>{hero.title}</h1><p className="muted">{hero.author} · ★ {hero.rating} · {t(hero.format)}</p><p style={{ maxWidth: 560 }}>{synopsis(hero)}</p>
        <div className="flex"><Link className="btn pri" to={`/read/${hero.id}/1`}>{t('startReading')}</Link><Link className="btn" to={`/title/${hero.id}`}>{t('overview')}</Link></div></div></section>}
      {resume.length > 0 && <section className="sec"><h2>{t('resume')}</h2><div className="row">{resume.map(({ id, p, m }) => (
        <Link key={id} to={`/read/${id}/${p.ch}`} className="card" style={{ width: 190 }}><div className="cw"><Cover t={m} /></div><b>{m.title}</b><small>{t('chapter')} {p.ch} · {Math.round(p.pos * 100)}%</small><div className="meter"><i style={{ width: p.pos * 100 + '%' }} /></div></Link>))}</div></section>}
      {S.site.toggles.recs && <Row title={t('foryou')} items={d?.rec} extra={(x) => <small className="muted">{x.why.k === 'because' ? `${t('because')} ${x.why.x}` : t(x.why.k)}</small>} />}
      <Row title={t('trending')} items={d?.trend} />
      <Row title={t('latest')} items={d?.latest} />
      {S.site.toggles.manhwa && <Row title={t('manhwaSpot')} items={d?.manhwa} />}
      {S.site.toggles.manga && <Row title={t('mangaSpot')} items={d?.manga} />}
      {d?.gr.map(([g, items]) => <Row key={g} title={g} items={items} />)}
      <Row title={t('gems')} items={d?.gems} />
    </>
  )
}
