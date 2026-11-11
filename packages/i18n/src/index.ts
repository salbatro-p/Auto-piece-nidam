import { formatBusinessDateTime } from './date-time';

export const locales = ['ar', 'fr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const languageNames: Record<Locale, string> = {
  ar: 'العربية (AR)',
  fr: 'Français (FR)',
  en: 'English (EN)',
};
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale);
}
export function resolveLocale(stored?: string | null, browser?: string, fallback: Locale = 'fr'): Locale {
  if (isLocale(stored)) return stored;
  const lang = browser?.split('-')[0]?.toLowerCase();
  return isLocale(lang) ? lang : fallback;
}
export const direction = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');
export const numberLocale = (locale: Locale) => ({ ar: 'ar-MA', fr: 'fr-MA', en: 'en-GB' })[locale];
export const money = (minor: number, locale: Locale) =>
  new Intl.NumberFormat(numberLocale(locale), { style: 'currency', currency: 'MAD' }).format(minor / 100);
export const quantity = (value: number, locale: Locale) =>
  new Intl.NumberFormat(numberLocale(locale)).format(value);
export const dateTime = (value: string | Date, locale: Locale) =>
  formatBusinessDateTime(value, numberLocale(locale));
/** Parse exact minor units; never use binary floating point to calculate stored money. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}
export function parseMoney(value: string): number {
  const digits = normalizeDigits(value);
  const normalized = digits.replace(/[\s\u202f\u00a0\u066c]/g, '').replace(/[\u066b,]/g, '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('INVALID_MONEY');
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('INVALID_MONEY');
  return minor;
}
export function contentValue(
  values: Partial<Record<Locale, string>> | undefined,
  locale: Locale,
  review: Partial<Record<Locale, string>> = {},
) {
  if (values?.[locale]) return { value: values[locale]!, missing: false, sourceLocale: locale };
  const sourceLocale = locales.find((lang) => values?.[lang] && review[lang] === 'APPROVED');
  return {
    value: sourceLocale ? (values?.[sourceLocale] ?? '') : '',
    missing: true,
    sourceLocale: sourceLocale ?? locale,
  };
}
