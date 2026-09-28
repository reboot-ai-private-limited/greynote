import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';

/** What HR uses of the approval module: register `LEAVE`, submit, read a leave's request. */
export type ApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord'>;
