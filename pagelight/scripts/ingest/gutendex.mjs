// Project Gutenberg via Gutendex (https://gutendex.com). Public-domain (US) only.
import { fetchJson, fetchText, norm, normAuthor } from './core.mjs';
import { stripGutenberg, splitChapters } from './text.mjs';

export const SOURCE_ID = 'gutendex';
const LANG_OK = new Set(['en', 'fr', 'zh']);   // Arabic Gutenberg coverage is tiny; handled if present

export const firstPageUrl = (lang = 'en') => `https://gutendex.com/books/?languages=${lang}&copyright=false&sort=popular`;

export async function listPage(url, limiter) {
  const j = await fetchJson(url, limiter);
  return { next: j.next, items: (j.results || []).map(toRecord) };
}

export function pickTextUrl(formats = {}) {
  const k = Object.keys(formats).find((f) => /^text\/plain/.test(f) && !/\.zip$/.test(formats[f]));
  return k ? formats[k] : null;
}

export function toRecord(b) {
  const author = b.authors?.[0]?.name || null;
  const language = (b.languages || [])[0] || 'en';
  const fiction = (b.subjects || []).concat(b.bookshelves || []).join(' ').match(/fiction|novel|stories|romance|adventure/i);
  return {
    source_id: SOURCE_ID, external_id: String(b.id), title: b.title, author,
    title_norm: norm(b.title), author_norm: author ? normAuthor(author) : null,
    language, subjects: (b.subjects || []).slice(0, 12), isFiction: !!fiction,
    copyright: b.copyright, text_url: pickTextUrl(b.formats),
    cover_url: b.formats?.['image/jpeg'] || null,
    source_url: `https://www.gutenberg.org/ebooks/${b.id}`,
    downloads: b.download_count,
  };
}

/** Qualification: public-domain, supported language, fiction-ish, has text URL. */
export function qualifyMeta(r) {
  if (r.copyright !== false) return 'copyright_unknown_or_true';
  if (!LANG_OK.has(r.language)) return 'language_unsupported';
  if (!r.text_url) return 'no_text_format';
  if (!r.isFiction) return 'not_fiction';
  return null;
}

export async function fetchChapters(r, limiter) {
  const raw = await fetchText(r.text_url, limiter);
  const chapters = splitChapters(stripGutenberg(raw));
  return chapters;
}
