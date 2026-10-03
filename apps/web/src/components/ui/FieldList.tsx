import type { ReactNode } from 'react';

/** A label and its value; an empty value renders as a quiet dash. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-text">{children || <span className="text-text-subtle">—</span>}</dd>
    </div>
  );
}

export function FieldList({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>;
}
