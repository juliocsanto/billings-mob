import React from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-surface dark:text-bg-app font-bold hover:bg-primary/90 disabled:bg-border disabled:text-text-sec',
  secondary:
    'bg-secondary text-text-main font-bold hover:bg-secondary/90 disabled:bg-border disabled:text-text-sec',
  outline:
    'bg-transparent text-primary font-bold border border-primary hover:bg-primaryLight disabled:border-border disabled:text-text-sec',
  ghost:
    'bg-transparent text-primary font-semibold hover:bg-primaryLight disabled:text-text-sec',
  danger:
    'bg-danger text-surface dark:text-bg-app font-bold hover:bg-danger/90 disabled:bg-border disabled:text-text-sec',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5 min-h-[36px]',
  md: 'text-sm px-5 py-2.5 min-h-[44px]',
  lg: 'text-base px-6 py-3 min-h-[48px]',
};

/**
 * Primary action button. 44px+ touch targets on md/lg (mobile-first PWA).
 * `loading` disables the button and shows an inline spinner.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-btn transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && (
        <span
          role="status"
          aria-label="…"
          className="h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
