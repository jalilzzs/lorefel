// Pure, dependency-free deterministic catalog generator (also used by scripts/seed-titles.mjs).
export const GENRES = ['Action','Fantasy','Romance','Thriller','Mystery','Sci-Fi','Historical','Slice of Life','Horror','Drama','Wuxia','Xianxia','LitRPG','Psychological','Comedy','Sports','Supernatural','Isekai','Adventure','School']
export const FORMATS = ['novel', 'manhwa', 'manga']
export const LANGS = ['en', 'fr', 'ar', 'zh', 'ko', 'ja']
export const TAGS = ['Overpowered MC','Revenge','Reincarnation','Dungeon','Magic Academy','Time Loop','Villainess','Cultivation','Found Family','Slow Burn','Tragedy','Politics','Necromancer','Guilds','Transmigration','Anti-Hero']
export const WARNINGS = ['Violence','Gore','Sexual Content','Strong Language','Self-harm','Abuse']
export const ARCH = ['Stoic Swordsman','Cunning Strategist','Reluctant Hero','Rival','Wise Mentor','Trickster','Fallen Noble','Cold Villain']
export const TOTAL = 100000

const W1 = ['Shadow','Crimson','Eternal','Silent','Azure','Iron','Broken','Hidden','Golden','Midnight','Frozen','Forgotten','Radiant','Hollow','Scarlet','Celestial','Ashen','Verdant','Obsidian','Wandering']
const W2 = ['Emperor','Blade','Academy','Crown','Garden','Oath','Dragon','Sage','Kingdom','Tower','Witch','Requiem','Heir','Soul','Cipher','Lantern','Monarch','Phoenix','Archive','Hunter']
const W3 = ['Dawn','Ashes','Stars','the Abyss','Tomorrow','Glass','Thorns','the Void','Eclipse','Winter','Echoes','Fate']
const FN = ['Aria','Kael','Lin','Mara','Ren','Soren','Yuki','Idris','Noor','Jae','Elena','Theo','Mei','Zane','Layla','Hiro','Camille','Omar','Sora','Vera']
const LN = ['Blackwood','Hart','Tanaka','Al-Rashid','Moreau','Chen','Park','Voss','Duval','Nakamura','Okafor','Lang']

export function rng(seed) {
  let s = (seed * 2654435761) % 4294967296
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

export function make(id) {
  const r = rng(id), p = (a) => a[Math.floor(r() * a.length)]
  const fr = r()
  const format = fr < 0.42 ? 'novel' : fr < 0.72 ? 'manhwa' : 'manga'
  const gs = new Set(); const n = 2 + Math.floor(r() * 2)
  while (gs.size < n) gs.add(p(GENRES))
  const genres = [...gs]
  const tags = [...new Set([p(TAGS), p(TAGS), p(TAGS)])]
  const v = Math.floor(r() * 3), a = p(W1), b = p(W2), c = p(W3)
  const title = v === 0 ? `The ${a} ${b}` : v === 1 ? `${a} ${b} of ${c}` : `${b} of ${c}`
  const lang = r() < 0.55 ? 'en' : LANGS[Math.floor(r() * LANGS.length)]
  const mature = r() < 0.07
  const warnings = mature ? ['Sexual Content', p(WARNINGS)] : (r() < 0.3 ? [p(WARNINGS)] : [])
  const chapters = format === 'novel' ? 20 + Math.floor(r() * 480) : 10 + Math.floor(r() * 250)
  const rating = Math.min(5, +(3 + 2 * Math.pow(r(), 0.6)).toFixed(1))
  const votes = Math.floor(Math.pow(r(), 3) * 50000)
  const popularity = +r().toFixed(3)
  const velocity = Math.round(r() * r() * 100)
  const year = 2008 + Math.floor(r() * 19)
  const sr = r(); const status = sr < 0.55 ? 'ongoing' : sr < 0.9 ? 'completed' : 'hiatus'
  const author = `${p(FN)} ${p(LN)}`
  const hue = Math.floor(r() * 360)
  return { id, title, author, format, genres, tags, warnings, lang, status, year, rating, votes, popularity, velocity, chapters, mature, hue, s: (title + ' ' + author + ' ' + tags.join(' ') + ' ' + genres.join(' ') + ' ' + format).toLowerCase() }
}

export function characters(t) {
  const r = rng(t.id * 13 + 5), out = [], seen = new Set()
  while (out.length < 6) {
    const name = FN[Math.floor(r() * FN.length)] + ' ' + LN[Math.floor(r() * LN.length)]
    if (seen.has(name)) continue
    seen.add(name); out.push({ name, arch: ARCH[Math.floor(r() * ARCH.length)] })
  }
  return out
}
export function relations(t) {
  const r = rng(t.id * 17 + 2), L = ['ally','rival','mentor','sibling','love interest','enemy']
  return [[0,1],[0,2],[1,3],[2,4],[0,5],[3,5]].map(([a, b]) => [a, b, L[Math.floor(r() * L.length)]])
}
export function lore(t) {
  const r = rng(t.id * 19 + 4), p = (a) => a[Math.floor(r() * a.length)]
  return [
    { kind: 'Faction', name: `The ${p(W1)} ${p(W2)}s`, text: 'A secretive order whose true aims are revealed slowly across the story.' },
    { kind: 'Location', name: `${p(W1)} ${p(['Citadel','Marsh','Spire','Harbor'])}`, text: 'A pivotal setting where several arcs converge.' },
    { kind: 'Artifact', name: `${p(W2)} of ${p(W3)}`, text: 'An ancient relic that bends the rules of the world.' },
    { kind: 'Law of the World', name: 'The Price of Power', text: 'Every ability demands a sacrifice, and it is never the one you expect.' },
  ]
}
export const synopsis = (t) => {
  const r = rng(t.id * 7 + 1), p = (a) => a[Math.floor(r() * a.length)], c = characters(t)
  return `${c[0].name}, ${p(['a disgraced heir','a nameless porter','a retired assassin','a gifted outcast','a reborn scholar'])}, awakens in a ${t.genres[0].toLowerCase()} world where ${p(['every promise has a price','the dead keep ledgers','the sky is slowly closing','power is inherited, not earned'])}. Alongside ${c[1].name}, they must ${p(['unseal the last gate','survive the trials','expose the crown','rewrite their fate'])} before ${p(['the final eclipse','the council convenes','winter returns'])}.`
}

const TP = [
  '{A} watched the horizon burn and said nothing for a long time.',
  '"We are running out of time," {B} whispered, gripping the hilt.',
  'The wind carried the scent of ash through the empty courtyard.',
  '{B} laughed, though nothing about the moment was funny.',
  'Somewhere beyond the walls, a bell tolled three times.',
  '{A} remembered the oath made beneath the {W} banner, and the cost that followed.',
  'Nobody spoke. The silence in the hall felt heavier than any blade.',
  '"You were never meant to find this place," {B} said, stepping out of the shadows.',
  'A thin crack of light split the sky, and chapter {N} of their story truly began.',
  '{A} clenched a fist; the old scar burned like a warning.',
  'The map was wrong. It had always been wrong, and {B} had known.',
  'Rain drummed on the rooftops while the city pretended to sleep.',
  '"Then we do it my way," {A} answered, and no one dared argue.',
  'Far below, the river ran red with the reflection of the dying sun.',
]
export function chapterText(t, n, ver = 0) {
  const r = rng(t.id * 997 + n * 13 + ver * 7 + 3), c = characters(t), out = []
  for (let i = 0; i < 14; i++) {
    let s = ''; const k = 3 + Math.floor(r() * 3)
    for (let j = 0; j < k; j++) {
      s += TP[Math.floor(r() * TP.length)].replace(/{A}/g, c[0].name).replace(/{B}/g, c[1 + Math.floor(r() * 4)].name).replace(/{W}/g, W1[Math.floor(r() * W1.length)].toLowerCase()).replace(/{N}/g, n) + ' '
    }
    out.push(s.trim())
  }
  return out
}
export const chapterTitle = (t, n) => `Chapter ${n} — ${W2[(t.id * 3 + n) % W2.length]} ${W3[(n * 7 + t.id) % W3.length]}`
export const tension = (t, n) => Math.max(0.05, Math.min(1, 0.5 + 0.4 * Math.sin(n / (3 + (t.id % 5))) * Math.cos(n / 7) + (rng(t.id * 31 + n)() - 0.5) * 0.3))

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const uri = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
export function coverUrl(t) {
  const words = String(t.title).split(' '), lines = ['']
  words.forEach((w) => { if ((lines[lines.length - 1] + ' ' + w).trim().length > 13 && lines.length < 3) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim() })
  const h = t.hue || 0
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},60%,18%)"/></linearGradient></defs><rect width="300" height="420" fill="url(#g)"/><circle cx="230" cy="90" r="60" fill="hsla(${(h + 120) % 360},90%,75%,.35)"/><path d="M0 330 L90 240 L160 310 L220 250 L300 330 V420 H0Z" fill="rgba(0,0,0,.35)"/>${lines.map((l, i) => `<text x="22" y="${250 + i * 34}" font-family="Georgia,serif" font-size="28" font-weight="700" fill="#fff">${esc(l)}</text>`).join('')}<text x="22" y="395" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,.8)">${esc(t.author || '')}</text></svg>`)
}
export function pageUrl(t, n, i) {
  const r = rng(t.id * 71 + n * 11 + i), h = (t.hue + i * 17) % 360
  let panels = ''; const rows = 2 + Math.floor(r() * 2); let y = 12
  for (let k = 0; k < rows; k++) {
    const ph = (776 - 12 * (rows + 1)) / rows, split = r() < 0.5
    const boxes = split ? [[12, y, 280, ph], [304, y, 284, ph]] : [[12, y, 576, ph]]
    boxes.forEach(([x, yy, w, hh]) => {
      const hh2 = (h + Math.floor(r() * 80)) % 360
      panels += `<rect x="${x}" y="${yy}" width="${w}" height="${hh}" fill="hsl(${hh2},45%,${30 + Math.floor(r() * 35)}%)" stroke="#111" stroke-width="4"/><circle cx="${x + w * r()}" cy="${yy + hh * r()}" r="${20 + r() * 50}" fill="hsla(${hh2 + 40},70%,80%,.5)"/><ellipse cx="${x + 40 + r() * (w - 120)}" cy="${yy + 30 + r() * 30}" rx="46" ry="24" fill="#fff" stroke="#111" stroke-width="2"/>`
    })
    y += ph + 12
  }
  return uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><rect width="600" height="800" fill="#fafafa"/>${panels}<text x="300" y="792" text-anchor="middle" font-size="14" font-family="sans-serif" fill="#555">${esc(t.title)} · ${n} · ${i + 1}</text></svg>`)
}
export const chapterPages = (t, n) => Array.from({ length: 10 }, (_, i) => pageUrl(t, n, i))

export function quiz(t, n) {
  const c = characters(t), r = rng(t.id + n * 5)
  const shuf = (a) => a.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
  const ai = ARCH.indexOf(c[1].arch)
  return [
    { q: `Who is the protagonist of "${t.title}"?`, o: shuf([c[0].name, c[2].name, c[3].name]), a: c[0].name },
    { q: 'Which genre is listed first for this story?', o: shuf([t.genres[0], ...GENRES.filter((g) => !t.genres.includes(g)).slice(0, 2)]), a: t.genres[0] },
    { q: `What is ${c[1].name}'s archetype?`, o: shuf([c[1].arch, ARCH[(ai + 1) % 8], ARCH[(ai + 2) % 8]]), a: c[1].arch },
  ]
}
