'use client';

import { Pencil } from 'lucide-react';

/** The one row action on a master-data table (these records are never deleted). */
export function EditButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      disabled={disabled}
      title={disabled ? 'A past financial year is read-only' : undefined}
      onClick={onClick}
      className="rounded-md p-1.5 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Pencil aria-hidden className="size-4" />
    </button>
  );
}
