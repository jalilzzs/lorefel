import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** true when real Supabase keys are configured; otherwise the app runs in DEMO MODE (localStorage). */
export const isLive = Boolean(url && key && /^https?:\/\//.test(url) && !url.includes('your-project'))
export const supabase = isLive ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null

export const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE || '010203'
export const ADMIN_REQUIRE_ROLE = String(import.meta.env.VITE_ADMIN_REQUIRE_ROLE) === 'true'
