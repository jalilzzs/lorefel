// Modern Open-Licensed Fiction (Fantasy, Horror, Sci-Fi, Thriller) via Internet Archive Creative Commons API
import { fetchJson, fetchText, norm, normAuthor } from './core.mjs';
import { splitChapters } from './text.mjs';

export const id = 'openfiction';
export const rps = 0.5;
export const minWords = 1500;

const LANG_MAP = { ar: 'Arabic', en: 'English', fr: 'French', zh: 'Chinese' };

export async function list(lang, cursor, limiter) {
  const page = cursor?.page || 1;
  const iaLang = LANG_MAP[lang] || 'English';
  // Query only modern creative-commons licensed fiction in Fantasy, Horror, Sci-Fi, Action, Thriller
  const q = encodeURIComponent(
    `mediatype:(texts) AND language:(${iaLang}) AND licenseurl:(*creativecommons.org*) AND subject:(fantasy OR horror OR "science fiction" OR thriller OR action OR mystery)`
  );
  const url = `https://archive.org{q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=description&fl[]=year&fl[]=subject&fl[]=licenseurl&sort[]=downloads+desc&rows=30&page=${page}&output=json`;
  const data = await fetchJson(url, limiter);
  const docs = data?.response?.docs || [];

  const items = docs.map((d) => {
    const title = Array.isArray(d.title) ? d.title[0] : d.title;
    const author = Array.isArray(d.creator) ? d.creator[0] : d.creator || null;
    const desc = Array.isArray(d.description) ? d.description.join('\n') : d.description || null;
    const subjects = Array.isArray(d.subject) ? d.subject : d.subject ? [d.subject] : [];
    return {
      source_id: id,
      external_id: d.identifier,
      title,
      title_norm: norm(title || ''),
      author,
      author_norm: author ? normAuthor(author) : null,
      format: 'novel',
      language: lang,
      description: desc ? String(desc).slice(0, 1500) : null,
      year: d.year ? Number(String(d.year).slice(0, 4)) || null : null,
      status: 'completed',
      subjects: subjects.slice(0, 10),
      cover_url: `https://archive.org{d.identifier}`,
      is_mature: false,
      source_url: `https://archive.org{d.identifier}`,
      license: d.licenseurl || 'Creative Commons (Open Fiction)',
    };
  });

  const numFound = data?.response?.numFound || 0;
  const hasNext = page * 30 < numFound;
  return { next: hasNext ? { page: page + 1 } : null, items };
}

export function qualify(r) {
  if (!r.title || r.title.length < 2) return 'missing_title';
  if (!r.external_id) return 'missing_id';
  return null;
}

export async function chapters(r, limiter) {
  const meta = await fetchJson(`https://archive.org{r.external_id}`, limiter);
  const files = meta?.files || [];
  // Prefer clean digital TXT or EPUB-extracted text (avoid bad raw scans)
  const txtFile =
    files.find((f) => f.name?.endsWith('.txt') && !f.name.includes('_djvu')) ||
    files.find((f) => f.name?.endsWith('_djvu.txt'));
  if (!txtFile) return [];

  const raw = await fetchText(`https://archive.org{r.external_id}/${encodeURIComponent(txtFile.name)}`, limiter);
  if (!raw || raw.length < 3000) return [];
  return splitChapters(raw, r.language);
}

export const readBook = (r, limiter) => chapters(r, limiter);
export const recordFromSource = (ws, lang) => ({ external_id: ws.external_id, language: lang });
