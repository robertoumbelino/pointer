'use client'

import { getTranslation, type Locale } from './i18n'

type LanguageSwitcherProps = {
  ariaLabel: string
  locale: Locale
}

const languages: Locale[] = ['pt', 'en', 'es']

export function LanguageSwitcher({ ariaLabel, locale }: LanguageSwitcherProps) {
  function changeLanguage(language: Locale): void {
    document.cookie = `pointer.locale=${language};path=/;max-age=31536000;samesite=lax`
    window.location.reload()
  }

  return (
    <div className="language-switcher" role="group" aria-label={ariaLabel}>
      {languages.map((language) => (
        <button
          type="button"
          lang={getTranslation(language).htmlLang}
          aria-pressed={language === locale}
          className={language === locale ? 'active' : undefined}
          onClick={() => changeLanguage(language)}
          key={language}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
