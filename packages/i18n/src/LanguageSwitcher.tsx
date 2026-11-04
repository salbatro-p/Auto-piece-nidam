import React from 'react';
import { languageNames, locales, type Locale } from './index';
export function LanguageSwitcher({
  locale,
  onChange,
  label,
}: {
  locale: Locale;
  onChange: (value: Locale) => void;
  label: string;
}) {
  return (
    <div className="language-switcher" role="group" aria-label={label}>
      {locales.map((lang) => (
        <button
          type="button"
          lang={lang}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          key={lang}
          data-testid={`language-${lang}`}
          aria-pressed={locale === lang}
          onClick={() => onChange(lang)}
        >
          {languageNames[lang]}
        </button>
      ))}
    </div>
  );
}
