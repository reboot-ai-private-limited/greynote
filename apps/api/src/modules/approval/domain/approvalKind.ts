import type { RoleName } from '@greynote/contracts';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ApprovalAction, ApprovalRequest, ApprovalStatus } from './approvalRequest.entity.js';

/** What the owning module is told after every status change it didn't initiate itself. */
export interface ApprovalStatusChange {
  requestId: string;
  kind: string;
  recordId: string;
  submitterId: string;
  previousStatus: ApprovalStatus;
  status: ApprovalStatus;
  /** The action that caused the change, as appended to the history. */
  action: ApprovalAction;
  request: ApprovalRequest;
}

/** What an owning module declares about one kind of request when it registers it. */
export interface ApprovalKindDefinition {
  kind: string;
  /**
   * Who may act at the final stage. Always includes `ADMIN` (Admin is the superuser of every
   * workflow); Leave adds `HR`.
   */
  finalApproverRoles: RoleName[];
  /**
   * The kind never has a final stage: the manager's approval is the decision, whatever
   * `APPROVAL_MANAGER_ONLY_KINDS` says. For a kind whose design is "the manager decides" (no kind uses it today), as opposed to one Admin may relax later through that setting.
   */
  managerOnly?: boolean;
  /**
   * Runs inside the same MongoDB transaction as the status change, on every decision, withdrawal
   * and reopen — not on submit/resubmit, which the owning module starts itself. Write through
   * `ctx` so both commit or neither does; throwing rolls the status change back too. May run
   * more than once on a transient-error retry, so keep it to database writes on `ctx` — no
   * notifications or other external side effects here.
   */
  onStatusChange?: (change: ApprovalStatusChange, ctx: TransactionContext) => Promise<void>;
}
