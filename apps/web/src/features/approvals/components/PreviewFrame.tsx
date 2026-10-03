import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';

/**
 * The shell every kind's preview shares: it loads, fails and is empty on its own, so a record that cannot be
 * read never blocks the decision bar or the history beside it.
 */
export function PreviewFrame({
  title,
  description,
  query,
  children,
}: {
  title: string;
  description: string;
  query: { isLoading: boolean; error: unknown; refetch: () => unknown; data: unknown };
  children: ReactNode;
}) {
  return (
    <Card title={title} description={description}>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!query.data}
        empty={{ title: 'The record could not be found', description: 'It may have been removed.' }}
        skeleton={<Skeleton className="m-5 h-40 w-[calc(100%-2.5rem)]" />}
      >
        {children}
      </DataState>
    </Card>
  );
}
