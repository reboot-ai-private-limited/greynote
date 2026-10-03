'use client';

import type { ConfigSettingDto } from '@greynote/contracts';
import { useId } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
    case 'KIND_LIST':
      return <Input {...aria} value={draft} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-72" />;
  }
}
