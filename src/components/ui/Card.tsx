import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

/** Surface container — white card on light, navy-tinted surface on dark. */
export function Card({ padded = true, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'bg-surface rounded-card shadow-card border border-border',
        padded ? 'p-4' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
