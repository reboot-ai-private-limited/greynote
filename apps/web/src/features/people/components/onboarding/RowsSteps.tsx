import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { emptyExperience, emptyQualification } from '../../lib/onboarding';
import { StepFrame, type StepProps } from './StepFrame';

/** A repeatable block: one bordered card per entry with a remove button, and "Add" under them. */
function Rows<T>({
  rows,
  addLabel,
  emptyText,
  onAdd,
  onRemove,
  children,
}: {
  rows: readonly (T & { id: string })[];
  addLabel: string;
  emptyText: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  children: (row: T & { id: string }, index: number) => ReactNode;
}) {
  return (
    <div className="space-y-4">
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted">{emptyText}</p> : null}
      {rows.map((row, index) => (
        <div key={row.id} className="relative rounded-lg border border-border bg-surface-subtle/50 p-4">
          <Button variant="ghost" size="sm" className="absolute right-2 top-2" aria-label={`Remove entry ${index + 1}`} onClick={() => onRemove(index)}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
          <div className="grid gap-x-5 gap-y-4 pr-8 sm:grid-cols-3">{children(row, index)}</div>
        </div>
      ))}
      <Button variant="secondary" onClick={onAdd}>
        <Plus aria-hidden className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

const patchAt = <T,>(rows: readonly T[], index: number, patch: Partial<T>): T[] => rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
const removeAt = <T,>(rows: readonly T[], index: number): T[] => rows.filter((_, i) => i !== index);

export function QualificationsStep({ form, update, errors }: StepProps) {
  return (
    <StepFrame title="Qualifications">
      <Rows
        rows={form.qualifications}
        addLabel="Add qualification"
        emptyText="No qualification added. You can skip this step."
        onAdd={() => update({ qualifications: [...form.qualifications, emptyQualification()] })}
        onRemove={(i) => update({ qualifications: removeAt(form.qualifications, i) })}
      >
        {(row, i) => {
          const set = (patch: Partial<typeof row>) => update({ qualifications: patchAt(form.qualifications, i, patch) });
          return (
            <>
              <FormField label="Degree / qualification" htmlFor={`q-degree-${i}`} error={errors[`${i}.degree`]}>
                <Input id={`q-degree-${i}`} value={row.degree} placeholder="B.Sc, HS, Diploma…" onChange={(e) => set({ degree: e.target.value })} aria-invalid={errors[`${i}.degree`] ? true : undefined} />
              </FormField>
              <FormField label="Board / institute" htmlFor={`q-inst-${i}`} error={errors[`${i}.institute`]}>
                <Input id={`q-inst-${i}`} value={row.institute} onChange={(e) => set({ institute: e.target.value })} aria-invalid={errors[`${i}.institute`] ? true : undefined} />
              </FormField>
              <FormField label="Year of passing" htmlFor={`q-year-${i}`} error={errors[`${i}.yearOfPassing`]}>
                <Input id={`q-year-${i}`} inputMode="numeric" maxLength={4} value={row.yearOfPassing} onChange={(e) => set({ yearOfPassing: e.target.value.replace(/\D/g, '') })} aria-invalid={errors[`${i}.yearOfPassing`] ? true : undefined} />
              </FormField>
            </>
          );
        }}
      </Rows>
    </StepFrame>
  );
}

export function ExperienceStep({ form, update, errors }: StepProps) {
  return (
    <StepFrame title="Professional experience">
      <Rows
        rows={form.experience}
        addLabel="Add company"
        emptyText="No previous company added. You can skip this step."
        onAdd={() => update({ experience: [...form.experience, emptyExperience()] })}
        onRemove={(i) => update({ experience: removeAt(form.experience, i) })}
      >
        {(row, i) => {
          const set = (patch: Partial<typeof row>) => update({ experience: patchAt(form.experience, i, patch) });
          return (
            <>
              <FormField label="Company name" htmlFor={`x-company-${i}`} error={errors[`${i}.companyName`]}>
                <Input id={`x-company-${i}`} value={row.companyName} onChange={(e) => set({ companyName: e.target.value })} aria-invalid={errors[`${i}.companyName`] ? true : undefined} />
              </FormField>
              <FormField label="Joining date" htmlFor={`x-from-${i}`} error={errors[`${i}.joiningDate`]}>
                <Input id={`x-from-${i}`} type="date" value={row.joiningDate} onChange={(e) => set({ joiningDate: e.target.value })} aria-invalid={errors[`${i}.joiningDate`] ? true : undefined} />
              </FormField>
              <FormField label="End date" htmlFor={`x-to-${i}`} error={errors[`${i}.endDate`]}>
                <Input id={`x-to-${i}`} type="date" value={row.endDate} onChange={(e) => set({ endDate: e.target.value })} aria-invalid={errors[`${i}.endDate`] ? true : undefined} />
              </FormField>
            </>
          );
        }}
      </Rows>
    </StepFrame>
  );
}
