// @vitest-environment jsdom
/**
 * ThemeToggle + OfflineIndicator unit tests
 *
 * AC (ThemeToggle): role=switch reflects the documentElement .dark class;
 *   toggling flips the class, persists billings-theme and updates the
 *   meta[name=theme-color].
 * AC (OfflineIndicator): hidden while online; appears on the offline event;
 *   disappears on the online event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { ThemeToggle } from '../ThemeToggle';
import { OfflineIndicator } from '../OfflineIndicator';

beforeEach(() => {
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  document.head.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', '#F7F8FA');
  document.head.appendChild(meta);
});

afterEach(cleanup);

describe('ThemeToggle', () => {
  it('starts unchecked in light mode and checked in dark mode', () => {
    const { unmount } = render(<ThemeToggle />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    unmount();

    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling to dark sets the class, persists and updates theme-color', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('switch'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('billings-theme')).toBe('dark');
    expect(
      document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    ).toBe('#0F1623');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling back to light restores class, storage and theme-color', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('switch'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('billings-theme')).toBe('light');
    expect(
      document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    ).toBe('#F7F8FA');
  });
});

describe('OfflineIndicator', () => {
  it('is hidden while online and appears/disappears with connectivity events', () => {
    render(<OfflineIndicator />);
    expect(screen.queryByTestId('offline-indicator')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('offline-indicator')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ui.offline');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByTestId('offline-indicator')).toBeNull();
  });
});
