// OCR cleanup + self-lexicon spell correction. Never invents text: a word is changed ONLY when
//   (a) it occurs once in the book, (b) one visually-confusable character swap turns it into a word that occurs >= 5x in the same book.
// Every correction is counted and sampled so it can be audited (stored in work_sources.raw_meta.ocr).
const TASHKEEL = /[ً-ٰٟ]/g;
const AR_CLASSES = ['بتثني', 'ىيئ', 'جحخ', 'دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق', 'هة', 'اأإآ', 'وؤ'];
const LAT_CLASSES = ['l1Ii|', '0oO', 'ec', 'ao', 'un', 'hb', 'vy', 'fl', 'iï', 'eéèêë', 'aàâä', 'uùûü', 'oôö', 'cç'];
const subsFor = (ch) => {
  const out = [];
  for (const cls of AR_CLASSES) if (cls.includes(ch)) out.push(...[...cls].filter((c) => c !== ch));
  for (const cls of LAT_CLASSES) if (cls.includes(ch)) out.push(...[...cls].filter((c) => c !== ch));
  return out;
};
const TOKEN = /[\p{L}\p{M}]+/gu;
const key = (w) => w.replace(TASHKEEL, '');
const isLetter = (c) => /\p{L}/u.test(c);

export function cleanText(raw, lang) {
  let t = raw.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[​-‏‪-‮﻿­]/g, '').replace(/\f/g, '\n\n');
  t = t.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl');
  if (lang === 'ar') t = t.replace(/ـ+/g, '').replace(/ی/g, 'ي').replace(/ک/g, 'ك').replace(/ہ/g, 'ه');
  if (lang === 'en' || lang === 'fr') t = t.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');           // re-join hyphenated line breaks
  let lines = t.split('\n').map((l) => l.replace(/[|¦~^_]{2,}/g, ' ').replace(/[ \t]+/g, ' ').trim());
  // running headers/footers: short identical lines repeated many times
  const cnt = new Map(); for (const l of lines) if (l && l.length < 60) cnt.set(l, (cnt.get(l) || 0) + 1);
  lines = lines.filter((l) => {
    if (!l) return true;
    const letters = [...l].filter(isLetter).length;
    if (/^[\d\s.\-–—*•·=_]+$/.test(l)) return false;                                            // page numbers, rules
    if (l.length < 4 && letters / l.length < 0.5) return false;
    if (letters / l.length < 0.35 && l.length < 40) return false;                              // symbol noise lines
    if ((cnt.get(l) || 0) >= 6 && l.length < 60 && !/[.!?؟。]$/.test(l)) return false;
    return true;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function correctText(text) {
  const freq = new Map();
  for (const m of text.matchAll(TOKEN)) { const k = key(m[0]); freq.set(k, (freq.get(k) || 0) + 1); }
  const memo = new Map(); const samples = []; let corrections = 0;
  const fix = (w) => {
    const k = key(w);
    if (k.length < 4 || k.length > 20 || (freq.get(k) || 0) !== 1) return w;
    if (/^\p{Lu}/u.test(k)) return w;                                                           // proper nouns untouched
    if (memo.has(k)) return memo.get(k);
    let best = null, bf = 4;                                                                     // candidate must occur >= 5 times
    const chars = [...k];
    for (let i = 0; i < chars.length; i++) for (const s of subsFor(chars[i])) {
      const cand = chars.slice(0, i).join('') + s + chars.slice(i + 1).join(''); const f = freq.get(cand) || 0;
      if (f > bf) { best = cand; bf = f; }
    }
    for (const [a, b] of [['rn', 'm'], ['m', 'rn'], ['cl', 'd'], ['vv', 'w']]) {                  // multi-char Latin confusions
      let at = k.indexOf(a); while (at >= 0) { const cand = k.slice(0, at) + b + k.slice(at + a.length); const f = freq.get(cand) || 0; if (f > bf) { best = cand; bf = f; } at = k.indexOf(a, at + 1); }
    }
    memo.set(k, best ?? w);
    return best ?? w;
  };
  const out = text.replace(TOKEN, (w) => { const r = fix(w); if (r !== w) { corrections++; if (samples.length < 25) samples.push([w, r]); } return r; });
  return { text: out, corrections, samples };
}

export function quality(text) {
  const nonSpace = text.replace(/\s/g, '').length || 1, letters = (text.match(/\p{L}/gu) || []).length;
  const toks = text.match(TOKEN) || []; const f = new Map(); for (const w of toks) f.set(key(w), (f.get(key(w)) || 0) + 1);
  const repeat = toks.length ? toks.filter((w) => f.get(key(w)) > 1).length / toks.length : 0;
  const lr = letters / nonSpace;
  const label = lr >= 0.85 && repeat >= 0.9 ? 'good' : lr >= 0.7 && repeat >= 0.75 ? 'fair' : 'poor';
  return { letters: +lr.toFixed(3), repeat: +repeat.toFixed(3), label, tokens: toks.length };
}

/** raw OCR -> { text, report } ; returns null text only when there is practically no letter content at all. */
export function processOcr(raw, lang) {
  const cleaned = cleanText(raw, lang);
  const before = quality(cleaned);
  if (before.letters < 0.35 || before.tokens < 200) return { text: null, report: { ...before, rejected: 'no_readable_text' } };
  const { text, corrections, samples } = correctText(cleaned);
  const after = quality(text);
  return { text, report: { quality: after.label, letters: after.letters, repeat: after.repeat, tokens: after.tokens, corrections, samples, quality_before: before.label } };
}
