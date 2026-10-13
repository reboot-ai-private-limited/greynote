'use client';

import type { DistributorDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field, FieldList } from '@/components/ui/FieldList';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import type { StepperItem } from '@/components/ui/Stepper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Grid } from '@/components/ui/WizardParts';
import { WizardShell } from '@/components/ui/WizardShell';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { DistributorAccountsPage } from './DistributorAccountsScreen';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import {
  useCreateDistributor,
  useDistributor,
  useUpdateDistributor,
} from '../hooks/useDistributors';
import {
  DISTRIBUTOR_STEPS,
  DISTRIBUTOR_STEP_LABEL,
  EMPTY_DISTRIBUTOR,
  buildDistributor,
  buildDistributorUpdate,
  distributorStepErrors,
  distributorToDraft,
  type DistributorDraft,
  type DistributorStep,
} from '../lib/distributors';
import { DistributorOrdersTab } from './DistributorOrdersTab';
import { DistributorPaymentsTab } from './DistributorPaymentsTab';
import { DistributorStockTab } from './DistributorStockTab';
import { LocationPicker } from './LocationPicker';
import { PeopleMultiField } from './PeopleMultiField';
import { RoutesMultiField } from './RoutesMultiField';
import { ZoneField } from './ZoneField';

const STEP_TITLE: Record<DistributorStep, string> = {
  details: 'Distributor details',
  coverage: 'Coverage',
  location: 'Location (optional)',
  review: 'Review',
};

/** `/distributors/new` (no id) walks the add wizard; `/distributors/[id]` is the distributor's page: Details, Payments and Orders. */
export function DistributorFormScreen({ id }: { id?: string }) {
  const { user } = useSession();
  if (user?.role === 'ACCOUNTANT' && id) return <DistributorAccountsPage id={id} />;
  return <AdminDistributorScreen id={id} />;
}

function AdminDistributorScreen({ id }: { id?: string | undefined }) {
  const query = useDistributor(id ?? '');
  if (!id) return <NewDistributor />;
  return (
    <DataState
      isLoading={query.isLoading}
      error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
      isEmpty={!query.data}
      empty={{ title: 'Distributor not found' }}
      skeleton={
        <div role="status" aria-label="Loading" className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      {query.data ? <DistributorPage distributor={query.data} /> : null}
    </DataState>
  );
}

/** The fields shared by the wizard's steps and the edit page. */
function useDistributorDraft(initial: DistributorDraft) {
  const [draft, setDraft] = useState<DistributorDraft>(initial);
  const set =
    <K extends keyof DistributorDraft>(field: K) =>
    (value: DistributorDraft[K]) =>
      setDraft((d) => ({ ...d, [field]: value }));
  return { draft, setDraft, set };
}

function DetailsFields({
  draft,
  set,
  errors,
  locked,
}: {
  draft: DistributorDraft;
  set: <K extends keyof DistributorDraft>(f: K) => (v: DistributorDraft[K]) => void;
  errors: Record<string, string>;
  locked: boolean;
}) {
  const invalid = (field: string) => (errors[field] ? true : undefined);
  return (
    <Grid>
      <FormField label="Name" htmlFor="dist-name" error={errors['name']}>
        <Input
          id="dist-name"
          value={draft.name}
          disabled={locked}
          onChange={(e) => set('name')(e.target.value)}
          aria-invalid={invalid('name')}
        />
      </FormField>
      <FormField label="GST number" htmlFor="dist-gst" error={errors['gstNumber']}>
        <Input
          id="dist-gst"
          value={draft.gstNumber}
          disabled={locked}
          onChange={(e) => set('gstNumber')(e.target.value)}
          autoCapitalize="characters"
          aria-invalid={invalid('gstNumber')}
        />
      </FormField>
      <FormField label="Contact person" htmlFor="dist-contact" error={errors['contactPerson']}>
        <Input
          id="dist-contact"
          value={draft.contactPerson}
          disabled={locked}
          onChange={(e) => set('contactPerson')(e.target.value)}
          aria-invalid={invalid('contactPerson')}
        />
      </FormField>
      <FormField label="Mobile" htmlFor="dist-mobile" error={errors['mobile']}>
        <Input
          id="dist-mobile"
          inputMode="tel"
          value={draft.mobile}
          disabled={locked}
          onChange={(e) => set('mobile')(e.target.value)}
          aria-invalid={invalid('mobile')}
        />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="Address" htmlFor="dist-address" error={errors['address']}>
          <Input
            id="dist-address"
            value={draft.address}
            disabled={locked}
            onChange={(e) => set('address')(e.target.value)}
            aria-invalid={invalid('address')}
          />
        </FormField>
      </div>
    </Grid>
  );
}

function CoverageFields({
  draft,
  setDraft,
  errors,
  locked,
}: {
  draft: DistributorDraft;
  setDraft: (f: (d: DistributorDraft) => DistributorDraft) => void;
  errors: Record<string, string>;
  locked: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* A different zone means different routes, so the old ones are dropped. */}
      <ZoneField
        id="dist-zone"
        value={draft.zoneId}
        onChange={(zoneId) =>
          setDraft((d) => (zoneId === d.zoneId ? d : { ...d, zoneId, routeIds: [] }))
        }
        error={errors['zoneId']}
        disabled={locked}
      />
      <RoutesMultiField
        id="dist-routes"
        zoneId={draft.zoneId}
        value={draft.routeIds}
        onChange={(routeIds) => setDraft((d) => ({ ...d, routeIds }))}
        error={errors['routeIds']}
        disabled={locked}
      />
      <PeopleMultiField
        id="dist-people"
        value={draft.assignedUserIds}
        onChange={(assignedUserIds) => setDraft((d) => ({ ...d, assignedUserIds }))}
        error={errors['assignedUserIds']}
        disabled={locked}
      />
    </div>
  );
}

function NewDistributor() {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const { draft, setDraft, set } = useDistributorDraft(EMPTY_DISTRIBUTOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<DistributorStep>('details');
  // Errors show for a step only once Next has been pressed on it, as in the employee wizard.
  const [tried, setTried] = useState<ReadonlySet<DistributorStep>>(new Set());
  const create = useCreateDistributor((created) => router.push(`/distributors/${created.id}`));
  const stepIndex = DISTRIBUTOR_STEPS.indexOf(step);
  const valid = (s: DistributorStep) => Object.keys(distributorStepErrors(draft, s)).length === 0;
  const items: StepperItem[] = DISTRIBUTOR_STEPS.map((s, i) => ({
    key: s,
    label: DISTRIBUTOR_STEP_LABEL[s],
    optional: s === 'location',
    done: i < stepIndex && valid(s),
    reachable: DISTRIBUTOR_STEPS.slice(0, i).every(valid),
  }));
  const shown = tried.has(step) ? distributorStepErrors(draft, step) : errors;

  function goTo(next: DistributorStep) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }
  function submit() {
    if (step !== 'review') {
      if (!valid(step)) return setTried((t) => new Set(t).add(step));
      return goTo(DISTRIBUTOR_STEPS[stepIndex + 1] ?? 'review');
    }
    const built = buildDistributor(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  const point =
    draft.coordinates.latitude !== '' && draft.coordinates.longitude !== ''
      ? `${draft.coordinates.latitude}, ${draft.coordinates.longitude}`
      : null;
  return (
    <WizardShell
      backHref="/distributors"
      backLabel="Distributors"
      title="New distributor"
      steps={items}
      current={step}
      onSelect={(key) => goTo(key as DistributorStep)}
      stepTitle={STEP_TITLE[step]}
      onSubmit={submit}
      onBack={() =>
        stepIndex > 0
          ? goTo(DISTRIBUTOR_STEPS[stepIndex - 1] ?? 'details')
          : router.push('/distributors')
      }
      backText={stepIndex > 0 ? 'Back' : 'Cancel'}
      isLast={step === 'review'}
      createLabel="Create distributor"
      pending={create.isPending}
      disabled={readOnly}
      disabledTitle={readOnly ? 'A past financial year is read-only' : undefined}
    >
      {step === 'details' ? (
        <DetailsFields draft={draft} set={set} errors={shown} locked={false} />
      ) : null}
      {step === 'coverage' ? (
        <CoverageFields draft={draft} setDraft={setDraft} errors={shown} locked={false} />
      ) : null}
      {step === 'location' ? (
        <LocationPicker
          inputs={draft.coordinates}
          onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
          errors={shown}
        />
      ) : null}
      {step === 'review' ? (
        <FieldList>
          <Field label="Name">{draft.name}</Field>
          <Field label="GST number">{draft.gstNumber}</Field>
          <Field label="Contact person">{draft.contactPerson}</Field>
          <Field label="Mobile">{draft.mobile}</Field>
          <Field label="Address">{draft.address}</Field>
          <Field label="Zone">{draft.zoneId ? directory.zoneName(draft.zoneId) : null}</Field>
          <Field label="Routes">
            {draft.routeIds.map((r) => directory.routeLabel(r)).join(', ') || null}
          </Field>
          <Field label="Assigned people">
            {draft.assignedUserIds.length > 0
              ? draft.assignedUserIds.map((u, i) => (
                  <span key={u}>
                    {i > 0 ? ', ' : ''}
                    <EmployeeName userId={u} />
                  </span>
                ))
              : null}
          </Field>
          <Field label="Location">{point}</Field>
        </FieldList>
      ) : null}
    </WizardShell>
  );
}

function DistributorPage({ distributor }: { distributor: DistributorDetailDto }) {
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const update = useUpdateDistributor(() => setToggling(false));
  const [toggling, setToggling] = useState(false);
  const zones = [...new Set(distributor.paths.map((p) => directory.zoneName(p.zoneId)))];
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/distributors" className="text-text-muted hover:text-accent hover:underline">
          ← Distributors
        </Link>
      </p>
      <PageHeader
        title={distributor.name}
        description={
          zones.length > 0
            ? `${zones.join(', ')} · ${distributor.routeIds.map((r) => directory.routeLabel(r)).join(', ')}`
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={distributor.status === 'active' ? 'success' : 'neutral'}>
              {distributor.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
            <Button variant="secondary" disabled={readOnly} onClick={() => setToggling(true)}>
              {distributor.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        }
      />
      {distributor.status === 'inactive' ? (
        <p
          role="status"
          className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted"
        >
          This distributor is inactive. Reactivate it to change it.
        </p>
      ) : null}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          {/* Keyed by what was loaded, so the draft starts from the latest data after a save. */}
          <DistributorEditForm key={JSON.stringify(distributor)} distributor={distributor} />
        </TabsContent>
        <TabsContent value="payments">
          <DistributorPaymentsTab
            distributorId={distributor.id}
            inactive={distributor.status === 'inactive'}
          />
        </TabsContent>
        <TabsContent value="orders">
          <DistributorOrdersTab distributorId={distributor.id} />
        </TabsContent>
        <TabsContent value="stock">
          <DistributorStockTab distributorId={distributor.id} inactive={distributor.status === 'inactive'} />
        </TabsContent>
      </Tabs>
      <StatusToggleDialog
        item={toggling ? distributor : null}
        noun="distributor"
        pending={update.isPending}
        onClose={() => setToggling(false)}
        onConfirm={(status) => update.mutate({ id: distributor.id, body: { status } })}
      />
    </>
  );
}

function DistributorEditForm({ distributor }: { distributor: DistributorDetailDto }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const { draft, setDraft, set } = useDistributorDraft(
    distributorToDraft(distributor, distributor.paths[0]?.zoneId ?? ''),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useUpdateDistributor();
  const locked = readOnly || distributor.status === 'inactive';

  function submit() {
    const built = buildDistributorUpdate(distributor, draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    if (Object.keys(built.body).length === 0) return;
    update.mutate({ id: distributor.id, body: built.body });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <Card title="Details">
        <div className="p-5">
          <DetailsFields draft={draft} set={set} errors={errors} locked={locked} />
        </div>
      </Card>
      <Card title="Coverage">
        <div className="p-5">
          <CoverageFields draft={draft} setDraft={setDraft} errors={errors} locked={locked} />
        </div>
      </Card>
      <Card title="Registered location">
        <div className="p-5">
          <LocationPicker
            inputs={draft.coordinates}
            onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
            errors={errors}
            disabled={locked}
          />
        </div>
      </Card>
      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={() => router.push('/distributors')}>
          Back to distributors
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
  );
}
