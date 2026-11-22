// Internet Archive: ONLY items whose uploader declared a public-domain/CC0 licenseurl. OCR text (djvu), so quality is checked.
import { fetchJson, fetchText, norm, normAuthor } from './core.mjs';
import { splitChapters } from './text.mjs';
import { processOcr } from './ocr.mjs';
export const id = 'archive';
export const rps = 0.7;
export const minWords = 3000;
const LANG = { ar: '(Arabic OR ara)', fr: '(French OR fre OR fra)', zh: '(Chinese OR chi OR zho)', en: '(English OR eng)' };
const first = (v) => (Array.isArray(v) ? v[0] : v) || null;

export async function list(lang, cursor, limiter) {
  const page = cursor?.page || 1;
  const q = `mediatype:texts AND language:${LANG[lang]} AND licenseurl:(*publicdomain* OR *cc0* OR *zero*) AND subject:(fiction OR novel OR roman OR رواية OR قصة OR 小说)`;
  const j = await fetchJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=year&fl[]=description&sort[]=downloads+desc&rows=50&page=${page}&output=json`, limiter);
  const docs = j.response?.docs || [];
  return { next: page * 50 < (j.response?.numFound || 0) && docs.length ? { page: page + 1 } : null, items: docs.map((d) => {
    const title = first(d.title) || d.identifier, author = first(d.creator);
    return { source_id: id, external_id: d.identifier, title, title_norm: norm(title), author, author_norm: author ? normAuthor(author) : null, language: lang, subjects: [],
      year: Number(first(d.year)) || null, description: first(d.description) ? String(first(d.description)).slice(0, 1000) : null,
      licenseurl: first(d.licenseurl), source_url: `https://archive.org/details/${d.identifier}`, cover_url: `https://archive.org/services/img/${d.identifier}`, license: `Declared on archive.org: ${first(d.licenseurl)}` };
  }) };
}
export const qualify = (r) => (/publicdomain|cc0|\/zero\//i.test(r.licenseurl || '') ? null : 'license_not_public_domain');

export async function chapters(r, limiter) {
  const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(r.external_id)}`, limiter);
  const f = (meta.files || []).find((x) => /_djvu\.txt$/i.test(x.name));
  if (!f) throw Object.assign(new Error('no_text_file'), { skip: true });
  if (Number(f.size) > 3_000_000) throw Object.assign(new Error('text_too_large'), { skip: true });
  const raw = (await fetchText(`https://archive.org/download/${encodeURIComponent(r.external_id)}/${encodeURIComponent(f.name)}`, limiter, { tries: 3 })).replace(/\r\n?/g, '\n');
  // Poor scans / handwriting are KEPT (flagged), only text with practically no letters is dropped.
  const { text, report } = processOcr(raw, r.language);
  r.ocr = report;
  if (!text) throw Object.assign(new Error('no_readable_text'), { skip: true });
  return splitChapters(text);
}
export const readBook = (r, limiter) => chapters(r, limiter);
export const recordFromSource = (ws, lang) => ({ external_id: ws.external_id, language: lang });
