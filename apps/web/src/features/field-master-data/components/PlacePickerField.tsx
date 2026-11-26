'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { usePlaceDirectory } from '@/features/territory/hooks/usePlaces';
import { RouteListDialog } from './RoutePickerField';

/** Pick the place a doctor or chemist sits on (2026-11-26), by "Place (HQ)". The choice is a place id. */
export function PlacePickerField({
  id,
  label = 'Place',
  value,
  onChange,
  error,
  disabled = false,
  hint,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (placeId: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  hint?: string;
}) {
  const places = usePlaceDirectory();
  const [open, setOpen] = useState(false);
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint ?? 'The town or station it sits at. A day planned to this place offers it.'}>
      <div className="flex items-center gap-3">
        <span id={id} className="min-w-0 flex-1 truncate text-sm" aria-invalid={error ? true : undefined}>
          {value ? places.labelOf(value) : <span className="text-text-subtle">No place chosen</span>}
        </span>
        <Button variant="secondary" size="sm" disabled={disabled || places.isLoading} onClick={() => setOpen(true)}>
          {places.isLoading ? 'Loading…' : value ? 'Change' : 'Choose'}
        </Button>
      </div>
      {open ? (
        <RouteListDialog
          title="Choose a place"
          noun="place"
          options={places.options}
          onClose={() => setOpen(false)}
          onPick={(placeId) => {
            onChange(placeId);
            setOpen(false);
          }}
        />
      ) : null}
    </FormField>
  );
}

/** A place filter for a list: "All places", or the chosen one with a way to clear it. The choice lives in the URL. */
export function PlaceFilter({ value, onChange }: { value: string; onChange: (placeId: string) => void }) {
  const places = usePlaceDirectory();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" disabled={places.isLoading} onClick={() => setOpen(true)} aria-label="Filter by place">
        <span className="max-w-56 truncate">{value ? places.labelOf(value) : 'All places'}</span>
      </Button>
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => onChange('')} aria-label="Clear the place filter">
          Clear
        </Button>
      ) : null}
      {open ? (
        <RouteListDialog
          title="Choose a place"
          noun="place"
          options={places.options}
          onClose={() => setOpen(false)}
          onPick={(placeId) => {
            onChange(placeId);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
