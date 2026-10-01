import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Numbers and money: right-aligned, tabular. */
  numeric?: boolean;
  sortable?: boolean;
}

export interface SortState {
  key: string;
  order: 'asc' | 'desc';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sort?: SortState | undefined;
  onSortChange?: ((next: SortState) => void) | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-subtle text-xs font-medium uppercase tracking-wide text-text-subtle">
          <tr className="border-b border-border">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const Icon = !active ? ChevronsUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-5 py-3 font-medium', c.numeric && 'text-right', c.className)}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange({ key: c.key, order: active && sort.order === 'asc' ? 'desc' : 'asc' })}
                      className="inline-flex items-center gap-1 uppercase hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
                    >
                      {c.header}
                      <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-subtle">
              {columns.map((c) => (
                <td key={c.key} className={cn('h-12 px-5', c.numeric && 'text-right tabular-nums', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
