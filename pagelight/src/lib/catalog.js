// Catalog service layer: a deterministic 100,000-title demo catalog + Supabase-backed live mode.
// All UI code talks to `catalog.*` and never cares which backend answers.
import { mulberry32, lsGet, lsSet, escapeXml, hash } from './util'
import { isLive, supabase } from './supabase'
import { importFromSources, SOURCES } from './sources'

export const CATALOG_SIZE = 100000
export const GENRES = ['action', 'fantasy', 'romance', 'thriller', 'mystery', 'scifi', 'historical', 'sliceoflife', 'horror', 'drama', 'wuxia', 'xianxia', 'litrpg', 'psychological', 'comedy', 'sports', 'supernatural', 'isekai', 'adventure', 'school', 'mecha', 'tragedy']
export const FORMATS = ['novel', 'manhwa', 'manga']
export const STORY_LANGS = ['en', 'fr', 'ar', 'zh']
export const STATUSES = ['ongoing', 'completed', 'hiatus']
export const WARNING_TAGS = ['violence', 'gore', 'sexual-content', 'nudity', 'self-harm', 'abuse', 'profanity']
export const TROPE_TAGS = ['reincarnation', 'overpowered-mc', 'revenge', 'magic-academy', 'villainess', 'time-travel', 'dungeon', 'cultivation', 'politics', 'war', 'slow-burn', 'found-family', 'harem', 'tournament']
export const ARCHETYPES = ['reluctant-hero', 'strategist', 'rogue', 'chosen-one', 'anti-hero', 'prodigy', 'wanderer', 'schemer', 'guardian', 'underdog']
export const SORTS = ['popular', 'rating', 'trending', 'new', 'updated', 'az']
export const LIST_STATUSES = ['reading', 'plan', 'completed', 'hold', 'dropped']

const ADJ = ['Crimson', 'Hollow', 'Silent', 'Ember', 'Iron', 'Pale', 'Gilded', 'Wandering', 'Veiled', 'Last', 'Midnight', 'Radiant', 'Forsaken', 'Sable', 'Verdant', 'Obsidian', 'Frozen', 'Hidden', 'Scarlet', 'Azure', 'Broken', 'Eternal', 'Silver', 'Thorned', 'Distant', 'Whispering', 'Burning', 'Nameless', 'Ivory', 'Storm-born']
const NOUN = ['Throne', 'Oath', 'Garden', 'Blade', 'Archive', 'Tide', 'Lantern', 'Crown', 'Covenant', 'Cipher', 'Orchard', 'Citadel', 'Requiem', 'Compass', 'Eclipse', 'Harbor', 'Mirror', 'Sonata', 'Frontier', 'Labyrinth', 'Phoenix', 'Dynasty', 'Serpent', 'Library', 'Bell', 'Raven', 'Empire', 'Dream', 'Star', 'Contract']
const PLACE = ['Aldermoor', 'Kharos', 'Seoyeon', 'Tianxu', 'Velmara', 'Nightharbor', 'Sunreach', 'Ironvale', 'Yoru', 'Marrowgate', 'Qalat', 'Everfen', 'Lunaria', 'Hanseong', 'Brightmere', 'Dorne']
const ROLE = ['Duke', 'Archmage', 'Swordsman', 'Empress', 'Alchemist', 'Detective', 'Apprentice', 'Healer', 'Assassin', 'Librarian', 'Heir', 'Knight', 'Villainess', 'Tutor', 'Champion', 'Cultivator']
const VERB = ['Stole', 'Burned', 'Outlived', 'Betrayed', 'Forgot', 'Married', 'Rewrote', 'Defied', 'Sealed', 'Inherited']
const HOOKS = ['A disgraced swordswoman wakes in a body ten years younger.', 'A night-shift archivist discovers the library is rewriting itself.', 'The weakest disciple of a dying sect finds a voice inside his sword.', 'A villainess realises she is trapped inside the novel she once mocked.', 'A courier who cannot be remembered by anyone delivers one fateful letter.', 'A prodigy chess master is summoned to a world run by game rules.', 'Twin heirs swap places on the eve of a royal funeral.', 'A tired detective inherits a cursed lighthouse and its ghostly clients.', 'A rookie cultivator swallows a forbidden pill and ages backwards.', 'A transfer student notices everyone in class shares one dream.', 'A retired hero is forced to train the demon lord\'s daughter.', 'A cartographer maps a city that only exists at midnight.', 'A mercenary company is hired to guard a bride who is not human.', 'A salaryman is reborn as the final boss\'s overworked secretary.', 'A healer discovers her gift only works on those who will die.', 'An orphan climbs a tower where every floor rewrites his memories.']
const CONFLICT = ['Old oaths collide with new ambitions as three factions close in.', 'Every ally carries a secret that could end the world — or save it.', 'A rival with an identical past stays one step ahead at every turn.', 'The rules of power demand a price no one is willing to name.', 'Court intrigue and quiet betrayals blur the line between friend and foe.', 'Each victory unlocks a darker truth about who built the system.', 'A sealed war resurfaces and the survivors refuse to stay silent.', 'Hunted by the guild he built, he must trust the people he wronged.', 'The deeper the mystery goes, the more the clues point inward.', 'Dreams leak into daylight and promises made there begin to bind.']
const STAKES = ['Now one choice will decide who gets to write the ending.', 'If she fails, the last light of the kingdom goes out.', 'Time is running out, and so is the cost of forgiveness.', 'What remains is a fragile hope, a borrowed name, and a very long road.', 'The final page is not yet written — and it is hungry.', 'Only by becoming the monster can he protect what he loves.', 'Love, loyalty and revenge pull in three different directions.', 'The truth is waiting at the end of the chapter that was never published.']
const NAMES = {
  KR: { f: ['Seo-jun', 'Ha-eun', 'Min-ji', 'Do-yoon', 'Ji-woo', 'Yeon-seok', 'Soo-ah', 'Tae-hyun'], l: ['Han', 'Kim', 'Park', 'Yoon', 'Jang', 'Choi', 'Baek'] },
  JP: { f: ['Aoi', 'Sora', 'Ren', 'Haruka', 'Kaito', 'Mio', 'Yuki', 'Daichi'], l: ['Tachibana', 'Minami', 'Kuroda', 'Hoshino', 'Mizuno', 'Arata', 'Sakamoto'] },
  CN: { f: ['Wei', 'Lian', 'Xiu', 'Ming', 'Jun', 'Yan', 'Hao', 'Ling'], l: ['Liang', 'Chen', 'Zhou', 'Lu', 'Shen', 'Gu', 'Fang'] },
  US: { f: ['Marcus', 'Elena', 'Jonah', 'Tessa', 'Rowan', 'Iris', 'Callum', 'Nora'], l: ['Vale', 'Hart', 'Quill', 'Mercer', 'Ashby', 'Rowe', 'Locke'] },
  FR: { f: ['Mireille', 'Étienne', 'Camille', 'Lucien', 'Océane', 'Baptiste', 'Solène', 'Thibault'], l: ['Dorsay', 'Lefèvre', 'Marchand', 'Aubert', 'Delcourt', 'Vasseur'] },
  AR: { f: ['Layla', 'Yara', 'Omar', 'Samir', 'Nour', 'Zaid', 'Rania', 'Khalid'], l: ['Haddad', 'Nasser', 'Mansour', 'Farouk', 'Sabbagh', 'Khoury'] },
}
export const NAME_POOLS = NAMES
const CURATED = [
  { title: 'The Ink-Bound Crown', author: 'Mireille Dorsay', format: 'novel', genres: ['fantasy', 'drama', 'adventure'], status: 'ongoing', year: 2021, rating: 4.82, synopsis: 'A bookbinder\'s apprentice discovers that every crown in the realm is bound in a living manuscript — and hers is still being written.' },
  { title: 'Reborn as the Ashen Duke', author: 'Han Seo-jun', format: 'manhwa', genres: ['action', 'fantasy', 'isekai'], status: 'ongoing', year: 2022, rating: 4.71, synopsis: 'Executed on a stormy night, a general wakes inside the body of the empire\'s most hated duke — with one year to undo his own downfall.' },
  { title: 'Midnight Bell Detective Club', author: 'Aoi Tachibana', format: 'manga', genres: ['mystery', 'school', 'supernatural'], status: 'ongoing', year: 2023, rating: 4.66, synopsis: 'Every night at 12:00 the school bell rings once — and someone disappears from the class register. Five students investigate.' },
  { title: 'The Cartographer of Ninth Rain', author: 'Layla Haddad', format: 'novel', genres: ['fantasy', 'historical', 'adventure'], status: 'completed', year: 2018, rating: 4.9, synopsis: 'A desert mapmaker is hired to chart a river that has not flowed for three hundred years.' },
  { title: 'Cloud-Piercing Sword Saint', author: 'Liang Wei', format: 'novel', genres: ['wuxia', 'xianxia', 'action'], status: 'ongoing', year: 2019, rating: 4.58, synopsis: 'From a mountain village blacksmith to the sword saint who split the heavens — one forged blade at a time.' },
  { title: 'My Villainess Contract Has a Loophole', author: 'Min-ji Park', format: 'manhwa', genres: ['romance', 'comedy', 'drama'], status: 'ongoing', year: 2023, rating: 4.62, synopsis: 'Reincarnated as the novel\'s doomed villainess, Elise reads the fine print on fate itself.' },
  { title: 'Static Hearts, Silent Stars', author: 'Sora Minami', format: 'manga', genres: ['scifi', 'romance', 'drama'], status: 'completed', year: 2020, rating: 4.74, synopsis: 'Two radio operators on opposite ends of a dying colony ship fall in love over a failing signal.' },
  { title: 'Dungeon Librarian', author: 'Marcus Vale', format: 'novel', genres: ['litrpg', 'fantasy', 'comedy'], status: 'ongoing', year: 2022, rating: 4.51, synopsis: 'When the dungeon\'s knowledge floor needs a librarian, the least-qualified applicant gets the job — and the system\'s attention.' },
  { title: 'Tournament of Tomorrow', author: 'Daichi Sakamoto', format: 'manga', genres: ['sports', 'drama', 'comedy'], status: 'ongoing', year: 2021, rating: 4.47, synopsis: 'A bench-warmer with perfect timing joins the last-place volleyball club in the country.' },
  { title: 'Hollow Orchard', author: 'Camille Aubert', format: 'novel', genres: ['horror', 'psychological', 'mystery'], status: 'completed', year: 2017, rating: 4.4, synopsis: 'Every tree in the family orchard bears fruit shaped like a different missing person.', mature: false },
  { title: 'The Regressor\'s Quiet Retirement', author: 'Do-yoon Kim', format: 'manhwa', genres: ['action', 'sliceoflife', 'comedy'], status: 'ongoing', year: 2024, rating: 4.69, synopsis: 'After saving the world nine times, he only wants a small bakery — but the tower keeps sending challengers.' },
  { title: 'Ashes of the Velvet Court', author: 'Nora Hart', format: 'novel', genres: ['romance', 'thriller', 'historical'], status: 'ongoing', year: 2020, rating: 4.55, synopsis: 'A royal poisoner and a royal taster fall for each other in a court where trust is the deadliest dish.', mature: true },
]

let ALL = null
let BYID = new Map()
let ORDERS = {}
let OVERLAY = lsGet('pl:overlay', { deleted: [], edits: {}, extras: [], chapters: {} })
let DELETED = new Set(OVERLAY.deleted)

const sorted = (r, base, n) => {
  const a = new Set()
  while (a.size < n) a.add(base[Math.floor(r() * base.length)])
  return [...a]
}
function weightedGenres(r, format) {
  const pool = {
    novel: ['fantasy', 'fantasy', 'romance', 'mystery', 'thriller', 'scifi', 'historical', 'drama', 'wuxia', 'xianxia', 'litrpg', 'horror', 'psychological', 'adventure', 'tragedy', 'supernatural', 'comedy', 'action'],
    manhwa: ['action', 'action', 'fantasy', 'fantasy', 'romance', 'romance', 'drama', 'isekai', 'isekai', 'litrpg', 'thriller', 'supernatural', 'comedy', 'sliceoflife', 'horror', 'school', 'psychological', 'tragedy'],
    manga: ['action', 'action', 'adventure', 'comedy', 'school', 'school', 'sports', 'sliceoflife', 'romance', 'mecha', 'supernatural', 'horror', 'mystery', 'scifi', 'fantasy', 'drama', 'psychological', 'isekai'],
  }[format]
  return sorted(r, pool, 2 + Math.floor(r() * 2))
}

function gen(i) {
  const r = mulberry32(Math.imul(i, 2654435761) ^ 0x9e3779b9)
  const f = r()
  const format = f < 0.4 ? 'novel' : f < 0.7 ? 'manhwa' : 'manga'
  const origin = format === 'manhwa' ? (r() < 0.85 ? 'KR' : 'CN') : format === 'manga' ? 'JP' : ['US', 'US', 'FR', 'AR', 'CN', 'KR', 'JP'][Math.floor(r() * 7)]
  const lr = r()
  const lang = format === 'novel' ? (origin === 'FR' ? 'fr' : origin === 'AR' ? 'ar' : origin === 'CN' ? 'zh' : 'en') : lr < 0.62 ? 'en' : lr < 0.77 ? 'fr' : lr < 0.87 ? 'ar' : 'zh'
  const pa = NAMES[origin]
  const author = `${pa.f[Math.floor(r() * pa.f.length)]} ${pa.l[Math.floor(r() * pa.l.length)]}`
  const A = ADJ[Math.floor(r() * ADJ.length)], N = NOUN[Math.floor(r() * NOUN.length)], N2 = NOUN[Math.floor(r() * NOUN.length)]
  const P = PLACE[Math.floor(r() * PLACE.length)], R = ROLE[Math.floor(r() * ROLE.length)], V = VERB[Math.floor(r() * VERB.length)]
  const pat = Math.floor(r() * (format === 'manhwa' ? 7 : 6))
  const title = [`${A} ${N}`, `The ${N} of ${P}`, `${P}'s ${A} ${N}`, `${R} of the ${A} ${N}`, `The ${R} Who ${V} the ${N}`, `${N} & ${N2}`, `Reborn as the ${A} ${R}`][pat]
  const genres = weightedGenres(r, format)
  const tags = []
  for (const w of WARNING_TAGS) if (r() < 0.045) tags.push(w)
  for (const w of TROPE_TAGS) if (r() < 0.12) tags.push(w)
  const mature = (tags.includes('sexual-content') || tags.includes('nudity') || tags.includes('gore')) && r() < 0.75
  const rating = Math.round((3.2 + ((r() + r() + r()) / 3) * 1.7) * 100) / 100
  const votes = Math.floor(10 ** (1.5 + r() * 3.7))
  const chapters = Math.max(6, Math.floor(10 ** ((format === 'manga' ? 0.9 : 1) + r() * (format === 'manga' ? 1.9 : 2.3))))
  const sr = r()
  const status = chapters < 60 ? (sr < 0.7 ? 'completed' : 'ongoing') : sr < 0.55 ? 'ongoing' : sr < 0.9 ? 'completed' : 'hiatus'
  const year = 2005 + Math.floor(r() * 22)
  const velocity = Math.round(Math.pow(r(), 2.2) * 100)
  const updatedDays = status === 'ongoing' ? Math.floor(r() * r() * 21) : Math.floor(r() * 400) + 5
  return {
    id: i, title, tl: title.toLowerCase(), author, format, status, year, rating, votes, chapters, lang, origin, genres, tags,
    mature, velocity, updatedDays, hue: Math.floor(r() * 360), pa: Math.floor(r() * ARCHETYPES.length),
    sa: Math.floor(r() * HOOKS.length), sb: Math.floor(r() * CONFLICT.length), sc: Math.floor(r() * STAKES.length),
    translator: lang === 'en' && origin !== 'US' ? `${NAMES.US.f[Math.floor(r() * 8)]} ${NAMES.US.l[Math.floor(r() * 7)]}` : null,
  }
}

function applyOverlay() {
  for (const [id, patch] of Object.entries(OVERLAY.edits)) {
    const t = byId(+id)
    if (t) Object.assign(t, patch, patch.title ? { tl: patch.title.toLowerCase() } : {})
  }
}

function ensure() {
  if (ALL) return ALL
  ALL = new Array(CATALOG_SIZE)
  for (let i = 1; i <= CATALOG_SIZE; i++) ALL[i - 1] = gen(i)
  CURATED.forEach((c, idx) => {
    const t = ALL[idx]
    Object.assign(t, c, { tl: c.title.toLowerCase(), votes: 20000 + idx * 7300, chapters: c.status === 'completed' ? 180 + idx * 9 : 240 + idx * 31, velocity: 92 - idx * 4, updatedDays: idx % 4, lang: 'en', mature: !!c.mature, tags: c.mature ? ['sexual-content', 'violence'] : ['slow-burn'], translator: null })
  })
  for (const e of OVERLAY.extras) { const t = { ...e, tl: e.title.toLowerCase() }; ALL.push(t); BYID.set(t.id, t) }
  applyOverlay()
  return ALL
}
function byId(id) {
  ensure()
  if (id >= 1 && id <= CATALOG_SIZE) return ALL[id - 1]
  return BYID.get(id)
}
const popScore = (t) => t.votes
const bayes = (t) => (t.rating * t.votes + 3.6 * 80) / (t.votes + 80)
function order(sort) {
  ensure()
  if (!ORDERS[sort]) {
    const a = ALL.slice()
    const cmp = {
      popular: (x, y) => popScore(y) - popScore(x),
      rating: (x, y) => bayes(y) - bayes(x),
      trending: (x, y) => y.velocity - x.velocity || popScore(y) - popScore(x),
      new: (x, y) => y.year - x.year || x.updatedDays - y.updatedDays,
      updated: (x, y) => x.updatedDays - y.updatedDays || popScore(y) - popScore(x),
      az: (x, y) => (x.tl < y.tl ? -1 : x.tl > y.tl ? 1 : 0),
    }[sort] || ((x, y) => popScore(y) - popScore(x))
    ORDERS[sort] = a.sort(cmp)
  }
  return ORDERS[sort]
}
const invalidate = () => { ORDERS = {} }

export function synopsisOf(t) {
  return t.synopsis || `${HOOKS[t.sa]} ${CONFLICT[t.sb]} ${STAKES[t.sc]}`
}

const coverCache = new Map()
export function coverOf(t) {
  if (t.cover) return t.cover
  const key = t.id + ':' + t.title
  if (coverCache.has(key)) return coverCache.get(key)
  const h1 = t.hue, h2 = (t.hue + 50 + (t.id % 70)) % 360
  const motif = t.id % 5
  const words = t.title.split(' ')
  const lines = []
  let line = ''
  for (const wd of words) { if ((line + ' ' + wd).trim().length > 13 && line) { lines.push(line); line = wd } else line = (line + ' ' + wd).trim() }
  if (line) lines.push(line)
  const L = lines.slice(0, 4)
  const shapes = [
    `<circle cx="210" cy="130" r="56" fill="hsl(${h2} 90% 85%)" opacity=".9"/><path d="M0 330 L70 220 L130 290 L200 190 L300 320 V450 H0Z" fill="hsl(${h1} 45% 12%)" opacity=".85"/>`,
    `<g stroke="hsl(${h2} 90% 80%)" stroke-width="3" opacity=".6">${Array.from({ length: 14 }, (_, k) => `<line x1="150" y1="170" x2="${150 + 260 * Math.cos(k * 0.45)}" y2="${170 + 260 * Math.sin(k * 0.45)}"/>`).join('')}</g><circle cx="150" cy="170" r="42" fill="hsl(${h2} 95% 88%)"/>`,
    `<path d="M-20 120 L140 -10 L170 20 L10 150Z M80 260 L260 90 L290 120 L110 290Z" fill="hsl(${h2} 85% 75%)" opacity=".75"/><path d="M0 360 L300 250 V450 H0Z" fill="hsl(${h1} 50% 10%)" opacity=".8"/>`,
    `<g fill="none" stroke="hsl(${h2} 90% 82%)" stroke-width="4" opacity=".7"><circle cx="150" cy="170" r="30"/><circle cx="150" cy="170" r="62"/><circle cx="150" cy="170" r="98"/><circle cx="150" cy="170" r="140"/></g>`,
    `<rect x="120" y="60" width="60" height="230" fill="hsl(${h1} 45% 10%)" opacity=".85"/><path d="M110 60 L150 10 L190 60Z" fill="hsl(${h1} 45% 10%)"/><circle cx="235" cy="90" r="26" fill="hsl(${h2} 95% 88%)"/>`,
  ]
  const fmtLabel = t.format === 'novel' ? 'NOVEL' : t.format.toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 70% 38%)"/><stop offset="1" stop-color="hsl(${h2} 75% 22%)"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/>${shapes[motif]}<rect width="300" height="450" fill="url(#s)"/><text x="20" y="36" font-family="Inter,Arial,sans-serif" font-size="11" letter-spacing="3" fill="#fff" opacity=".8" font-weight="700">${fmtLabel}</text>${L.map((s, k) => `<text x="20" y="${450 - 24 - (L.length - 1 - k) * 32}" font-family="Georgia,serif" font-size="28" font-weight="700" fill="#fff">${escapeXml(s)}</text>`).join('')}</svg>`
  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  if (coverCache.size > 600) coverCache.clear()
  coverCache.set(key, uri)
  return uri
}

function fromRow(r) {
  return {
    id: r.id, title: r.title, tl: (r.title || '').toLowerCase(), author: r.author || '—', translator: r.translator, format: r.format, status: r.status,
    year: r.year || 2020, rating: Number(r.rating) || 0, votes: r.rating_count || 0, chapters: r.chapter_count || 0, lang: r.language, origin: r.origin,
    genres: r.genres || [], tags: r.tags || [], mature: !!r.is_mature, velocity: Number(r.velocity) || 0,
    updatedDays: Math.max(0, Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 864e5)), hue: (r.id * 47) % 360, pa: r.id % ARCHETYPES.length,
    sa: r.id % HOOKS.length, sb: (r.id * 3) % CONFLICT.length, sc: (r.id * 7) % STAKES.length, synopsis: r.synopsis, cover: r.cover_url, live: true,
  }
}
const SORT_COLS = { popular: ['rating_count', false], rating: ['rating', false], trending: ['velocity', false], new: ['year', false], updated: ['updated_at', false], az: ['title', true] }

function matchesLocal(t, f, q) {
  if (DELETED.has(t.id)) return false
  if (f.format && t.format !== f.format) return false
  if (f.disabledFormats && f.disabledFormats.includes(t.format)) return false
  if (f.status && t.status !== f.status) return false
  if (f.lang && t.lang !== f.lang) return false
  if (f.minRating && t.rating < f.minRating) return false
  if (f.yearMin && t.year < f.yearMin) return false
  if (f.yearMax && t.year > f.yearMax) return false
  if (f.hideMature && t.mature) return false
  if (f.genres && f.genres.length) for (const g of f.genres) if (!t.genres.includes(g)) return false
  if (f.muteTags && f.muteTags.length) for (const m of f.muteTags) if (t.tags.includes(m)) return false
  if (f.ids && !f.ids.has(t.id)) return false
  if (f.archetypes && f.archetypes.length && !f.archetypes.includes(ARCHETYPES[t.pa])) return false
  if (f.maxChapters && t.chapters > f.maxChapters) return false
  if (f.maxVotes && t.votes > f.maxVotes) return false
  if (q) {
    for (const tok of q.toks) {
      const ok = t.tl.includes(tok) || t.author.toLowerCase().includes(tok) || t.format.startsWith(tok) ||
        t.genres.some((g) => g.includes(tok) || (q.genreHits[tok] && q.genreHits[tok].has(g))) || t.tags.some((g) => g.includes(tok)) ||
        (t.synopsis ? t.synopsis.toLowerCase().includes(tok) : q.synHits[tok].a.has(t.sa) || q.synHits[tok].b.has(t.sb) || q.synHits[tok].c.has(t.sc))
      if (!ok) return false
    }
  }
  return true
}
function prepQuery(qs, genreLabels) {
  const toks = String(qs || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)
  if (!toks.length) return null
  const idx = (arr, tok) => new Set(arr.map((s, i) => (s.toLowerCase().includes(tok) ? i : -1)).filter((i) => i >= 0))
  const synHits = {}, genreHits = {}
  for (const tok of toks) {
    synHits[tok] = { a: idx(HOOKS, tok), b: idx(CONFLICT, tok), c: idx(STAKES, tok) }
    genreHits[tok] = new Set(GENRES.filter((g) => (genreLabels?.[g] || '').toLowerCase().includes(tok)))
  }
  return { toks, synHits, genreHits }
}

async function queryLive(p) {
  const [col, asc] = SORT_COLS[p.sort] || SORT_COLS.popular
  let qb = supabase.from('titles').select('*', { count: 'estimated' })
  if (p.q) qb = qb.textSearch('search_vector', p.q.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '') + ':*').filter((w) => w !== ':*').join(' & '), { config: 'simple' })
  if (p.genres?.length) qb = qb.contains('genres', p.genres)
  if (p.format) qb = qb.eq('format', p.format)
  if (p.disabledFormats?.length) qb = qb.not('format', 'in', `(${p.disabledFormats.join(',')})`)
  if (p.status) qb = qb.eq('status', p.status)
  if (p.lang) qb = qb.eq('language', p.lang)
  if (p.minRating) qb = qb.gte('rating', p.minRating)
  if (p.yearMin) qb = qb.gte('year', p.yearMin)
  if (p.yearMax) qb = qb.lte('year', p.yearMax)
  if (p.hideMature) qb = qb.eq('is_mature', false)
  if (p.maxChapters) qb = qb.lte('chapter_count', p.maxChapters)
  if (p.maxVotes) qb = qb.lte('rating_count', p.maxVotes)
  const from = (p.page - 1) * p.pageSize
  const { data, error, count } = await qb.order(col, { ascending: asc }).range(from, from + p.pageSize - 1)
  if (error) throw error
  return { items: (data || []).map(fromRow), total: count ?? data.length }
}

function toDbRow(data) {
  const mergedTags = [
    ...(data.tags || []),
    ...(data.source ? [`src:${data.source}`] : []),
  ]
  return {
    title: data.title,
    author: data.author || '—',
    format: data.format || 'novel',
    status: data.status || 'ongoing',
    year: Number(data.year) || 2022,
    chapter_count: Number(data.chapters) || 12,
    language: data.lang || 'en',
    genres: Array.isArray(data.genres) && data.genres.length ? data.genres : ['fantasy'],
    tags: mergedTags,
    synopsis: data.synopsis || '',
    cover_url: data.cover || null,
    is_mature: !!data.mature,
    rating: Number(data.rating) || 4,
    rating_count: Number(data.votes) || 0,
  }
}

export const catalog = {
  size: CATALOG_SIZE,
  sources: SOURCES,
  local: (id) => byId(id),
  allLocal: () => ensure(),

  async query(params = {}) {
    const p = { sort: 'popular', page: 1, pageSize: 24, ...params }
    if (isLive) {
      try {
        const res = await queryLive(p)
        if (res.total > 0 || p.q || p.genres?.length || p.format) return res
      } catch (e) { console.warn('[catalog] live query failed, using demo catalog', e) }
    }
    const q = prepQuery(p.q, p.genreLabels)
    const src = order(p.sort)
    const out = []
    let total = 0
    const start = (p.page - 1) * p.pageSize, end = start + p.pageSize
    for (let i = 0; i < src.length; i++) {
      const t = src[i]
      if (!matchesLocal(t, p, q)) continue
      if (total >= start && total < end) out.push(t)
      total++
    }
    return { items: out, total }
  },

  async get(id) {
    id = Number(id)
    if (isLive) {
      try {
        const { data } = await supabase.from('titles').select('*').eq('id', id).maybeSingle()
        if (data) return fromRow(data)
      } catch { /* fallback */ }
    }
    const t = byId(id)
    return t && !DELETED.has(id) ? t : null
  },

  byIds(ids) { return ids.map((i) => byId(Number(i))).filter((t) => t && !DELETED.has(t.id)) },

  async suggest(qs, n = 6) {
    const q = String(qs || '').trim().toLowerCase()
    if (q.length < 2) return []
    if (isLive) {
      try {
        const { data } = await supabase.from('titles').select('*').ilike('title', `%${q}%`).order('rating_count', { ascending: false }).limit(n)
        if (data?.length) return data.map(fromRow)
      } catch { /* fallback */ }
    }
    const out = []
    const src = order('popular')
    for (let i = 0; i < src.length && out.length < n; i++) if (src[i].tl.includes(q) && !DELETED.has(src[i].id)) out.push(src[i])
    return out
  },

  related(t, n = 12, crossFormat = false) {
    const src = order('popular')
    const best = []
    for (let i = 0; i < src.length; i++) {
      const c = src[i]
      if (c.id === t.id || DELETED.has(c.id)) continue
      let s = 0
      for (const g of c.genres) if (t.genres.includes(g)) s += 2
      if (s < 4) continue
      for (const g of c.tags) if (t.tags.includes(g)) s += 1
      if (c.author === t.author) s += 4
      s += crossFormat ? (c.format !== t.format ? 2 : 0) : (c.format === t.format ? 1.5 : 0)
      s += (c.rating - 3.5) * 1.5 + Math.log10(c.votes + 1) * 0.3
      if (best.length < n || s > best[best.length - 1].s) {
        best.push({ c, s }); best.sort((a, b) => b.s - a.s); if (best.length > n) best.pop()
      }
      if (i > 25000 && best.length >= n) break
    }
    return best.map((b) => b.c)
  },

  health() {
    const all = ensure()
    const by = { novel: 0, manhwa: 0, manga: 0 }, st = { ongoing: 0, completed: 0, hiatus: 0 }
    let mature = 0, noCover = 0, extras = BYID.size
    for (const t of all) { if (DELETED.has(t.id)) continue; by[t.format]++; st[t.status]++; if (t.mature) mature++; if (!t.cover) noCover++ }
    return { total: all.length - DELETED.size, by, st, mature, noCover, extras, deleted: DELETED.size }
  },

  async importExternal(sourceIds, opts = {}) {
    ensure()
    const existing = new Set(ALL.map((t) => `${t.tl}::${t.format}`))
    const { items, report } = await importFromSources(sourceIds, { ...opts, existingTitles: existing })
    const imported = await adminCatalog.importMany(items)
    invalidate()
    return { imported, report }
  },

  customChapters(id) { return OVERLAY.chapters[id] || [] },
  async loadCustomChapter(id, n, version = 'official') {
    const c = (OVERLAY.chapters[id] || []).find((x) => x.n === n)
    if (c) return c
    if (isLive) {
      try {
        const { data } = await supabase.from('chapters').select('*').eq('title_id', id).eq('number', n).eq('version', version).maybeSingle()
        if (data) return { n, name: data.name, content: data.content, pages: data.pages }
      } catch { /* fallback */ }
    }
    return null
  },
}

const saveOverlay = () => { OVERLAY.deleted = [...DELETED]; lsSet('pl:overlay', OVERLAY) }
export const adminCatalog = {
  async add(data) {
    ensure()
    const mergedTags = [
      ...(data.tags || []),
      ...(data.source ? [`src:${data.source}`] : []),
    ]
    if (isLive) {
      const { data: row, error } = await supabase
        .from('titles')
        .insert(toDbRow(data))
        .select()
        .single()
      if (error) throw error
      const mapped = fromRow(row)
      ALL.push(mapped)
      BYID.set(mapped.id, mapped)
      invalidate()
      return mapped
    }
    const id = Math.max(CATALOG_SIZE, ...OVERLAY.extras.map((e) => e.id)) + 1
    const t = { votes: 0, rating: 4, velocity: 30, updatedDays: 0, hue: id % 360, pa: 0, sa: 0, sb: 0, sc: 0, origin: 'US', cover: null, ...data, tags: mergedTags, id }
    OVERLAY.extras.push(t); const tt = { ...t, tl: t.title.toLowerCase() }; ALL.push(tt); BYID.set(id, tt)
    invalidate(); saveOverlay(); return tt
  },
  async update(id, patch) {
    ensure()
    if (isLive && byId(id)?.live) {
      const map = { title: 'title', author: 'author', format: 'format', status: 'status', year: 'year', chapters: 'chapter_count', lang: 'language', genres: 'genres', synopsis: 'synopsis', cover: 'cover_url', mature: 'is_mature' }
      const row = {}; for (const k in patch) if (map[k]) row[map[k]] = patch[k]
      const { error } = await supabase.from('titles').update(row).eq('id', id); if (error) throw error
      return
    }
    const t = byId(id); if (!t) return
    Object.assign(t, patch, patch.title ? { tl: patch.title.toLowerCase() } : {})
    const ex = OVERLAY.extras.find((e) => e.id === id)
    if (ex) Object.assign(ex, patch); else OVERLAY.edits[id] = { ...(OVERLAY.edits[id] || {}), ...patch }
    invalidate(); saveOverlay()
  },
  async remove(id) {
    ensure()
    if (isLive && byId(id)?.live) { const { error } = await supabase.from('titles').delete().eq('id', id); if (error) throw error; return }
    DELETED.add(id); OVERLAY.extras = OVERLAY.extras.filter((e) => e.id !== id); invalidate(); saveOverlay()
  },
  async setChapter(titleId, ch) {
    if (isLive) { const { error } = await supabase.from('chapters').upsert({ title_id: titleId, number: ch.n, name: ch.name, content: ch.content, pages: ch.pages || null, version: 'official' }, { onConflict: 'title_id,number,version' }); if (error) throw error; return }
    const list = OVERLAY.chapters[titleId] || (OVERLAY.chapters[titleId] = [])
    const i = list.findIndex((c) => c.n === ch.n); if (i >= 0) list[i] = ch; else list.push(ch)
    list.sort((a, b) => a.n - b.n); saveOverlay()
  },
  async removeChapter(titleId, n) {
    if (isLive) { await supabase.from('chapters').delete().eq('title_id', titleId).eq('number', n); return }
    OVERLAY.chapters[titleId] = (OVERLAY.chapters[titleId] || []).filter((c) => c.n !== n); saveOverlay()
  },
  async importMany(list) {
    ensure()
    if (!Array.isArray(list) || !list.length) return 0
    if (isLive) {
      const batchSize = 100
      let totalSaved = 0
      for (let i = 0; i < list.length; i += batchSize) {
        const chunk = list.slice(i, i + batchSize).map(toDbRow)
        const { data: rows, error } = await supabase.from('titles').insert(chunk).select()
        if (!error && rows?.length) {
          for (const r of rows) {
            const mapped = fromRow(r)
            ALL.push(mapped)
            BYID.set(mapped.id, mapped)
          }
          totalSaved += rows.length
        } else {
          for (const item of list.slice(i, i + batchSize)) {
            try { await this.add(item); totalSaved++ } catch { /* skip single error */ }
          }
        }
      }
      invalidate()
      return totalSaved
    }
    let n = 0
    for (const d of list) { await this.add(d); n++ }
    return n
  },
  resetOverlay() { OVERLAY = { deleted: [], edits: {}, extras: [], chapters: {} }; lsSet('pl:overlay', OVERLAY); location.reload() },
}

export const hueFor = (s) => hash(String(s)) % 360
