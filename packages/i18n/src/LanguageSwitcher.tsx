import React, { useEffect, useRef } from 'react';
import { languageNames, locales, type Locale } from './index';

/** A single compact language affordance for desktop, tablet, mobile and dialogs.
 * Native <details>/<summary> retains keyboard activation without a heavyweight menu library.
 * Full language names remain available in an accessible, focusable popup. */
export function LanguageSwitcher({
  locale,
  onChange,
  label,
}: {
  locale: Locale;
  onChange: (value: Locale) => void;
  label: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (details.current && !details.current.contains(event.target as Node))
        details.current.removeAttribute('open');
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && details.current?.open) {
        event.preventDefault();
        details.current.open = false;
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <details className="language-picker" ref={details} data-testid="language-picker">
      <summary ref={trigger} aria-label={label} title={label} data-testid="language-toggle" data-current-language={locale}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-4 5-4 13 0 18M12 3c4 5 4 13 0 18"/>
        </svg>
        <bdi className="language-code">{locale.toUpperCase()}</bdi>
        <svg className="language-chevron" viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="m5 7 5 5 5-5"/>
        </svg>
      </summary>
      <div className="language-options" role="group" aria-label={label}>
        {locales.map((lang) => (
          <button type="button" key={lang} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className={locale === lang ? 'selected' : undefined}
            data-testid={`language-${lang}`}
            aria-pressed={locale === lang}
            onClick={() => { details.current?.removeAttribute('open'); onChange(lang); }}
          >
            <span>{languageNames[lang]}</span>
            {locale === lang && <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 10 4 4 8-8"/></svg>}
          </button>
        ))}
      </div>
    </details>
  );
}
