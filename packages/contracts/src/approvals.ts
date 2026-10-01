/** One row of `GET /approvals/inbox` (and the team/mine lists, which share the shape). */
export interface ApprovalInboxItemDto {
  id: string;
  kind: string;
  recordId: string;
  status: string;
  cycle: number;
  submittedAt: string;
  submitter: { id: string; employeeCode: string; name: string };
  canAct: boolean;
}
