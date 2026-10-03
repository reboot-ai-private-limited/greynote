import type { ApprovalDetailDto } from '@greynote/contracts';
import { Card } from '@/components/ui/Card';
import { kindLabel } from '../lib/approvals';
import { DoctorPreview } from './DoctorPreview';
import { LeavePreview } from './LeavePreview';

/**
 * What is being approved. Each kind adds its own read-only panel; a kind with none yet still shows
 * what it is and which record it points at, so a decision is never made on nothing.
 */
export function ApprovalPreview({ request }: { request: ApprovalDetailDto }) {
  switch (request.kind) {
    case 'NEW_DOCTOR':
      return <DoctorPreview recordId={request.recordId} />;
    case 'LEAVE':
      return <LeavePreview recordId={request.recordId} />;
    default:
      return (
        <Card title={kindLabel(request.kind)} description="The record this request is about.">
          <p className="p-5 text-sm text-text-muted">
            A preview of this kind is not available in the portal yet. Record <span className="font-mono text-text">{request.recordId}</span>.
          </p>
        </Card>
      );
  }
}
