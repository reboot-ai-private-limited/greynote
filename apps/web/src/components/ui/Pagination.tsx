import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZES, pageRange } from '@/lib/pagination';
import { Button } from './Button';
import { cn } from './cn';
import { Select } from './Select';

/**
 * The foot of a list: how many rows per page and "Showing 1 to 25 of 61 entries" on the left, Previous / page / Next on the
 * right. The page-size choice only shows when the screen handles it (`onPageSizeChange`).
 */
export function Pagination({
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  bleed = true,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: ((pageSize: number) => void) | undefined;
  /** Match a bleeding `DataTable`; `false` under a table inside a card. */
  bleed?: boolean;
}) {
  const { from, to } = pageRange(page, pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 py-3 text-sm', bleed ? '-mx-4 px-4 sm:-mx-8 sm:px-8' : 'px-4')}
    >
      <div className="flex items-center gap-3 text-text-muted">
        {onPageSizeChange ? (
          <div className="w-20">
            <Select
              aria-label="Rows per page"
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        ) : null}
        <span className="tabular-nums">
          Showing {from} to {to} of {total} entries
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" /> Previous
        </Button>
        <span className="px-1 text-text-muted tabular-nums">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
