// Turn raw source text into real chapters + paragraphs WITHOUT inventing structure.
// Chapters come only from headings present in the text. No headings -> ONE section.
const START = /\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i;
const END = /\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;

export function stripGutenberg(raw) {
  let t = raw.replace(/\r\n?/g, '\n');
  const s = t.match(START); if (s) t = t.slice(s.index + s[0].length);
  const e = t.search(END); if (e >= 0) t = t.slice(0, e);
  return t.trim();
}

const ROMAN = '[IVXLCDM]+';
const HEADING = new RegExp(
  `^\\s*(?:(?:CHAPTER|Chapter|CHAP\\.|BOOK|Book|PART|Part|LETTER|Letter|STAVE|Stave|CHAPITRE|Chapitre|LIVRE|Livre|PARTIE|Partie)\\s+(?:${ROMAN}|\\d+|[A-Z][a-z]+(?:-[a-z]+)?)\\b[.:]?.{0,80}|(?:${ROMAN}|\\d{1,3})\\.\\s*$)\\s*$`);

export function toParagraphs(block) {
  return block.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
}

/** returns [{number,name,paragraphs[],split_method}] */
export function splitChapters(text) {
  const lines = text.split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.length < 90 && HEADING.test(L) && (i === 0 || lines[i - 1].trim() === '') && (lines[i + 1] ?? '').trim() === '') marks.push(i);
  }
  // Table-of-contents guard: drop marks followed by another heading within 6 lines.
  const wc = (from, to) => lines.slice(from, to).join(' ').split(/\s+/).filter(Boolean).length;
  const real = marks.filter((m, k) => !(marks[k + 1] !== undefined && marks[k + 1] - m < 7 && wc(m + 1, marks[k + 1]) < 30));
  const wordCount = (ps) => ps.reduce((n, p) => n + p.split(/\s+/).length, 0);
  if (real.length < 3) {
    const ps = toParagraphs(text);
    return ps.length ? [{ number: 1, name: null, paragraphs: ps, split_method: 'single_section' }] : [];
  }
  const out = [];
  real.forEach((m, k) => {
    const end = real[k + 1] ?? lines.length;
    const name = lines[m].trim();
    // optional subtitle line directly after heading
    const body = lines.slice(m + 1, end).join('\n');
    const ps = toParagraphs(body);
    if (wordCount(ps) >= 50) out.push({ number: out.length + 1, name, paragraphs: ps, split_method: 'source_headings' });
  });
  return out.length >= 2 ? out : [{ number: 1, name: null, paragraphs: toParagraphs(text), split_method: 'single_section' }];
}
