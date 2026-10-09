'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';

/** The routes chosen so far, each removable, and a dialog to tick more from the zone. Without a zone there is nothing to offer yet. */
export function RoutesMultiField({
  id,
  zoneId,
  value,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  zoneId: string;
  value: string[];
  onChange: (routeIds: string[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const directory = useTerritoryDirectory();
  const [open, setOpen] = useState(false);
  return (
    <FormField label="Routes" htmlFor={id} error={error}>
      <div id={id} className="flex flex-wrap items-center gap-2">
        {value.length === 0 ? (
          <span className="text-sm text-text-subtle">
            {zoneId ? 'No route chosen' : 'Choose a zone first'}
          </span>
        ) : null}
        {value.map((routeId) => (
          <span
            key={routeId}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover py-1 pl-3 pr-1.5 text-sm text-text"
          >
            {directory.routeLabel(routeId)}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${directory.routeLabel(routeId)}`}
              className="rounded-full px-1.5 text-text-muted hover:text-danger-fg disabled:opacity-50"
              onClick={() => onChange(value.filter((r) => r !== routeId))}
            >
              ×
            </button>
          </span>
        ))}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !zoneId || directory.isLoading}
          onClick={() => setOpen(true)}
        >
          {value.length === 0 ? 'Choose routes' : 'Add routes'}
        </Button>
      </div>
      {open ? (
        <RoutesChecklistDialog
          zoneId={zoneId}
          chosen={value}
          onDone={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </FormField>
  );
}

/** Tick the active routes of one zone; "Done" keeps the ticks. Routes already on the distributor stay ticked, even if no longer active. */
function RoutesChecklistDialog({
  zoneId,
  chosen,
  onDone,
  onClose,
}: {
  zoneId: string;
  chosen: string[];
  onDone: (routeIds: string[]) => void;
  onClose: () => void;
}) {
  const directory = useTerritoryDirectory();
  const [ticked, setTicked] = useState<string[]>(chosen);
  const [term, setTerm] = useState('');
  const needle = term.trim().toLowerCase();
  const inZone = directory.routeOptions.filter((o) => directory.pathOf(o.value)?.zoneId === zoneId);
  const matches = inZone.filter((o) => o.label.toLowerCase().includes(needle));
  const toggle = (routeId: string) =>
    setTicked((t) => (t.includes(routeId) ? t.filter((r) => r !== routeId) : [...t, routeId]));

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={`Routes in ${directory.zoneName(zoneId)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onDone(ticked)}>Done ({ticked.length})</Button>
        </>
      }
    >
      <label htmlFor="routes-search" className="mb-1.5 block text-sm font-medium text-text">
        Search
      </label>
      <Input
        id="routes-search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="HQ or route name"
        autoComplete="off"
      />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {matches.length === 0 ? (
          <p className="text-[13px] text-text-subtle">No active route in this zone matches.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {matches.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={ticked.includes(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="min-w-0 truncate">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
