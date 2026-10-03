'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';

/** How many matches the list shows at once: a company has a few hundred Routes, and a long list is not searchable by eye. */
const SHOWN = 50;

/** Pick a Route by "HQ · Area · Route". The choice is a Route id; the label is only for people. */
export function RoutePickerField({
  id,
  label = 'Route',
  value,
  onChange,
  error,
  disabled = false,
  hint,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (routeId: string) => void;
  error?: string | undefined;
  disabled?: boolean;
  hint?: string;
}) {
  const directory = useTerritoryDirectory();
  const [open, setOpen] = useState(false);

  return (
    <FormField label={label} htmlFor={id} error={error} {...(hint ? { hint } : {})}>
      <div className="flex items-center gap-3">
        <span id={id} className="min-w-0 flex-1 truncate text-sm" aria-invalid={error ? true : undefined}>
          {value ? directory.routeLabel(value) : <span className="text-text-subtle">No route chosen</span>}
        </span>
        <Button variant="secondary" size="sm" disabled={disabled || directory.isLoading} onClick={() => setOpen(true)}>
          {directory.isLoading ? 'Loading…' : value ? 'Change' : 'Choose'}
        </Button>
      </div>
      {open ? (
        <RouteListDialog
          options={directory.routeOptions}
          onClose={() => setOpen(false)}
          onPick={(routeId) => {
            onChange(routeId);
            setOpen(false);
          }}
        />
      ) : null}
    </FormField>
  );
}

export function RouteListDialog({
  options,
  onPick,
  onClose,
}: {
  options: { value: string; label: string }[];
  onPick: (routeId: string) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const needle = term.trim().toLowerCase();
  const matches = options.filter((o) => o.label.toLowerCase().includes(needle));

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()} title="Choose a route" description="Only active routes are offered.">
      <label htmlFor="route-search" className="mb-1.5 block text-sm font-medium text-text">
        Search
      </label>
      <Input id="route-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="HQ, area or route name" autoComplete="off" />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {matches.length === 0 ? (
          <p className="text-[13px] text-text-subtle">No active route matches.</p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-md border border-border">
              {matches.slice(0, SHOWN).map((o) => (
                <li key={o.value} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-text">{o.label}</span>
                  <Button size="sm" onClick={() => onPick(o.value)}>
                    Choose
                  </Button>
                </li>
              ))}
            </ul>
            {matches.length > SHOWN ? (
              <p className="mt-2 text-[13px] text-text-subtle">Showing {SHOWN} of {matches.length}. Type more to narrow them.</p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** A route filter for a list: "All routes", or the chosen one with a way to clear it. The choice lives in the URL. */
export function RouteFilter({ value, onChange }: { value: string; onChange: (routeId: string) => void }) {
  const directory = useTerritoryDirectory();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button variant="secondary" disabled={directory.isLoading} onClick={() => setOpen(true)} aria-label="Filter by route">
        <span className="max-w-56 truncate">{value ? directory.routeLabel(value) : 'All routes'}</span>
      </Button>
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => onChange('')} aria-label="Clear the route filter">
          Clear
        </Button>
      ) : null}
      {open ? (
        <RouteListDialog
          options={directory.routeOptions}
          onClose={() => setOpen(false)}
          onPick={(routeId) => {
            onChange(routeId);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
