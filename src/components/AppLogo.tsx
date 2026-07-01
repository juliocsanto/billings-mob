/**
 * AppLogo — SVG logomark for Billings Gráfico.
 *
 * The four clinical notation symbols (● | ○ ✕) arranged in a 2×2 grid,
 * each rendered in its clinical ink color via CSS custom properties from
 * src/styles/tokens.css. Colors are theme-invariant (no dark overrides).
 *
 * Usage:
 *   — standalone (sole brand element): <AppLogo standalone /> → role="img" + aria-label
 *   — decorative (adjacent to text):   <AppLogo />           → aria-hidden="true"
 *
 * Clinical constraint: symbols are notation marks, never fertility classifications.
 * LGPD: this component renders no user data.
 */

interface AppLogoProps {
  /** When true the SVG is the sole brand element and gets role="img" + aria-label.
   *  When false (default) it is decorative — aria-hidden="true". */
  standalone?: boolean;
  className?: string;
  /** Width and height in px. Default: 24 */
  size?: number;
}

export function AppLogo({ standalone = false, className, size = 24 }: AppLogoProps) {
  const ariaProps = standalone
    ? ({ role: 'img', 'aria-label': 'Billings Gráfico' } as const)
    : ({ 'aria-hidden': true } as const);

  return (
    <svg
      data-testid="app-logo"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...ariaProps}
    >
      {/* ● sangramento — top-left quadrant (center 6,6) */}
      <circle
        cx="6"
        cy="6"
        r="4"
        fill="var(--stamp-sangramento-ink, #A03030)"
      />

      {/* | seco — top-right quadrant (center 18,6) */}
      <rect
        x="17"
        y="2.5"
        width="2"
        height="7"
        rx="1"
        fill="var(--stamp-seco-ink, #2E6040)"
      />

      {/* ○ muco — bottom-left quadrant (center 6,18) */}
      <circle
        cx="6"
        cy="18"
        r="4"
        fill="none"
        stroke="var(--stamp-muco-ink, #806020)"
        strokeWidth="1.5"
      />

      {/* ✕ apice — bottom-right quadrant (center 18,18) */}
      <path
        d="M15 15l6 6M21 15l-6 6"
        stroke="var(--stamp-apice-ink, #8C3C28)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
