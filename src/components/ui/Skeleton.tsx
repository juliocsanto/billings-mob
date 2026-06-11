import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** tailwind sizing classes, e.g. "h-4 w-32" */
  className?: string;
}

/** Loading placeholder block. Respects prefers-reduced-motion. */
export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'animate-pulse motion-reduce:animate-none rounded-md bg-border/70',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}

/** Card-shaped skeleton group for list loading states. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col gap-3"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === 0 ? 'h-4 w-1/2' : 'h-3 w-full'} />
      ))}
      <span className="sr-only">…</span>
    </div>
  );
}
