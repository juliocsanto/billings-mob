// @vitest-environment jsdom
/**
 * Card / Input / Textarea / Skeleton / EmptyState / Badge unit tests
 *
 * AC (Input/Textarea): label is associated; error renders as role=alert and
 *   sets aria-invalid; hint renders when no error.
 * AC (Skeleton): aria-hidden; SkeletonCard exposes role=status.
 * AC (EmptyState): renders title/description/action.
 * AC (Badge): tone maps to semantic classes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Card } from '../Card';
import { Input, Textarea } from '../Input';
import { Skeleton, SkeletonCard } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { Badge } from '../Badge';

afterEach(cleanup);

describe('Card', () => {
  it('renders children on a surface with card classes', () => {
    render(<Card data-testid="c">conteúdo</Card>);
    const card = screen.getByTestId('c');
    expect(card).toHaveTextContent('conteúdo');
    expect(card.className).toContain('bg-surface');
    expect(card.className).toContain('rounded-card');
  });
});

describe('Input', () => {
  it('associates the label with the field', () => {
    render(<Input label="E-mail" />);
    expect(screen.getByLabelText('E-mail')).toBeInstanceOf(HTMLInputElement);
  });

  it('renders error as role=alert and sets aria-invalid', () => {
    render(<Input label="E-mail" error="E-mail inválido" />);
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail inválido');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders hint when there is no error', () => {
    render(<Input label="E-mail" hint="Usaremos para o link mágico" />);
    expect(screen.getByText('Usaremos para o link mágico')).toBeInTheDocument();
  });
});

describe('Textarea', () => {
  it('associates the label and accepts typing attributes', () => {
    render(<Textarea label="Notas" maxLength={500} />);
    const field = screen.getByLabelText('Notas');
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    expect(field).toHaveAttribute('maxlength', '500');
  });
});

describe('Skeleton', () => {
  it('is aria-hidden', () => {
    render(<Skeleton data-testid="sk" className="h-4 w-20" />);
    expect(screen.getByTestId('sk')).toHaveAttribute('aria-hidden', 'true');
  });

  it('SkeletonCard exposes a polite live region', () => {
    render(<SkeletonCard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title="Nenhum registro ainda"
        description="Comece registrando a observação de hoje."
        action={<button>Registrar</button>}
        data-testid="empty"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nenhum registro ainda' })).toBeInTheDocument();
    expect(screen.getByText('Comece registrando a observação de hoje.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
  });
});

describe('Badge', () => {
  it('maps tone to semantic classes', () => {
    render(<Badge tone="success" data-testid="b">Ativo</Badge>);
    const badge = screen.getByTestId('b');
    expect(badge).toHaveTextContent('Ativo');
    expect(badge.className).toContain('bg-success-light');
  });
});
