'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAllFieldEmployees } from '@/features/people/hooks/useUsers';
import { downloadBlob } from '@/lib/download';
import { SheetViewer } from './SheetViewer';

/** Every active field employee as options for the picker ("Name (code)"), and the chosen one's name. */
export function useEmployeeOptions(userId: string) {
  const employees = useAllFieldEmployees(true);
  const options = (employees.data ?? []).map((u) => ({ value: u.id, label: u.employeeCode ? `${u.name} (${u.employeeCode})` : u.name }));
  return { options, name: (employees.data ?? []).find((u) => u.id === userId)?.name ?? '' };
}

/**
 * The layout the per-employee sheet reports share: a filter bar (employee, then the report's own filters, with Download Excel on the right), and under it
 * the sheet. With no employee chosen it says so, and Download is off.
 */
export function EmployeeSheetFrame({
  userId,
  onUserChange,
  options,
  filters,
  file,
  filename,
  emptyTitle,
  emptyDescription,
}: {
  userId: string;
  onUserChange: (id: string) => void;
  options: { value: string; label: string }[];
  filters?: ReactNode;
  file: UseQueryResult<Blob>;
  filename: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid min-w-64 flex-1 gap-1 text-sm sm:max-w-sm">
            <span className="font-medium text-text">Employee</span>
            <SearchableSelect aria-label="Employee" value={userId} onValueChange={onUserChange} options={options} placeholder="Search and choose an employee…" searchPlaceholder="Name or code…" />
          </div>
          {filters}
          <div className="ml-auto">
            <Button
              disabled={!userId || !file.data}
              title={userId ? undefined : 'Choose an employee first'}
              onClick={() => file.data && downloadBlob(filename.replace(/\s+\.xlsx$/, '.xlsx'), file.data)}
            >
              Download Excel
            </Button>
          </div>
        </div>
      </Card>
      {!userId ? (
        <Card>
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </Card>
      ) : file.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : file.error ? (
        <Card>
          <ErrorState message={file.error instanceof Error ? file.error.message : 'Could not make the file.'} onRetry={() => void file.refetch()} />
        </Card>
      ) : file.data ? (
        <SheetViewer file={file.data} />
      ) : null}
    </div>
  );
}
