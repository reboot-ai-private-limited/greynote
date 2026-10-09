import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The resting container: white, hairline border, no shadow. Shadows are for floating things.
 * `flat` drops the box: a plain section with its heading above, for a flat full-width table or a list on the page itself.
 */
export function Card({
  title,
  description,
  actions,
  children,
  className,
  flat = false,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <section className={cn(!flat && 'rounded-lg border border-border bg-surface', className)}>
      {title ? (
        <header className={cn('flex items-start justify-between gap-4', flat ? 'mb-3' : 'border-b border-border px-5 py-4')}>
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
