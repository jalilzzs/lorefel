import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Automatic demo/fallback mode: live === false when keys are missing.
export const live = !!(url && key && url.startsWith('http'))
export const sb = live ? createClient(url, key) : null
