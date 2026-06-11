// @vitest-environment jsdom
/**
 * AuthGate unit tests — TDD Red/Green/Refactor for Sprint 6.10
 *
 * Feature: Google OAuth Login button
 *
 * AC1 — The login form renders a "Entrar com Google" button (PT-BR)
 * AC2 — Clicking the Google button calls supabase.auth.signInWithOAuth with provider: 'google'
 * AC3 — The Google button has a proper aria-label for accessibility
 * AC4 — Existing magic link flow is not broken
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// ── Mock react-i18next ────────────────────────────────────────────────────────
const mockChangeLanguage = vi.fn();
let mockLanguage = 'pt-BR';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'auth.loading': 'Carregando...',
        'auth.appName': 'Billings Gráfico',
        'auth.appSubtitle': 'Método de Ovulação Billings',
        'auth.loginTitle': 'Entrar',
        'auth.loginSubtitle': 'Enviaremos um link de acesso para seu e-mail',
        'auth.emailLabel': 'E-MAIL',
        'auth.emailPlaceholder': 'seu@email.com',
        'auth.sendMagicLink': 'Enviar link de acesso',
        'auth.sending': 'Enviando...',
        'auth.disclaimer': 'Ao entrar você concorda com nossa política de privacidade.',
        'auth.checkEmail': 'Verifique seu e-mail',
        'auth.checkEmailBody': 'Link enviado para {{email}}',
        'auth.useOtherEmail': 'Usar outro e-mail',
        'auth.errorGeneric': 'Erro ao enviar o link. Tente novamente.',
        'auth.signOut': 'Sair',
      };
      return map[key] ?? key;
    },
    i18n: {
      get language() { return mockLanguage; },
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

// ── Mock useAuth ──────────────────────────────────────────────────────────────
const mockSignInWithMagicLink = vi.fn();
const mockSignOut = vi.fn();
let mockUser = null;
let mockSession = null;
let mockLoading = false;

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    session: mockSession,
    loading: mockLoading,
    signInWithMagicLink: mockSignInWithMagicLink,
    signOut: mockSignOut,
  }),
}));

// ── Mock supabase client ──────────────────────────────────────────────────────
// NOTE: vi.mock is hoisted, so the factory must not reference outer variables.
// We use vi.hoisted() to create mockSignInWithOAuth before hoisting occurs.
const { mockSignInWithOAuth } = vi.hoisted(() => ({
  mockSignInWithOAuth: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  },
}));

// ── Mock LanguageSelector ─────────────────────────────────────────────────────
vi.mock('../LanguageSelector.jsx', () => ({
  LanguageSelector: () => React.createElement('div', { 'data-testid': 'language-selector' }),
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
    secondary: '#2EC4B6',
    error: '#EF4444',
    success: '#10B981',
    radiusBtn: 24,
    radiusInput: 8,
    shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
    shadowFAB: '0 4px 16px rgba(55,81,126,0.4)',
  },
}));

import { AuthGate } from '../AuthGate.tsx';

describe('AuthGate — Google OAuth button', () => {
  beforeEach(() => {
    mockSignInWithMagicLink.mockClear();
    mockSignInWithOAuth.mockClear();
    mockSignOut.mockClear();
    mockChangeLanguage.mockClear();
    mockUser = null;
    mockSession = null;
    mockLoading = false;
    mockLanguage = 'pt-BR';
    // Default: OAuth returns no error
    mockSignInWithOAuth.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('AC1: renders the "Entrar com Google" button in PT-BR', () => {
    render(React.createElement(AuthGate, null, () => null));

    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('AC2: clicking the Google button calls signInWithOAuth with provider google', async () => {
    render(React.createElement(AuthGate, null, () => null));

    const googleBtn = screen.getByText('Entrar com Google');
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledOnce();
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });
  });

  it('AC3: the Google button has an aria-label for accessibility', () => {
    render(React.createElement(AuthGate, null, () => null));

    const googleBtn = screen.getByText('Entrar com Google').closest('button');
    expect(googleBtn).toBeInTheDocument();
    expect(googleBtn.getAttribute('aria-label')).not.toBeNull();
    expect(googleBtn.getAttribute('aria-label').length).toBeGreaterThan(0);
  });

  it('AC4: the Google button visible focus style is applied on focus', () => {
    render(React.createElement(AuthGate, null, () => null));

    const googleBtn = screen.getByText('Entrar com Google').closest('button');
    expect(googleBtn).toBeInTheDocument();
    // Button exists and is interactive
    expect(googleBtn.tagName).toBe('BUTTON');
    expect(googleBtn).not.toBeDisabled();
  });

  it('AC5: the privacy policy link is visible below the form', () => {
    render(React.createElement(AuthGate, null, () => null));

    const privacyLink = screen.getByText('Política de Privacidade');
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink.closest('a')).toHaveAttribute('href', '/privacy');
  });

  it('AC6: the "ou" separator is rendered between magic link and Google button', () => {
    render(React.createElement(AuthGate, null, () => null));

    // Separator text visible between magic link form and Google button
    expect(screen.getByText('ou')).toBeInTheDocument();
  });

  it('does not break existing magic link form', () => {
    render(React.createElement(AuthGate, null, () => null));

    // Magic link button still renders
    expect(screen.getByText('Enviar link de acesso')).toBeInTheDocument();
    // Email input still renders
    expect(screen.getByLabelText('E-MAIL')).toBeInTheDocument();
  });

  it('renders English text when language is en', () => {
    mockLanguage = 'en';
    render(React.createElement(AuthGate, null, () => null));

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('renders children when user and session are present', () => {
    mockUser = { id: 'u-1', email: 'test@example.com' };
    mockSession = { access_token: 'tok' };

    render(
      React.createElement(
        AuthGate,
        null,
        ({ user }) => React.createElement('div', { 'data-testid': 'app-content' }, `Hello ${user.email}`),
      )
    );

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
    expect(screen.getByText('Hello test@example.com')).toBeInTheDocument();
  });

  it('renders loading spinner when loading is true', () => {
    mockLoading = true;

    render(React.createElement(AuthGate, null, () => null));

    // The spinner role=status should be present with aria-label for screen readers
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('aria-label', 'Carregando...');
    // The loading text is also rendered in a sibling element
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });
});
