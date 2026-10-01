import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-hover', className)} />;
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2.5 p-5">
      {/* Static placeholders: they never reorder, so the index is a safe key. */}
      {Array.from({ length: rows }, (_, i) => (
        // eslint-disable-next-line no-restricted-syntax
        <Skeleton key={`row-${i}`} className="h-9 w-full" />
      ))}
    </div>
  );
}
