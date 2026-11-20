import { useEffect, useRef, useState } from 'react'

export function useDocTitle(title, description) {
  useEffect(() => {
    document.title = title ? `${title} · Pagelight` : 'Pagelight'
    const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el && val) el.setAttribute(attr, val) }
    set('meta[name="description"]', 'content', description)
    set('meta[property="og:title"]', 'content', title || 'Pagelight')
    set('meta[property="og:description"]', 'content', description)
  }, [title, description])
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    Promise.resolve().then(fn).then((data) => live && setState({ data, loading: false, error: null }), (error) => live && setState({ data: null, loading: false, error }))
    return () => { live = false }
  }, deps) // eslint-disable-line
  return state
}

export function useInView(rootMargin = '300px') {
  const ref = useRef(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current || seen) return
    if (!('IntersectionObserver' in window)) { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { rootMargin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen, rootMargin])
  return [ref, seen]
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id) }, [value, ms])
  return v
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false)
    window.addEventListener('online', a); window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}
