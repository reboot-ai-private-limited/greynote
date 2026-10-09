import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from './Badge';
import { cn } from './cn';

/**
 * A number and what it means. With `href` the whole tile is the link to where the number is
 * resolved — a figure you cannot act on is decoration.
 */
export function StatTile({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: string | undefined;
  tone?: BadgeTone | undefined;
  href?: string | undefined;
}) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-text">{value}</p>
      {note ? (
        <div className="mt-2">
          {tone ? (
            <Badge tone={tone}>{note}</Badge>
          ) : (
            <p className="text-[13px] text-text-subtle">{note}</p>
          )}
        </div>
      ) : null}
    </>
  );
  const base = 'block rounded-lg border border-border bg-surface p-5';

  return href ? (
    <Link
      href={href}
      className={cn(
        base,
        'transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:shadow-focus focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
