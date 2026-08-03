/**
 * Translator hook.
 *
 * Memoised on the locale so `t` is referentially stable between renders — it is
 * passed into `useMemo`/`useCallback` dependency arrays all over the UI, and a
 * fresh function every render would defeat every one of them.
 */

import { useMemo } from 'react'
import { createTranslator, type Translator } from '@shared/i18n'
import { useAppStore } from '../store/useAppStore'

export function useTranslator(): Translator {
  const locale = useAppStore((state) => state.settings.general.locale)
  return useMemo(() => createTranslator(locale), [locale])
}

/** For the overlay/mascot windows, which receive a locale but have no store. */
export function useStandaloneTranslator(locale: Parameters<typeof createTranslator>[0]): Translator {
  return useMemo(() => createTranslator(locale), [locale])
}
