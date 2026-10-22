import type { ApprovalPublicContract, ApprovalStatus } from '@/modules/approval/approval.public.js';

/** What Planning uses of the approval module: register its kinds, submit, read a Plan's request, and close a leaver's open ones. */
export type ApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord' | 'autoReject'>;

/** A Plan's state as other modules see it: `DRAFT` until it has an approval request. */
export type PlanApprovalStatus = 'DRAFT' | ApprovalStatus;
