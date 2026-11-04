import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState, type ErrorStateProps } from './ErrorState';
import { SkeletonTable } from './Skeleton';
import { TopProgressBar } from './TopProgressBar';

/**
 * Every data surface goes through this: loading, error, empty, ready — never a bare spinner and
 * never a screen that forgot one of the four.
 */
export function DataState({
  isLoading,
  isFetching = false,
  error,
  isEmpty,
  empty,
  skeleton = <SkeletonTable />,
  children,
}: {
  isLoading: boolean;
  /** Background refetch (filter/search/page change): shows a progress bar and dims the stale content. */
  isFetching?: boolean;
  error: ErrorStateProps | null;
  isEmpty: boolean;
  empty: { title: string; description?: string };
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (error) return <ErrorState {...error} />;
  if (isEmpty) return <EmptyState {...empty} />;
  if (!isFetching) return <>{children}</>;
  return (
    <>
      <TopProgressBar active />
      <div aria-busy className="pointer-events-none opacity-60 transition-opacity">
        {children}
      </div>
    </>
  );
}
