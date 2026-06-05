// @vitest-environment jsdom
/**
 * LanguageSelector unit tests — TDD Green phase
 *
 * AC: renders PT and EN buttons.
 * AC: the active language button has aria-pressed="true".
 * AC: clicking EN calls i18n.changeLanguage('en').
 * AC: clicking PT calls i18n.changeLanguage('pt-BR').
 * AC: component has an accessible role=group container.
 * AC: clicking the already-active locale is a no-op (no redundant changeLanguage call).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// Lightweight mock — avoids needing a real i18next provider in unit tests.
const mockChangeLanguage = vi.fn();
let mockLanguage = 'pt-BR';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      get language() { return mockLanguage; },
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

// Import AFTER the mock is set up
import { LanguageSelector } from '../LanguageSelector.jsx';

describe('LanguageSelector', () => {
  beforeEach(() => {
    mockChangeLanguage.mockClear();
    mockLanguage = 'pt-BR';
  });

  afterEach(() => {
    cleanup();
  });

  it('renders PT and EN buttons', () => {
    render(<LanguageSelector />);
    // aria-label on each button makes them discoverable by accessible name
    const ptBtn = screen.getByRole('button', { name: /Português/i });
    const enBtn = screen.getByRole('button', { name: /English/i });
    expect(ptBtn).toBeDefined();
    expect(enBtn).toBeDefined();
  });

  it('PT button is aria-pressed="true" when language is pt-BR', () => {
    render(<LanguageSelector />);
    const ptBtn = screen.getByRole('button', { name: /Português/i });
    expect(ptBtn.getAttribute('aria-pressed')).toBe('true');
    const enBtn = screen.getByRole('button', { name: /English/i });
    expect(enBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('EN button is aria-pressed="true" when language is en', () => {
    mockLanguage = 'en';
    render(<LanguageSelector />);
    const enBtn = screen.getByRole('button', { name: /English/i });
    expect(enBtn.getAttribute('aria-pressed')).toBe('true');
    const ptBtn = screen.getByRole('button', { name: /Português/i });
    expect(ptBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking EN button calls i18n.changeLanguage("en")', () => {
    render(<LanguageSelector />);
    fireEvent.click(screen.getByRole('button', { name: /English/i }));
    expect(mockChangeLanguage).toHaveBeenCalledWith('en');
    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
  });

  it('clicking PT button calls i18n.changeLanguage("pt-BR")', () => {
    mockLanguage = 'en';
    render(<LanguageSelector />);
    fireEvent.click(screen.getByRole('button', { name: /Português/i }));
    expect(mockChangeLanguage).toHaveBeenCalledWith('pt-BR');
    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
  });

  it('has a role=group container wrapping the buttons', () => {
    render(<LanguageSelector />);
    expect(screen.getByRole('group')).toBeDefined();
  });

  it('does not call changeLanguage when clicking the already-active language', () => {
    // mockLanguage is 'pt-BR', clicking PT should be a no-op
    render(<LanguageSelector />);
    fireEvent.click(screen.getByRole('button', { name: /Português/i }));
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });
});
