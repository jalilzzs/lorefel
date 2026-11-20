// Canvas card renderer shared by Quote Card Studio, share cards and gift cards.
export const RATIOS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920], '16:9': [1600, 900] }
export const BACKGROUNDS = [
  { id: 'aurora', c: ['#2b1055', '#7597de'] }, { id: 'ember', c: ['#42275a', '#734b6d'] }, { id: 'sunrise', c: ['#ff9966', '#ff5e62'] },
  { id: 'forest', c: ['#134e5e', '#71b280'] }, { id: 'paper', c: ['#f6efe2', '#e6d5b8'], dark: true }, { id: 'ink', c: ['#0f0c29', '#302b63'] },
  { id: 'rose', c: ['#ee9ca7', '#ffdde1'], dark: true }, { id: 'ocean', c: ['#0f2027', '#2c5364'] },
]
export const CARD_FONTS = { serif: 'Georgia, "Noto Serif SC", serif', sans: 'Inter, "Noto Sans SC", Arial, sans-serif', display: 'Fraunces, Georgia, serif', arabic: '"Noto Naskh Arabic", serif' }

export function drawCard(canvas, { text, source, ratio = '1:1', bg = BACKGROUNDS[0], custom, font = 'display', align = 'center', size = 64, kind = 'quote', footer = 'Pagelight' }) {
  const [W, H] = RATIOS[ratio] || RATIOS['1:1']
  canvas.width = W; canvas.height = H
  const c = canvas.getContext('2d')
  const [c1, c2] = custom || bg.c
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, c2)
  c.fillStyle = g; c.fillRect(0, 0, W, H)
  c.globalAlpha = 0.08; c.fillStyle = bg.dark ? '#000' : '#fff'
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(W * ((i * 37) % 100) / 100, H * ((i * 53) % 100) / 100, 120 + i * 40, 0, 7); c.fill() }
  c.globalAlpha = 1
  const ink = bg.dark && !custom ? '#2a2118' : '#ffffff'
  c.fillStyle = ink; c.textBaseline = 'alphabetic'
  const pad = W * 0.1, maxW = W - pad * 2
  if (kind === 'quote') { c.font = `700 ${size * 2.4}px ${CARD_FONTS.display}`; c.globalAlpha = 0.3; c.textAlign = 'left'; c.fillText('“', pad * 0.6, pad + size * 1.6); c.globalAlpha = 1 }
  c.font = `500 ${size}px ${CARD_FONTS[font] || CARD_FONTS.display}`
  c.textAlign = align === 'center' ? 'center' : align === 'end' ? 'right' : 'left'
  const rtl = /[؀-ۿ]/.test(text)
  if (rtl) { c.direction = 'rtl'; c.textAlign = align === 'center' ? 'center' : 'right' } else c.direction = 'ltr'
  const words = /[一-鿿]/.test(text) ? [...text] : text.split(/\s+/)
  const sp = /[一-鿿]/.test(text) ? '' : ' '
  const lines = []; let line = ''
  for (const w of words) { const test = line ? line + sp + w : w; if (c.measureText(test).width > maxW && line) { lines.push(line); line = w } else line = test }
  if (line) lines.push(line)
  const lh = size * 1.35, total = lines.length * lh
  let y = (H - total) / 2 + size * 0.9
  const x = align === 'center' ? W / 2 : align === 'end' ? W - pad : pad
  const rx = rtl ? (align === 'center' ? W / 2 : W - pad) : x
  lines.forEach((l, i) => c.fillText(l, rx, y + i * lh))
  c.direction = 'ltr'
  c.font = `600 ${size * 0.4}px ${CARD_FONTS.sans}`; c.globalAlpha = 0.85
  c.textAlign = align === 'center' ? 'center' : align === 'end' ? 'right' : 'left'
  if (source) c.fillText('— ' + source, x, Math.min(H - pad * 1.3, y + total + size * 0.8))
  c.globalAlpha = 0.6; c.font = `700 ${size * 0.34}px ${CARD_FONTS.sans}`
  c.textAlign = 'center'; c.fillText('✦ ' + footer, W / 2, H - pad * 0.6)
  c.globalAlpha = 1
}
