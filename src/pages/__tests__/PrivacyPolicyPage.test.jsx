// @vitest-environment jsdom
/**
 * PrivacyPolicyPage unit tests — TDD Red/Green/Refactor for Sprint 6.10
 *
 * Feature: Public /privacy page with bilingual privacy policy
 *
 * AC1 — Page renders without crash
 * AC2 — Contains contact email juliocsanto3@gmail.com
 * AC3 — Contains the clinical notice (that the app does NOT classify days as
 *        fertile/infertile) — this text must be present and is NOT a violation
 *        of the clinical constraint (it is a disclaimer that the app does NOT do it)
 * AC4 — The "← Voltar" back link exists and points to "/"
 * AC5 — In English mode, back link reads "← Back"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// ── Mock react-i18next ────────────────────────────────────────────────────────
let mockLanguage = 'pt-BR';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      get language() { return mockLanguage; },
    },
  }),
}));

// ── Mock DS constants ─────────────────────────────────────────────────────────
vi.mock('../../constants.js', () => ({
  DS: {
    bg: '#F7F8FA',
    surface: '#FFFFFF',
    textMain: '#1A2B4A',
    textSec: '#6B7280',
    border: '#E5E7EB',
    primary: '#37517E',
    radiusCard: 8,
    shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
  },
}));

import { PrivacyPolicyPage } from '../PrivacyPolicyPage.jsx';

describe('PrivacyPolicyPage', () => {
  beforeEach(() => {
    mockLanguage = 'pt-BR';
  });

  afterEach(() => {
    cleanup();
  });

  it('AC1: renders without crash and shows the main heading', () => {
    render(React.createElement(PrivacyPolicyPage));
    // The page heading must be present — confirms the component rendered its content
    const headings = document.querySelectorAll('h1, h2');
    expect(headings.length).toBeGreaterThan(0);
    // Back link must be present in PT-BR
    expect(screen.getByText(/← Voltar/i)).toBeInTheDocument();
  });

  it('AC2: contains the contact email in PT-BR mode', () => {
    render(React.createElement(PrivacyPolicyPage));

    // Email appears multiple times in the policy
    const emailElements = screen.getAllByText(/juliocsanto3@gmail\.com/i);
    expect(emailElements.length).toBeGreaterThan(0);
  });

  it('AC2b: contains the contact email in EN mode', () => {
    mockLanguage = 'en';
    render(React.createElement(PrivacyPolicyPage));

    const emailElements = screen.getAllByText(/juliocsanto3@gmail\.com/i);
    expect(emailElements.length).toBeGreaterThan(0);
  });

  it('AC3: contains the clinical notice in PT-BR (app does NOT classify days)', () => {
    render(React.createElement(PrivacyPolicyPage));

    // The text must state the app does NOT classify — this is the legal disclaimer
    const pageText = document.body.textContent;
    expect(pageText).toContain('NÃO classifica');
  });

  it('AC3b: contains the clinical notice in EN (app does NOT classify days)', () => {
    mockLanguage = 'en';
    render(React.createElement(PrivacyPolicyPage));

    const pageText = document.body.textContent;
    expect(pageText).toContain('does NOT automatically classify');
  });

  it('AC4: the back link exists and points to "/" in PT-BR', () => {
    render(React.createElement(PrivacyPolicyPage));

    const backLink = screen.getByText(/← Voltar/i).closest('a');
    expect(backLink).toBeTruthy();
    expect(backLink.getAttribute('href')).toBe('/');
  });

  it('AC5: back link reads "← Back" in English mode', () => {
    mockLanguage = 'en';
    render(React.createElement(PrivacyPolicyPage));

    const backLink = screen.getByText(/← Back/i).closest('a');
    expect(backLink).toBeTruthy();
    expect(backLink.getAttribute('href')).toBe('/');
  });

  it('renders PT-BR title when language starts with pt', () => {
    mockLanguage = 'pt-BR';
    render(React.createElement(PrivacyPolicyPage));

    const pageText = document.body.textContent;
    expect(pageText).toContain('Política de Privacidade');
  });

  it('renders EN title when language does not start with pt', () => {
    mockLanguage = 'en';
    render(React.createElement(PrivacyPolicyPage));

    const pageText = document.body.textContent;
    expect(pageText).toContain('Privacy Policy');
  });
});
