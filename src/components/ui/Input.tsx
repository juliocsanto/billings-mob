import React, { useId } from 'react';

interface FieldBaseProps {
  label?: string;
  error?: string;
  hint?: string;
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    FieldBaseProps {}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldBaseProps {}

const fieldClasses =
  'w-full rounded-lg border bg-surface text-text-main placeholder:text-text-sec/70 ' +
  'px-3 py-2.5 text-base outline-none transition-colors ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/25';

function FieldWrapper({
  id,
  label,
  error,
  hint,
  children,
}: FieldBaseProps & { id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-bold uppercase tracking-wide text-text-sec"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-text-sec">{hint}</p>
      ) : null}
    </div>
  );
}

/** Labeled text input with error/hint slots wired for screen readers. */
export function Input({ label, error, hint, className = '', id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={[fieldClasses, error ? 'border-danger' : 'border-border', className].join(' ')}
        {...rest}
      />
    </FieldWrapper>
  );
}

/** Labeled textarea with error/hint slots wired for screen readers. */
export function Textarea({ label, error, hint, className = '', id, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint}>
      <textarea
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={[fieldClasses, error ? 'border-danger' : 'border-border', className].join(' ')}
        {...rest}
      />
    </FieldWrapper>
  );
}
