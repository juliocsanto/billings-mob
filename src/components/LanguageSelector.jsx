/**
 * LanguageSelector — toggle between pt-BR and en.
 *
 * - Reads and writes via i18next (persisted to localStorage key 'billings_locale').
 * - Accessible: role=group, aria-pressed on each button, aria-label on each button.
 * - Clicking the already-active locale is a no-op (no redundant changeLanguage call).
 * - Visual state: active button uses DS.primary fill; inactive is transparent with border.
 *
 * ADR-014: single namespace, pt-BR default, localStorage persistence.
 */
import { useTranslation } from 'react-i18next';
import { DS } from '../constants.js';

const LOCALES = [
  { code: 'pt-BR', label: 'PT', ariaLabel: 'Português' },
  { code: 'en',   label: 'EN', ariaLabel: 'English' },
];

export function LanguageSelector() {
  const { i18n } = useTranslation();
  const current = i18n.language;

  const handleChange = (code) => {
    if (code === current) return;
    i18n.changeLanguage(code);
    // i18next-browser-languagedetector persists to 'billings_locale' in localStorage automatically
  };

  return (
    <div
      role="group"
      aria-label={current === 'pt-BR' ? 'Selecionar idioma' : 'Select language'}
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
      }}
    >
      {LOCALES.map(({ code, label, ariaLabel }) => {
        const isActive = current === code;
        return (
          <button
            key={code}
            onClick={() => handleChange(code)}
            aria-pressed={isActive}
            aria-label={ariaLabel}
            style={{
              background: isActive ? DS.primary : 'transparent',
              color: isActive ? DS.surface : DS.textSec,
              border: `1.5px solid ${isActive ? DS.primary : DS.border}`,
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: isActive ? 'default' : 'pointer',
              fontFamily: 'Lato, sans-serif',
              transition: 'all 0.15s',
              minWidth: 28,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
