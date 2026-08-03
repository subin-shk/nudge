/**
 * A ~60-line i18n runtime.
 *
 * Why not an off-the-shelf library: Nudge needs exactly three things —
 * flat-key lookup, `{placeholder}` interpolation, and English fallback for
 * partially-translated locales. Everything else an i18n framework provides
 * (namespaces, lazy loading, ICU plurals, backends) is weight this app would
 * never use, and it would have to be bundled into four separate renderers.
 *
 * Plural handling convention: supply `key.one` / `key.other` and call
 * `t('key', { count })`. The selector is per-locale (see `pluralRules`), so
 * languages with different plural categories can override it.
 */

import { en } from './locales/en'
import { es } from './locales/es'
import { de } from './locales/de'
import { ne } from './locales/ne'
import type { LocaleId } from '../types/settings'

export type Messages = Record<string, string>

export interface LocaleMeta {
  id: LocaleId
  /** Endonym — a language list should read in its own language. */
  nativeName: string
  englishName: string
  messages: Messages
  /** Fraction of English keys translated, computed at module load. */
  coverage: number
}

/** Plural category selector. Extend per-locale when adding a language. */
const pluralRules: Partial<Record<LocaleId, (count: number) => 'one' | 'other'>> = {}

const defaultPlural = (count: number): 'one' | 'other' => (count === 1 ? 'one' : 'other')

const rawLocales: Array<Omit<LocaleMeta, 'coverage'>> = [
  { id: 'en', nativeName: 'English', englishName: 'English', messages: en },
  { id: 'es', nativeName: 'Español', englishName: 'Spanish', messages: es },
  { id: 'de', nativeName: 'Deutsch', englishName: 'German', messages: de },
  { id: 'ne', nativeName: 'नेपाली', englishName: 'Nepali', messages: ne }
]

const englishKeyCount = Object.keys(en).length

export const LOCALES: LocaleMeta[] = rawLocales.map((locale) => {
  const translated = Object.keys(en).filter((key) => key in locale.messages).length
  return { ...locale, coverage: englishKeyCount === 0 ? 1 : translated / englishKeyCount }
})

const byId = new Map<LocaleId, LocaleMeta>(LOCALES.map((l) => [l.id, l]))

export function getLocaleMeta(id: LocaleId): LocaleMeta {
  return byId.get(id) ?? byId.get('en')!
}

export type TranslateParams = Record<string, string | number> & { count?: number }
export type Translator = ((key: string, params?: TranslateParams) => string) & {
  locale: LocaleId
  /** Returns null instead of the key when a string is genuinely optional. */
  maybe: (key: string, params?: TranslateParams) => string | null
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}

/**
 * Build a translator for `locale`.
 *
 * Lookup order: exact key in locale → plural variant in locale → same in
 * English → the key itself (which makes missing strings loudly visible in dev
 * rather than rendering an empty box in production).
 */
export function createTranslator(locale: LocaleId): Translator {
  const meta = getLocaleMeta(locale)
  const selectPlural = pluralRules[locale] ?? defaultPlural

  const lookup = (key: string, params?: TranslateParams): string | null => {
    const candidates: string[] = []
    if (params && typeof params.count === 'number') {
      candidates.push(`${key}.${selectPlural(params.count)}`)
    }
    candidates.push(key)

    for (const candidate of candidates) {
      const value = meta.messages[candidate] ?? en[candidate]
      if (typeof value === 'string') return interpolate(value, params)
    }
    return null
  }

  const translate = ((key: string, params?: TranslateParams): string => lookup(key, params) ?? key) as Translator

  translate.locale = locale
  translate.maybe = (key, params) => lookup(key, params)
  return translate
}

/**
 * Merge extra strings into a locale at runtime.
 *
 * Used by the plugin loader: a declarative reminder plugin supplies its own
 * labels, which are injected here under `plugin.*` keys so plugin strings resolve
 * through exactly the same lookup and fallback path as built-in ones.
 *
 * Existing keys are never overwritten — a plugin cannot rewrite the app's copy.
 */
export function registerMessages(locale: LocaleId, messages: Messages): void {
  const target = getLocaleMeta(locale).messages
  for (const [key, value] of Object.entries(messages)) {
    if (!(key in target)) target[key] = value
  }
}

/** Best-effort map from an OS locale string ('es-419') to a shipped locale. */
export function resolveSystemLocale(systemLocale: string): LocaleId {
  const base = systemLocale.toLowerCase().split(/[-_]/)[0]
  const match = LOCALES.find((l) => l.id === base)
  return match?.id ?? 'en'
}
