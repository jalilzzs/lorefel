export const cx = (...a) => a.filter(Boolean).join(' ')
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export const rpick = (r, arr) => arr[Math.floor(r() * arr.length)]
export function rshuffle(r, arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d }
}
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota */ } }

export const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n))
export const dayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

export function downloadFile(name, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const LOCALES = { en: 'en-US', fr: 'fr-FR', ar: 'ar', zh: 'zh-CN' }
export const localeOf = (lang) => LOCALES[lang] || 'en-US'
export function timeAgo(ts, lang = 'en') {
  const diff = (ts - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' })
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u)
  return rtf.format(Math.round(diff), 'second')
}
export const fmtDate = (ts, lang = 'en', opts = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(localeOf(lang), opts).format(new Date(ts))
export const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`)
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const escapeXml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
export const prettify = (id) => String(id).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function toCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}
export function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0])
}
