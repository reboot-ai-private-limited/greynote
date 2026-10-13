'use client';

import type { ExpenseMonthGrantDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Column } from '@/components/ui/DataTable';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useExpenseGrants, useRevokeExpenseGrant } from '../hooks/useExpenses';
import {
  EXPENSE_GRANT_PHASE_LABEL,
  EXPENSE_GRANT_STATUS_LABEL,
  EXPENSE_GRANT_STATUS_TONE,
} from '../lib/expenseGrants';
import { GrantLateExpenseDialog } from './GrantLateExpenseDialog';

/** Admin: whose month of expenses may be sent or approved after its deadline, until when, and why. Grant one, or revoke one not yet used. */
export function LateExpensesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const readOnly = useIsReadOnly();
  const { page, pageSize, update } = useFilterParams([]);
  const list = useExpenseGrants({ page, pageSize });
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<ExpenseMonthGrantDto | null>(null);
  const revoke = useRevokeExpenseGrant(() => setRevoking(null));

  const columns: readonly Column<ExpenseMonthGrantDto>[] = [
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
      key: 'month',
      header: 'Expenses of',
      render: (g) => (
        <div>
          <div>{monthLabel(g.month)}</div>
          <div className="text-xs text-text-subtle">{EXPENSE_GRANT_PHASE_LABEL[g.phase]}</div>
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
        <Badge tone={EXPENSE_GRANT_STATUS_TONE[g.effectiveStatus]}>
          {EXPENSE_GRANT_STATUS_LABEL[g.effectiveStatus]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (g) =>
        g.effectiveStatus === 'OPEN' && !readOnly ? (
          <Button variant="ghost" size="sm" onClick={() => setRevoking(g)}>
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <PagedListFrame
      title="Late exceptions"
      hideHeader={embedded}
      description="One-off exceptions that let a month of expenses be sent or approved after its deadline. Each works once, until the time set, and never after any of the month is paid."
      noun="exception"
      readOnly={readOnly}
      onNew={() => setGranting(true)}
      filters={null}
      query={list}
      columns={columns}
      emptyTitle="No exceptions"
      emptyDescription="Nobody has been allowed to send or approve expenses late."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {granting ? <GrantLateExpenseDialog onClose={() => setGranting(false)} /> : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this exception?"
        description="The month will no longer be able to go through late."
        confirmLabel="Revoke"
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </PagedListFrame>
  );
}
