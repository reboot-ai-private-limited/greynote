'use client';

import type { DistributorDetailDto } from '@greynote/contracts';
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
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useCreateDistributor, useDistributor, useUpdateDistributor } from '../hooks/useDistributors';
import {
  EMPTY_DISTRIBUTOR,
  SALES_OPTIONS,
  buildDistributor,
  buildDistributorUpdate,
  distributorToDraft,
  type DistributorDraft,
} from '../lib/distributors';
import { EmployeePickerField } from './EmployeePickerField';
import { LocationPicker } from './LocationPicker';
import { RoutePickerField } from './RoutePickerField';

/** `/distributors/new` (no id) and `/distributors/[id]` (edit). */
export function DistributorFormScreen({ id }: { id?: string }) {
  const query = useDistributor(id ?? '');
  if (!id) return <DistributorForm />;
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
      {query.data ? <DistributorForm key={JSON.stringify(query.data)} distributor={query.data} /> : null}
    </DataState>
  );
}

function DistributorForm({ distributor }: { distributor?: DistributorDetailDto }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [draft, setDraft] = useState<DistributorDraft>(distributor ? distributorToDraft(distributor) : EMPTY_DISTRIBUTOR);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const create = useCreateDistributor(() => router.push('/distributors'));
  const update = useUpdateDistributor();
  const toggle = useUpdateDistributor(() => setToggling(false));
  const locked = readOnly || distributor?.status === 'inactive';
  const set = <K extends keyof DistributorDraft>(field: K) => (value: DistributorDraft[K]) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);
  const path = distributor?.path;

  function submit() {
    if (distributor) {
      const built = buildDistributorUpdate(distributor, draft);
      if (!built.ok) return setErrors(built.errors);
      setErrors({});
      if (Object.keys(built.body).length === 0) return router.push('/distributors');
      return update.mutate({ id: distributor.id, body: built.body }, { onSuccess: () => router.push('/distributors') });
    }
    const built = buildDistributor(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/distributors" className="text-text-muted hover:text-accent hover:underline">
          ← Distributors
        </Link>
      </p>
      <PageHeader
        title={distributor ? distributor.name : 'New distributor'}
        description={
          path
            ? `${directory.zoneName(path.zoneId)} → ${directory.hqName(path.hqId)} → ${directory.areaName(path.areaId)} → ${directory.routeName(path.routeId)}`
            : 'A stockist on a route. The location can be set now or later.'
        }
        actions={
          distributor ? (
            <div className="flex items-center gap-2">
              <Badge tone={distributor.status === 'active' ? 'success' : 'neutral'}>{distributor.status === 'active' ? 'Active' : 'Inactive'}</Badge>
              <Button variant="secondary" disabled={readOnly} onClick={() => setToggling(true)}>
                {distributor.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          ) : null
        }
      />
      {distributor?.status === 'inactive' ? (
        <p role="status" className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          This distributor is inactive. Reactivate it to change it.
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
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <RoutePickerField id="dist-route" value={draft.routeId} onChange={set('routeId')} error={errors['routeId']} disabled={locked} />
            </div>
            <FormField label="Name" htmlFor="dist-name" error={errors['name']}>
              <Input id="dist-name" value={draft.name} disabled={locked} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
            </FormField>
            <FormField label="GST number" htmlFor="dist-gst" error={errors['gstNumber']} hint="15 characters, e.g. 19ABCDE1234F1Z5.">
              <Input id="dist-gst" value={draft.gstNumber} disabled={locked} onChange={(e) => set('gstNumber')(e.target.value)} autoCapitalize="characters" aria-invalid={invalid('gstNumber')} />
            </FormField>
            <FormField label="Contact person" htmlFor="dist-contact" error={errors['contactPerson']}>
              <Input id="dist-contact" value={draft.contactPerson} disabled={locked} onChange={(e) => set('contactPerson')(e.target.value)} aria-invalid={invalid('contactPerson')} />
            </FormField>
            <FormField label="Mobile" htmlFor="dist-mobile" error={errors['mobile']}>
              <Input id="dist-mobile" inputMode="tel" value={draft.mobile} disabled={locked} onChange={(e) => set('mobile')(e.target.value)} aria-invalid={invalid('mobile')} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Address" htmlFor="dist-address" error={errors['address']}>
                <Input id="dist-address" value={draft.address} disabled={locked} onChange={(e) => set('address')(e.target.value)} aria-invalid={invalid('address')} />
              </FormField>
            </div>
          </div>
        </Card>
        <Card title="Orders" description="Which kinds of order this distributor may take. You choose; there is no default.">
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <FormField label="Primary sales" htmlFor="dist-primary" error={errors['primarySales']}>
              <Select id="dist-primary" value={draft.primarySales} onValueChange={(v) => set('primarySales')(v as 'yes' | 'no')} options={SALES_OPTIONS} placeholder="Choose" aria-invalid={invalid('primarySales')} />
            </FormField>
            <FormField label="Secondary sales" htmlFor="dist-secondary" error={errors['secondarySales']}>
              <Select id="dist-secondary" value={draft.secondarySales} onValueChange={(v) => set('secondarySales')(v as 'yes' | 'no')} options={SALES_OPTIONS} placeholder="Choose" aria-invalid={invalid('secondarySales')} />
            </FormField>
          </div>
        </Card>
        <Card title="Assigned people" description="The MR who can place orders and stock counts against this distributor, and the ASM above them.">
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <EmployeePickerField id="dist-mr" label="MR" title="Choose an MR" value={draft.assignedMrId} onChange={set('assignedMrId')} error={errors['assignedMrId']} disabled={locked} />
            <EmployeePickerField id="dist-asm" label="ASM" title="Choose an ASM" value={draft.assignedAsmId} onChange={set('assignedAsmId')} error={errors['assignedAsmId']} disabled={locked} />
          </div>
        </Card>
        <Card title="Registered location">
          <div className="p-5">
            <LocationPicker inputs={draft.coordinates} onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))} errors={errors} disabled={locked} />
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/distributors')}>
            Cancel
          </Button>
          <Button type="submit" disabled={locked || create.isPending || update.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending || update.isPending ? 'Saving…' : distributor ? 'Save changes' : 'Create distributor'}
          </Button>
        </div>
      </form>
      {distributor ? (
        <StatusToggleDialog
          item={toggling ? distributor : null}
          noun="distributor"
          pending={toggle.isPending}
          onClose={() => setToggling(false)}
          onConfirm={(status) => toggle.mutate({ id: distributor.id, body: { status } })}
        />
      ) : null}
    </>
  );
}
