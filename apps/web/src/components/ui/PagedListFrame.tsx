'use client';

import type { PaginatedDto } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { toErrorState } from '@/lib/api/toErrorState';
import { TopProgressBar } from '@/components/ui/TopProgressBar';

/**
 * The shared shell of a paginated admin list (Zones, HQs, Areas, Products, Doctors…): header with the "New" action, a filter
 * row, the four-state table and pagination. A screen supplies its columns, filters and dialogs.
 */
export function PagedListFrame<T extends { id: string }>({
  title,
  description,
  noun,
  readOnly,
  onNew,
  filters,
  query,
  columns,
  emptyTitle,
  emptyDescription,
  onPageChange,
  children,
}: {
  title: string;
  description: string;
  noun: string;
  readOnly: boolean;
  /** Omit for a list with nothing to create (the approvals queue): no "New" button is shown. */
  onNew?: () => void;
  filters: ReactNode;
  query: {
    data: PaginatedDto<T> | undefined;
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  columns: readonly Column<T>[];
  /** Defaults to "No {noun}s". */
  emptyTitle?: string;
  emptyDescription: string;
  onPageChange: (page: number) => void;
  /** Dialogs, rendered beside the table. */
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          onNew ? (
            <Button
              onClick={onNew}
              disabled={readOnly}
              title={readOnly ? 'A past financial year is read-only' : undefined}
            >
              <Plus aria-hidden className="size-4" /> New {noun}
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">{filters}</div>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={query.data?.items.length === 0}
          empty={{ title: emptyTitle ?? `No ${noun}s`, description: emptyDescription }}
        >
          <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} />
          {query.data ? (
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              onPageChange={onPageChange}
            />
          ) : null}
        </DataState>
      </Card>
      {children}
    </>
  );
}
