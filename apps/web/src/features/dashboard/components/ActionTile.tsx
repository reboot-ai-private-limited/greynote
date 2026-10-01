'use client';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { isRouteBuilt } from '@/components/shell/nav-items';
import { toErrorState } from '@/lib/api/toErrorState';
import type { TileData } from '../lib/tiles';
import type { TileQuery } from '../lib/tileQuery';

/**
 * One dashboard tile and its own loading / error / ready states. A failing endpoint fails this
 * tile only; the rest of the dashboard keeps working.
 */
export function ActionTile<T>({
  label,
  query,
  map,
  href,
}: {
  label: string;
  query: TileQuery<T>;
  map: (data: T) => TileData;
  /** Where this number is resolved. Ignored while that screen is not built, so no tile 404s. */
  href?: string;
}) {
  if (query.isLoading) {
    return (
      <div role="status" aria-label={`Loading ${label}`} className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-16" />
        <Skeleton className="mt-3 h-5 w-32" />
      </div>
    );
  }

  if (query.error || query.data === undefined) {
    const state = toErrorState(query.error);
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-5">
        <p className="text-[13px] font-medium text-text-muted">{label}</p>
        <p className="mt-2 text-sm text-danger-fg">{state.message}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = map(query.data);
  return (
    <StatTile
      label={label}
      value={data.value}
      note={data.note}
      tone={data.tone}
      href={href && isRouteBuilt(href) ? href : undefined}
    />
  );
}
