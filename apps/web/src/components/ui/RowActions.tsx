'use client';

import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

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
