import type { ReactNode } from 'react';

/** One wizard step's heading and body. A heading only: the labels say the rest. */
export function StepFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title" className="mb-5 text-lg font-semibold tracking-tight text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Two columns of fields from a tablet up, one on a phone. */
export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{children}</div>;
}

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mt-6 first:mt-0">
      <legend className="mb-3 text-sm font-semibold text-text">{title}</legend>
      {children}
    </fieldset>
  );
}
