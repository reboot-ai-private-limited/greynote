import type { ReactNode } from 'react';

/**
 * Label + control + hint/error. The control must carry the same `id` as `htmlFor`; the error is
 * announced (role="alert") and the control should set `aria-invalid` when `error` is present.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
