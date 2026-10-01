import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
      <span className="text-text-muted tabular-nums">{total} total</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" /> Previous
        </Button>
        <span className="px-1 text-text-muted tabular-nums">
          {page} / {totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
