// @vitest-environment jsdom
/**
 * GuiaPage unit tests.
 *
 * Covers:
 *  - Renders the FAQ questions when no messages exist
 *  - Renders chat messages with correct alignment (user vs assistant)
 *  - Shows the loading indicator (role="status") when aiLoading is true
 *  - Loading dots use Tailwind arbitrary animation classes (no inline styles)
 *  - Calls sendAI with the FAQ question when a FAQ button is clicked
 *  - Calls sendAI when Enter is pressed in the input
 *  - Send button is disabled when aiLoading or input is empty
 *  - Clinical constraint: no fertile/infertile classification rendered
 */
import { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GuiaPage } from '../GuiaPage.jsx';

afterEach(cleanup);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const strings = {
        'app.guideTitle': 'Guia de anotação',
        'app.guideWarning': 'Este guia ajuda com o app.',
        'app.guideWarningCycleInterpretation': 'Interpretação do ciclo',
        'app.guideWarningCycleInterpretationSuffix': 'é responsabilidade da instrutora.',
        'app.guideFAQTitle': 'Perguntas frequentes',
        'app.guideFAQ1': 'Como anotar muco?',
        'app.guideFAQ2': 'O que é ápice?',
        'app.guideFAQ3': 'Como marcar sangramento?',
        'app.guideFAQ4': 'O que é seco?',
        'app.guideFAQ5': 'Como enviar à instrutora?',
        'app.guideInputPlaceholder': 'Escreva sua pergunta...',
        'app.guideSend': 'Enviar',
        'common.loading': 'Carregando...',
      };
      return strings[key] ?? key;
    },
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

const defaultProps = {
  msgs: [],
  input: '',
  setInput: vi.fn(),
  aiLoading: false,
  sendAI: vi.fn(),
  chatEnd: createRef(),
};

describe('GuiaPage', () => {
  it('renders FAQ questions when msgs is empty', () => {
    render(<GuiaPage {...defaultProps} />);
    expect(screen.getByText('Como anotar muco?')).toBeInTheDocument();
    expect(screen.getByText('O que é ápice?')).toBeInTheDocument();
  });

  it('calls sendAI with the FAQ question when FAQ button is clicked', () => {
    const sendAI = vi.fn();
    render(<GuiaPage {...defaultProps} sendAI={sendAI} />);
    fireEvent.click(screen.getByText('Como anotar muco?'));
    expect(sendAI).toHaveBeenCalledWith('Como anotar muco?');
  });

  it('renders user and assistant chat messages', () => {
    const msgs = [
      { role: 'user', content: 'Olá' },
      { role: 'assistant', content: 'Olá! Como posso ajudar?' },
    ];
    render(<GuiaPage {...defaultProps} msgs={msgs} />);
    expect(screen.getByText('Olá')).toBeInTheDocument();
    expect(screen.getByText('Olá! Como posso ajudar?')).toBeInTheDocument();
  });

  it('shows loading indicator with role="status" when aiLoading is true', () => {
    render(<GuiaPage {...defaultProps} aiLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('loading dots have no inline styles — Tailwind arbitrary animation classes only', () => {
    const { container } = render(<GuiaPage {...defaultProps} aiLoading />);
    const status = screen.getByRole('status');
    const dots = status.querySelectorAll('span');
    dots.forEach((dot) => {
      expect(dot.getAttribute('style')).toBeNull();
      expect(dot.className).toContain('[animation:');
    });
  });

  it('outer div has flex flex-col but no inline height style', () => {
    const { container } = render(<GuiaPage {...defaultProps} />);
    const outer = container.firstChild;
    expect(outer.className).toContain('flex');
    expect(outer.className).toContain('flex-col');
    expect(outer.getAttribute('style')).toBeNull();
  });

  it('disables send button when input is empty', () => {
    render(<GuiaPage {...defaultProps} input="" />);
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
  });

  it('disables send button when aiLoading is true', () => {
    render(<GuiaPage {...defaultProps} input="pergunta" aiLoading />);
    expect(screen.getByLabelText('Enviar')).toBeDisabled();
  });

  it('calls sendAI when Enter is pressed in input', () => {
    const sendAI = vi.fn();
    render(<GuiaPage {...defaultProps} input="pergunta" sendAI={sendAI} />);
    fireEvent.keyDown(screen.getByTestId('guide-question-input'), { key: 'Enter' });
    expect(sendAI).toHaveBeenCalledTimes(1);
  });

  it('clinical constraint: never renders fertil/infertil/seguro/inseguro', () => {
    const { container } = render(<GuiaPage {...defaultProps} />);
    expect(container.textContent).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
  });
});
