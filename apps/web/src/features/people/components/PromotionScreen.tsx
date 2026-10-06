'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useEmployeeBalances } from '@/features/hr/hooks/useBalances';
import { formatDays } from '@/features/hr/lib/days';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate, istMonth } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { useFinancialYear } from '@/lib/useFinancialYear';
import type { LeaveBalanceDto } from '@greynote/contracts';
import { useDesignations, usePayBands } from '../hooks/useMasterData';
import { usePromotionPreview, useSchedulePromotion } from '../hooks/usePromotions';
import { useUser } from '../hooks/useUsers';
import { DESIGNATION_LABEL } from '../lib/masterData';
import { assignMoves, buildPromotionRequest, changeSummary, clearMoves, emptyPromotionDraft, monthStartLabel, unplacedIds, type PromotionDraft } from '../lib/promotion';
import { CtcBreakdownTable } from './CtcBreakdownTable';
import { EmployeePickerField } from './EmployeePickerField';
import { PromotionTeamTable } from './PromotionTeamTable';

const KEEP = 'keep';

/**
 * Promote an employee: the new designation, grade, manager and CTC, from the 1st of a coming month, with every direct report given
 * a manager first. The server works out the preview (problems, warnings, where everyone goes) as the form is filled in; Schedule
 * is open only when it finds none. Nothing changes until the month starts.
 */
export function PromotionScreen({ id }: { id: string }) {
  const router = useRouter();
  const query = useUser(id);
  const user = query.data;
  const designations = useDesignations();
  const payBands = usePayBands();
  const [draft, setDraft] = useState<PromotionDraft>(() => emptyPromotionDraft(istMonth()));
  const [names, setNames] = useState<Record<string, string>>({});
  const set = (patch: Partial<PromotionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const built = useMemo(() => buildPromotionRequest(draft), [draft]);
  const body = built.ok ? built.body : null;
  const preview = usePromotionPreview(id, body);
  const schedule = useSchedulePromotion(id, () => router.push('/promotions'));
  const data = preview.data;
  const team = data?.team ?? [];
  const waiting = preview.isFetching || preview.isPlaceholderData;
  const canSchedule = Boolean(body && data?.canSchedule && !waiting && !schedule.isPending);
  const unplaced = unplacedIds(team.map((t) => t.person.id), draft.moves);

  const designationOptions = [{ value: KEEP, label: 'Keep the current designation' }, ...[...(designations.data ?? [])].sort((a, b) => a.level - b.level).map((d) => ({ value: d.id, label: DESIGNATION_LABEL[d.name] }))];
  const gradeOptions = [{ value: KEEP, label: 'Keep the current grade' }, ...[...(payBands.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ value: b.id, label: b.name }))];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/employees/${id}`} className="text-text-muted hover:text-accent hover:underline">
          ← {user?.name ?? 'Employee'}
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!user}
        empty={{ title: 'Employee not found' }}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {user ? (
          user.role !== 'FIELD' || user.status === 'inactive' ? (
            <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              Only active field employees can be promoted.
            </p>
          ) : (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (body && canSchedule) schedule.mutate(body);
              }}
              className="space-y-6"
            >
              <PageHeader
                title={`Promote ${user.name}`}
                description={`${user.employeeCode} · takes effect on the 1st of the month you choose; nothing changes before then.`}
                actions={
                  <Button type="submit" disabled={!canSchedule}>
                    {schedule.isPending ? 'Scheduling…' : 'Schedule promotion'}
                  </Button>
                }
              />

              <Card title="What changes" description="Leave a field alone to keep it as it is.">
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <FormField label="Takes effect on the 1st of" htmlFor="promo-month" error={!built.ok ? built.errors['effectiveFrom'] : undefined} {...(data ? { hint: `The earliest is ${monthStartLabel(data.earliestMonth)}.` } : {})}>
                    <Input id="promo-month" type="month" value={draft.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
                  </FormField>
                  <FormField label="New designation" htmlFor="promo-designation">
                    <Select id="promo-designation" value={draft.designationId || KEEP} onValueChange={(v) => set({ designationId: v === KEEP ? '' : v })} options={designationOptions} placeholder="Keep the current designation" />
                  </FormField>
                  <FormField label="New pay grade" htmlFor="promo-grade">
                    <Select id="promo-grade" value={draft.payBandId || KEEP} onValueChange={(v) => set({ payBandId: v === KEEP ? '' : v })} options={gradeOptions} placeholder="Keep the current grade" />
                  </FormField>
                  <EmployeePickerField
                    id="promo-manager"
                    selfId={user.id}
                    label="New manager"
                    title="Choose their new manager"
                    value={draft.managerId}
                    onChange={(managerId) => set({ managerId })}
                    hint="Leave empty to keep the current manager."
                  />
                  <FormField label="New CTC per year (₹)" htmlFor="promo-ctc" error={!built.ok ? built.errors['ctc'] : undefined} hint="Optional. It does not have to fit any range; it starts from the same month.">
                    <Input id="promo-ctc" inputMode="decimal" value={draft.ctc} placeholder="e.g. 900000" onChange={(e) => set({ ctc: e.target.value })} aria-invalid={!built.ok && built.errors['ctc'] ? true : undefined} />
                  </FormField>
                  <FormField label="Reason (optional)" htmlFor="promo-reason" error={!built.ok ? built.errors['reason'] : undefined}>
                    <Input id="promo-reason" value={draft.reason} placeholder="Annual review" onChange={(e) => set({ reason: e.target.value })} />
                  </FormField>
                </div>
              </Card>

              <Card
                title="Their team"
                description={`Everyone who reports to ${user.name} needs a manager from the effective month. Choose one for a person, a group, or everyone.`}
              >
                {data && team.length === 0 ? (
                  <p className="p-5 text-sm text-text-muted">{user.name} has no direct reports, so there is nothing to hand over.</p>
                ) : !data ? (
                  <p className="p-5 text-sm text-text-muted">{preview.isError ? 'The team could not be loaded.' : 'Loading the team…'}</p>
                ) : (
                  <>
                    {unplaced.length > 0 ? (
                      <p role="status" className="mx-5 mt-4 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                        {unplaced.length} of {team.length} still need a manager. The promotion can't be scheduled until everyone has one.
                      </p>
                    ) : null}
                    <PromotionTeamTable
                      team={team}
                      promoted={{ id: user.id, name: user.name }}
                      moves={draft.moves}
                      names={names}
                      onPlace={(ids, manager) => {
                        setNames((n) => ({ ...n, [manager.id]: manager.name }));
                        set({ moves: assignMoves(draft.moves, ids, manager.id) });
                      }}
                      onClear={(ids) => set({ moves: clearMoves(draft.moves, ids) })}
                    />
                  </>
                )}
              </Card>

              <LeaveCard userId={id} />

              <Card title="Preview" {...(data ? { description: `From ${monthStartLabel(data.effectiveFrom)}` } : {})}>
                <div className="space-y-3 p-5" aria-live="polite">
                  {!body ? (
                    <p className="text-sm text-text-muted">Fix the fields above to see the preview.</p>
                  ) : !data ? (
                    <p className="text-sm text-text-muted">{preview.isError ? toErrorState(preview.error).message : 'Working it out…'}</p>
                  ) : (
                    <>
                      <ul className="space-y-1 text-sm">
                        {changeSummary(data.from, data.to).map((c) => (
                          <li key={c} className="font-medium">
                            {c}
                          </li>
                        ))}
                        {data.ctc ? (
                          <li className="font-medium">
                            CTC {data.ctc.previousAnnualPaise !== null ? `${formatMoney(data.ctc.previousAnnualPaise)} → ` : ''}
                            {formatMoney(data.ctc.newAnnualPaise)} a year
                          </li>
                        ) : null}
                        {changeSummary(data.from, data.to).length === 0 && !data.ctc ? <li className="text-text-muted">Nothing is changing yet.</li> : null}
                      </ul>
                      {data.problems.length > 0 ? (
                        <ul role="alert" className="space-y-1 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                          {data.problems.map((p) => (
                            <li key={`${p.field}:${p.message}`}>{p.message}</li>
                          ))}
                        </ul>
                      ) : null}
                      {data.warnings.length > 0 ? (
                        <ul role="status" className="space-y-1 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                          {data.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                      {data.canSchedule ? <Badge tone="success">Ready to schedule</Badge> : null}
                      {data.ctc ? (
                        <div className="overflow-x-auto rounded-md border border-border">
                          <CtcBreakdownTable lines={data.ctc.lines} ctcAnnualPaise={data.ctc.newAnnualPaise} />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            </form>
          )
        ) : null}
      </DataState>
    </>
  );
}

/** The leave position in the financial year in view. A promotion leaves it as it is; the new grade's days apply from the next year. */
function LeaveCard({ userId }: { userId: string }) {
  const { year } = useFinancialYear();
  const query = useEmployeeBalances(userId, year);
  const shown = query.data?.year ?? year ?? financialYearOf(istDate());
  const columns: readonly Column<LeaveBalanceDto>[] = [
    { key: 'type', header: 'Leave type', render: (b) => <span className="font-medium">{b.leaveTypeName}</span> },
    { key: 'allocated', header: 'Allocated', numeric: true, render: (b) => formatDays(b.allocatedDays) },
    { key: 'used', header: 'Used', numeric: true, render: (b) => formatDays(b.usedDays) },
    { key: 'pending', header: 'Pending', numeric: true, render: (b) => formatDays(b.pendingDays) },
    { key: 'available', header: 'Available', numeric: true, render: (b) => formatDays(b.availableDays) },
  ];
  return (
    <Card title={`Leave · ${financialYearLabel(shown)}`} description="Leave is by financial year. A promotion does not change this year's days or balance; the new grade's days apply from the next year.">
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={query.data?.balances.length === 0}
        empty={{ title: 'No leave balances', description: 'This employee has no paid leave allocated this year.' }}
      >
        <DataTable columns={columns} rows={query.data?.balances ?? []} rowKey={(b) => b.id} />
      </DataState>
    </Card>
  );
}
