'use client';

import type { ChemistDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StepperItem } from '@/components/ui/Stepper';
import { WizardShell } from '@/components/ui/WizardShell';
import { Field, FieldList } from '@/components/ui/FieldList';
import { Grid } from '@/components/ui/WizardParts';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useChemist, useCreateChemist, useUpdateChemist } from '../hooks/useChemists';
import {
  CHEMIST_STATUS_LABEL,
  CHEMIST_STATUS_TONE,
  EMPTY_CHEMIST,
  PENDING_CHEMIST_APPROVALS_HREF,
  canToggleChemistStatus,
  buildChemist,
  buildChemistUpdate,
  chemistToDraft,
  chemistStepErrors,
  CHEMIST_STEPS,
  CHEMIST_STEP_LABEL,
  type ChemistStep,
  type PlaceDraft,
} from '../lib/chemists';
import { formatPoint, pointFromInputs } from '../lib/location';
import { LocationPicker } from './LocationPicker';
import { RoutePickerField } from './RoutePickerField';

/** `/chemists/new` (no id) and `/chemists/[id]` (edit). */
export function ChemistFormScreen({ id }: { id?: string }) {
  const query = useChemist(id ?? '');
  if (!id) return <ChemistForm />;
  return (
    <DataState
      isLoading={query.isLoading}
      error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
      isEmpty={!query.data}
      empty={{ title: 'Chemist not found' }}
      skeleton={
        <div role="status" aria-label="Loading" className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      {/* Keyed by what was loaded, so the draft starts from the latest data after a save. */}
      {query.data ? <ChemistForm key={JSON.stringify(query.data)} chemist={query.data} /> : null}
    </DataState>
  );
}

const STEP_TITLE: Record<ChemistStep, string> = {
  details: 'Chemist details',
  location: 'Location (optional)',
  review: 'Review',
};

/** Adding walks Details, Location and Review in the same shell as the employee wizard; editing shows the two sections on one page. */
function ChemistForm({ chemist }: { chemist?: ChemistDto }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [draft, setDraft] = useState<PlaceDraft>(chemist ? chemistToDraft(chemist) : EMPTY_CHEMIST);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const [step, setStep] = useState<ChemistStep>('details');
  // Errors show for a step only once Next has been pressed on it, as in the employee wizard.
  const [tried, setTried] = useState<ReadonlySet<ChemistStep>>(new Set());
  const create = useCreateChemist((created) => router.push(`/chemists/${created.id}`));
  const update = useUpdateChemist(() => setErrors({}));
  const toggle = useUpdateChemist(() => setToggling(false));
  const set = (field: 'name' | 'address') => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const locked = readOnly || chemist?.status === 'inactive';
  const stepIndex = CHEMIST_STEPS.indexOf(step);
  const valid = (s: ChemistStep) => Object.keys(chemistStepErrors(draft, s)).length === 0;
  const items: StepperItem[] = CHEMIST_STEPS.map((s, i) => ({
    key: s,
    label: CHEMIST_STEP_LABEL[s],
    optional: s === 'location',
    done: i < stepIndex && valid(s),
    reachable: CHEMIST_STEPS.slice(0, i).every(valid),
  }));
  const shown = chemist ? errors : tried.has(step) ? chemistStepErrors(draft, step) : errors;
  const invalid = (field: string) => (shown[field] ? true : undefined);

  function goTo(next: ChemistStep) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }
  function submit() {
    if (chemist) {
      const built = buildChemistUpdate(chemist, draft);
      if (!built.ok) return setErrors(built.errors);
      setErrors({});
      if (Object.keys(built.body).length === 0) return router.push('/chemists');
      return update.mutate(
        { id: chemist.id, body: built.body },
        { onSuccess: () => router.push('/chemists') },
      );
    }
    if (step !== 'review') {
      if (!valid(step)) return setTried((t) => new Set(t).add(step));
      return goTo(CHEMIST_STEPS[stepIndex + 1] ?? 'review');
    }
    const built = buildChemist(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  const detailsFields = (
    <Grid>
      <div className="sm:col-span-2">
        <RoutePickerField
          id="chemist-route"
          value={draft.routeId}
          onChange={(routeId) => setDraft((d) => ({ ...d, routeId }))}
          error={shown['routeId']}
          disabled={locked}
        />
      </div>
      <FormField label="Name" htmlFor="chemist-name" error={shown['name']}>
        <Input
          id="chemist-name"
          value={draft.name}
          disabled={locked}
          onChange={(e) => set('name')(e.target.value)}
          aria-invalid={invalid('name')}
        />
      </FormField>
      <FormField label="Address" htmlFor="chemist-address" error={shown['address']}>
        <Input
          id="chemist-address"
          value={draft.address}
          disabled={locked}
          onChange={(e) => set('address')(e.target.value)}
          aria-invalid={invalid('address')}
        />
      </FormField>
    </Grid>
  );
  const locationPicker = (
    <LocationPicker
      inputs={draft.coordinates}
      onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
      errors={shown}
      disabled={locked}
    />
  );

  if (!chemist) {
    const point = pointFromInputs(draft.coordinates);
    return (
      <WizardShell
        backHref="/chemists"
        backLabel="Chemists"
        title="New chemist"
        steps={items}
        current={step}
        onSelect={(key) => goTo(key as ChemistStep)}
        stepTitle={STEP_TITLE[step]}
        onSubmit={submit}
        onBack={() =>
          stepIndex > 0 ? goTo(CHEMIST_STEPS[stepIndex - 1] ?? 'details') : router.push('/chemists')
        }
        backText={stepIndex > 0 ? 'Back' : 'Cancel'}
        isLast={step === 'review'}
        createLabel="Create chemist"
        pending={create.isPending}
        disabled={readOnly}
        disabledTitle={readOnly ? 'A past financial year is read-only' : undefined}
      >
        {step === 'details' ? detailsFields : null}
        {step === 'location' ? locationPicker : null}
        {step === 'review' ? (
          <FieldList>
            <Field label="Route">
              {draft.routeId ? directory.routeLabel(draft.routeId) : null}
            </Field>
            <Field label="Name">{draft.name}</Field>
            <Field label="Address">{draft.address}</Field>
            <Field label="Location">{point.ok ? formatPoint(point.point) : 'Not valid'}</Field>
          </FieldList>
        ) : null}
      </WizardShell>
    );
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/chemists" className="text-text-muted hover:text-accent hover:underline">
          ← Chemists
        </Link>
      </p>
      <PageHeader
        title={chemist.name}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={CHEMIST_STATUS_TONE[chemist.status]}>{CHEMIST_STATUS_LABEL[chemist.status]}</Badge>
            {canToggleChemistStatus(chemist.status) ? (
              <Button variant="secondary" disabled={readOnly} onClick={() => setToggling(true)}>
                {chemist.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => router.push(PENDING_CHEMIST_APPROVALS_HREF)}>
                Approve or reject
              </Button>
            )}
          </div>
        }
      />
      {chemist.status === 'inactive' ? (
        <p
          role="status"
          className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted"
        >
          This chemist is inactive. Reactivate it to change it.
        </p>
      ) : null}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <Card title="Details">
          <div className="p-5">{detailsFields}</div>
        </Card>
        <Card title="Registered location">
          <div className="p-5">{locationPicker}</div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/chemists')}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={locked || update.isPending}
            title={readOnly ? 'A past financial year is read-only' : undefined}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
      <StatusToggleDialog
        item={toggling && chemist.status !== 'pending' ? { ...chemist, status: chemist.status } : null}
        noun="chemist"
        pending={toggle.isPending}
        onClose={() => setToggling(false)}
        onConfirm={(status) => toggle.mutate({ id: chemist.id, body: { status } })}
      />
    </>
  );
}
