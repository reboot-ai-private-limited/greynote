import type { RollupStatusDto } from '@greynote/contracts';
import { Badge, type BadgeTone } from '@/components/ui/Badge';

const LOOK: Record<RollupStatusDto, { tone: BadgeTone; text: string }> = {
  NOT_SUBMITTED: { tone: 'warning', text: 'Report not sent' },
  DRAFT: { tone: 'warning', text: 'Report not sent' },
  PENDING: { tone: 'accent', text: 'Report waiting' },
  APPROVED: { tone: 'success', text: 'Report approved' },
  REJECTED: { tone: 'danger', text: 'Report rejected' },
};

/** Where a manager's team report for the month stands: their achievement is the approved one, so this says why a manager shows 0. */
export function RollupBadge({ status }: { status: RollupStatusDto }) {
  const look = LOOK[status];
  return <Badge tone={look.tone}>{look.text}</Badge>;
}
