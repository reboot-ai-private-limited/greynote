'use client';

import type { LateSubmitGrantDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Column } from '@/components/ui/DataTable';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { EmployeeFilter, EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useLateGrants, useRevokeLate } from '../hooks/useLateGrants';
import { GRANT_STATUS_LABEL, GRANT_STATUS_TONE } from '../lib/lateGrants';
import { GrantLateDialog } from './GrantLateDialog';

/** Admin: who may submit a plan after its deadline, until when, and why. Grant a new one, or revoke one not yet used. */
export function LateSubmissionsScreen() {
  const readOnly = useIsReadOnly();
  const { values, page, pageSize, update } = useFilterParams(['userId', 'kind']);
  const kind =
    values.kind === 'MONTHLY_PLAN' || values.kind === 'DAILY_PLAN' ? values.kind : undefined;
  const list = useLateGrants({
    page,
    pageSize,
    ...(values.userId && { userId: values.userId }),
    ...(kind && { kind }),
  });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<LateSubmitGrantDto | null>(null);
  const revoke = useRevokeLate(() => setRevoking(null));

  const columns: readonly Column<LateSubmitGrantDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (g) => (
        <span className="font-medium">
          <EmployeeName userId={g.userId} />
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (g) => (
        <div>
          <div>{g.kind === 'MONTHLY_PLAN' ? 'Monthly plan' : 'Daily plan'}</div>
          <div className="text-xs text-text-subtle">{g.planKey}</div>
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
    {
      key: 'reason',
      header: 'Reason',
      render: (g) => <span className="text-text-muted">{g.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (g) => (
        <Badge tone={GRANT_STATUS_TONE[g.status]}>{GRANT_STATUS_LABEL[g.status]}</Badge>
      ),
    },
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
      description="One-off exceptions that let an employee submit a plan after its deadline. Each works once, until the time set."
      noun="exception"
      readOnly={readOnly}
      onNew={() => setGranting(true)}
      filters={
        <>
          <EmployeeFilter
            allLabel="Any employee"
            value={values.userId}
            onChange={(v) => update({ userId: v })}
          />
          <select
            aria-label="Plan type"
            className="h-10 rounded-md border border-border-strong bg-surface px-3 text-sm"
            value={kind ?? ''}
            onChange={(e) => update({ kind: e.target.value })}
          >
            <option value="">Any plan</option>
            <option value="MONTHLY_PLAN">Monthly plans</option>
            <option value="DAILY_PLAN">Daily plans</option>
          </select>
        </>
      }
      query={list}
      columns={columns}
      emptyTitle="No exceptions"
      emptyDescription="Nobody has been allowed to submit late."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {granting ? <GrantLateDialog onClose={() => setGranting(false)} /> : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this exception?"
        description="The employee will no longer be able to submit this plan late."
        confirmLabel="Revoke"
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </PagedListFrame>
  );
}
