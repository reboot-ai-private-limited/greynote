import type { ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';

export const DCR_KIND = 'DCR';

/** A DCR's state as the app sees it: `DRAFT` until it has an approval request. */
export type DcrStatus = 'DRAFT' | ApprovalStatus;
export const dcrStatus = (request: ApprovalRequest | null): DcrStatus => request?.status ?? 'DRAFT';

/** The statuses that mean the MR reported the day (sign-off B7's working assumption: submitted counts). */
const QUALIFYING: ReadonlySet<DcrStatus> = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);
export const isQualifyingDcr = (status: DcrStatus): boolean => QUALIFYING.has(status);

/** Records can still be added or changed: not yet submitted, or sent back (rejected, withdrawn, reopened). */
export const isOpenForLogging = (request: ApprovalRequest | null): boolean => request === null || isEditableBySubmitter(request.status);
