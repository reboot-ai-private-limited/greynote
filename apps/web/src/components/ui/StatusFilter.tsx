'use client';

import { Select } from '@/components/ui/Select';

const OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** The empty URL param means "all"; Radix Select cannot hold an empty-string item, hence the sentinel. */
export function StatusFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="w-44">
      <Select
        aria-label="Status"
        value={value || 'all'}
        onValueChange={(v) => onChange(v === 'all' ? '' : v)}
        options={OPTIONS}
      />
    </div>
  );
}
