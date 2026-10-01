import type { ReactNode } from 'react';
import { cn } from './cn';

/** The resting container: white, hairline border, no shadow. Shadows are for floating things. */
export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface', className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-text-subtle">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
