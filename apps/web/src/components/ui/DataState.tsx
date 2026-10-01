import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState, type ErrorStateProps } from './ErrorState';
import { SkeletonTable } from './Skeleton';

/**
 * Every data surface goes through this: loading, error, empty, ready — never a bare spinner and
 * never a screen that forgot one of the four.
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  empty,
  skeleton = <SkeletonTable />,
  children,
}: {
  isLoading: boolean;
  error: ErrorStateProps | null;
  isEmpty: boolean;
  empty: { title: string; description?: string; action?: ReactNode };
  skeleton?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (error) return <ErrorState {...error} />;
  if (isEmpty) return <EmptyState {...empty} />;
  return <>{children}</>;
}
