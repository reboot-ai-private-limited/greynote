'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { PeoplePickerDialog } from './PeoplePickerDialog';

/** The field employees a record is handed to — any designation — each removable, and a dialog to tick several at once. */
export function PeopleMultiField({
  id,
  label = 'Assigned people',
  value,
  onChange,
  error,
  coverageHqIds,
  disabled = false,
}: {
  id: string;
  label?: string;
  value: string[];
  onChange: (userIds: string[]) => void;
  error?: string | undefined;
  /** The HQs the record covers: the picker starts narrowed to people based in them. */
  coverageHqIds?: string[] | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <div id={id} className="flex flex-wrap items-center gap-2">
        {value.length === 0 ? (
          <span className="text-sm text-text-subtle">Nobody assigned</span>
        ) : null}
        {value.map((userId) => (
          <span
            key={userId}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover py-1 pl-3 pr-1.5 text-sm text-text"
          >
            <EmployeeName userId={userId} />
            <button
              type="button"
              disabled={disabled}
              aria-label="Remove this person"
              className="rounded-full px-1.5 text-text-muted hover:text-danger-fg disabled:opacity-50"
              onClick={() => onChange(value.filter((u) => u !== userId))}
            >
              ×
            </button>
          </span>
        ))}
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {value.length === 0 ? 'Add people' : 'Edit people'}
        </Button>
      </div>
      {open ? (
        <PeoplePickerDialog
          chosen={value}
          coverageHqIds={coverageHqIds}
          onClose={() => setOpen(false)}
          onDone={(userIds) => {
            onChange(userIds);
            setOpen(false);
          }}
        />
      ) : null}
    </FormField>
  );
}
