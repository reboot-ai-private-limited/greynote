import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';

/** What Field Activity uses of the approval module: register its kinds, submit, read a request. */
export type ApprovalsPort = Pick<ApprovalPublicContract, 'registerKind' | 'submit' | 'getForRecord'>;
