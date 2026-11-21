// Minimal HTML -> paragraphs (Wikisource parse output). Only <p> blocks are kept: navigation boxes, tables and headers are dropped.
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return ENT[e.toLowerCase()] ?? ' ';
});
export function htmlToParagraphs(html = '') {
  const clean = html.replace(/<(style|script|table)[\s\S]*?<\/\1>/gi, ' ').replace(/<sup[\s\S]*?<\/sup>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of clean.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = decode(m[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (t.length >= 2) out.push(t);
  }
  return out;
}
export const countWords = (ps) => ps.reduce((n, p) => n + p.split(/\s+/).filter(Boolean).length, 0);
