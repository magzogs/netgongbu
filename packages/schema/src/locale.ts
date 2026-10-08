// The language of everything the app writes: the viewer, the scenarios it builds and the AI's
// answers. One per process: the viewer sets it at startup (changing it reloads the page), and the
// desktop main process and the web server take it from the viewer.

export const LOCALES = ['ko', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language's name, written in that language (for the picker). */
export const LOCALE_NAMES: Record<Locale, string> = { ko: '한국어', en: 'English' };

let current: Locale = 'ko';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

/** The text in the current language: tr('닫기', 'Close'). */
export function tr(ko: string, en: string): string {
  return current === 'en' ? en : ko;
}
