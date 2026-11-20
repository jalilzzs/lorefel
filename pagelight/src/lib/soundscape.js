// Ambient soundscape mixer built on the Web Audio API — no audio files required.
export const SCAPES = ['rain', 'fireplace', 'coffee', 'forest', 'breeze']

let ctx = null, master = null
const channels = {}

function noiseBuffer(c, kind) {
  const len = c.sampleRate * 4
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 } else d[i] = w
  }
  return buf
}
function src(c, kind) { const s = c.createBufferSource(); s.buffer = noiseBuffer(c, kind); s.loop = true; return s }
function filt(c, type, f, q = 0.7) { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x }

function build(name) {
  const c = ctx, g = c.createGain(); g.gain.value = 0; g.connect(master)
  const nodes = []; const timers = []
  const start = (n) => { n.start(); nodes.push(n) }
  if (name === 'rain') { const s = src(c, 'white'), hp = filt(c, 'highpass', 1200), lp = filt(c, 'lowpass', 9000); s.connect(hp); hp.connect(lp); lp.connect(g); start(s) }
  if (name === 'fireplace') {
    const s = src(c, 'brown'), lp = filt(c, 'lowpass', 600); s.connect(lp); lp.connect(g); start(s)
    timers.push(setInterval(() => { // crackles
      if (Math.random() < 0.6) { const o = c.createOscillator(), og = c.createGain(); o.type = 'square'; o.frequency.value = 800 + Math.random() * 2500; og.gain.setValueAtTime(0.05, c.currentTime); og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.04); o.connect(og); og.connect(g); o.start(); o.stop(c.currentTime + 0.05) }
    }, 220))
  }
  if (name === 'coffee') {
    const s = src(c, 'brown'), bp = filt(c, 'bandpass', 500, 0.5); s.connect(bp); bp.connect(g); start(s)
    timers.push(setInterval(() => { if (Math.random() < 0.35) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 1800 + Math.random() * 1400; og.gain.setValueAtTime(0.04, c.currentTime); og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35); o.connect(og); og.connect(g); o.start(); o.stop(c.currentTime + 0.4) } }, 1800))
  }
  if (name === 'forest') {
    const s = src(c, 'white'), bp = filt(c, 'bandpass', 1500, 0.4); s.connect(bp); bp.connect(g); start(s)
    timers.push(setInterval(() => { if (Math.random() < 0.5) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; const f = 2200 + Math.random() * 1800; o.frequency.setValueAtTime(f, c.currentTime); o.frequency.linearRampToValueAtTime(f * 1.3, c.currentTime + 0.15); og.gain.setValueAtTime(0.0001, c.currentTime); og.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.03); og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25); o.connect(og); og.connect(g); o.start(); o.stop(c.currentTime + 0.3) } }, 1500))
  }
  if (name === 'breeze') {
    const s = src(c, 'brown'), lp = filt(c, 'lowpass', 450), lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.35
    const mod = c.createGain(); mod.gain.value = 0.65; lfo.connect(lg); lg.connect(mod.gain); s.connect(lp); lp.connect(mod); mod.connect(g); start(s); start(lfo)
  }
  return { gain: g, stop() { nodes.forEach((n) => { try { n.stop() } catch { /* already stopped */ } }); timers.forEach(clearInterval); g.disconnect() } }
}

export function setScape(name, volume) {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination) }
  if (ctx.state === 'suspended') ctx.resume()
  if (volume > 0 && !channels[name]) channels[name] = build(name)
  const ch = channels[name]
  if (!ch) return
  ch.gain.gain.setTargetAtTime(volume * (name === 'rain' ? 0.25 : name === 'breeze' ? 0.9 : 0.5), ctx.currentTime, 0.2)
  if (volume === 0) setTimeout(() => { if (channels[name] && channels[name].gain.gain.value < 0.001) { channels[name].stop(); delete channels[name] } }, 800)
}
export function stopAllScapes() { Object.keys(channels).forEach((k) => setScape(k, 0)) }
