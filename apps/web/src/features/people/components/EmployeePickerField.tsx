'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { ManagerPickerDialog } from './ManagerPickerDialog';
import { useUser } from '../hooks/useUsers';

/** A person's name and code from their id, or a dash while it loads or for someone not found. */
export function EmployeeName({ userId }: { userId: string | null | undefined }) {
  const user = useUser(userId);
  if (!userId) return <span className="text-text-subtle">—</span>;
  return <>{user.data ? `${user.data.name} (${user.data.employeeCode})` : '—'}</>;
}

/** Choose an active field employee, or clear the choice. The value is a user id. */
export function EmployeePickerField({
  id,
  label,
  title,
  value,
  onChange,
  error,
  disabled = false,
  hint,
  selfId,
}: {
  id: string;
  label: string;
  title: string;
  value: string;
  onChange: (userId: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  hint?: string;
  /** Not offered in the list (the employee themselves, when choosing their own manager). */
  selfId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormField label={label} htmlFor={id} error={error} {...(hint ? { hint } : {})}>
      <div className="flex items-center gap-2">
        <span id={id} className="min-w-0 flex-1 truncate text-sm">
          {value ? <EmployeeName userId={value} /> : <span className="text-text-subtle">Nobody assigned</span>}
        </span>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {value ? 'Change' : 'Choose'}
        </Button>
        {value ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('')} aria-label={`Remove the ${label}`}>
            Remove
          </Button>
        ) : null}
      </div>
      {open ? (
        <ManagerPickerDialog
          {...(selfId ? { selfId } : {})}
          title={title}
          label={label}
          onClose={() => setOpen(false)}
          onPick={(u) => {
            onChange(u.id);
            setOpen(false);
          }}
        />
      ) : null}
    </FormField>
  );
}

/** A list filter for an MR: "Any MR", or the chosen one with a way to clear it. */
export function EmployeeFilter({ value, onChange, allLabel }: { value: string; onChange: (userId: string) => void; allLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label={allLabel}>
        <span className="max-w-48 truncate">{value ? <EmployeeName userId={value} /> : allLabel}</span>
      </Button>
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => onChange('')} aria-label={`Clear the ${allLabel} filter`}>
          Clear
        </Button>
      ) : null}
      {open ? (
        <ManagerPickerDialog
          title="Filter by employee"
          label="Employee"
          onClose={() => setOpen(false)}
          onPick={(u) => {
            onChange(u.id);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
