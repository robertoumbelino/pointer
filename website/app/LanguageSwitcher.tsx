'use client'

import { useEffect, useRef, useState } from 'react'
import { getTranslation, type Locale } from './i18n'

type LanguageSwitcherProps = {
  ariaLabel: string
  locale: Locale
}

const languages: Locale[] = ['pt', 'en', 'es']

export function LanguageSwitcher({ ariaLabel, locale }: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  function changeLanguage(language: Locale): void {
    document.cookie = `pointer.locale=${language};path=/;max-age=31536000;samesite=lax`
    window.location.reload()
  }

  return (
    <div className="language-dropdown" ref={containerRef}>
      <button
        type="button"
        className="language-trigger"
        aria-label={`${ariaLabel}: ${getTranslation(locale).languageName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12S9.6 18.5 12 21" />
        </svg>
        <span className="language-current-name">{getTranslation(locale).languageName}</span>
        <span className="language-current-code">{locale.toUpperCase()}</span>
        <svg className="language-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {isOpen ? (
        <div className="language-menu" role="menu" aria-label={ariaLabel}>
          <p>{ariaLabel}</p>
          {languages.map((language) => {
            const languageCopy = getTranslation(language)

            return (
              <button
                type="button"
                role="menuitemradio"
                lang={languageCopy.htmlLang}
                aria-checked={language === locale}
                className={language === locale ? 'active' : undefined}
                onClick={() => changeLanguage(language)}
                key={language}
              >
                <span>{languageCopy.languageName}</span>
                <small>{language.toUpperCase()}</small>
                {language === locale ? <strong aria-hidden="true">✓</strong> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
