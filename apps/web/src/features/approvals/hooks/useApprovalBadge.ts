'use client';

import type { RoleName } from '@greynote/contracts';
import { useWaitingCounts } from './useApprovals';

const ALL_KINDS = [{ value: '' }] as const;

/** How many requests are waiting on the caller, for the badge beside Approvals in the navigation; `undefined` for a role without the screen, or while it loads. */
export function useApprovalBadge(role: RoleName): number | undefined {
  return useWaitingCounts(ALL_KINDS, role === 'ADMIN' || role === 'HR')[''];
}
