'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { ZoneFormDialog } from '@/features/territory/components/ZoneFormDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';

/** Choose a Zone from the active ones, or add a new one without leaving the form; the new zone is chosen for you. */
export function ZoneField({
  id,
  value,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (zoneId: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const directory = useTerritoryDirectory();
  const [adding, setAdding] = useState(false);
  return (
    <FormField label="Zone" htmlFor={id} error={error}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Select
            id={id}
            value={value}
            onValueChange={onChange}
            options={directory.zoneOptions}
            placeholder={directory.isLoading ? 'Loading…' : 'Choose a zone'}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setAdding(true)}>
          Add zone
        </Button>
      </div>
      {adding ? (
        <ZoneFormDialog onClose={() => setAdding(false)} onCreated={(zone) => onChange(zone.id)} />
      ) : null}
    </FormField>
  );
}
