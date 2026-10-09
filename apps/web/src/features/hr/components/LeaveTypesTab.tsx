'use client';

import type { LeaveTypeDto } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { RowActions } from '@/components/ui/RowActions';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useLeaveTypes, useUpdateLeaveType } from '../hooks/useLeaveTypes';
import { paidLabel } from '../lib/leaveTypes';
import { LeaveTypeFormDialog } from './LeaveTypeFormDialog';

export function LeaveTypesTab() {
  const readOnly = useIsReadOnly();
  const types = useLeaveTypes();
  const [form, setForm] = useState<{ type?: LeaveTypeDto } | null>(null);
  const [toggling, setToggling] = useState<LeaveTypeDto | null>(null);
  const update = useUpdateLeaveType(() => setToggling(null));

  const columns: readonly Column<LeaveTypeDto>[] = [
    {
      key: 'name',
      header: 'Leave type',
      render: (t) => <span className="font-medium">{t.name}</span>,
    },
    {
      key: 'paid',
      header: 'Pay',
      render: (t) => <Badge tone={t.isPaid ? 'success' : 'warning'}>{paidLabel(t.isPaid)}</Badge>,
    },
    {
      key: 'proof',
      header: 'Proof',
      render: (t) =>
        t.allowsProof ? (
          <Badge tone="accent">Can attach</Badge>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      key: 'active',
      header: 'Status',
      render: (t) => (
        <Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (t) => (
        <RowActions
          label={t.name}
          status={t.active ? 'active' : 'inactive'}
          disabled={readOnly}
          onEdit={() => setForm({ type: t })}
          onToggleStatus={() => setToggling(t)}
        />
      ),
    },
  ];

  return (
    <Card
      flat
      title="Leave types"
      description="The kinds of leave an employee can ask for. An inactive type can't be requested but stays in history."
      actions={
        <Button
          onClick={() => setForm({})}
          disabled={readOnly}
          title={readOnly ? 'A past financial year is read-only' : undefined}
        >
          <Plus aria-hidden className="size-4" /> New leave type
        </Button>
      }
    >
      <DataState
        isLoading={types.isLoading}
        error={types.error ? toErrorState(types.error, () => void types.refetch()) : null}
        isEmpty={types.data?.length === 0}
        empty={{
          title: 'No leave types',
          description:
            'Add Casual, Sick, Earned and Loss of Pay before employees can ask for leave.',
        }}
      >
        <DataTable columns={columns} rows={types.data ?? []} rowKey={(t) => t.id} />
      </DataState>
      {form ? <LeaveTypeFormDialog type={form.type} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={
          toggling
            ? {
                id: toggling.id,
                name: toggling.name,
                status: toggling.active ? 'active' : 'inactive',
              }
            : null
        }
        noun="leave type"
        pending={update.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) =>
          toggling && update.mutate({ id: toggling.id, body: { active: status === 'active' } })
        }
      />
    </Card>
  );
}
