'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';

/**
 * The shell of the Pay Bands and Designations screens: header with the "New" action and the
 * four-state table. Both lists are a handful of rows returned as a bare array, so no filters
 * and no pagination.
 */
export function MasterDataFrame<T extends { id: string }>({
  title,
  description,
  noun,
  readOnly,
  canCreate,
  createHint,
  onNew,
  query,
  columns,
  emptyDescription,
  children,
}: {
  title: string;
  description: string;
  noun: string;
  readOnly: boolean;
  /** False once every allowed name exists: nothing left to create. */
  canCreate: boolean;
  createHint: string;
  onNew: () => void;
  query: {
    data: T[] | undefined;
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  columns: readonly Column<T>[];
  emptyDescription: string;
  /** Dialogs, rendered beside the table. */
  children?: ReactNode;
}) {
  const disabledReason = readOnly ? 'A past financial year is read-only' : canCreate ? undefined : createHint;
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={onNew} disabled={readOnly || !canCreate} title={disabledReason}>
            <Plus aria-hidden className="size-4" /> New {noun}
          </Button>
        }
      />
      <Card>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={query.data?.length === 0}
          empty={{ title: `No ${noun}s`, description: emptyDescription }}
        >
          <DataTable columns={columns} rows={query.data ?? []} rowKey={(row) => row.id} />
        </DataState>
      </Card>
      {children}
    </>
  );
}
