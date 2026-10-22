'use client';

import { HOLIDAY_SCOPES, type HolidayScope } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useCreateHoliday } from '../hooks/useHolidays';
import { EMPTY_HOLIDAY, HOLIDAY_SCOPE_LABEL, buildHoliday, dateSpan, holidayDays, toggleId, withScope, type HolidayDraft } from '../lib/holidays';

const SCOPE_OPTIONS = HOLIDAY_SCOPES.map((s) => ({
  value: s,
  label: s === 'NATIONAL' ? 'National: every employee' : s === 'ZONE' ? 'Zone: employees in chosen zones' : 'HQ: employees at chosen HQs',
}));

/** A list of checkboxes to pick any number of zones or HQs from. */
export function Choices({ legend, options, chosen, onToggle, error }: {
  legend: string;
  options: { value: string; label: string }[];
  chosen: readonly string[];
  onToggle: (id: string) => void;
  error?: string | undefined;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      {options.length === 0 ? (
        <p className="text-[13px] text-text-subtle">None to choose from yet.</p>
      ) : (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {options.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-hover">
                <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => onToggle(o.value)} className="size-4 rounded border-border-strong accent-[var(--color-accent)]" />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error ? <p role="alert" className="text-[13px] text-danger-fg">{error}</p> : <p className="text-[13px] text-text-subtle">{chosen.length} chosen.</p>}
    </fieldset>
  );
}

/** Add a holiday for one day or a run of days (Durga Puja, 2–8 Oct). The API has no edit, so a correction is remove and add. Mounted only while open. */
export function HolidayFormDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<HolidayDraft>(EMPTY_HOLIDAY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const directory = useTerritoryDirectory();
  const create = useCreateHoliday(onClose);
  const days = holidayDays(draft.date, draft.endDate || draft.date);

  function submit() {
    const built = buildHoliday(draft);
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title="New holiday"
      description="Employees don't lose a leave day to a holiday inside their dates."
      formId="holiday-form"
      pending={create.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="holiday-name" error={errors['name']}>
        <Input id="holiday-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="From" htmlFor="holiday-date" error={errors['date']}>
          <Input id="holiday-date" type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} aria-invalid={errors['date'] ? true : undefined} />
        </FormField>
        <FormField label="To (optional)" htmlFor="holiday-end-date" error={errors['endDate']}>
          <Input
            id="holiday-end-date"
            type="date"
            value={draft.endDate}
            min={draft.date || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            aria-invalid={errors['endDate'] ? true : undefined}
          />
        </FormField>
      </div>
      {days !== null ? (
        <p className="-mt-2 text-[13px] text-text-subtle">
          {days === 1 ? `One day: ${dateSpan(draft.date, draft.date)}.` : `${days} days: ${dateSpan(draft.date, draft.endDate)}.`}
        </p>
      ) : (
        <p className="-mt-2 text-[13px] text-text-subtle">Leave “To” empty for a one-day holiday.</p>
      )}
      <FormField label="Applies to" htmlFor="holiday-scope" error={errors['scope']}>
        <Select
          id="holiday-scope"
          value={draft.scope}
          onValueChange={(v) => setDraft((d) => withScope(d, v as HolidayScope))}
          options={SCOPE_OPTIONS}
          placeholder="Choose"
          aria-invalid={errors['scope'] ? true : undefined}
        />
      </FormField>
      {draft.scope === 'ZONE' ? (
        <Choices legend="Zones" options={directory.zoneOptions} chosen={draft.zoneIds} onToggle={(id) => setDraft((d) => ({ ...d, zoneIds: toggleId(d.zoneIds, id) }))} error={errors['zoneIds']} />
      ) : null}
      {draft.scope === 'HQ' ? (
        <Choices legend="HQs" options={directory.hqOptions} chosen={draft.hqIds} onToggle={(id) => setDraft((d) => ({ ...d, hqIds: toggleId(d.hqIds, id) }))} error={errors['hqIds']} />
      ) : null}
      {draft.scope ? <p className="text-[13px] text-text-subtle">{HOLIDAY_SCOPE_LABEL[draft.scope]} holiday.</p> : null}
    </FormDialog>
  );
}
