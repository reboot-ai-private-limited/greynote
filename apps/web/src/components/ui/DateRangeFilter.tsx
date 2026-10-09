'use client';

import { Input } from './Input';
import { Select } from './Select';

export interface DateRangeValue {
  preset: string;
  from: string;
  to: string;
}

/**
 * A preset choice (Today, Last 7 days, Custom) and, for Custom, the two dates. It only reports what was chosen; the screen turns a
 * preset into dates, so the same control serves any list that takes a `from`/`to`.
 */
export function DateRangeFilter({
  value,
  presets,
  max,
  error,
  onChange,
}: {
  value: DateRangeValue;
  presets: readonly { value: string; label: string }[];
  /** The latest day a custom date may be (`YYYY-MM-DD`). */
  max?: string;
  error?: string | undefined;
  onChange: (next: Partial<DateRangeValue>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-40">
        <Select
          aria-label="Period"
          value={value.preset}
          onValueChange={(preset) => onChange({ preset })}
          options={presets}
        />
      </div>
      {value.preset === 'custom' ? (
        <>
          <Input
            type="date"
            aria-label="From"
            className="w-40"
            value={value.from}
            {...(max ? { max } : {})}
            onChange={(e) => onChange({ from: e.target.value })}
          />
          <span className="text-sm text-text-muted">to</span>
          <Input
            type="date"
            aria-label="To"
            className="w-40"
            value={value.to}
            {...(max ? { max } : {})}
            onChange={(e) => onChange({ to: e.target.value })}
          />
          {error ? (
            <p role="alert" className="w-full text-[13px] text-danger-fg">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
