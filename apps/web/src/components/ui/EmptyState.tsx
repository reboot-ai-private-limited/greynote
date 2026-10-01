import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
        <Inbox aria-hidden className="size-5" />
      </span>
      <h2 className="mt-1 font-medium text-text">{title}</h2>
      {description ? <p className="max-w-md text-sm text-text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
