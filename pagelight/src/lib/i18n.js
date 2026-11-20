import en from '../locales/en'
import fr from '../locales/fr'
import ar from '../locales/ar'
import zh from '../locales/zh'

export const LANGS = [
  { code: 'en', name: 'English', dir: 'ltr', speech: 'en-US' },
  { code: 'fr', name: 'Français', dir: 'ltr', speech: 'fr-FR' },
  { code: 'ar', name: 'العربية', dir: 'rtl', speech: 'ar-SA' },
  { code: 'zh', name: '中文', dir: 'ltr', speech: 'zh-CN' },
]
const dicts = { en, fr, ar, zh }

export function makeT(lang) {
  const d = dicts[lang] || en
  const t = (key, vars) => {
    let s = d[key] ?? en[key] ?? key
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k])
    return s
  }
  t.has = (k) => (d[k] ?? en[k]) != null
  return t
}
