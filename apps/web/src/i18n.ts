import { getLocale, isLocale, setLocale, type Locale } from '@netgongbu/schema';

// Imported first by main.tsx, so the language is set before any module builds its labels.

const LOCALE_KEY = 'netgongbu.locale';

/** The language picked in the settings, else the browser's: Korean for Korean, English otherwise. */
function startLocale(): Locale {
  // Outside a browser (tests): the default, Korean.
  if (typeof window === 'undefined') return getLocale();
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage blocked: fall back to the browser's language.
  }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export const locale: Locale = startLocale();
setLocale(locale);
if (typeof document !== 'undefined') document.documentElement.lang = locale;

/** Remembers the language and reloads, so every label, scenario and example is rebuilt in it. */
export function changeLocale(next: Locale): void {
  if (next === locale) return;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    return;
  }
  window.location.reload();
}
