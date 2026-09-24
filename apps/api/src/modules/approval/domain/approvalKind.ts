import type { RoleName } from '@greynote/contracts';
import type { ApprovalWorkflow } from './approvalRequest.entity.js';

/** What an owning module declares about one kind of request when it registers it. */
export interface ApprovalKindDefinition {
  kind: string;
  /**
   * Who may act at the final stage. Always includes `ADMIN` (Admin is the superuser of every
   * workflow); Leave adds `HR`.
   */
  finalApproverRoles: RoleName[];
  /** Used until the per-kind `SystemConfig` switch exists (Phase 3 step 3). */
  defaultWorkflow: ApprovalWorkflow;
}
