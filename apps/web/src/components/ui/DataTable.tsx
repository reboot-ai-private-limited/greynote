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
  bleed = true,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sort?: SortState | undefined;
  onSortChange?: ((next: SortState) => void) | undefined;
  /**
   * A page-level table runs edge to edge: it cancels the page's side padding and gives its first and last
   * column the same padding back, so the text still lines up with the title. `false` for a table inside a card or dialog.
   */
  bleed?: boolean;
}) {
  const last = columns.length - 1;
  const pad = (i: number) =>
    bleed ? cn('pl-4', i === 0 && 'sm:pl-8', 'pr-4', i === last && 'sm:pr-8') : 'px-4';
  return (
    <div className={cn('overflow-x-auto border-y border-border', bleed && '-mx-4 sm:-mx-8')}>
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-subtle text-[13px] text-text-muted">
          <tr className="border-b border-border">
            {columns.map((c, i) => {
              const active = sort?.key === c.key;
              const Icon = !active ? ChevronsUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('py-3 font-semibold', pad(i), c.numeric && 'text-right', c.className)}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange({ key: c.key, order: active && sort.order === 'asc' ? 'desc' : 'asc' })}
                      className="inline-flex items-center gap-1 hover:text-text focus-visible:shadow-focus focus-visible:outline-none"
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
              {columns.map((c, i) => (
                <td key={c.key} className={cn('h-12', pad(i), c.numeric && 'text-right tabular-nums', c.className)}>
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
