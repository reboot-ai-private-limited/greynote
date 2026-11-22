'use client';

import { useEffect, useState } from 'react';
import { FormField } from '@/components/ui/FormField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useDoctors } from '../hooks/useDoctors';

/**
 * Pick one active doctor from a single dropdown with its own search box. The typed text goes to the server (a doctor's name, or the
 * name or code of the MR who holds the doctor), so a long list is searched, not scrolled. Twenty matches are shown at a time.
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
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null);
  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setTerm(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  const doctors = useDoctors({ page: 1, pageSize: 20, status: 'active', ...(term && { search: term }) });
  const options = (doctors.data?.items ?? []).map((d) => ({
    value: d.id,
    label: `${d.name} · ${d.specialty} — ${d.assignedTo ? `MR: ${d.assignedTo.name} (${d.assignedTo.employeeCode})` : 'no MR assigned'}`,
  }));
  // The doctor already chosen stays selectable after the search moves on.
  if (chosen && value === chosen.id && !options.some((o) => o.value === chosen.id)) options.unshift({ value: chosen.id, label: chosen.label });
  const settling = typed.trim() !== term || doctors.isFetching;

  return (
    <FormField label={label} htmlFor={id} error={error} hint="Open the list and type a doctor's or MR's name to search.">
      <SearchableSelect
        id={id}
        value={value}
        onValueChange={(v) => {
          onChange(v);
          const o = options.find((x) => x.value === v);
          if (o) setChosen({ id: v, label: o.label });
        }}
        options={options}
        filterLocally={false}
        onSearchChange={setTyped}
        placeholder="Choose a doctor"
        searchPlaceholder="Search doctor or MR"
        emptyText="No doctor matches."
        loading={settling}
        aria-invalid={error ? true : undefined}
      />
    </FormField>
  );
}
