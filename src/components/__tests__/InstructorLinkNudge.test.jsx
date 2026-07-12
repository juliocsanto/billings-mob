// @vitest-environment jsdom
/**
 * Unit tests — InstructorLinkNudge
 *
 * AC — 'none' renders the CTA card; button calls onNavigate('vinculo')
 * AC — 'pending' renders the awaiting note; no CTA
 * AC — 'active' renders nothing
 * AC — Clinical: no fertility classification language in any state
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

afterEach(cleanup);

import { InstructorLinkNudge } from '../InstructorLinkNudge.jsx';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const map = {
        'app.instructorNudgeTitle': 'Receba a interpretação do seu ciclo',
        'app.instructorNudgeBody':
          'Vincule-se a uma instrutora certificada CENPLAFAM/WOOMB — só ela interpreta seus registros.',
        'app.instructorNudgeCta': 'Vincular a uma instrutora',
        'app.instructorNudgePending': 'Convite enviado — aguardando sua instrutora aceitar.',
      };
      return map[key] ?? key;
    },
  }),
}));

const FORBIDDEN = /f[eé]rtil|inf[eé]rtil|inseguro|janela f[eé]rtil|per[ií]odo f[eé]rtil/i;

describe('InstructorLinkNudge', () => {
  it('renders the CTA card when status is "none"', () => {
    render(<InstructorLinkNudge status="none" onNavigate={() => {}} />);
    expect(screen.getByTestId('instructor-link-nudge')).toBeTruthy();
    expect(screen.getByTestId('instructor-link-nudge-cta')).toBeTruthy();
  });

  it('CTA button navigates to the vinculo tab', () => {
    const onNavigate = vi.fn();
    render(<InstructorLinkNudge status="none" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('instructor-link-nudge-cta'));
    expect(onNavigate).toHaveBeenCalledWith('vinculo');
  });

  it('renders the awaiting note (no CTA) when status is "pending"', () => {
    render(<InstructorLinkNudge status="pending" onNavigate={() => {}} />);
    expect(screen.getByTestId('instructor-link-nudge-pending')).toBeTruthy();
    expect(screen.queryByTestId('instructor-link-nudge-cta')).toBeNull();
  });

  it('renders nothing when status is "active"', () => {
    const { container } = render(<InstructorLinkNudge status="active" onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('never renders fertility classification language', () => {
    for (const status of ['none', 'pending']) {
      const { container } = render(<InstructorLinkNudge status={status} onNavigate={() => {}} />);
      expect(FORBIDDEN.test(container.textContent)).toBe(false);
      cleanup();
    }
  });
});
