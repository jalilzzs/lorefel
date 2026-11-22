// Wikisource (MediaWiki API). Texts are public domain or CC BY-SA. One adapter, 4 languages.
// Category names differ per wiki and are UNVERIFIED defaults: override with env WIKISOURCE_CATEGORIES='{"ar":["تصنيف:..."],...}'
import { fetchJson, norm } from './core.mjs';
import { htmlToParagraphs, countWords } from './html.mjs';
export const id = 'wikisource';
export const rps = 1;   // Wikimedia asks for polite, mostly serial API use
export const minWords = 1500;
const DEFAULT_CATS = {
  ar: ['تصنيف:روايات', 'تصنيف:قصص'],
  fr: ['Catégorie:Romans', 'Catégorie:Nouvelles'],
  zh: ['Category:小说', 'Category:小說'],
  en: ['Category:Novels', 'Category:Short stories'],
};
const cats = (lang) => { try { return JSON.parse(process.env.WIKISOURCE_CATEGORIES || '{}')[lang] || DEFAULT_CATS[lang] || []; } catch { return DEFAULT_CATS[lang] || []; } };
const api = (lang) => `https://${lang}.wikisource.org/w/api.php`;
const MAX_CHAPTERS = Number(process.env.WIKISOURCE_MAX_CHAPTERS || 80);

export async function list(lang, cursor, limiter) {
  const cl = cats(lang); let ci = cursor?.ci || 0, cont = cursor?.cont || null;
  while (ci < cl.length) {
    const j = await fetchJson(`${api(lang)}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cl[ci])}&cmtype=page&cmlimit=50&format=json&formatversion=2&origin=*${cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ''}`, limiter);
    const members = j.query?.categorymembers || [];
    const nextCont = j.continue?.cmcontinue || null;
    const next = nextCont ? { ci, cont: nextCont } : (ci + 1 < cl.length ? { ci: ci + 1, cont: null } : null);
    if (members.length || next === null) {
      const thumbs = await pageImages(lang, members.map((m) => m.title).filter((t) => !t.includes('/')), limiter);
      return { next, items: members.filter((m) => !m.title.includes('/')).map((m) => ({
        source_id: id, external_id: `${lang}:${m.title}`, title: m.title, title_norm: norm(m.title), author: null, author_norm: null, language: lang, cover_url: thumbs[m.title] || null,
        subjects: [], source_url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(m.title.replace(/ /g, '_'))}`, license: 'Wikisource (public domain / CC BY-SA)', wsTitle: m.title })) };
    }
    ci++; cont = null;   // empty category (name may not exist on this wiki): move on
  }
  return { next: null, items: [] };
}
export const qualify = () => null;

// Real poster/thumbnail from Wikimedia when the work page has an image (best effort, failures ignored).
async function pageImages(lang, titles, limiter) {
  const out = {};
  try {
    if (!titles.length) return out;
    const j = await fetchJson(`${api(lang)}?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(titles.join('|'))}&format=json&formatversion=2&origin=*`, limiter);
    for (const p of j.query?.pages || []) if (p.thumbnail?.source) out[p.title] = p.thumbnail.source;
  } catch { /* no covers this time */ }
  return out;
}
export { pageImages };

const parse = (lang, page, limiter) => fetchJson(`${api(lang)}?action=parse&page=${encodeURIComponent(page)}&prop=text|links&redirects=1&disableeditsection=1&format=json&formatversion=2&origin=*`, limiter, { timeout: 60000 });

export async function chapters(r, limiter) {
  const lang = r.language;
  const main = await parse(lang, r.wsTitle, limiter);
  const subs = [...new Set((main.parse?.links || []).filter((l) => l.exists !== false && l.ns === 0 && l.title.startsWith(r.wsTitle + '/')).map((l) => l.title))].slice(0, MAX_CHAPTERS);
  if (subs.length >= 2) {
    const out = [];
    for (const s of subs) {
      const ps = htmlToParagraphs((await parse(lang, s, limiter)).parse?.text);
      if (countWords(ps) >= 50) out.push({ number: out.length + 1, name: s.split('/').pop(), paragraphs: ps, split_method: 'source_subpages', ref: { page: s } });
    }
    return out;
  }
  const ps = htmlToParagraphs(main.parse?.text);
  return ps.length ? [{ number: 1, name: null, paragraphs: ps, split_method: 'single_section', ref: { page: r.wsTitle } }] : [];
}

/** Reader: fetch ONE chapter on demand (nothing is stored). r = { language, wsTitle }, ref = { page } */
export async function readChapter(r, ch, limiter) {
  const page = ch.ref?.page || r.wsTitle;
  const ps = htmlToParagraphs((await parse(r.language, page, limiter)).parse?.text);
  return { paragraphs: ps };
}
// Rebuild the adapter record from stored work_sources (external_id = '<lang>:<title>')
export const recordFromSource = (ws, lang) => { const i = ws.external_id.indexOf(':'); return { language: ws.external_id.slice(0, i) || lang, wsTitle: ws.external_id.slice(i + 1), external_id: ws.external_id }; };
