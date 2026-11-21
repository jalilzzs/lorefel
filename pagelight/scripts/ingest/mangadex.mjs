// MangaDex official API. Only chapters hosted on MangaDex (no external URLs), real page images in order.
import { fetchJson, norm, normAuthor } from './core.mjs';
const API = 'https://api.mangadex.org';
export const SOURCE_ID = 'mangadex';

export const listUrl = (offset, lang = 'en') =>
  `${API}/manga?limit=50&offset=${offset}&availableTranslatedLanguage[]=${lang}&hasAvailableChapters=true&contentRating[]=safe&order[followedCount]=desc&includes[]=cover_art&includes[]=author`;

export function toRecord(m, lang = 'en') {
  const a = m.attributes, rel = m.relationships || [];
  const title = a.title?.en || Object.values(a.title || {})[0];
  const author = rel.find((r) => r.type === 'author')?.attributes?.name || null;
  const cover = rel.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const format = a.originalLanguage === 'ko' ? 'manhwa' : a.originalLanguage === 'ja' ? 'manga' : null;
  return {
    source_id: SOURCE_ID, external_id: m.id, title, title_norm: norm(title || ''), author, author_norm: author ? normAuthor(author) : null,
    format, language: lang, description: a.description?.[lang] || a.description?.en || null, year: a.year || null,
    status: ({ completed: 'completed', hiatus: 'hiatus' })[a.status] || 'ongoing',
    subjects: (a.tags || []).map((t) => t.attributes?.name?.en).filter(Boolean).slice(0, 12),
    cover_url: cover ? `https://uploads.mangadex.org/covers/${m.id}/${cover}.256.jpg` : null,
    is_mature: false, source_url: `https://mangadex.org/title/${m.id}`, license: 'Hosted on MangaDex via official API',
  };
}

/** first `max` integer-numbered chapters that MangaDex itself hosts. */
export async function fetchChapters(r, limiter, { max = 5 } = {}) {
  const feed = await fetchJson(`${API}/manga/${r.external_id}/feed?translatedLanguage[]=${r.language}&limit=100&order[chapter]=asc&includeExternalUrl=0&contentRating[]=safe`, limiter);
  const out = [], seen = new Set();
  for (const c of feed.data || []) {
    const a = c.attributes, n = Number(a.chapter);
    if (!Number.isInteger(n) || n < 1 || seen.has(n) || !a.pages || a.externalUrl) continue;
    const srv = await fetchJson(`${API}/at-home/server/${c.id}`, limiter);
    const pages = (srv.chapter?.data || []).map((f) => `${srv.baseUrl}/data/${srv.chapter.hash}/${f}`);
    if (!pages.length) continue;
    seen.add(n); out.push({ number: n, name: a.title || null, pages });
    if (out.length >= max) break;
  }
  return out;
}
