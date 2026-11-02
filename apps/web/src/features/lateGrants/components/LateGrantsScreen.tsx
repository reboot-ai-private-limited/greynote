'use client';

import type { LateGrantDto, LateGrantKindDto, LateGrantStatusDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Column } from '@/components/ui/DataTable';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { EmployeeFilter, EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useLateGrants, useRevokeLate } from '../hooks/useLateGrants';
import { GRANT_STATUS_LABEL, GRANT_STATUS_TONE, KIND_LABEL, kindOptions } from '../lib/lateGrants';
import { GrantLateDialog } from './GrantLateDialog';

const STATUSES = Object.keys(GRANT_STATUS_LABEL) as LateGrantStatusDto[];

/**
 * Admin: who may do a late thing after its deadline — send a plan, send or approve a month of expenses, enter a closed month's stock or
 * secondary sales — for which period, until when, and why. Grant a new one, or revoke one not yet used. `groups` narrows the screen to
 * some kinds (the Expenses tab shows only `Expenses`).
 */
export function LateGrantsScreen({ embedded = false, groups }: { embedded?: boolean; groups?: readonly string[] } = {}) {
  const readOnly = useIsReadOnly();
  const { values, page, pageSize, update } = useFilterParams(['userId', 'kind', 'month', 'status']);
  const options = kindOptions(groups);
  const kind = options.find((o) => o.value === values.kind)?.value as LateGrantKindDto | undefined;
  const status = STATUSES.find((s) => s === values.status);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(values.month ?? '') ? values.month : undefined;
  const list = useLateGrants({
    page,
    pageSize,
    ...(values.userId && { userId: values.userId }),
    ...(kind && { kind }),
    ...(month && { month }),
    ...(status && { status }),
  });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<LateGrantDto | null>(null);
  const revoke = useRevokeLate(() => setRevoking(null));
  const selectClass = 'h-10 rounded-md border border-border-strong bg-surface px-3 text-sm';

  const columns: readonly Column<LateGrantDto>[] = [
    { key: 'employee', header: 'Employee', render: (g) => <span className="font-medium"><EmployeeName userId={g.userId} /></span> },
    {
      key: 'what',
      header: 'What',
      render: (g) => (
        <div>
          <div>{KIND_LABEL[g.kind]}</div>
          <div className="text-xs text-text-subtle">{g.periodKey}</div>
        </div>
      ),
    },
    { key: 'until', header: 'Allowed until', render: (g) => formatDateTime(g.expiresAt) },
    {
      key: 'by',
      header: 'Granted by',
      render: (g) => (
        <div>
          <EmployeeName userId={g.grantedBy} />
          <div className="text-xs text-text-subtle">{formatDateTime(g.grantedAt)}</div>
        </div>
      ),
    },
    { key: 'reason', header: 'Reason', render: (g) => <span className="text-text-muted">{g.reason}</span> },
    { key: 'status', header: 'Status', render: (g) => <Badge tone={GRANT_STATUS_TONE[g.status]}>{GRANT_STATUS_LABEL[g.status]}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (g) =>
        g.status === 'OPEN' && !readOnly ? (
          <Button variant="ghost" size="sm" onClick={() => setRevoking(g)}>
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <PagedListFrame
      title="Late submissions"
      hideHeader={embedded}
      description="One-off exceptions that let an employee do something after its deadline — plans, expenses, stock and secondary sales. Each is for one period and works until the time set; never once the money for it is settled."
      noun="exception"
      readOnly={readOnly}
      onNew={() => setGranting(true)}
      filters={
        <>
          <EmployeeFilter allLabel="Any employee" value={values.userId} onChange={(v) => update({ userId: v })} />
          <select aria-label="What" className={selectClass} value={kind ?? ''} onChange={(e) => update({ kind: e.target.value })}>
            <option value="">Anything</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <div className="w-72">
              <MonthPicker value={month ?? ''} onChange={(v) => update({ month: v })} />
            </div>
            {month ? (
              <Button variant="ghost" size="sm" onClick={() => update({ month: '' })}>
                Clear
              </Button>
            ) : null}
          </div>
          <select aria-label="Status" className={selectClass} value={status ?? ''} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {GRANT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </>
      }
      query={list}
      columns={columns}
      emptyTitle="No exceptions"
      emptyDescription="Nobody has been allowed to do anything late."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {granting ? <GrantLateDialog onClose={() => setGranting(false)} {...(groups && { groups })} /> : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this exception?"
        description="The employee will no longer be able to do this late."
        confirmLabel="Revoke"
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </PagedListFrame>
  );
}
