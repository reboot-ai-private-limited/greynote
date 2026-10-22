'use client';

import type { ConfigSettingDto } from '@greynote/contracts';
import { useId, useRef } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { draftFromRows, rowsFromDraft } from '../lib/slabRows';
import { cn } from '@/components/ui/cn';

const TIME_ZONES: readonly string[] = typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl ? Intl.supportedValuesOf('timeZone') : [];

/** The control for a setting's type. It edits a draft string; the screen decides when to save. */
export function SettingControl({
  setting,
  draft,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  setting: ConfigSettingDto;
  draft: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
}) {
  const id = useId();
  const aria = { 'aria-label': setting.label, 'aria-invalid': invalid ? true : undefined, 'aria-describedby': describedBy } as const;

  switch (setting.type) {
    case 'BOOLEAN': {
      const on = draft === 'true';
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={setting.label}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => onChange(on ? 'false' : 'true')}
          className={cn(
            'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            on ? 'bg-accent' : 'bg-border-strong',
          )}
        >
          <span className={cn('size-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[1.375rem]' : 'translate-x-0.5')} />
          <span className="sr-only">{on ? 'On' : 'Off'}</span>
        </button>
      );
    }
    case 'INTEGER':
      return (
        <div className="flex items-center gap-2">
          <Input {...aria} inputMode="numeric" value={draft} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-32 tabular-nums" />
          {setting.unit ? <span className="text-sm text-text-muted">{setting.unit}</span> : null}
        </div>
      );
    case 'TIME':
      return <Input {...aria} type="time" value={draft} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-36" />;
    case 'MONTH':
    case 'WEEKDAY':
      return (
        <div className="w-48">
          <Select
            id={id}
            value={draft}
            onValueChange={onChange}
            options={(setting.options ?? []).map((o) => ({ value: o, label: o.charAt(0) + o.slice(1).toLowerCase() }))}
            aria-label={setting.label}
            aria-invalid={invalid ? true : undefined}
          />
        </div>
      );
    case 'TIMEZONE':
      return (
        <>
          <Input {...aria} list={`${id}-zones`} value={draft} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-64" />
          <datalist id={`${id}-zones`}>
            {TIME_ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </>
      );
    case 'SLAB_LIST':
      return <SlabListEditor label={setting.label} draft={draft} onChange={onChange} disabled={disabled} invalid={invalid} describedBy={describedBy} />;
    case 'KIND_LIST':
      return <Input {...aria} value={draft} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-72" />;
  }
}

let nextSlab = 0;
const slabKey = (): string => `slab-${(nextSlab += 1)}`;

/**
 * The professional-tax slabs: one row per slab, `to` shown from the next row's `from`. The rows are re-read from the draft
 * string on every render, so each keeps a key here, added and dropped with its row, so removing a middle slab doesn't move
 * focus or typing onto the one below. A draft replaced from outside (a reset, a save) with a different count starts fresh keys.
 */
function SlabListEditor({
  label,
  draft,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  label: string;
  draft: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
}) {
  const rows = rowsFromDraft(draft);
  const keys = useRef<string[]>([]);
  if (keys.current.length !== rows.length) keys.current = rows.map(slabKey);
  const keyed = rows.map((row, i) => ({ row, key: keys.current[i] ?? '' }));
  const edit = (i: number, patch: Partial<{ from: string; amount: string }>) => onChange(draftFromRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const remove = (i: number) => {
    keys.current = keys.current.filter((_, j) => j !== i);
    onChange(draftFromRows(rows.filter((_, j) => j !== i)));
  };
  const add = () => {
    keys.current = [...keys.current, slabKey()];
    onChange(draftFromRows([...rows, { from: '', amount: '' }]));
  };
  return (
    <div className="space-y-2" role="group" aria-label={label} aria-describedby={describedBy}>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 text-xs text-text-subtle">
        <span>Monthly salary from (₹)</span>
        <span>to (₹, until the next slab)</span>
        <span>Amount a month (₹)</span>
        <span className="w-16" />
      </div>
      {keyed.map(({ row: r, key }, i) => {
        const next = rows[i + 1];
        const to = next === undefined ? 'and above' : /^\d+$/.test(next.from) ? String(Number(next.from) - 1) : '…';
        return (
          <div key={key} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
            <Input aria-label={`Slab ${i + 1} from`} aria-invalid={invalid ? true : undefined} inputMode="numeric" value={r.from} disabled={disabled} onChange={(e) => edit(i, { from: e.target.value })} className="tabular-nums" />
            <span className="px-2 text-sm text-text-muted tabular-nums">{to}</span>
            <Input aria-label={`Slab ${i + 1} amount`} aria-invalid={invalid ? true : undefined} inputMode="numeric" value={r.amount} disabled={disabled} onChange={(e) => edit(i, { amount: e.target.value })} className="tabular-nums" />
            <Button type="button" variant="ghost" size="sm" disabled={disabled || rows.length <= 1} aria-label={`Remove slab ${i + 1}`} onClick={() => remove(i)}>
              Remove
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="secondary" size="sm" disabled={disabled || rows.length >= 20} onClick={add}>
        Add slab
      </Button>
    </div>
  );
}
