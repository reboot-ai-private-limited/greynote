'use client';

import { useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDoctors } from '../hooks/useDoctors';

/**
 * Pick one active doctor: type part of the name to narrow the list, then choose. Twenty matches are shown at a time, so a long
 * list is searched, not scrolled.
 */
export function DoctorPickerField({
  id,
  label = 'Doctor',
  value,
  onChange,
  error,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (doctorId: string) => void;
  error?: string | undefined;
}) {
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  const doctors = useDoctors({ page: 1, pageSize: 20, status: 'active', ...(term.trim() && { search: term.trim() }) });
  const options = (doctors.data?.items ?? []).map((d) => ({ value: d.id, label: `${d.name} · ${d.specialty}` }));
  // The doctor already chosen stays selectable after the search moves on.
  if (chosen && value === chosen.id && !options.some((o) => o.value === chosen.id)) options.unshift({ value: chosen.id, label: chosen.label });

  return (
    <FormField label={label} htmlFor={id} error={error} hint="Type to search by name, then choose.">
      <div className="space-y-2">
        <Input aria-label="Search doctors" placeholder="Search by name" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select
          id={id}
          value={value}
          onValueChange={(v) => {
            onChange(v);
            const o = options.find((x) => x.value === v);
            if (o) setChosen({ id: v, label: o.label });
          }}
          options={options}
          placeholder={doctors.isLoading ? 'Loading…' : options.length === 0 ? 'No doctor matches' : 'Choose a doctor'}
          aria-invalid={error ? true : undefined}
        />
      </div>
    </FormField>
  );
}
