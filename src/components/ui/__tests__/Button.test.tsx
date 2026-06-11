// @vitest-environment jsdom
/**
 * Button unit tests
 *
 * AC: renders children and fires onClick.
 * AC: loading disables the button, sets aria-busy and shows a spinner.
 * AC: disabled blocks onClick.
 * AC: defaults to type="button" (no accidental form submits).
 * AC: variant/size/fullWidth map to the expected classes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button } from '../Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button"', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('loading disables the button, sets aria-busy and shows a spinner', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Salvar
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('[role="status"]')).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled blocks onClick', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Salvar
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant, size and fullWidth classes', () => {
    render(
      <Button variant="danger" size="lg" fullWidth>
        Excluir
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-danger');
    expect(btn.className).toContain('min-h-[48px]');
    expect(btn.className).toContain('w-full');
  });

  it('passes through data-testid', () => {
    render(<Button data-testid="save-observation">Salvar</Button>);
    expect(screen.getByTestId('save-observation')).toBeInTheDocument();
  });
});
