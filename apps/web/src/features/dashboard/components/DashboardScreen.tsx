'use client';

import type { RoleName } from '@greynote/contracts';
import type { ComponentType } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useSession } from '@/lib/auth/SessionProvider';
import { cardsForRole, comingSoonForRole, type CardId } from '@/lib/dashboard';
import { istMonth, previousMonth } from '@/lib/dates';
import {
  useApprovalInbox,
  useEmployeeCounts,
  useMissingStock,
  useOnLeaveToday,
  usePayrollStatus,
  usePendingDevices,
  useUnpaidExpenses,
} from '../hooks/useDashboardData';
import {
  approvalsTile,
  devicesTile,
  employeesTile,
  missingStockTile,
  onLeaveTile,
  payrollTile,
  unpaidExpensesTile,
} from '../lib/tiles';
import { ActionTile } from './ActionTile';
import { ApprovalsWaitingList } from './AttentionList';
import { ComingSoonStrip } from './ComingSoonStrip';

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

function ApprovalsTile({ kind, label = 'Pending approvals' }: { kind?: string; label?: string }) {
  return <ActionTile label={label} query={useApprovalInbox(kind)} map={(page) => approvalsTile(page)} href="/approvals" />;
}

function LeaveApprovalsTile() {
  return <ApprovalsTile kind="LEAVE" label="Leave awaiting you" />;
}

function DevicesTile() {
  return <ActionTile label="Devices awaiting approval" query={usePendingDevices()} map={devicesTile} href="/employees" />;
}

function EmployeesTile() {
  return <ActionTile label="Active employees" query={useEmployeeCounts()} map={employeesTile} href="/employees" />;
}

function MissingStockTile() {
  return <ActionTile label="MRs missing stock" query={useMissingStock()} map={missingStockTile} />;
}

function OnLeaveTodayTile() {
  return <ActionTile label="On leave today" query={useOnLeaveToday()} map={onLeaveTile} href="/hr" />;
}

function UnpaidExpensesTile() {
  return <ActionTile label="Expenses awaiting payment" query={useUnpaidExpenses()} map={unpaidExpensesTile} href="/expenses" />;
}

function PayrollTile() {
  const month = previousMonth(istMonth());
  return <ActionTile label={`Payroll · ${monthLabel(month)}`} query={usePayrollStatus()} map={payrollTile} href="/payroll" />;
}

/** A role's dashboard is `cardsForRole(role).map(id => CARDS[id])`; each card owns its own hooks. */
const CARDS: Record<CardId, ComponentType> = {
  approvals: ApprovalsTile,
  leaveApprovals: LeaveApprovalsTile,
  devices: DevicesTile,
  employees: EmployeesTile,
  missingStock: MissingStockTile,
  onLeaveToday: OnLeaveTodayTile,
  unpaidExpenses: UnpaidExpensesTile,
  payroll: PayrollTile,
};

function listFor(role: RoleName) {
  if (role === 'ADMIN') return <ApprovalsWaitingList title="Waiting for approval" />;
  if (role === 'HR') return <ApprovalsWaitingList kind="LEAVE" title="Leave waiting for you" />;
  return null;
}

export function DashboardScreen() {
  const { user } = useSession();
  if (user === null) return null;

  const cards = cardsForRole(user.role);
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} description="What needs your attention right now." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((id) => {
          const Tile = CARDS[id];
          return <Tile key={id} />;
        })}
      </div>
      {listFor(user.role)}
      <ComingSoonStrip items={comingSoonForRole(user.role)} />
    </div>
  );
}
