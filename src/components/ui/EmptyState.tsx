import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  'data-testid'?: string;
}

/** Centered empty state: icon, title, optional description and CTA. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  'data-testid': testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      {icon && (
        <div aria-hidden="true" className="text-text-sec/60 [&>svg]:h-10 [&>svg]:w-10">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-bold text-text-main">{title}</h2>
      {description && <p className="max-w-xs text-sm text-text-sec">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
