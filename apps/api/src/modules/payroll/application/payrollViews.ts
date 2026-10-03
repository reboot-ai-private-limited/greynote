import type { PayrollRun } from '../domain/payrollRun.entity.js';
import type { IdentityPort } from '../domain/ports.js';
import type { GenerateOutcome } from './usecases/payroll.usecase.js';

/** A run with who it is for. The row carries only an id, and a sheet of hundreds cannot look each one up on its own. */
export type PayrollRunView = PayrollRun & { userName: string; employeeCode: string };

export type GenerateOutcomeView =
  | { userId: string; userName: string; employeeCode: string; outcome: 'created' | 'updated'; run: PayrollRunView }
  | { userId: string; userName: string; employeeCode: string; outcome: 'skipped'; reason: string; message: string };

/** Attaches employee names and codes to payroll rows for the API, in one Identity call however many rows. */
export class PayrollViews {
  constructor(private readonly identity: IdentityPort) {}

  private async people(userIds: string[]): Promise<Map<string, { name: string; employeeCode: string }>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    return new Map((await this.identity.getUserSummaries(unique)).map((u) => [u.id, { name: u.name, employeeCode: u.employeeCode }]));
  }

  async many(runs: PayrollRun[]): Promise<PayrollRunView[]> {
    const people = await this.people(runs.map((r) => r.userId));
    return runs.map((r) => ({ ...r, userName: people.get(r.userId)?.name ?? '', employeeCode: people.get(r.userId)?.employeeCode ?? '' }));
  }

  async one(run: PayrollRun): Promise<PayrollRunView> {
    return (await this.many([run]))[0]!;
  }

  /** A generate result: every line, created, updated or skipped, says whom it is about. */
  async outcomes(outcomes: GenerateOutcome[]): Promise<GenerateOutcomeView[]> {
    const people = await this.people(outcomes.map((o) => o.userId));
    const who = (userId: string) => ({ userName: people.get(userId)?.name ?? '', employeeCode: people.get(userId)?.employeeCode ?? '' });
    return outcomes.map((o) =>
      o.outcome === 'skipped'
        ? { userId: o.userId, ...who(o.userId), outcome: 'skipped' as const, reason: o.reason, message: o.message }
        : { userId: o.userId, ...who(o.userId), outcome: o.outcome, run: { ...o.run, ...who(o.run.userId) } },
    );
  }
}
