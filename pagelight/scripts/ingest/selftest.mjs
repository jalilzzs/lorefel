import assert from 'node:assert/strict';
import { stripGutenberg, splitChapters, toParagraphs } from './text.mjs';
import { toRecord, qualifyMeta } from './gutendex.mjs';
import { norm, normAuthor, RateLimiter, withRetry } from './core.mjs';
const body = (n) => ('Lorem sentence about chapter. '.repeat(12) + '\nstill same paragraph line.\n\nSecond paragraph here. ' + 'word '.repeat(30));
const raw = `Header junk\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\nCONTENTS\n\nCHAPTER I.\n\nCHAPTER II.\n\nCHAPTER III.\n\n\nCHAPTER I.\n\n${body()}\n\nCHAPTER II.\n\n${body()}\n\nCHAPTER III.\n\n${body()}\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicense text`;
const ch = splitChapters(stripGutenberg(raw));
assert.equal(ch.length, 3); assert.equal(ch[0].split_method, 'source_headings'); assert.equal(ch[0].paragraphs.length, 2);
assert.ok(!ch[0].paragraphs[0].includes('\n')); assert.ok(!JSON.stringify(ch).includes('license text'));
// No headings => one honest section, never fake splits
const flat = splitChapters('Para one text.\n\nPara two text.\n\nPara three.'); assert.equal(flat.length, 1); assert.equal(flat[0].split_method, 'single_section');
assert.equal(splitChapters('').length, 0);
assert.equal(normAuthor('Austen, Jane'), 'jane austen'); assert.equal(norm('Émile (Vol. 1)'), 'emile');
const rec = toRecord({ id: 1, title: 'T', authors: [{ name: 'A, B' }], languages: ['en'], subjects: ['Fiction'], copyright: false, formats: { 'text/plain; charset=utf-8': 'http://x/1.txt' } });
assert.equal(qualifyMeta(rec), null); assert.equal(qualifyMeta({ ...rec, copyright: null }), 'copyright_unknown_or_true'); assert.equal(qualifyMeta({ ...rec, text_url: null }), 'no_text_format');
let n = 0; assert.equal(await withRetry(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { base: 1 }), 'ok');
const t0 = Date.now(); const rl = new RateLimiter(20); await rl.wait(); await rl.wait(); await rl.wait(); assert.ok(Date.now() - t0 >= 90);
console.log('ingest selftest: all assertions passed');
const md = await import('./mangadex.mjs');
const r = md.toRecord({ id: 'abc', attributes: { title: { en: 'Solo' }, originalLanguage: 'ko', status: 'completed', tags: [], description: { en: 'd' } }, relationships: [{ type: 'author', attributes: { name: 'Kim' } }] });
assert.equal(r.format, 'manhwa'); assert.equal(r.status, 'completed'); assert.equal(md.toRecord({ id: 'x', attributes: { title: { en: 'T' }, originalLanguage: 'fr' } }).format, null);
console.log('mangadex mapping ok');

const fr = (n) => ('Une phrase du chapitre. '.repeat(12) + '\n\nDeuxieme paragraphe ici. ' + 'mot '.repeat(30));
const frTxt = `CHAPITRE I\n\n${fr()}\n\nCHAPITRE II\n\n${fr()}\n\nCHAPITRE III\n\n${fr()}`;
assert.equal(splitChapters(frTxt).length, 3);
assert.equal(qualifyMeta({ ...rec, language: 'ar' }), null);
console.log('fr/ar ok');
const { htmlToParagraphs, decode } = await import('./html.mjs');
const ps = htmlToParagraphs('<div class="navbox"><table><tr><td><p>nav</p></td></tr></table></div><p>مرحبا &amp; <b>أهلاً</b><sup class="r">[1]</sup> بالعالم</p><style>p{}</style><p>Second&nbsp;one &#8217;x</p><p> </p>');
assert.deepEqual(ps, ['مرحبا & أهلاً بالعالم', 'Second one ’x']);
const ar = await import('./archive.mjs');
assert.equal(ar.qualify({ licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/' }), null);
assert.equal(ar.qualify({ licenseurl: 'https://creativecommons.org/licenses/by-nc/4.0/' }), 'license_not_public_domain');
assert.equal(ar.qualify({}), 'license_not_public_domain');
console.log('html/archive ok');
const ocr = await import('./ocr.mjs');
const base = ('مدرسة جميلة كبيرة في المدينة القديمة ').repeat(12);
const arTxt = base + 'ذهب الطالب الى مدرشة الحي. ' + base + 'قرأ الكتاب الجديد. ' + base;
const fixed = ocr.correctText(arTxt);
assert.ok(fixed.text.includes('الى مدرسة الحي') && fixed.corrections >= 1, 'arabic confusion fix');
const en = ('mother father brother sister ').repeat(10) + 'and rnother came ' + ('mother ').repeat(3) + 'zxqvk';
const fe = ocr.correctText(en); assert.ok(fe.text.includes('and mother came'), 'rn->m'); assert.ok(fe.text.includes('zxqvk'), 'unknown word untouched');
assert.ok(!ocr.correctText('Paris Paris Paris Paris Paris Parls x').text.includes('Parls Paris'.replace('Parls','Pari1')), 'sanity');
const cl = ocr.cleanText('Chapitre\n\n12\n\n------\n\nUne phrase nor-\nmale ici.\n', 'fr'); assert.ok(cl.includes('normale') && !/^12$/m.test(cl));
const bad = ocr.processOcr('~~ ^^ __ ##\n'.repeat(300), 'en'); assert.equal(bad.text, null);
const ok = ocr.processOcr((base + '\n\n').repeat(40), 'ar'); assert.ok(ok.text && ['good', 'fair', 'poor'].includes(ok.report.quality));
console.log('ocr ok', ok.report.quality);

// reader (on-demand chapters, nothing stored) + enrichment matching
{
  const B = () => ('Une phrase du chapitre. '.repeat(12) + '\n\nDeuxieme paragraphe ici. ' + 'mot '.repeat(30));
  const book = `*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\nCHAPITRE I\n\n${B()}\n\nCHAPITRE II\n\n${B()}\n\nCHAPITRE III\n\n${B()}\n*** END OF THE PROJECT GUTENBERG EBOOK X ***`;
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (u) => { calls++; return String(u).includes('pg42.txt') ? new Response(book, { status: 200 }) : new Response('x', { status: 404 }); };
  const rows = { '1:2': { id: 9, name: 'CHAPITRE II', number: 2, is_real: true, source_id: 'gutendex', work_id: 5 } };
  const works = { 5: { language: 'fr', work_sources: [{ source_id: 'gutendex', external_id: '42' }] } };
  const db = { from: (t) => { const f = {}; const q = { select: () => q, eq: (k, v) => { f[k] = v; return q; }, maybeSingle: async () => ({ data: t === 'chapters' ? rows[`${f.title_id}:${f.number}`] ?? null : works[f.id] ?? null, error: null }) }; return q; } };
  const { readChapter } = await import('./reader.mjs');
  const a = await readChapter(db, 1, 2); assert.equal(a.paras.length, 2);
  const c = calls; await readChapter(db, 1, 2); assert.equal(calls, c, 'cached');
  assert.equal(await readChapter(db, 1, 3), null);
  globalThis.fetch = realFetch;
  const { pickOpenLibrary, pickJikan } = await import('./enrich.mjs');
  const w1 = { title_norm: 'les miserables', author_norm: 'victor hugo' };
  assert.ok(pickOpenLibrary(w1, [{ title: 'Les Misérables', author_name: ['Victor Hugo'] }])); assert.equal(pickOpenLibrary(w1, [{ title: 'Les Misérables', author_name: ['X'] }]), null);
  assert.ok(pickJikan({ title_norm: 'solo leveling' }, [{ title: 'A', title_english: 'Solo Leveling' }])); assert.equal(pickJikan({ title_norm: 'solo leveling' }, [{ title: 'B' }]), null);
  console.log('reader/enrich ok');
}
