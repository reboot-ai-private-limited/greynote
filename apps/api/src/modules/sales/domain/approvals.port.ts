import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';

/** What Sales uses of the approval module: register its kind, submit a month's secondary, read its request. */
export type SalesApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord'>;
