'use client';

import type { TerritoryStatus } from '@greynote/contracts';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, type MenuItem } from '@/components/ui/DropdownMenu';

/** Edit and (de)activate. Territory is soft-deleted only, so there is no delete. */
export function RowActions({
  label,
  status,
  disabled,
  onEdit,
  onToggleStatus,
  extraItems = [],
}: {
  label: string;
  status: TerritoryStatus;
  disabled: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  /** Level-specific actions, shown first — e.g. "Add HQ" on a zone. */
  extraItems?: readonly MenuItem[];
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
        ...extraItems,
        { label: 'Edit', onSelect: onEdit },
        status === 'active'
          ? { label: 'Deactivate', onSelect: onToggleStatus, tone: 'danger' }
          : { label: 'Reactivate', onSelect: onToggleStatus },
      ]}
    />
  );
}
