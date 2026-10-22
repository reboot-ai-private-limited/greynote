/**
 * What the modules above Identity hold for an employee who is leaving (decision-log 2026-10-22). Identity can't import them, so the
 * composition root builds this from their contracts and hands it in (`identity.bindOffboarding`).
 */
export interface OffboardingImpact {
  /** Routes they hold, and HQs/Zones they cover (their main HQ included). */
  routes: number;
  coverage: number;
  /** Doctors assigned to them, and distributors that list them. */
  doctors: number;
  distributors: number;
  /** Their own Daily/Monthly Plans and leave requests dated after the last working day, still open: closed on deactivation. */
  plansAfter: number;
  leavesAfter: number;
  /** Their targets that run past the leaving month: cut at that month. */
  targetsAfter: number;
  /** Requests from their team waiting for their decision: they move with the team to the new manager. */
  waitingOnThem: number;
}

export interface OffboardingStep {
  step: 'TERRITORY' | 'DOCTORS' | 'DISTRIBUTORS' | 'PLANS' | 'LEAVE' | 'TARGETS';
  ok: boolean;
  /** What was done ("12 doctors handed over, 3 left unassigned"), or why it failed. */
  detail: string;
}

export interface OffboardingPort {
  impact(userId: string, lastWorkingDay: string): Promise<OffboardingImpact>;
  /**
   * Releases what the employee held, each part on its own: a part that fails is reported (and can be run again by deactivating again),
   * never undoes the others. `doctorHandoverTo`: the employee who takes over the doctors they can (those on routes they have); null or
   * any left over: unassigned.
   */
  release(userId: string, input: { lastWorkingDay: string; doctorHandoverTo: string | null }, actorId: string): Promise<OffboardingStep[]>;
}

export const NO_OFFBOARDING: OffboardingPort = {
  impact: async () => ({ routes: 0, coverage: 0, doctors: 0, distributors: 0, plansAfter: 0, leavesAfter: 0, targetsAfter: 0, waitingOnThem: 0 }),
  release: async () => [],
};
