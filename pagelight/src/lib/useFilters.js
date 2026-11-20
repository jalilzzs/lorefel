import { useMemo } from 'react'
import { useApp } from './app'
import { useUD } from './userdata'

/** Global filter state → catalog.query params (genre/language/format + age gating + muted tags + disabled modules). */
export function useCatalogFilters(extra = {}) {
  const { filters, adult, site, genreLabels, enabledFormats, profile } = useApp()
  const muted = useUD((s) => s.mutedTags)
  const hideMature = site.features.gating18 && !adult && site.matureMode === 'hide'
  const key = JSON.stringify([filters, hideMature, enabledFormats, muted, extra])
  return useMemo(() => ({
    genres: filters.genres, lang: filters.lang, format: filters.format,
    disabledFormats: ['novel', 'manhwa', 'manga'].filter((f) => !enabledFormats.includes(f)),
    hideMature, muteTags: muted, genreLabels, ...extra,
  }), [key, genreLabels]) // eslint-disable-line
}
