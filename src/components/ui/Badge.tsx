import React from 'react';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-border/60 text-text-sec',
  primary: 'bg-primaryLight text-primary',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  danger: 'bg-danger-light text-danger',
};

/** Status pill — tones map to the semantic feedback tokens (AA in both themes). */
export function Badge({ tone = 'neutral', className = '', children, ...rest }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
        toneClasses[tone],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
