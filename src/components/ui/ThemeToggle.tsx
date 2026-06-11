import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'billings-theme';

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
  // Keep the PWA chrome (status bar / splash) in sync with the active theme.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0F1623' : '#F7F8FA');
}

/**
 * Light/dark switch. The initial value comes from the pre-paint script in
 * index.html (localStorage `billings-theme`, falling back to
 * prefers-color-scheme); this component only reflects and persists changes.
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';
  const toggle = () => {
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      onClick={toggle}
      data-testid="theme-toggle"
      className="inline-flex min-h-[44px] w-full items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-main hover:bg-primaryLight/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span>{t('ui.darkMode')}</span>
      <span
        aria-hidden="true"
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          theme === 'dark' ? 'bg-primary' : 'bg-border',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-card transition-all',
            theme === 'dark' ? 'left-[22px]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}
