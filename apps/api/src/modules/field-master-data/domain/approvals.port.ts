import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';

/** What Field Master Data uses of the approval module: register `NEW_DOCTOR`, submit, read a Doctor's request, and drop it with a never-approved doctor or chemist the employee deletes. */
export type ApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord' | 'deleteForRecord'>;
