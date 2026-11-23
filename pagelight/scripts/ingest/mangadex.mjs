// MangaDex official API. Only chapters hosted on MangaDex (no external URLs), real page images in order.
import { fetchJson, norm, normAuthor } from './core.mjs';
const API = 'https://mangadex.org';
export const SOURCE_ID = 'mangadex';

// MangaDex official tag UUIDs for Fantasy, Horror, Action, Thriller, Web Comic
const GENRE_TAGS = [
  'cdc58593-87dd-415e-bbc0-2ec27bf404cc', // Fantasy
  'cdad7e68-1419-41dd-bdce-27753074a640', // Horror
  '391b0423-d847-456f-aff0-8b0cfc03066b', // Action
  '07251805-a27e-4d59-b488-f0bfbec15168', // Thriller
];

export const listUrl = (offset, lang = 'en') => {
  const tagsQuery = GENRE_TAGS.map((id) => `includedTags[]=${id}`).join('&');
  return `${API}/manga?limit=50&offset=${offset}&availableTranslatedLanguage[]=${lang}&hasAvailableChapters=true&contentRating[]=safe&contentRating[]=suggestive&${tagsQuery}&includedTagsMode=OR&order[followedCount]=desc&includes[]=cover_art&includes[]=author`;
};

export function toRecord(m, lang = 'en') {
  const a = m.attributes, rel = m.relationships || [];
  const title = a.title?.en || Object.values(a.title || {})[0];
  const author = rel.find((r) => r.type === 'author')?.attributes?.name || null;
  const cover = rel.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const format = a.originalLanguage === 'ko' ? 'manhwa' : a.originalLanguage === 'ja' ? 'manga' : 'manhwa';
  return {
    source_id: SOURCE_ID, external_id: m.id, title, title_norm: norm(title || ''), author, author_norm: author ? normAuthor(author) : null,
    format, language: lang, description: a.description?.[lang] || a.description?.en || null, year: a.year || null,
    status: ({ completed: 'completed', hiatus: 'hiatus' })[a.status] || 'ongoing',
    subjects: (a.tags || []).map((t) => t.attributes?.name?.en).filter(Boolean).slice(0, 12),
    cover_url: cover ? `https://mangadex.org{m.id}/${cover}.256.jpg` : null,
    is_mature: false, source_url: `https://mangadex.org{m.id}`, license: 'Hosted on MangaDex via official API',
  };
}

/** Chapter LIST only (nothing is downloaded or stored): integer-numbered chapters hosted by MangaDex itself. */
export async function fetchChapters(r, limiter, { max = 200 } = {}) {
  const feed = await fetchJson(`${API}/manga/${r.external_id}/feed?translatedLanguage[]=${r.language}&limit=500&order[chapter]=asc&includeExternalUrl=0&contentRating[]=safe&contentRating[]=suggestive`, limiter);
  const out = [], seen = new Set();
  for (const c of feed.data || []) {
    const a = c.attributes, n = Number(a.chapter);
    if (!Number.isInteger(n) || n < 1 || seen.has(n) || !a.pages || a.externalUrl) continue;
    if (!out.length) {   // verify that the first chapter really serves pages right now
      const srv = await fetchJson(`${API}/at-home/server/${c.id}`, limiter);
      if (!(srv.chapter?.data || []).length) continue;
    }
    seen.add(n); out.push({ number: n, name: a.title || null, page_count: a.pages, ref: { u: c.id } });
    if (out.length >= max) break;
  }
  return out;
}

/** Provider rating (MangaDex community, 0..10 -> 0..5). Returns null when MangaDex has none. */
export async function fetchStats(ids, limiter) {
  const out = {};
  if (!ids.length) return out;
  try {
    const j = await fetchJson(`${API}/statistics/manga?${ids.map((i) => `manga[]=${i}`).join('&')}`, limiter);
    for (const [id, s] of Object.entries(j.statistics || {})) {
      const v = s.rating?.bayesian ?? s.rating?.average;
      const dist = s.rating?.distribution ? Object.values(s.rating.distribution).reduce((n, x) => n + x, 0) : 0;
      if (v) out[id] = { rating: Math.round((v / 2) * 100) / 100, rating_count: dist, rating_source: 'MangaDex' };
    }
  } catch { /* ratings are optional */ }
  return out;
}

/** Reader: page image URLs fetched at reading time (at-home URLs are short-lived, so they must not be stored). */
export async function readPages(chapterUuid, limiter) {
  const srv = await fetchJson(`${API}/at-home/server/${chapterUuid}`, limiter);
  return (srv.chapter?.data || []).map((f) => `${srv.baseUrl}/data/${srv.chapter.hash}/${f}`);
}
