# Approval

The workflow around every approvable record — who approves what, in which order, and the full
history of it. The mechanism, its states and the reasoning are in
[`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md); this doc is the
module-level contract. Code: `apps/api/src/modules/approval/`. Tier 2, beside Territory.

## What it owns

- **`ApprovalRequest`** — one per `(kind, recordId)`, with its status, workflow, cycle and an
  embedded, append-only `history` (HLD 05 §2). Collection `approvalrequests`, indexed on
  `(kind, recordId)` unique, `(submitterId, status, submittedAt)` and `(status, kind,
  submittedAt)`.
- **The kind registry** — in memory, filled at boot by owning modules. The module knows no kind
  of its own.

**Not owned here:** the records being approved (Plans, Leaves, …), what an approval *means* for
them (unlocking a DCR, deducting leave balance) — that's the owning module's `onStatusChange` —
and notifications (F8 still open).

## Public contract

```ts
interface ApprovalPublicContract {
  registerKind(definition: ApprovalKindDefinition): void;
  submit(input: { kind: string; recordId: string; submitterId: string }, ctx?: TransactionContext): Promise<ApprovalRequest>;
  getForRecord(kind: string, recordId: string): Promise<ApprovalRequest | null>;
}

interface ApprovalKindDefinition {
  kind: string;                                  // e.g. 'DAILY_PLAN'
  finalApproverRoles: RoleName[];                // must include 'ADMIN'; Leave: ['HR', 'ADMIN']
  managerOnly?: boolean;                         // never a final stage, whatever APPROVAL_MANAGER_ONLY_KINDS says (Planning's DAILY_PLAN_CHANGE)
  onStatusChange?: (change: ApprovalStatusChange, ctx: TransactionContext) => Promise<void>;
}
```

Also exported: `isEditableBySubmitter(status)` — true for `REJECTED` / `WITHDRAWN` / `REOPENED`;
owning modules gate their own edit endpoints on it.

**How a consumer uses it** (Planning, HR, Field Master Data, Field Activity — Phase 4 onward):

1. In its container, `approval.contract.registerKind({ kind: 'DAILY_PLAN', finalApproverRoles:
   ['ADMIN'], onStatusChange })`. The top-level `container.ts` passes `approval.contract` in,
   the same way Identity's contract reaches Territory.
2. On its own submit endpoint: validate and save the record, then `submit(...)` — in one
   transaction if both writes must land together.
3. On its own edit endpoint: refuse unless `isEditableBySubmitter(request.status)` (or the caller
   is Admin — Admin can edit approved records directly).
4. Read status with `getForRecord` — don't mirror it onto the record.
5. React to decisions in `onStatusChange`, writing only through `ctx`.

The owning module's tier must be above 2 (it imports `approval.public.ts`); approval never
imports it back — the callback is how it's told.

## Dependencies

- **Identity** (tier 1), through `UserDirectoryPort`: `findUserSummary` (the submitter's current
  manager), `getUserSummaries` (names on lists, batched), `getDirectReports` (a manager's inbox,
  Admin's manager filter), `getDownline` (the Team view), `getManagerChain` (who may view a
  request).
- **Config** (tier 0): `APPROVAL_MANAGER_ONLY_KINDS` — comma-separated kinds with no final stage,
  or `NONE` (HLD 05 §6).

## HTTP surface

All under `/api/approvals`, all authenticated. Every list returns the same row shape — `id`,
`kind`, `recordId`, `status`, `workflow`, `cycle`, `submittedAt`, `decidedAt`, `submitter
{id, employeeCode, name}`, `lastAction` (with actor), and **`canAct`** for the caller — so the
web portal and the app's Team tab can share one approval screen (client §19.6).

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/inbox` | FIELD, HR, ADMIN | What I can act on now, oldest first. Manager: direct reports at Stage 1. HR: open requests of kinds where HR is a final approver that HR can act on. Admin: every open request. Filters: `kind`, `status`, `submitterId`, `managerId` (Admin), `from`, `to` (see below); paginated |
| `GET` | `/all` | HR, ADMIN | The portal's History: **every** request in any status, newest first, same filters and row shape as `/inbox`. Admin sees all; HR sees the kinds it is a final approver of (Leave). It is how Admin finds an Approved request to reopen. Scoped to the selected Financial Year like the other lists |
| `GET` | `/team` | FIELD | My downline's requests, any status, newest first; `scope=direct\|indirect\|all`. Direct reports' Stage-1 requests have `canAct: true`, deeper levels are read-only |
| `GET` | `/mine` | any | My own requests, newest first |
| `GET` | `/:id` | submitter, their manager chain, Admin, the kind's final approvers | Detail with the full named `history`, plus `canAct`, `canWithdraw`, `canReopen`. Anyone else: `404` |
| `POST` | `/:id/approve` | whoever `resolveAuthority` allows | `cycle` required (the one displayed), optional `comment` |
| `POST` | `/:id/reject` | same | `cycle` and `comment` required |
| `POST` | `/bulk` | FIELD, HR, ADMIN | `{ decision, requests: [{ id, cycle }] (≤100), comment? }` — each decided independently in its own transaction; `results[]` per id (`ok` + `status`, or `statusCode` + `message`). A genuine fault on one item is logged and returned as that item's `500`; the rest still run |
| `POST` | `/:id/withdraw` | the submitter | Only while `SUBMITTED` |
| `POST` | `/:id/reopen` | ADMIN | Only from `APPROVED`; `comment` required |

`from` / `to` are ISO date-times **with an offset** (`2026-09-28T23:59:59.999+05:30`), both
inclusive, on `submittedAt`. A bare date is a `400`: the server has no business timezone, so the
client turns "the 28th" into its own start and end of day. `from` after `to` is a `400` on `to`.

Submitting is not an HTTP endpoint here — it happens through the owning module's own submit
endpoint, which calls `contract.submit`.

## Write-path rules & invariants

- One request per `(kind, recordId)`; a resubmission is a new **cycle** on it, never a new
  request. Only the original submitter can resubmit.
- Every status change is conditional on the status **and cycle** it started from (HLD 05 §8) →
  `409` on a lost race, with nothing committed.
- Decisions, withdrawals and reopens run the kind's `onStatusChange` in the same transaction.
- The workflow is re-read from config at each (re)submission and fixed for that cycle.
- `history` is append-only.

## Edge cases

- **The submitter's manager changes while a request is pending** — the new manager can act, the
  old one can't (resolved live). Nothing to migrate.
- **The submitter withdraws, edits and resubmits while the approver has it open** — the
  approver's decision carries the old `cycle`, so it's a `409` ("changed and resubmitted since
  you opened it"); they reload and decide on what's actually there.
- **The manager is inactive or never acts** — Admin approves or rejects from `/inbox` (override,
  final in one step). No timeout or auto-escalation; F8's notifications may add reminders later.
- **HR submits their own leave** — HR has no manager, so it's top-of-chain; HR can't act on
  their own request, so another HR user or Admin decides.
- **A request's kind is no longer registered** (a module removed a kind) — it still lists and
  shows, with `canAct: false`; acting on it is a server error, since that's a wiring bug.
- **Reopen after payroll** — once Payroll exists (Phase 7), reopening an expense in a Finalized
  month must be refused; that check belongs to the owning module's reaction or a guard added
  then, noted here so it isn't forgotten.
- **HR's inbox** filters open HR-kind requests in memory (top-of-chain needs each submitter's
  manager), capped at the 2000 oldest — far above the open leaves at any moment.

## Deliberately deferred

- **Notifications** on submit/decision (client sign-off F8).
- **Delegation** ("my deputy approves while I'm on leave") — Admin's override covers it for now.
- **Auto-escalation / auto-approval** after N days — not wanted: the client asked for a flag only (2026-10-03). `APPROVAL_SLA_DAYS` (seed `3`) gives every open request `dueAt` (the stage's start + N days; from submit at Stage 1, from the manager's approval at the final stage) and `overdue` on the list/detail views. Computed on read, so a config change applies to requests already waiting. Admin's ability to act is unchanged.
- **Auto-approved submit** — `SubmitApprovalInput.autoApprove` records the submission already `APPROVED` with authority `AUTO` and one history entry. The owning module decides when (the DCR switch) and runs its own follow-up, since no status change fires.
