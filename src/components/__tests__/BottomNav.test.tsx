// @vitest-environment jsdom
/**
 * BottomNav unit tests.
 *
 * Covers:
 *  - Renders five nav tabs with correct data-testid and role="tab"
 *  - Active tab has aria-selected="true"; others have aria-selected="false"
 *  - Active indicator span is present with aria-hidden="true" on every button
 *  - Active indicator has bg-primary on the active tab; bg-transparent on inactive
 *  - onNavigate is called with the correct tab id when a button is clicked
 *  - PERFIL_GROUP tabs (vinculo, notificacoes, feedback) highlight the perfil button
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BottomNav } from '../BottomNav';

afterEach(cleanup);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

describe('BottomNav', () => {
  it('renders five tab buttons with data-testid attributes', () => {
    render(<BottomNav tab="hoje" onNavigate={vi.fn()} />);
    const ids = ['hoje', 'grafico', 'analise', 'guia', 'perfil'];
    ids.forEach((id) => {
      expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument();
    });
  });

  it('marks the active tab with aria-selected="true"', () => {
    render(<BottomNav tab="grafico" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('nav-grafico')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('nav-hoje')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders an aria-hidden indicator span inside every button', () => {
    render(<BottomNav tab="hoje" onNavigate={vi.fn()} />);
    const buttons = screen.getAllByRole('tab');
    buttons.forEach((btn) => {
      // The icon also has aria-hidden; we need the span indicator specifically
      const spans = btn.querySelectorAll('span[aria-hidden="true"]');
      expect(spans.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('active indicator has bg-primary class on the active tab', () => {
    render(<BottomNav tab="analise" onNavigate={vi.fn()} />);
    const activeBtn = screen.getByTestId('nav-analise');
    const indicator = activeBtn.querySelector('span[aria-hidden="true"]');
    expect(indicator?.className).toContain('bg-primary');
  });

  it('inactive indicator has bg-transparent on inactive tabs', () => {
    render(<BottomNav tab="analise" onNavigate={vi.fn()} />);
    const inactiveBtn = screen.getByTestId('nav-hoje');
    const indicator = inactiveBtn.querySelector('span[aria-hidden="true"]');
    expect(indicator?.className).toContain('bg-transparent');
  });

  it('calls onNavigate with the tab id when a button is clicked', () => {
    const onNavigate = vi.fn();
    render(<BottomNav tab="hoje" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('nav-grafico'));
    expect(onNavigate).toHaveBeenCalledWith('grafico');
  });

  it('highlights perfil for secondary tabs in PERFIL_GROUP', () => {
    render(<BottomNav tab="vinculo" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('nav-perfil')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('nav-hoje')).toHaveAttribute('aria-selected', 'false');
  });
});
