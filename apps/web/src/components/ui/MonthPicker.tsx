'use client';

import { Select } from './Select';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A month as `YYYY-MM`, chosen from a year and a month list. The browser's own month input is missing in Firefox and Safari on the
 * desktop, where it is a plain text box: this works everywhere. `value` is `''` until both are chosen.
 */
export function MonthPicker({
  id,
  value,
  onChange,
  fromYear = new Date().getFullYear() - 3,
  toYear = new Date().getFullYear() + 1,
  'aria-invalid': invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  fromYear?: number;
  toYear?: number;
  'aria-invalid'?: boolean | undefined;
}) {
  const [year = '', month = ''] = value ? value.split('-') : [];
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => String(toYear - i));
  // Picking one half before the other keeps what is already chosen: the first pick falls back to the current year or January.
  const emit = (y: string, m: string) => onChange(y && m ? `${y}-${m}` : '');
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        {...(id && { id })}
        aria-label="Month"
        aria-invalid={invalid}
        value={month}
        placeholder="Month"
        onValueChange={(m) => emit(year || String(new Date().getFullYear()), m)}
        options={MONTHS.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }))}
      />
      <Select
        aria-label="Year"
        aria-invalid={invalid}
        value={year}
        placeholder="Year"
        onValueChange={(y) => emit(y, month || '01')}
        options={years.map((y) => ({ value: y, label: y }))}
      />
    </div>
  );
}
