import type { ApprovalKindDefinition } from '../domain/approvalKind.js';
import { isOpen, type ApprovalAction, type ApprovalRequest } from '../domain/approvalRequest.entity.js';
import { resolveAuthority, type Actor } from '../domain/approvalRules.js';
import type { DirectoryUser, UserDirectoryPort } from '../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from './approvalKindRegistry.js';

export interface PersonRef {
  id: string;
  employeeCode: string;
  name: string;
}

/** One row of a queue or list: no full history, but who submitted it, the latest action, and whether the caller can act. */
export interface ApprovalListItem {
  id: string;
  kind: string;
  recordId: string;
  status: ApprovalRequest['status'];
  workflow: ApprovalRequest['workflow'];
  cycle: number;
  submittedAt: Date;
  decidedAt: Date | null;
  submitter: PersonRef | null;
  lastAction: Omit<ApprovalAction, 'actorId'> & { actor: PersonRef | null };
  /** Whether the caller may approve/reject it right now. */
  canAct: boolean;
}

const ref = (u: DirectoryUser | undefined): PersonRef | null =>
  u ? { id: u.id, employeeCode: u.employeeCode, name: u.name } : null;

/** Everyone the rows mention, in one batched Identity call. */
export async function loadPeople(users: UserDirectoryPort, requests: ApprovalRequest[]): Promise<Map<string, DirectoryUser>> {
  const ids = requests.flatMap((r) => [r.submitterId, ...r.history.map((h) => h.actorId)]);
  if (ids.length === 0) return new Map();
  return new Map((await users.getUserSummaries(ids)).map((u) => [u.id, u]));
}

export function canActOn(
  request: ApprovalRequest,
  actor: Actor,
  submitter: DirectoryUser | undefined,
  kind: ApprovalKindDefinition | undefined,
): boolean {
  if (!kind || !isOpen(request.status)) return false;
  return resolveAuthority(request, actor, submitter?.managerId ?? null, kind) !== null;
}

export function toListItem(
  request: ApprovalRequest,
  actor: Actor,
  people: Map<string, DirectoryUser>,
  kinds: ApprovalKindRegistry,
): ApprovalListItem {
  const submitter = people.get(request.submitterId);
  const last = request.history.at(-1) as ApprovalAction;
  const { actorId, ...lastRest } = last;
  return {
    id: request.id,
    kind: request.kind,
    recordId: request.recordId,
    status: request.status,
    workflow: request.workflow,
    cycle: request.cycle,
    submittedAt: request.submittedAt,
    decidedAt: request.decidedAt,
    submitter: ref(submitter),
    lastAction: { ...lastRest, actor: ref(people.get(actorId)) },
    canAct: canActOn(request, actor, submitter, kinds.find(request.kind)),
  };
}

export { ref as toPersonRef };
