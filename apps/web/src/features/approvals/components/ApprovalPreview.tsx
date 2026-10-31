import type { ApprovalDetailDto } from '@greynote/contracts';
import { Card } from '@/components/ui/Card';
import { kindLabel } from '../lib/approvals';
import { ChemistPreview } from './ChemistPreview';
import { DailyPlanPreview } from './DailyPlanPreview';
import { DcrPreview } from './DcrPreview';
import { DoctorPreview } from './DoctorPreview';
import { DoctorServicePreview } from './DoctorServicePreview';
import { ExpenseMonthPreview } from './ExpenseMonthPreview';
import { LeavePreview } from './LeavePreview';
import { MonthlyPlanPreview } from './MonthlyPlanPreview';
import { SecondarySalesPreview } from './SecondarySalesPreview';

/**
 * What is being approved. Each kind adds its own read-only panel; a kind with none yet still shows
 * what it is and which record it points at, so a decision is never made on nothing.
 */
export function ApprovalPreview({ request }: { request: ApprovalDetailDto }) {
  switch (request.kind) {
    case 'NEW_DOCTOR':
      return <DoctorPreview recordId={request.recordId} />;
    case 'NEW_CHEMIST':
      return <ChemistPreview recordId={request.recordId} />;
    case 'DCR':
      return <DcrPreview recordId={request.recordId} />;
    case 'DAILY_PLAN':
      return <DailyPlanPreview recordId={request.recordId} />;
    case 'MONTHLY_PLAN':
      return <MonthlyPlanPreview recordId={request.recordId} />;
    case 'DOCTOR_SERVICE':
      return <DoctorServicePreview recordId={request.recordId} />;
    case 'LEAVE':
      return <LeavePreview recordId={request.recordId} />;
    case 'EXPENSE_MONTH':
      return <ExpenseMonthPreview recordId={request.recordId} />;
    case 'SECONDARY_SALES':
      return <SecondarySalesPreview recordId={request.recordId} />;
    default:
      return (
        <Card title={kindLabel(request.kind)} description="The record this request is about.">
          <p className="p-5 text-sm text-text-muted">
            This kind has no preview in the portal. Record <span className="font-mono text-text">{request.recordId}</span>.
          </p>
        </Card>
      );
  }
}
