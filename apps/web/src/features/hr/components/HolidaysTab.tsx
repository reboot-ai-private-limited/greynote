'use client';

import type { HolidayScope } from '@greynote/contracts';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSession } from '@/lib/auth/SessionProvider';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDeleteHoliday, useHolidays } from '../hooks/useHolidays';
import { HOLIDAY_SCOPE_LABEL, appliesTo, dateSpan, groupByMonth, rangeError, type HolidayEntry } from '../lib/holidays';
import { HolidayFormDialog } from './HolidayFormDialog';
import { HolidayImportDialog } from './HolidayImportDialog';

const ANY = 'all';
const monthLabel = (month: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00Z`));

/** The holiday calendar; a holiday added for several days shows as one line. The range defaults to the financial year in view, and the API lists at most 400 days at a time. */
export function HolidaysTab() {
  const readOnly = useIsReadOnly();
  const { year } = useFinancialYear();
  const defaults = financialYearRange(year ?? financialYearOf(istDate()));
  const { values, update } = useFilterParams(['from', 'to', 'scope', 'zoneId', 'hqId']);
  const from = values.from || defaults.from;
  const to = values.to || defaults.to;
  const range = rangeError(from, to);
  const directory = useTerritoryDirectory();
  const isAdmin = useSession().user?.role === 'ADMIN';
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<HolidayEntry | null>(null);
  const remove = useDeleteHoliday(() => setRemoving(null));

  const holidays = useHolidays(
    { from, to, ...(values.scope && { scope: values.scope as HolidayScope }), ...(values.zoneId && { zoneId: values.zoneId }), ...(values.hqId && { hqId: values.hqId }) },
    !range,
  );
  const groups = groupByMonth(holidays.data ?? []);

  return (
    <Card
      title="Holidays"
      description="National holidays apply to everyone; Zone and HQ holidays only to employees there (an employee's HQ is set on their Leave tab)."
      actions={
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button variant="secondary" onClick={() => setUploading(true)}>
              <Upload aria-hidden className="size-4" /> Upload list
            </Button>
          ) : null}
        <Button onClick={() => setAdding(true)} disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined}>
          <Plus aria-hidden className="size-4" /> New holiday
        </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <label htmlFor="holiday-from">From</label>
          <Input id="holiday-from" type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
          <label htmlFor="holiday-to">to</label>
          <Input id="holiday-to" type="date" value={to} onChange={(e) => update({ to: e.target.value })} className="w-40" aria-invalid={range ? true : undefined} />
        </div>
        <div className="w-40">
          <Select aria-label="Applies to" value={values.scope || ANY} options={[{ value: ANY, label: 'Any scope' }, ...(['NATIONAL', 'ZONE', 'HQ'] as const).map((s) => ({ value: s, label: HOLIDAY_SCOPE_LABEL[s] }))]} onValueChange={(v) => update({ scope: v === ANY ? '' : v })} />
        </div>
        <div className="w-44">
          <Select aria-label="Zone" value={values.zoneId || ANY} options={[{ value: ANY, label: 'Any zone' }, ...directory.zoneOptions]} onValueChange={(v) => update({ zoneId: v === ANY ? '' : v })} />
        </div>
        <div className="w-52">
          <Select aria-label="HQ" value={values.hqId || ANY} options={[{ value: ANY, label: 'Any HQ' }, ...directory.hqOptions]} onValueChange={(v) => update({ hqId: v === ANY ? '' : v })} />
        </div>
        {values.from || values.to || values.scope || values.zoneId || values.hqId ? (
          <Button variant="ghost" size="sm" onClick={() => update({ from: '', to: '', scope: '', zoneId: '', hqId: '' })}>
            Reset
          </Button>
        ) : null}
        {range ? <p role="alert" className="basis-full text-[13px] text-danger-fg">{range}</p> : null}
      </div>

      <DataState
        isLoading={!range && holidays.isLoading}
        error={holidays.error ? toErrorState(holidays.error, () => void holidays.refetch()) : null}
        isEmpty={!range && holidays.data?.length === 0}
        empty={{ title: 'No holidays in this range', description: 'Add one, or widen the dates.' }}
      >
        <div className="divide-y divide-border">
          {groups.map(({ month, items }) => (
            <section key={month} aria-label={monthLabel(month)} className="px-5 py-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">{monthLabel(month)}</h3>
              <ul className="space-y-1">
                {items.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-hover">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {h.name} <span className="font-normal text-text-subtle">· {dateSpan(h.from, h.to)}{h.days > 1 ? ` · ${h.days} days` : ''}</span>
                      </p>
                      <p className="text-[13px] text-text-muted">{appliesTo(h, directory.zoneName, directory.hqName)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={h.scope === 'NATIONAL' ? 'accent' : 'neutral'}>{HOLIDAY_SCOPE_LABEL[h.scope]}</Badge>
                      <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Remove ${h.name}`} onClick={() => setRemoving(h)}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DataState>

      {adding ? <HolidayFormDialog onClose={() => setAdding(false)} /> : null}
      {uploading ? <HolidayImportDialog onClose={() => setUploading(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove holiday"
        description={
          removing
            ? `“${removing.name}” ${removing.groupId ? `(${dateSpan(removing.from, removing.to)}) is removed from the calendar, every day of it` : `on ${dateSpan(removing.from, removing.to)} is removed from the calendar`}. Leaves already counted keep the days they were counted with.`
            : undefined
        }
        confirmLabel={removing?.groupId ? 'Remove every day' : 'Remove'}
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate({ id: removing.id, group: removing.groupId !== null })}
      />
    </Card>
  );
}
