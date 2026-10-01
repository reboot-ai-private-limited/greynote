'use client';

import type { PaginatedDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TreeNote } from '@/components/ui/Tree';
import { toErrorState } from '@/lib/api/toErrorState';

/**
 * What an expanded node shows in place of children that are not there: loading, a failure of THIS
 * branch only (with retry), or empty with a way to add the first one.
 */
export function BranchStatus<T>({
  level,
  query,
  noun,
  onAdd,
  addDisabled,
}: {
  level: number;
  query: { data: PaginatedDto<T> | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  /** Plural noun of the children, e.g. "HQs". */
  noun: string;
  onAdd: () => void;
  addDisabled: boolean;
}) {
  if (query.isLoading) {
    return (
      <TreeNote level={level}>
        <Skeleton className="h-4 w-40" />
      </TreeNote>
    );
  }
  if (query.error) {
    return (
      <TreeNote level={level}>
        <span className="text-danger-fg">{toErrorState(query.error).message}</span>
        <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </TreeNote>
    );
  }
  if (query.data && query.data.items.length === 0) {
    return (
      <TreeNote level={level}>
        <span>No {noun} yet</span>
        <Button size="sm" variant="ghost" disabled={addDisabled} onClick={onAdd}>
          Add
        </Button>
      </TreeNote>
    );
  }
  if (query.data && query.data.total > query.data.items.length) {
    return (
      <TreeNote level={level}>
        Showing the first {query.data.items.length} of {query.data.total} {noun} — use search to find the rest.
      </TreeNote>
    );
  }
  return null;
}
