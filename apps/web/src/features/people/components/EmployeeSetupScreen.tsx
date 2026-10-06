'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useUser } from '../hooks/useUsers';
import { missingForActive } from '../lib/profile';
import { neighbour, requiredProgress, setupSteps, startStep, type SetupStepKey } from '../lib/setup';
import { AddressSection } from './AddressSection';
import { BankSection } from './BankSection';
import { BasicSection } from './BasicSection';
import { CompensationTab } from './CompensationTab';
import { DocumentsSection } from './DocumentsSection';
import { WorkSection } from './WorkSection';

/**
 * Setting a field employee up one step at a time: personal details, address, work, bank, compensation, documents. Each step is the same
 * section the profile shows, opened for editing, and saves on its own; nothing is lost by leaving, and the profile always shows what is left.
 */
export function EmployeeSetupScreen({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const readOnly = useIsReadOnly();
  const query = useUser(id);
  const user = query.data;

  const steps = user ? setupSteps(user) : [];
  const current: SetupStepKey = user ? startStep(user, params.get('step') ?? undefined) : 'personal';
  const go = (step: SetupStepKey) => router.push(`/employees/${id}/setup?step=${step}`);
  const progress = requiredProgress(steps);
  const missing = user ? missingForActive(user) : [];
  const next = neighbour(current, 1);
  const previous = neighbour(current, -1);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/employees/${id}`} className="text-text-muted hover:text-accent hover:underline">
          ← Profile
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!user}
        empty={{ title: 'Employee not found' }}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {user && user.role !== 'FIELD' ? (
          <p className="rounded-lg border border-border bg-surface-subtle p-6 text-sm text-text-muted">
            Step-by-step setup is for field employees. <Link href={`/employees/${id}`} className="text-accent hover:underline">Open the profile</Link>.
          </p>
        ) : user ? (
          <>
            <PageHeader
              title={`Set up ${user.name}`}
              description={`${user.employeeCode} · ${progress.done} of ${progress.total} required steps done. Each step saves on its own, so you can stop and come back.`}
              actions={user.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Onboarding</Badge>}
            />
            <ol className="mb-6 flex flex-wrap gap-2" aria-label="Setup steps">
              {steps.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => go(s.key)}
                    aria-current={s.key === current ? 'step' : undefined}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${s.key === current ? 'border-accent bg-accent/10 font-medium text-text' : 'border-border text-text-muted hover:border-border-strong'}`}
                  >
                    <span className={`flex size-5 items-center justify-center rounded-full text-xs ${s.done ? 'bg-success text-white' : 'bg-surface-subtle text-text-subtle'}`}>
                      {s.done ? <Check aria-hidden className="size-3" /> : i + 1}
                    </span>
                    {s.label}
                    {!s.required ? <span className="text-xs text-text-subtle">(optional)</span> : null}
                  </button>
                </li>
              ))}
            </ol>
            <p className="mb-4 text-sm text-text-muted">{steps.find((s) => s.key === current)?.hint}</p>

            <div className="mb-6">
              {current === 'personal' ? <BasicSection key="personal" user={user} readOnly={readOnly} startEditing /> : null}
              {current === 'address' ? <AddressSection key="address" user={user} readOnly={readOnly} startEditing /> : null}
              {current === 'work' ? <WorkSection key="work" user={user} readOnly={readOnly} startEditing /> : null}
              {current === 'bank' ? <BankSection key="bank" user={user} readOnly={readOnly} startEditing /> : null}
              {current === 'compensation' ? <CompensationTab key="compensation" user={user} readOnly={readOnly} /> : null}
              {current === 'documents' ? <DocumentsSection key="documents" user={user} readOnly={readOnly} /> : null}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="secondary" disabled={!previous} onClick={() => previous && go(previous)}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                <Link href={`/employees/${id}`} className="text-sm text-text-muted hover:text-accent hover:underline">
                  Finish later
                </Link>
                {next ? (
                  <Button onClick={() => go(next)}>Next: {steps.find((s) => s.key === next)?.label}</Button>
                ) : (
                  <Button onClick={() => router.push(`/employees/${id}`)}>Finish</Button>
                )}
              </div>
            </div>
            {!next && missing.length > 0 ? (
              <p role="status" className="mt-4 rounded-lg border border-border bg-warning-bg p-3 text-sm text-warning-fg">
                Still to fill in before this employee is active: {missing.join(' · ')}.
              </p>
            ) : null}
          </>
        ) : null}
      </DataState>
    </>
  );
}
