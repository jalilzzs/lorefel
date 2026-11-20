import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useApp } from '../lib/app'
import { cx } from '../lib/util'

export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b7bff" /><stop offset="1" stopColor="#ff7ab6" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M32 47V24c-4.5-3-10-4-17-3.5v22c7-.5 12.5.5 17 4.5Z" fill="#fff" fillOpacity=".92" />
      <path d="M32 47V24c4.5-3 10-4 17-3.5v22c-7-.5-12.5.5-17 4.5Z" fill="#fff" fillOpacity=".7" />
      <path d="M32 6c1.2 5.2 3.8 7.8 9 9-5.2 1.2-7.8 3.8-9 9-1.2-5.2-3.8-7.8-9-9 5.2-1.2 7.8-3.8 9-9Z" fill="#fff" />
    </svg>
  )
}
export const Logo = ({ size = 34, text = true }) => (
  <span className="logo"><LogoMark size={size} />{text && <span className="logo-text">Pagelight</span>}</span>
)

export function Modal({ onClose, title, children, wide, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal glass', wide && 'wide', className)} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export const Skeleton = ({ h = 16, w = '100%', r = 8, style }) => <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} />
export const CardSkeletons = ({ n = 8 }) => (
  <div className="grid">{Array.from({ length: n }, (_, i) => <div key={i}><Skeleton h={0} style={{ aspectRatio: '2/3', height: 'auto' }} r={14} /><Skeleton h={12} w="80%" style={{ marginTop: 10 }} /><Skeleton h={10} w="50%" style={{ marginTop: 6 }} /></div>)}</div>
)
export function Empty({ icon = 'book', title, children, action }) {
  return <div className="empty"><Icon name={icon} size={40} /><h3>{title}</h3>{children && <p className="muted">{children}</p>}{action}</div>
}

export function Stars({ value = 0, onChange, size = 18 }) {
  const [hover, setHover] = useState(0)
  const v = hover || value
  return (
    <span className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const full = v >= n, half = !full && v >= n - 0.5
        return (
          <button key={n} type="button" className={cx('star', (full || half) && 'on')} disabled={!onChange} onMouseEnter={() => onChange && setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => onChange && onChange(n)} aria-label={`${n}`}>
            <Icon name="star" size={size} fill={full} />
          </button>
        )
      })}
    </span>
  )
}

export const Chip = ({ active, onClick, children, icon, className, title }) => (
  <button type="button" className={cx('chip', active && 'active', className)} onClick={onClick} aria-pressed={active} title={title}>{icon && <Icon name={icon} size={14} />}{children}</button>
)

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((x) => <button key={x.id} role="tab" aria-selected={value === x.id} className={cx('tab', value === x.id && 'active')} onClick={() => onChange(x.id)}>{x.icon && <Icon name={x.icon} size={15} />}{x.label}</button>)}</div>
}

export function ToastHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const on = (e) => { const it = e.detail; setItems((x) => [...x, it]); setTimeout(() => setItems((x) => x.filter((y) => y.id !== it.id)), 3600) }
    window.addEventListener('pl:toast', on); return () => window.removeEventListener('pl:toast', on)
  }, [])
  return <div className="toasts" role="status" aria-live="polite">{items.map((i) => <div key={i.id} className={cx('toast glass', i.type)}>{i.message}</div>)}</div>
}

export function Ring({ value, size = 84, label, sub }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, v = Math.min(1, value)
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}><circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" /><circle cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
      <div className="ring-label"><b>{label}</b>{sub && <small>{sub}</small>}</div>
    </div>
  )
}

export function Bars({ data, height = 120, fmt = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.v))
  return (
    <div className="bars" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${fmt(d.v)}`}>
          <div className="bar" style={{ height: `${(d.v / max) * 100}%` }} />
          <small>{d.label}</small>
        </div>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
}

export function Switch({ checked, onChange, label }) {
  return <label className="switch"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><i /><span>{label}</span></label>
}

export function Avatar({ profile, size = 36 }) {
  const initials = (profile?.display || '?').trim().slice(0, 2).toUpperCase()
  const hue = ((profile?.handle || 'x').length * 47) % 360
  return profile?.avatar
    ? <img className="avatar" src={profile.avatar} width={size} height={size} alt="" />
    : <span className="avatar ph" style={{ width: size, height: size, background: `linear-gradient(135deg,hsl(${hue} 70% 55%),hsl(${(hue + 60) % 360} 70% 45%))`, fontSize: size * 0.38 }}>{initials}</span>
}

export const useT = () => useApp().t
