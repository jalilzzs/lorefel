import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Field, Logo, Tabs } from '../components/ui'
import { useApp } from '../lib/app'
import { useDocTitle } from '../lib/hooks'
import { toast } from '../lib/toast'

export default function Auth() {
  const { t, signIn, signUp, profile, isLive } = useApp()
  useDocTitle(t('auth.signin'))
  const nav = useNavigate()
  const [mode, setMode] = useState('in')
  const [f, setF] = useState({ email: '', password: '', display: '', birthDate: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (profile) return <Navigate to="/profile" replace />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const res = mode === 'in' ? await signIn(f) : await signUp(f)
    setBusy(false)
    if (res.error) return setErr(res.error)
    if (mode === 'up' && isLive) toast(t('auth.check.email'), 'success'); else nav('/profile')
  }
  return (
    <div className="page narrow">
      <form className="auth glass pad stack" onSubmit={submit}>
        <div className="center"><Logo size={44} /></div>
        <Tabs tabs={[{ id: 'in', label: t('auth.signin') }, { id: 'up', label: t('auth.signup') }]} value={mode} onChange={setMode} />
        {mode === 'up' && <Field label={t('profile.display')}><input required value={f.display} onChange={set('display')} autoComplete="name" /></Field>}
        <Field label={t('auth.email')}><input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label={t('auth.password')}><input required type="password" minLength={6} value={f.password} onChange={set('password')} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        {mode === 'up' && <Field label={t('profile.birthdate')} hint={t('profile.birthdate.hint')}><input required type="date" max={new Date().toISOString().slice(0, 10)} value={f.birthDate} onChange={set('birthDate')} /></Field>}
        {err && <div className="error">{err}</div>}
        <button className="btn primary lg" disabled={busy}>{mode === 'in' ? t('auth.signin') : t('auth.signup')}</button>
        {!isLive && <small className="muted center">{t('auth.demo')}</small>}
      </form>
    </div>
  )
}
