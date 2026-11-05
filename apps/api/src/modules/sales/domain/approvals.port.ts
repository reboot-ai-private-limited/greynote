import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';

/** What Sales uses of the approval module: register its kind, submit a month's secondary, read its request, and remove it when Admin deletes the month. */
export type SalesApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord' | 'listForRecords' | 'deleteForRecord'>;
