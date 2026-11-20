import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Field, Logo, Tabs } from '../components/ui'
import { useApp } from '../lib/app'
import { useDocTitle } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

export default function Auth() {
  const { t, signIn, signUp, profile, isLive } = useApp()
  useDocTitle(t('auth.signin'))
  const nav = useNavigate()

  const [mode, setMode] = useState('in')
  const [f, setF] = useState({ email: '', password: '', display: '', birthDate: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // مؤقت إعادة إرسال رابط التأكيد
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // التقاط العودة من رابط تأكيد Supabase وتسجيل الدخول تلقائياً
  useEffect(() => {
    if (!isLive) return

    const url = new URL(window.location.href)
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    const code = url.searchParams.get('code')
    const tokenHash = url.searchParams.get('token_hash')
    const type = url.searchParams.get('type')
    const searchError = url.searchParams.get('error_description') || hashParams.get('error_description')

    if (searchError) {
      setErr(decodeURIComponent(searchError))
    }

    const handleVerifiedSession = async () => {
      try {
        if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setErr(error.message)
            return
          }
        } else if (tokenHash && type && typeof supabase.auth.verifyOtp === 'function') {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
          if (error) {
            setErr(error.message)
            return
          }
        }

        const { data } = await supabase.auth.getSession()
        if (data?.session?.user) {
          setPendingEmail('')
          setErr('')
          setConfirmed(true)
          toast('تم تأكيد الحساب وتسجيل الدخول بنجاح', 'success')
          setTimeout(() => {
            nav('/profile', { replace: true })
          }, 1200)
        }
      } catch {
        setErr('تعذر إتمام تأكيد الحساب تلقائياً')
      }
    }

    if (code || tokenHash || hashParams.get('access_token')) {
      handleVerifiedSession()
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        setPendingEmail('')
        setErr('')
        setConfirmed(true)
        toast('تم تأكيد الحساب وتسجيل الدخول بنجاح', 'success')
        setTimeout(() => {
          nav('/profile', { replace: true })
        }, 1200)
      }
    })

    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [isLive, nav])

  // إذا لم يكن هناك عرض لرسالة التأكيد والملف الشخصي جاهز، ينتقل مباشرة
  if (profile && !confirmed) return <Navigate to="/profile" replace />

  // بطاقة تأكيد نجاح تفعيل الحساب
  if (confirmed) {
    return (
      <div className="page narrow">
        <div className="auth glass pad stack center">
          <Logo size={44} />
          <h2>تم تأكيد الحساب بنجاح</h2>
          <p className="muted">
            تم تفعيل حسابك وتسجيل دخولك تلقائياً، جاري تحويلك إلى ملفك الشخصي...
          </p>
          <button
            type="button"
            className="btn primary lg"
            onClick={() => nav('/profile', { replace: true })}
          >
            الانتقال إلى الملف الشخصي الآن
          </button>
        </div>
      </div>
    )
  }

  // بطاقة بانتظار تأكيد البريد الإلكتروني بعد إنشاء الحساب
  if (pendingEmail) {
    const handleResend = async () => {
      if (resending || cooldown > 0 || !isLive) return
      setResending(true)
      setErr('')
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: pendingEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        })
        if (error) {
          setErr(error.message)
          return
        }
        setCooldown(60)
        toast(t('auth.check.email'), 'success')
      } catch {
        setErr('تعذر إعادة إرسال رابط التأكيد')
      } finally {
        setResending(false)
      }
    }

    return (
      <div className="page narrow">
        <div className="auth glass pad stack">
          <div className="center"><Logo size={44} /></div>
          <h2 className="center">تأكيد البريد الإلكتروني</h2>
          <p className="muted center">{t('auth.check.email')}</p>
          <div className="pill center">{pendingEmail}</div>
          <p className="muted small center">
            بمجرد الضغط على رابط التأكيد في بريدك، سيتم تأكيد حسابك وتسجيل دخولك تلقائياً.
          </p>
          {err && <div className="error">{err}</div>}
          <button
            type="button"
            className="btn primary lg"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
          >
            {resending
              ? '...'
              : cooldown > 0
              ? `إعادة الإرسال (${cooldown}s)`
              : 'إعادة إرسال رابط التأكيد'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setPendingEmail('')
              setErr('')
            }}
          >
            العودة إلى تسجيل الدخول
          </button>
        </div>
      </div>
    )
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const res = mode === 'in' ? await signIn(f) : await signUp(f)
    setBusy(false)
    if (res.error) return setErr(res.error)
    if (mode === 'up' && isLive) {
      if (res.needsConfirmation !== false) {
        setPendingEmail(f.email.trim())
        setCooldown(60)
        toast(t('auth.check.email'), 'success')
        return
      }
    }
    nav('/profile', { replace: true })
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
