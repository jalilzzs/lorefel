// Internet Archive: ONLY items whose uploader declared a public-domain/CC0 licenseurl, or a Creative Commons licence that allows non-commercial
// redistribution (BY, BY-SA, BY-NC, BY-NC-SA; ND is refused). Two phases per language: 'cc' (modern 2000+ fiction first) then 'pd'.
import { fetchJson, fetchText, norm, normAuthor } from './core.mjs';
import { splitChapters } from './text.mjs';
import { processOcr } from './ocr.mjs';

export const id = 'archive';
export const rps = 0.7;
export const minWords = 3000;

const LANG = { ar: '(Arabic OR ara)', fr: '(French OR fre OR fra)', zh: '(Chinese OR chi OR zho)', en: '(English OR eng)' };
const first = (v) => (Array.isArray(v) ? v : v) || null;

const SUBJ_CC = {
  en: 'fantasy OR horror OR "science fiction" OR thriller OR mystery OR adventure OR fiction',
  fr: 'fantasy OR fantastique OR horreur OR "science-fiction" OR policier OR roman OR fiction',
  ar: 'رواية OR قصة OR فنتازيا OR رعب OR خيال',
  zh: '小说 OR 奇幻 OR 科幻 OR fiction',
};
const CC_ON = process.env.ARCHIVE_CC !== 'false';

export async function list(lang, cursor, limiter) {
  // Start with 'cc' (modern 2000+ fiction) first if enabled, then move to 'pd'
  const phase = cursor?.phase || (CC_ON ? 'cc' : 'pd');
  const page = cursor?.page || 1;

  const q = phase === 'cc'
    ? 'mediatype:texts AND language:' + LANG[lang] + ' AND year:[2000 TO 2030] AND licenseurl:*creativecommons.org* AND subject:(' + SUBJ_CC[lang] + ')'
    : 'mediatype:texts AND language:' + LANG[lang] + ' AND licenseurl:(*publicdomain* OR *cc0* OR *zero*) AND subject:(fiction OR novel OR roman OR رواية OR قصة OR 小说)';

  const params = new URLSearchParams({
    q: q,
    rows: '50',
    page: String(page),
    output: 'json',
  });
  ['identifier', 'title', 'creator', 'licenseurl', 'year', 'description'].forEach((f) => params.append('fl[]', f));
  params.append('sort[]', 'downloads desc');

  const url = 'https://archive.org' + String.fromCharCode(63) + params.toString();
  const j = await fetchJson(url, limiter);
  const docs = j.response?.docs || [];
  const more = page * 50 < (j.response?.numFound || 0) && docs.length;

  let next = null;
  if (more) {
    next = { phase, page: page + 1 };
  } else if (phase === 'cc') {
    next = { phase: 'pd', page: 1 };
  }

  return {
    next,
    items: docs.map((d) => {
      const title = first(d.title) || d.identifier;
      const author = first(d.creator);
      const lic = first(d.licenseurl);
      return {
        source_id: id,
        external_id: d.identifier,
        title,
        title_norm: norm(title),
        author,
        author_norm: author ? normAuthor(author) : null,
        language: lang,
        subjects: [],
        year: Number(String(first(d.year) || '').slice(0, 4)) || null,
        description: first(d.description) ? String(first(d.description)).slice(0, 1000) : null,
        licenseurl: lic,
        source_url: 'https://archive.org' + d.identifier,
        cover_url: 'https://archive.org' + d.identifier,
        license: 'Declared on archive.org: ' + lic,
      };
    }),
  };
}

const PD = /publicdomain|cc0|\/zero\//i;
const CC_OK = /creativecommons\.org\/licenses\/(by|by-sa|by-nc|by-nc-sa)\//i; // ND (no derivatives) is refused

export const qualify = (r) => {
  if (r.licenseurl && CC_OK.test(r.licenseurl) && r.year && r.year < 2000) return 'too_old_cc';
  return PD.test(r.licenseurl || '') || (CC_ON && CC_OK.test(r.licenseurl || '')) ? null : 'license_not_allowed';
};

export async function chapters(r, limiter) {
  const meta = await fetchJson('https://archive.org' + encodeURIComponent(r.external_id), limiter);
  const files = meta.files || [];
  // Prefer clean digital .txt for modern books, fallback to _djvu.txt for scanned books
  const f =
    files.find((x) => /\.txt$/i.test(x.name) && !/_djvu\.txt$/i.test(x.name)) ||
    files.find((x) => /_djvu\.txt$/i.test(x.name));

  if (!f) throw Object.assign(new Error('no_text_file'), { skip: true });
  if (Number(f.size) > 3_000_000) throw Object.assign(new Error('text_too_large'), { skip: true });

  const fileUrl = 'https://archive.org' + encodeURIComponent(r.external_id) + '/' + encodeURIComponent(f.name);
  const raw = (await fetchText(fileUrl, limiter, { tries: 3 })).replace(/\r\n?/g, '\n');

  const isScan = /_djvu\.txt$/i.test(f.name);
  if (isScan) {
    const { text, report } = processOcr(raw, r.language);
    r.ocr = report;
    if (!text) throw Object.assign(new Error('no_readable_text'), { skip: true });
    return splitChapters(text);
  } else {
    r.ocr = false;
    if (!raw || raw.trim().length < 2000) throw Object.assign(new Error('no_readable_text'), { skip: true });
    return splitChapters(raw);
  }
}

export const readBook = (r, limiter) => chapters(r, limiter);
export const recordFromSource = (ws, lang) => ({ external_id: ws.external_id, language: lang });
