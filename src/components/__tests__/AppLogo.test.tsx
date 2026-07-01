// @vitest-environment jsdom
/**
 * AppLogo unit tests — TDD Red/Green for LVL-04
 *
 * Assertions follow the spec contract (not vacuous):
 *   1. SVG element rendered with correct dimensions (24×24 default)
 *   2. aria contract: standalone=true → role="img" + aria-label; standalone=false → aria-hidden
 *   3. data-testid="app-logo" is present
 *   4. All four clinical notation shapes are present in the SVG
 *   5. Custom size prop changes width/height
 *   6. Custom className is forwarded to the SVG element
 *   7. Clinical constraint: no "fertil", "infertil", "seguro", "inseguro" rendered
 *   8. LGPD constraint: "relations" value never rendered as visible content
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppLogo } from '../AppLogo';

afterEach(() => {
  cleanup();
});

describe('AppLogo', () => {
  describe('element structure', () => {
    it('renders an SVG element', () => {
      const { container } = render(<AppLogo />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.tagName.toLowerCase()).toBe('svg');
    });

    it('has data-testid="app-logo"', () => {
      const { container } = render(<AppLogo />);
      const svg = container.querySelector('[data-testid="app-logo"]');
      expect(svg).not.toBeNull();
    });

    it('defaults to 24×24 px', () => {
      const { container } = render(<AppLogo />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('height')).toBe('24');
    });

    it('respects a custom size prop', () => {
      const { container } = render(<AppLogo size={48} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('width')).toBe('48');
      expect(svg.getAttribute('height')).toBe('48');
    });

    it('forwards className to the SVG element', () => {
      const { container } = render(<AppLogo className="mx-auto" />);
      const svg = container.querySelector('svg')!;
      expect(svg.classList.contains('mx-auto')).toBe(true);
    });
  });

  describe('aria contract', () => {
    it('when standalone=false (default): is aria-hidden, no role, no aria-label', () => {
      const { container } = render(<AppLogo />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('role')).toBeNull();
      expect(svg.getAttribute('aria-label')).toBeNull();
    });

    it('when standalone=true: has role="img" and aria-label="Billings Gráfico"', () => {
      const { container } = render(<AppLogo standalone />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.getAttribute('aria-label')).toBe('Billings Gráfico');
      expect(svg.getAttribute('aria-hidden')).toBeNull();
    });

    it('aria-label is exactly "Billings Gráfico" with accent on the "a"', () => {
      const { container } = render(<AppLogo standalone />);
      const svg = container.querySelector('svg')!;
      // Must have the accent (á) — Gráfico not Grafico
      expect(svg.getAttribute('aria-label')).toBe('Billings Gráfico');
    });

    it('standalone=false renders no accessible role in the accessibility tree', () => {
      render(<AppLogo />);
      // aria-hidden=true elements are excluded from the accessible tree
      const hiddenSvg = screen.queryByRole('img');
      expect(hiddenSvg).toBeNull();
    });

    it('standalone=true is discoverable by assistive technology as an img', () => {
      render(<AppLogo standalone />);
      const img = screen.getByRole('img', { name: 'Billings Gráfico' });
      expect(img).toBeTruthy();
    });
  });

  describe('SVG shapes — four notation symbols', () => {
    it('contains a filled circle for ● sangramento (top-left)', () => {
      const { container } = render(<AppLogo />);
      const circles = Array.from(container.querySelectorAll('circle'));
      // Filled circle: fill attribute is not "none"
      const filledCircle = circles.find(
        (c) => c.getAttribute('fill') !== null && c.getAttribute('fill') !== 'none',
      );
      expect(filledCircle).toBeTruthy();
      expect(filledCircle!.getAttribute('cx')).toBe('6');
      expect(filledCircle!.getAttribute('cy')).toBe('6');
    });

    it('contains a rectangle for | seco (top-right)', () => {
      const { container } = render(<AppLogo />);
      const rect = container.querySelector('rect');
      expect(rect).not.toBeNull();
      // Vertical bar in the top-right quadrant (x > 12)
      expect(parseFloat(rect!.getAttribute('x')!)).toBeGreaterThan(12);
    });

    it('contains a circle outline for ○ muco (bottom-left)', () => {
      const { container } = render(<AppLogo />);
      const circles = Array.from(container.querySelectorAll('circle'));
      const outlineCircle = circles.find((c) => c.getAttribute('fill') === 'none');
      expect(outlineCircle).not.toBeNull();
      // In the bottom-left quadrant (cy > 12, cx < 12)
      expect(parseFloat(outlineCircle!.getAttribute('cy')!)).toBeGreaterThan(12);
      expect(parseFloat(outlineCircle!.getAttribute('cx')!)).toBeLessThan(12);
    });

    it('contains a path for ✕ apice (bottom-right)', () => {
      const { container } = render(<AppLogo />);
      const path = container.querySelector('path');
      expect(path).not.toBeNull();
      // The X path should use the apice ink CSS variable
      const stroke = path!.getAttribute('stroke') ?? '';
      expect(stroke).toContain('stamp-apice-ink');
    });

    it('has exactly 2 circles, 1 rect, and 1 path', () => {
      const { container } = render(<AppLogo />);
      expect(container.querySelectorAll('circle')).toHaveLength(2);
      expect(container.querySelectorAll('rect')).toHaveLength(1);
      expect(container.querySelectorAll('path')).toHaveLength(1);
    });
  });

  describe('clinical constraint', () => {
    it('never renders a fertility classification in visible content', () => {
      const { container } = render(<AppLogo standalone />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
    });

    it('aria-label does not contain fertility language', () => {
      const { container } = render(<AppLogo standalone />);
      const svg = container.querySelector('svg')!;
      const label = svg.getAttribute('aria-label') ?? '';
      expect(label).not.toMatch(/f[eé]rtil|inf[eé]rtil|seguro|inseguro/i);
    });
  });

  describe('LGPD constraint', () => {
    it('does not render "relations" as visible text', () => {
      const { container } = render(<AppLogo />);
      expect(container.textContent).not.toContain('relations');
    });
  });
});
