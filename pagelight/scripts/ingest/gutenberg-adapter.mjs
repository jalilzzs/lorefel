import { fetchBuffer } from './core.mjs';
import { firstPageUrl, listPage, qualifyMeta, fetchChapters } from './gutendex.mjs';
export const id = 'gutendex';
export const rps = 0.5;
export const minWords = 1000;
export async function list(lang, cursor, limiter) {
  const p = await listPage(cursor?.next || firstPageUrl(lang), limiter);
  return { next: p.next ? { next: p.next } : null, items: p.items.map((r) => ({ ...r, cover_url: null, license: 'Public domain in the USA (Project Gutenberg)' })) };
}
export const qualify = qualifyMeta;
export const chapters = fetchChapters;
// Reader: same download + same splitter as at import time, so chapter numbers always match. Cached by the reader.
export const readBook = (r, limiter) => fetchChapters(r, limiter);
export const recordFromSource = (ws, lang) => ({ external_id: ws.external_id, language: lang });

// Cover is fetched from an official MIRROR (never hot-linked from www.gutenberg.org) and re-hosted in our own storage.
export async function cover(r, limiter) {
  const mirrors = (process.env.GUTENBERG_MIRRORS || 'https://aleph.gutenberg.org,https://gutenberg.pglaf.org').split(',').map((m) => m.trim().replace(/\/$/, '')).filter(Boolean);
  for (const m of mirrors) { try { return await fetchBuffer(`${m}/cache/epub/${r.external_id}/pg${r.external_id}.cover.medium.jpg`, limiter); } catch { /* next */ } }
  return null;
}
