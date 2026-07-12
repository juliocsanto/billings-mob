// @vitest-environment jsdom
/**
 * Unit tests — OnboardingFlow component.
 *
 * Covers:
 *  - Renders on first use (no localStorage flag set)
 *  - Hidden / not rendered when the flag is set (App-level gate)
 *  - Next button advances steps (1→2→...→5)
 *  - Skip calls onFinish (sets flag and closes)
 *  - Finish button on last step calls onFinish
 *  - data-testid attributes present on all interactive elements
 *  - Accessibility: role=dialog, aria-modal, aria-labelledby
 *  - Clinical constraint: ZERO fertility classification text anywhere
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { OnboardingFlow } from '../OnboardingFlow.jsx';

afterEach(cleanup);

// ── Mock react-i18next ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        'onboarding.dialogLabel': 'Introdução ao Billings Gráfico',
        'onboarding.progressAria': `Passo ${opts?.current ?? 1} de ${opts?.total ?? 5}`,
        'onboarding.skip': 'Pular introdução',
        'onboarding.next': 'Próximo',
        'onboarding.finish': 'Começar',
        'onboarding.step1Title': 'Bem-vinda ao Billings Gráfico',
        'onboarding.step1Body': 'Este app ajuda você a registrar suas observações diárias do ciclo.',
        'onboarding.step2Title': 'O carimbo da observação',
        'onboarding.step2Body': 'Cada dia tem um carimbo: Sangramento, Seco, Muco ou Ápice.',
        'onboarding.step3Title': 'Muco e sensação',
        'onboarding.step3Body': 'Quando há muco, você registra o tipo e a sensação.',
        'onboarding.step4Title': 'O papel da instrutora',
        'onboarding.step4Body': 'O app não classifica dias — quem interpreta é sua instrutora.',
        'onboarding.step5Title': 'Seus dados são seus',
        'onboarding.step5Body': 'Seus registros ficam no seu dispositivo e são sincronizados de forma segura.',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderFlow(onFinish = vi.fn()) {
  return render(<OnboardingFlow onFinish={onFinish} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OnboardingFlow — rendering', () => {
  it('renders the onboarding overlay with correct testid', () => {
    renderFlow();
    expect(screen.queryByTestId('onboarding-overlay')).toBeInTheDocument();
  });

  it('renders with role=dialog and aria-modal=true', () => {
    renderFlow();
    const dialog = screen.getByTestId('onboarding-overlay');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('has aria-labelledby pointing to the step title element', () => {
    renderFlow();
    const dialog = screen.getByTestId('onboarding-overlay');
    const labelledById = dialog.getAttribute('aria-labelledby');
    expect(labelledById).toBeTruthy();
    // The referenced element must exist in the DOM
    expect(document.getElementById(labelledById)).toBeTruthy();
  });

  it('renders step 1 content on mount (data-testid onboarding-step-1)', () => {
    renderFlow();
    expect(screen.queryByTestId('onboarding-step-1')).toBeInTheDocument();
    expect(screen.queryByText('Bem-vinda ao Billings Gráfico')).toBeInTheDocument();
  });

  it('renders skip button with correct testid and accessible label', () => {
    renderFlow();
    const skip = screen.getByTestId('onboarding-skip');
    expect(skip.getAttribute('aria-label')).toBe('Pular introdução');
  });

  it('renders next button (not finish) on first step', () => {
    renderFlow();
    expect(screen.queryByTestId('onboarding-next')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-finish')).toBeNull();
  });
});

describe('OnboardingFlow — navigation', () => {
  it('advances to step 2 when Next is clicked', () => {
    renderFlow();
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.queryByTestId('onboarding-step-2')).toBeInTheDocument();
    expect(screen.queryByText('O carimbo da observação')).toBeInTheDocument();
  });

  it('advances through all 5 steps via Next clicks', () => {
    renderFlow();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    // Should now be on step 5
    expect(screen.queryByTestId('onboarding-step-5')).toBeInTheDocument();
    expect(screen.queryByText('Seus dados são seus')).toBeInTheDocument();
  });

  it('shows finish button (not next) on the last step', () => {
    renderFlow();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    expect(screen.queryByTestId('onboarding-finish')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-next')).toBeNull();
  });
});

describe('OnboardingFlow — finish / skip callbacks', () => {
  it('calls onFinish when Skip is clicked', () => {
    const onFinish = vi.fn();
    renderFlow(onFinish);
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onFinish when Finish is clicked on last step', () => {
    const onFinish = vi.fn();
    renderFlow(onFinish);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    fireEvent.click(screen.getByTestId('onboarding-finish'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onFinish when Escape key is pressed', () => {
    const onFinish = vi.fn();
    renderFlow(onFinish);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingFlow — clinical constraint', () => {
  it('does not render any fertility classification text (step 1)', () => {
    const { container } = renderFlow();
    expect(container.textContent ?? '').not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });

  it('does not render any fertility classification text across all steps', () => {
    const onFinish = vi.fn();
    const { container } = renderFlow(onFinish);
    for (let i = 0; i < 4; i++) {
      expect(container.textContent ?? '').not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    // Final step
    expect(container.textContent ?? '').not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});

describe('OnboardingFlow — localStorage gate (App-level behaviour)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getOnboardingSeen returns false before it is set', async () => {
    const { getOnboardingSeen } = await import('../../../utils/storage.js');
    expect(getOnboardingSeen()).toBe(false);
  });

  it('setOnboardingSeen persists the flag so getOnboardingSeen returns true', async () => {
    const { getOnboardingSeen, setOnboardingSeen } = await import('../../../utils/storage.js');
    expect(getOnboardingSeen()).toBe(false);
    setOnboardingSeen();
    expect(getOnboardingSeen()).toBe(true);
  });
});
