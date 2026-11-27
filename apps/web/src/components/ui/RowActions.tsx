'use client';

import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, type MenuItem } from '@/components/ui/DropdownMenu';
import { cn } from './cn';

/** The "⋯" button at the end of a table row, with whatever actions the row offers. */
export function RowMenu({ label, disabled, items }: { label: string; disabled: boolean; items: readonly MenuItem[] }) {
  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label={`Actions for ${label}`}
          disabled={disabled}
          title={disabled ? 'A past financial year is read-only' : undefined}
          className="rounded-md p-1.5 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
      }
      items={items}
    />
  );
}

/** Edit and (de)activate, and a permanent delete where a screen offers one (it asks for confirmation with a warning of what it affects). */
type ActiveStatus = 'active' | 'inactive';

export function RowActions({
  label,
  status,
  disabled,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  label: string;
  status: ActiveStatus;
  disabled: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete?: () => void;
}) {
  return (
    <RowMenu
      label={label}
      disabled={disabled}
      items={[
        { label: 'Edit', onSelect: onEdit },
        status === 'active'
          ? { label: 'Deactivate', onSelect: onToggleStatus, tone: 'danger' }
          : { label: 'Reactivate', onSelect: onToggleStatus },
        ...(onDelete ? [{ label: 'Delete…', onSelect: onDelete, tone: 'danger' as const }] : []),
      ]}
    />
  );
}

export interface ActionLink {
  label: string;
  onClick: () => void;
  /** Red: deactivate, delete. */
  tone?: 'danger';
  /** Shown even in a read-only financial year (e.g. View). */
  alwaysOn?: boolean;
}

/**
 * A row's actions as words — "View · Edit · Deactivate" — instead of a "⋯" menu (2026-11-27): accent for ordinary actions, red for
 * deactivate and delete. In a read-only financial year only the `alwaysOn` ones work.
 */
export function ActionLinks({ label, disabled, actions }: { label: string; disabled: boolean; actions: readonly ActionLink[] }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
      {actions.map((a, i) => {
        const off = disabled && !a.alwaysOn;
        return (
          <span key={a.label} className="inline-flex items-center gap-1">
            {i > 0 ? (
              <span aria-hidden className="text-text-subtle/60">
                ·
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`${a.label} ${label}`}
              disabled={off}
              title={off ? 'A past financial year is read-only' : undefined}
              onClick={a.onClick}
              className={cn(
                'cursor-pointer rounded px-1 py-0.5 font-medium hover:underline focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40',
                a.tone === 'danger' ? 'text-danger-fg' : 'text-accent',
              )}
            >
              {a.label}
            </button>
          </span>
        );
      })}
    </span>
  );
}
