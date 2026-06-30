/**
 * AppLogo — Billings Gráfico visual mark.
 *
 * A 2×2 grid of the four Billings notation symbols (●, |, ○, ✕), each in its
 * clinical ink color on a transparent background. These symbols ARE the product:
 * any instrutora or aluna familiar with the method immediately recognises them.
 *
 * Clinical constraint: this component renders notation symbols only — it does NOT
 * display or imply any cycle classification (fertil/infertil/seguro/inseguro).
 * The symbols represent observation categories, not clinical interpretations.
 *
 * Colors use CSS custom properties from src/styles/tokens.css (theme-invariant).
 * SVG fill/stroke attributes resolve CSS vars when the SVG is DOM-embedded, which
 * is the intended usage. For standalone SVG files (favicon), hex is used directly.
 *
 * Usage:
 *   Standalone (no adjacent text) — aria-label is set, role="img":
 *     <AppLogo />
 *
 *   Decorative (adjacent to visible text label) — aria-hidden to avoid duplication:
 *     <AppLogo standalone={false} />
 *     <span>Billings Gráfico</span>
 */

interface AppLogoProps {
  /** Size in pixels for both width and height. Default: 24. */
  size?: number;
  /**
   * When true (default), the SVG carries aria-label="Billings Gráfico" so it
   * is announced by screen readers as the sole brand element.
   * When false, aria-hidden="true" prevents duplicate announcements when the
   * logo appears next to visible text.
   */
  standalone?: boolean;
  className?: string;
}

export function AppLogo({ size = 24, standalone = true, className }: AppLogoProps) {
  const half = size / 2;
  // Each symbol is centered in its half×half quadrant.
  // Symbol metrics scale proportionally from a 24px base.
  const scale = size / 24;
  const r = 4 * scale;          // radius for circle symbols (● and ○)
  const stroke = 1.5 * scale;   // stroke width for ○, | and ✕

  const ariaProps = standalone
    ? { role: 'img' as const, 'aria-label': 'Billings Gráfico' }
    : { 'aria-hidden': 'true' as const };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      data-testid="app-logo"
      {...ariaProps}
    >
      {/* Top-left: ● sangramento — filled circle */}
      <circle
        cx={half / 2}
        cy={half / 2}
        r={r}
        fill="var(--stamp-sangramento-ink)"
      />

      {/* Top-right: | seco — vertical line (PBI / dry day) */}
      <line
        x1={half + half / 2}
        y1={half / 2 - r}
        x2={half + half / 2}
        y2={half / 2 + r}
        stroke="var(--stamp-seco-ink)"
        strokeWidth={stroke * 1.5}
        strokeLinecap="round"
      />

      {/* Bottom-left: ○ muco — open circle (ring) */}
      <circle
        cx={half / 2}
        cy={half + half / 2}
        r={r}
        fill="none"
        stroke="var(--stamp-muco-ink)"
        strokeWidth={stroke}
      />

      {/* Bottom-right: ✕ ápice — cross (last lubricative day) */}
      <line
        x1={half + half / 2 - r * 0.7}
        y1={half + half / 2 - r * 0.7}
        x2={half + half / 2 + r * 0.7}
        y2={half + half / 2 + r * 0.7}
        stroke="var(--stamp-apice-ink)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <line
        x1={half + half / 2 + r * 0.7}
        y1={half + half / 2 - r * 0.7}
        x2={half + half / 2 - r * 0.7}
        y2={half + half / 2 + r * 0.7}
        stroke="var(--stamp-apice-ink)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
