import { parsePositiveInt, readConfig } from '@/shared/config/readConfig.js';
import type { ApprovalKindDefinition, ApprovalSubject } from '../domain/approvalKind.js';
import { isOpen, type ApprovalAction, type ApprovalRequest } from '../domain/approvalRequest.entity.js';
import { resolveAuthority, type Actor } from '../domain/approvalRules.js';
import { APPROVAL_SLA_DAYS_KEY, type ConfigProviderPort } from '../domain/configProvider.port.js';
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
  /** What the request is about (a doctor's name and place); null for a kind that does not say. */
  subject: ApprovalSubject | null;
  lastAction: Omit<ApprovalAction, 'actorId'> & { actor: PersonRef | null };
  /** Whether the caller may approve/reject it right now. */
  canAct: boolean;
  /** When the current approver's turn ends (`APPROVAL_SLA_DAYS` after it began); null once decided. */
  dueAt: Date | null;
  /** Past `dueAt` and still open. Only a flag: nothing is approved or re-routed because of it. */
  overdue: boolean;
}

/** The approver SLA in days, read on every call so a change applies at once. */
export function loadSlaDays(config: ConfigProviderPort): Promise<number> {
  return readConfig(config, APPROVAL_SLA_DAYS_KEY, parsePositiveInt(30));
}

const DAY_MS = 86_400_000;

/**
 * The current stage's clock starts when the request was submitted (waiting on the manager) or when the manager
 * approved it (waiting on the final approver, the last history entry).
 */
export function dueAt(request: ApprovalRequest, slaDays: number): Date | null {
  if (!isOpen(request.status)) return null;
  const since = request.status === 'SUBMITTED' ? request.submittedAt : (request.history.at(-1)?.at ?? request.submittedAt);
  return new Date(since.getTime() + slaDays * DAY_MS);
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
  sla: { days: number; now: Date },
  subjects: Map<string, ApprovalSubject> = new Map(),
): ApprovalListItem {
  const submitter = people.get(request.submitterId);
  const last = request.history.at(-1) as ApprovalAction;
  const { actorId, ...lastRest } = last;
  const due = dueAt(request, sla.days);
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
    subject: subjects.get(request.id) ?? null,
    lastAction: { ...lastRest, actor: ref(people.get(actorId)) },
    canAct: canActOn(request, actor, submitter, kinds.find(request.kind)),
    dueAt: due,
    overdue: due !== null && sla.now.getTime() > due.getTime(),
  };
}

export { ref as toPersonRef };

/** The subject of each request on a page, keyed by request id: one `describeRecords` call per kind. */
export async function loadSubjects(kinds: ApprovalKindRegistry, requests: ApprovalRequest[]): Promise<Map<string, ApprovalSubject>> {
  const byKind = new Map<string, ApprovalRequest[]>();
  for (const r of requests) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const out = new Map<string, ApprovalSubject>();
  await Promise.all(
    [...byKind].map(async ([kind, rows]) => {
      const describe = kinds.find(kind)?.describeRecords;
      if (!describe) return;
      const found = await describe(rows.map((r) => r.recordId));
      for (const r of rows) {
        const subject = found.get(r.recordId);
        if (subject) out.set(r.id, subject);
      }
    }),
  );
  return out;
}
