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
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useChemist, useCreateChemist, useUpdateChemist } from '../hooks/useChemists';
import { EMPTY_CHEMIST, buildChemist, buildChemistUpdate, chemistToDraft, type PlaceDraft } from '../lib/chemists';
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

function ChemistForm({ chemist }: { chemist?: ChemistDto }) {
  const router = useRouter();
  const readOnly = useIsReadOnly();
  const [draft, setDraft] = useState<PlaceDraft>(chemist ? chemistToDraft(chemist) : EMPTY_CHEMIST);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toggling, setToggling] = useState(false);
  const create = useCreateChemist(() => router.push('/chemists'));
  const update = useUpdateChemist(() => setErrors({}));
  const toggle = useUpdateChemist(() => setToggling(false));
  const set = (field: 'name' | 'address') => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);
  const locked = readOnly || chemist?.status === 'inactive';

  function submit() {
    if (chemist) {
      const built = buildChemistUpdate(chemist, draft);
      if (!built.ok) return setErrors(built.errors);
      setErrors({});
      if (Object.keys(built.body).length === 0) return router.push('/chemists');
      return update.mutate({ id: chemist.id, body: built.body }, { onSuccess: () => router.push('/chemists') });
    }
    const built = buildChemist(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/chemists" className="text-text-muted hover:text-accent hover:underline">
          ← Chemists
        </Link>
      </p>
      <PageHeader
        title={chemist ? chemist.name : 'New chemist'}
        description={chemist ? 'Edit the details and the registered location.' : 'A pharmacy on a route. The location can be set now or later.'}
        actions={
          chemist ? (
            <div className="flex items-center gap-2">
              <Badge tone={chemist.status === 'active' ? 'success' : 'neutral'}>{chemist.status === 'active' ? 'Active' : 'Inactive'}</Badge>
              <Button variant="secondary" disabled={readOnly} onClick={() => setToggling(true)}>
                {chemist.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          ) : null
        }
      />
      {chemist?.status === 'inactive' ? (
        <p role="status" className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
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
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <RoutePickerField
                id="chemist-route"
                value={draft.routeId}
                onChange={(routeId) => setDraft((d) => ({ ...d, routeId }))}
                error={errors['routeId']}
                disabled={locked}
              />
            </div>
            <FormField label="Name" htmlFor="chemist-name" error={errors['name']}>
              <Input id="chemist-name" value={draft.name} disabled={locked} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
            </FormField>
            <FormField label="Address" htmlFor="chemist-address" error={errors['address']}>
              <Input id="chemist-address" value={draft.address} disabled={locked} onChange={(e) => set('address')(e.target.value)} aria-invalid={invalid('address')} />
            </FormField>
          </div>
        </Card>
        <Card title="Registered location" description="What a chemist call's geofence compares the MR's position against.">
          <div className="p-5">
            <LocationPicker
              inputs={draft.coordinates}
              onChange={(coordinates) => setDraft((d) => ({ ...d, coordinates }))}
              errors={errors}
              disabled={locked}
            />
          </div>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.push('/chemists')}>
            Cancel
          </Button>
          <Button type="submit" disabled={locked || create.isPending || update.isPending} title={readOnly ? 'A past financial year is read-only' : undefined}>
            {create.isPending || update.isPending ? 'Saving…' : chemist ? 'Save changes' : 'Create chemist'}
          </Button>
        </div>
      </form>
      {chemist ? (
        <StatusToggleDialog
          item={toggling ? chemist : null}
          noun="chemist"
          pending={toggle.isPending}
          onClose={() => setToggling(false)}
          onConfirm={(status) => toggle.mutate({ id: chemist.id, body: { status } })}
        />
      ) : null}
    </>
  );
}
