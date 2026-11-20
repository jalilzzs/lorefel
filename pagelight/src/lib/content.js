// Deterministic story content: chapter text, comic pages, characters, lore, quizzes, tension, polls.
// Replace the generators with real chapter data in Supabase (`chapters` table) — the reader prefers DB rows.
import { mulberry32, hash, rpick, rshuffle, clamp } from './util'
import { ARCHETYPES, NAME_POOLS } from './catalog'

const EN = [
  '{h} stood at the edge of {p}, listening to the wind carry rumors of {f}.',
  '"We don\'t have much time," {a} whispered, tightening the strap of a worn satchel.',
  'The {x} pulsed once against {h}\'s palm, as if it had been waiting for this exact moment.',
  'Behind them, the bells of {p} began to toll, slow and uneven.',
  '{r} smiled the way people smile when they have already won an argument no one else knew was happening.',
  '"You think this is courage?" {r} asked. "It is only habit wearing courage\'s coat."',
  '{h} did not answer. Some questions deserve silence, and some deserve a blade.',
  'Rain had begun to fall in thin silver threads, turning the road toward {p} into a ribbon of mirrors.',
  'Every member of {f} had a reason for being here, and {h} was beginning to suspect none of them were the reasons they claimed.',
  '{a} laughed, too loudly, the way one laughs to keep from admitting fear.',
  'It was a small thing, really: a door left unlocked, a lantern left burning. But small things were how {f} always began.',
  '"Say that again," {h} said, very quietly.',
  'The {x} hummed a low note that {h} felt in their teeth rather than their ears.',
  'By the time the moon cleared the rooftops of {p}, the choice had already been made for them.',
  '{r} stepped aside, which was somehow worse than if they had drawn a sword.',
  'Memories surfaced without permission: a kitchen, a lullaby, the smell of smoke from a fire that should not have burned.',
  '"Promise me," {a} said, "that if this goes badly you will run." {h} promised, and both of them knew it was a lie.',
  'The corridor ended in a door older than {p} itself, carved with the sigil of {f}.',
  'For a moment nobody breathed. Then the {x} went dark, and the whole room exhaled.',
  '{h} counted the steps to the exit the way a prisoner counts days — hopefully, and with great precision.',
  'It is a strange thing to be afraid of a person you once trusted with your name.',
  '"Whatever happens next," {r} said, "remember that I offered you a way out."',
  'Somewhere far below, the foundations of {p} groaned like an old animal turning in its sleep.',
  'The ink on the page was still wet, and the handwriting was {h}\'s own.',
]
const FR = [
  '{h} se tenait au bord de {p}, écoutant le vent porter les rumeurs de {f}.',
  '« Nous n\'avons presque plus de temps », murmura {a}.',
  'La relique pulsa une fois dans la paume de {h}, comme si elle attendait ce moment précis.',
  'Derrière eux, les cloches de {p} se mirent à sonner, lentes et irrégulières.',
  '{r} sourit comme sourient ceux qui ont déjà gagné une dispute que personne n\'avait vue.',
  'La pluie tombait en fins fils d\'argent sur la route de {p}.',
  '« Promets-moi de fuir si tout tourne mal », dit {a}. {h} promit, et tous deux savaient que c\'était un mensonge.',
  'Au fond du couloir, une porte plus ancienne que {p} portait le sceau de {f}.',
  'Les souvenirs remontaient sans permission : une cuisine, une berceuse, l\'odeur d\'un feu qui n\'aurait pas dû brûler.',
  'Quand la lune dépassa les toits de {p}, le choix avait déjà été fait.',
]
const AR = [
  'وقف {h} على حافة {p}، يصغي إلى الريح وهي تحمل شائعات {f}.',
  'همس {a}: «لم يبقَ لنا كثير من الوقت».',
  'ابتسم {r} كمن ربح جدالًا لم يعلم به أحد.',
  'خلفهم بدأت أجراس {p} تدق ببطء وبلا انتظام.',
  'كانت الأمطار تتساقط خيوطًا فضية رقيقة على الطريق المؤدي إلى {p}.',
  'قال {a}: «عدني أن تهرب إن ساءت الأمور». وعده {h}، وكلاهما يعلم أنه كذب.',
  'في نهاية الممر كان بابٌ أقدم من {p} نفسها، منقوشٌ عليه ختم {f}.',
  'عادت الذكريات دون إذن: مطبخ، وتهويدة، ورائحة نارٍ لم يكن ينبغي أن تشتعل.',
  'حين تجاوز القمر أسطح {p}، كان القرار قد اتُّخذ.',
]
const ZH = [
  '{h}站在{p}的边缘，听风带来关于{f}的传闻。',
  '“我们没有多少时间了，”{a}低声说。',
  '{r}笑了，那是赢下一场无人知晓的争论之后才会有的笑。',
  '身后，{p}的钟声缓慢而不均匀地响起。',
  '细雨如银丝般落在通往{p}的路上。',
  '“答应我，如果事情不妙你就逃走，”{a}说。{h}答应了，两人都知道那是谎言。',
  '走廊尽头是一扇比{p}还要古老的门，上面刻着{f}的印记。',
  '记忆不请自来：一间厨房、一首摇篮曲、一场本不该燃起的火的烟味。',
  '当月亮越过{p}的屋顶时，选择早已做出。',
]
const TPL = { en: EN, fr: FR, ar: AR, zh: ZH }

const CH_A = ['Quiet', 'Broken', 'Last', 'Hidden', 'Borrowed', 'Burning', 'First', 'Silver', 'Hollow', 'Final', 'Unspoken', 'Midnight']
const CH_B = ['Debt', 'Promise', 'Door', 'Letter', 'Storm', 'Echo', 'Truce', 'Harvest', 'Reckoning', 'Tide', 'Vow', 'Mirror']
const ROLES = ['protagonist', 'ally', 'rival', 'mentor', 'antagonist', 'wildcard', 'healer', 'trickster']
const TRAITS = ['stubborn', 'witty', 'loyal', 'secretive', 'reckless', 'gentle', 'ruthless', 'curious', 'haunted', 'charming', 'patient', 'proud']
const REL = ['ally', 'rival', 'mentor', 'family', 'romance', 'enemy', 'secret']
const ORD = ['Order', 'Court', 'Guild', 'Clan', 'Syndicate', 'Covenant']
const ADJ = ['Crimson', 'Hollow', 'Silent', 'Ember', 'Iron', 'Pale', 'Gilded', 'Veiled', 'Sable', 'Verdant']
const PLACES = ['Aldermoor', 'Kharos', 'Velmara', 'Nightharbor', 'Sunreach', 'Ironvale', 'Marrowgate', 'Everfen', 'Lunaria', 'Brightmere', 'Dorne', 'Tianxu']
const ARTIFACTS = ['Starglass Compass', 'Hollow Crown', 'Ember Seal', 'Whisper Blade', 'Ninth Lantern', 'Silent Bell', 'Ashen Key', 'Tide Mirror']

const seedOf = (t, extra = '') => hash(`${t.id}:${extra}`)
const poolOf = (t) => NAME_POOLS[t.origin] || NAME_POOLS.US
const nm = (r, pool) => `${rpick(r, pool.f)} ${rpick(r, pool.l)}`

export function characters(t) {
  const r = mulberry32(seedOf(t, 'chars'))
  const pool = poolOf(t)
  const used = new Set()
  const list = []
  const count = 6 + Math.floor(r() * 3)
  for (let i = 0; i < count; i++) {
    let n; do { n = nm(r, pool) } while (used.has(n)); used.add(n)
    list.push({
      id: i, name: n, role: ROLES[i % ROLES.length], archetype: i === 0 ? ARCHETYPES[t.pa] : rpick(r, ARCHETYPES),
      traits: rshuffle(r, TRAITS).slice(0, 3), age: 16 + Math.floor(r() * 40), hue: Math.floor(r() * 360),
      bio: `${n} first appears in chapter ${1 + Math.floor(r() * Math.max(1, Math.min(30, t.chapters)))} and quietly reshapes the story.`,
    })
  }
  const edges = []
  for (let i = 1; i < list.length; i++) edges.push({ a: 0, b: i, type: i === 1 ? 'ally' : i === 2 ? 'rival' : i === 3 ? 'mentor' : i === 4 ? 'enemy' : rpick(r, REL) })
  for (let k = 0; k < 3; k++) { const a = 1 + Math.floor(r() * (count - 1)), b = 1 + Math.floor(r() * (count - 1)); if (a !== b) edges.push({ a, b, type: rpick(r, REL) }) }
  return { list, edges }
}

export function lore(t) {
  const r = mulberry32(seedOf(t, 'lore'))
  const places = rshuffle(r, PLACES).slice(0, 6).map((n, i) => ({ id: i, name: n, kind: 'location', x: 12 + r() * 76, y: 14 + r() * 72, text: `${n} sits where three old roads meet; its people trade in secrets as much as grain.` }))
  const factions = rshuffle(r, ADJ).slice(0, 4).map((a, i) => ({ id: i, name: `${a} ${rpick(r, ORD)}`, kind: 'faction', base: places[i % places.length].name, text: `A ${a.toLowerCase()}-sworn power bloc headquartered in ${places[i % places.length].name}.` }))
  const artifacts = rshuffle(r, ARTIFACTS).slice(0, 3).map((n, i) => ({ id: i, name: n, kind: 'artifact', owner: factions[i % factions.length].name, text: `The ${n} is guarded by the ${factions[i % factions.length].name} and rumoured to answer only one question per lifetime.` }))
  const blobs = Array.from({ length: 5 }, () => { const cx = 20 + r() * 60, cy = 20 + r() * 60, rad = 10 + r() * 16; return Array.from({ length: 9 }, (_, k) => { const a = (k / 9) * 6.283, rr = rad * (0.7 + r() * 0.6); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] }) })
  return { places, factions, artifacts, blobs }
}

export function tension(t, n) {
  const s = hash(String(t.id)), ph = ((s % 97) / 97) * 6.28
  const noise = (hash(`${t.id}:${n}`) % 1000) / 1000
  const arc = 18 + (s % 14)
  let v = 46 + 20 * Math.sin(n / (5 + (s % 6)) + ph) + 12 * Math.sin(n / 2.3 + ph * 2) + 14 * noise
  if (n % arc >= arc - 3) v += 16
  return Math.round(clamp(v, 6, 98))
}
export const tensionSeries = (t, from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => ({ n: from + i, v: tension(t, from + i) }))
export function pacingOf(t) {
  const n = Math.min(t.chapters, 60); let s = 0
  for (let i = 1; i <= n; i++) s += tension(t, i)
  const avg = s / n
  return { avg, label: avg < 45 ? 'slow' : avg < 56 ? 'balanced' : 'intense' }
}

export function chapterTitle(t, n) {
  const r = mulberry32(seedOf(t, 'ct' + n))
  return `${rpick(r, CH_A)} ${rpick(r, CH_B)}`
}
export const isComic = (t) => t.format !== 'novel'
export const wordsOf = (t, n) => 1800 + (hash(`${t.id}:w${n}`) % 1800)
export const pagesCount = (t, n) => 14 + (hash(`${t.id}:p${n}`) % 12)
export const chapterMinutes = (t, n, wpm = 230) => (isComic(t) ? Math.round(pagesCount(t, n) * 0.35) : Math.max(1, Math.round(wordsOf(t, n) / wpm)))
export const remainingMinutes = (t, fromChapter, wpm = 230) => {
  const left = Math.max(0, t.chapters - fromChapter + 1)
  const per = isComic(t) ? 6 : 2600 / wpm
  return Math.round(left * per)
}
export const versionsOf = (t) => (t.id % 3 === 0 ? ['official', 'fan', 'raw'] : t.id % 3 === 1 ? ['official', 'fan'] : ['official'])
export const seasonEnd = (t) => Math.max(1, t.chapters - (t.id % 4))

export function chapterParagraphs(t, n, version = 'official') {
  const r = mulberry32(seedOf(t, `txt${n}${version}`))
  const ch = characters(t).list
  const lo = lore(t)
  const L = t.lang in TPL ? t.lang : 'en'
  const tpl = TPL[L]
  const fill = (s) => s.replace('{h}', ch[0].name).replace('{a}', ch[1].name).replace('{r}', ch[2].name).replace(/\{p\}/g, rpick(r, lo.places).name).replace(/\{f\}/g, rpick(r, lo.factions).name).replace(/\{x\}/g, rpick(r, lo.artifacts).name)
  const out = []
  const count = 8 + Math.floor(r() * 7)
  for (let i = 0; i < count; i++) {
    const sentences = 2 + Math.floor(r() * 4)
    const sep = L === 'zh' ? '' : ' '
    out.push(Array.from({ length: sentences }, () => fill(rpick(r, tpl))).join(sep))
  }
  if (version === 'fan') out.unshift(L === 'ar' ? '[ترجمة المعجبين]' : L === 'zh' ? '[粉丝翻译]' : L === 'fr' ? '[Traduction fan]' : '[Fan translation — TL note: names kept in original order]')
  if (version === 'raw') out.unshift('[Raw / unedited stream]')
  return out
}

// ---- comic page art (SVG data URIs)
const pageCache = new Map()
export function pageArt(t, n, p) {
  const key = `${t.id}:${n}:${p}`
  if (pageCache.has(key)) return pageCache.get(key)
  const r = mulberry32(seedOf(t, `pg${n}-${p}`))
  const manga = t.format === 'manga'
  const W = 800, H = 1200
  const hue = (t.hue + n * 7 + p * 13) % 360
  const panels = []
  const rows = 2 + Math.floor(r() * 3)
  const gutter = 18
  const rh = (H - gutter * (rows + 1)) / rows
  const bubbleTexts = ['...', 'Wait.', 'It begins.', 'Not again!', 'Who are you?', 'Run!', 'I remember.', 'Too late.', 'Hm?']
  for (let i = 0; i < rows; i++) {
    const y = gutter + i * (rh + gutter)
    const split = r() < 0.4
    const cells = split ? [[gutter, (W - gutter * 3) * 0.45], [gutter * 2 + (W - gutter * 3) * 0.45, (W - gutter * 3) * 0.55]] : [[gutter, W - gutter * 2]]
    for (const [x, w] of cells) {
      const cx = x + w * (0.3 + r() * 0.4), cy = y + rh * (0.35 + r() * 0.3)
      const lines = Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * 6.283; return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * w}" y2="${cy + Math.sin(a) * w}"/>` }).join('')
      const fill = manga ? `hsl(0 0% ${88 - r() * 25}%)` : `hsl(${hue + r() * 50} ${50 + r() * 30}% ${28 + r() * 30}%)`
      const ink = manga ? '#111' : `hsl(${hue} 40% 12%)`
      panels.push(`<g><clipPath id="c${i}${Math.round(x)}"><rect x="${x}" y="${y}" width="${w}" height="${rh}"/></clipPath><rect x="${x}" y="${y}" width="${w}" height="${rh}" fill="${fill}" stroke="#111" stroke-width="5"/><g clip-path="url(#c${i}${Math.round(x)})"><g stroke="${ink}" stroke-width="1.5" opacity=".35">${lines}</g><circle cx="${cx}" cy="${cy - rh * 0.12}" r="${Math.min(w, rh) * 0.14}" fill="${ink}"/><path d="M${cx - w * 0.13} ${y + rh} Q${cx} ${cy} ${cx + w * 0.13} ${y + rh}Z" fill="${ink}"/></g>${r() < 0.7 ? `<g><ellipse cx="${x + w * 0.7}" cy="${y + 52}" rx="${Math.min(110, w * 0.3)}" ry="34" fill="#fff" stroke="#111" stroke-width="3"/><text x="${x + w * 0.7}" y="${y + 58}" text-anchor="middle" font-size="22" font-family="Comic Sans MS,Arial" font-weight="700" fill="#111">${rpick(r, bubbleTexts)}</text></g>` : ''}</g>`)
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${manga ? '#fafafa' : `hsl(${hue} 30% 94%)`}"/>${panels.join('')}<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="16" font-family="Arial" fill="#666">${n}-${p + 1}</text></svg>`
  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  if (pageCache.size > 300) pageCache.clear()
  pageCache.set(key, uri)
  return uri
}

export function recap(t, n) {
  const ch = characters(t).list, lo = lore(t)
  const r = mulberry32(seedOf(t, 'recap' + n))
  return [
    `${ch[0].name} learned that the ${rpick(r, lo.artifacts).name} answers to more than one master.`,
    `${ch[2].name} openly sided with the ${rpick(r, lo.factions).name}, breaking an old truce.`,
    `${ch[1].name} promised to guard the road to ${rpick(r, lo.places).name} — and was not entirely honest about why.`,
  ]
}

export function quiz(t, chapter = null) {
  const r = mulberry32(seedOf(t, 'quiz' + (chapter ?? 'all')))
  const { list, edges } = characters(t)
  const lo = lore(t)
  const mc = (q, correct, pool) => {
    const opts = rshuffle(r, [correct, ...rshuffle(r, pool.filter((x) => x !== correct)).slice(0, 3)])
    return { q, opts, answer: opts.indexOf(correct) }
  }
  const names = list.map((c) => c.name)
  const qs = [
    mc(`Who is the protagonist of "${t.title}"?`, list[0].name, names),
    mc(`Which role does ${list[2].name} play?`, list[2].role, ROLES),
    mc(`Where is the ${lo.factions[0].name} based?`, lo.factions[0].base, lo.places.map((p) => p.name)),
    mc(`Who guards the ${lo.artifacts[0].name}?`, lo.artifacts[0].owner, lo.factions.map((f) => f.name)),
  ]
  const e = edges[0]
  qs.push(mc(`What is the relationship between ${list[e.a].name} and ${list[e.b].name}?`, e.type, REL))
  return chapter ? qs.slice(0, 3) : qs
}

const COMMENTERS = ['nightreader', 'inkwitch', 'paperfox', 'arcaneowl', 'moonlibrarian', 'sakura_fan', 'wen_reads', 'amine_dz']
const COMMENT_TPL = [
  ['That ending hit harder than I expected.', false], ['I called the twist three chapters ago!', true], ['The pacing here is superb.', false],
  ['Does anyone else think {r} is lying?', true], ['Translation quality is great in this chapter.', false], ['That final line gave me chills.', false], ['{h} is making a mistake and I can feel it.', true],
]
export function seedComments(t, n) {
  const r = mulberry32(seedOf(t, 'cm' + n))
  const ch = characters(t).list
  return Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => {
    const [txt, sp] = rpick(r, COMMENT_TPL)
    return { id: `seed-${t.id}-${n}-${i}`, user: rpick(r, COMMENTERS), body: txt.replace('{r}', ch[2].name).replace('{h}', ch[0].name), spoiler: sp, chapter: n, ts: Date.now() - Math.floor(r() * 9e7), seed: true }
  })
}
export function pollFor(t, n) {
  const r = mulberry32(seedOf(t, 'poll' + n))
  const ch = characters(t).list
  const kind = Math.floor(r() * 3)
  if (kind === 0) return { id: `${t.id}:${n}`, q: 'Who do you trust most after this chapter?', options: [ch[1].name, ch[2].name, ch[3].name, 'Nobody'] }
  if (kind === 1) return { id: `${t.id}:${n}`, q: 'How tense was this chapter?', options: ['Calm', 'Simmering', 'Nail-biting', 'Unbearable'] }
  return { id: `${t.id}:${n}`, q: `Will ${ch[0].name} survive the arc?`, options: ['Yes', 'Barely', 'No', 'Plot armor'] }
}
export function seedVotes(poll) { const r = mulberry32(hash(poll.id)); return poll.options.map(() => 5 + Math.floor(r() * 90)) }

export const VOCAB = {
  sigil: 'a symbol or emblem used as a seal', rumors: 'unverified stories passed between people', satchel: 'a small bag carried on the shoulder', toll: 'to ring slowly, as a bell',
  ribbon: 'a long narrow strip', suspect: 'to think something is probably true without proof', lantern: 'a portable light with a protective case', foundations: 'the base on which a building rests',
  lullaby: 'a soothing song for children', corridor: 'a long passage in a building', precision: 'exactness and accuracy', sworn: 'bound by an oath',
}
