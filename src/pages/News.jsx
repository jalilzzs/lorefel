import { useApp, useTitle } from '../store'

export default function News() {
  const { S, t } = useApp(); useTitle(t('news'))
  const posts = S.news.filter((n) => n.published).sort((a, b) => b.ts - a.ts)
  return (
    <>
      <h1>{t('news')}</h1>
      <div className="cols">{posts.map((n, i) => (
        <article key={n.id} className="glass box" style={i === 0 ? { gridColumn: '1/-1' } : {}}>
          <span className="chip sm">{n.category}</span> <small className="muted">{new Date(n.ts).toLocaleDateString(S.lang)}</small>
          <h2>{n.title}</h2><p>{n.body}</p></article>))}</div>
    </>
  )
}
