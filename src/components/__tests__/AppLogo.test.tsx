// @vitest-environment jsdom
/**
 * AppLogo unit tests — render, accessibility, and prop-driven aria behaviour.
 *
 * WCAG 2.1 AA requirements verified:
 *   - Standalone mode: role="img" + aria-label in Portuguese
 *   - Decorative mode: aria-hidden="true" when adjacent to text
 *
 * Clinical constraint: symbols are notation categories; no fertile/infertile
 * label is rendered or implied.
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { AppLogo } from '../AppLogo';

afterEach(() => {
  cleanup();
});

describe('AppLogo', () => {
  describe('standalone mode (default)', () => {
    it('renders an SVG element', () => {
      render(<AppLogo />);
      expect(screen.getByTestId('app-logo')).toBeInTheDocument();
    });

    it('has role="img" and Portuguese aria-label in standalone mode', () => {
      render(<AppLogo />);
      const logo = screen.getByRole('img');
      expect(logo).toHaveAttribute('aria-label', 'Billings Gráfico');
    });

    it('uses the default 24×24 dimensions when size is not specified', () => {
      render(<AppLogo />);
      const logo = screen.getByTestId('app-logo');
      expect(logo).toHaveAttribute('width', '24');
      expect(logo).toHaveAttribute('height', '24');
    });

    it('applies a custom size', () => {
      render(<AppLogo size={40} />);
      const logo = screen.getByTestId('app-logo');
      expect(logo).toHaveAttribute('width', '40');
      expect(logo).toHaveAttribute('height', '40');
    });

    it('does NOT have aria-hidden in standalone mode', () => {
      render(<AppLogo />);
      const logo = screen.getByTestId('app-logo');
      expect(logo).not.toHaveAttribute('aria-hidden');
    });
  });

  describe('decorative mode (standalone=false)', () => {
    it('has aria-hidden="true" when standalone is false', () => {
      render(<AppLogo standalone={false} />);
      const logo = screen.getByTestId('app-logo');
      expect(logo).toHaveAttribute('aria-hidden', 'true');
    });

    it('does NOT have aria-label in decorative mode', () => {
      render(<AppLogo standalone={false} />);
      const logo = screen.getByTestId('app-logo');
      expect(logo).not.toHaveAttribute('aria-label');
    });
  });

  describe('clinical safety', () => {
    it('does not render any text implying fertile, infertil, seguro, or inseguro', () => {
      const { container } = render(<AppLogo />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
    });
  });

  describe('className prop', () => {
    it('forwards className to the SVG element', () => {
      render(<AppLogo className="my-logo" />);
      expect(screen.getByTestId('app-logo')).toHaveClass('my-logo');
    });
  });
});
