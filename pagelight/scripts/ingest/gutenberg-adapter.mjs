import { firstPageUrl, listPage, qualifyMeta, fetchChapters } from './gutendex.mjs';
export const id = 'gutendex';
export const rps = 0.5;
export const minWords = 1000;
export async function list(lang, cursor, limiter) {
  const p = await listPage(cursor?.next || firstPageUrl(lang), limiter);
  return { next: p.next ? { next: p.next } : null, items: p.items.map((r) => ({ ...r, license: 'Public domain in the USA (Project Gutenberg)' })) };
}
export const qualify = qualifyMeta;
export const chapters = fetchChapters;
