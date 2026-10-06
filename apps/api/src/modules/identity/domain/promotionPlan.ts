import { ctcJumpWarning } from './ctcJump.js';

/** A person as the plan needs to see them. `level` is the designation's rank, `null` while they have none. */
export interface PlanPerson {
  id: string;
  name: string;
  employeeCode: string;
  level: number | null;
  active: boolean;
}

export interface PlanFacts {
  /** The month the promotion is for, the earliest allowed, and whether the input month is a valid `YYYY-MM`. */
  effectiveFrom: string;
  earliestMonth: string;
  employee: PlanPerson & { isField: boolean; managerId: string | null };
  /** Current direct reports who are not inactive. */
  reports: PlanPerson[];
  request: {
    toDesignation: { found: boolean; level: number | null } | null;
    toPayBand: { found: boolean } | null;
    toManager: { person: PlanPerson | null; reachesEmployee: boolean } | null;
    ctc: { annualPaise: number; previousAnnualPaise: number | null; breakdownError: string | null } | null;
    teamMoves: Array<{ userId: string; toManagerId: string; target: PlanPerson | null; targetReachesReport: boolean }>;
  };
  /** The employee's manager now, as a person, to judge the level when the request leaves it unchanged. */
  currentManager: PlanPerson | null;
  /** The employee's current designation level, to say whether this raises or lowers it. */
  currentLevel: number | null;
  alreadyScheduled: boolean;
  jumpWarnPercent: number;
}

export interface PlanProblem {
  field: string;
  message: string;
}

export interface PlanResult {
  problems: PlanProblem[];
  warnings: string[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Judges a promotion before anything is saved. Problems stop it from being scheduled; warnings never do ("warn, don't block").
 * Pure: every lookup has already been done by the caller.
 */
export function judgePromotion(f: PlanFacts): PlanResult {
  const problems: PlanProblem[] = [];
  const warnings: string[] = [];
  const problem = (field: string, message: string) => problems.push({ field, message });
  const r = f.request;

  if (!f.employee.isField) problem('userId', 'Only field employees can be promoted.');
  else if (!f.employee.active) problem('userId', 'This employee is not active.');
  if (f.alreadyScheduled) problem('userId', 'This employee already has a promotion scheduled. Cancel it first.');

  if (!MONTH_RE.test(f.effectiveFrom)) problem('effectiveFrom', 'Choose the month it starts.');
  else if (f.effectiveFrom < f.earliestMonth) problem('effectiveFrom', `It can start from ${f.earliestMonth} at the earliest: a promotion takes effect on the 1st of a coming month.`);

  const changes = r.toDesignation !== null || r.toPayBand !== null || r.toManager !== null || r.ctc !== null;
  if (!changes) problem('toDesignationId', 'Nothing is changing: choose a designation, grade, manager or CTC.');
  if (r.toDesignation && !r.toDesignation.found) problem('toDesignationId', 'Unknown designation.');
  if (r.toPayBand && !r.toPayBand.found) problem('toPayBandId', 'Unknown pay grade.');

  if (r.toManager) {
    const m = r.toManager.person;
    if (!m) problem('toManagerId', 'Unknown manager.');
    else if (m.id === f.employee.id) problem('toManagerId', 'An employee cannot report to themselves.');
    else if (!m.active) problem('toManagerId', `${m.name} is not active.`);
    else if (r.toManager.reachesEmployee) problem('toManagerId', `${m.name} already reports to this employee, directly or through the chain.`);
  }

  if (r.ctc?.breakdownError) problem('ctcAnnualPaise', r.ctc.breakdownError);
  const jump = r.ctc ? ctcJumpWarning(r.ctc.previousAnnualPaise, r.ctc.annualPaise, f.jumpWarnPercent) : null;
  if (jump) warnings.push(jump);

  // The handover: every direct report needs a manager from the effective month.
  const reportIds = new Set(f.reports.map((p) => p.id));
  const seen = new Set<string>();
  for (const move of r.teamMoves) {
    if (seen.has(move.userId)) problem('teamMoves', 'Each person can be placed only once.');
    seen.add(move.userId);
    if (!reportIds.has(move.userId)) {
      problem('teamMoves', 'Someone listed is not a direct report of this employee.');
      continue;
    }
    const who = f.reports.find((p) => p.id === move.userId)!;
    if (move.toManagerId === who.id) problem('teamMoves', `${who.name} cannot report to themselves.`);
    else if (move.toManagerId === f.employee.id) continue;
    else if (!move.target) problem('teamMoves', `Unknown manager for ${who.name}.`);
    else if (!move.target.active) problem('teamMoves', `${move.target.name} is not active, so ${who.name} cannot report to them.`);
    else if (move.targetReachesReport) problem('teamMoves', `${move.target.name} reports to ${who.name}, directly or through the chain.`);
  }
  const unplaced = f.reports.filter((p) => !seen.has(p.id));
  if (unplaced.length > 0) {
    const names = unplaced.map((p) => `${p.name} (${p.employeeCode})`).join(', ');
    problem('teamMoves', `${f.employee.name} has ${unplaced.length} direct report${unplaced.length === 1 ? '' : 's'} who need${unplaced.length === 1 ? 's' : ''} a manager from ${f.effectiveFrom}: ${names}.`);
  }

  // Warnings: the level of the new designation against the manager, the manager against each report, and a team left with the promoted person.
  const newLevel = r.toDesignation?.found ? r.toDesignation.level : f.currentLevel;
  if (r.toDesignation?.found && r.toDesignation.level !== null && f.currentLevel !== null && r.toDesignation.level < f.currentLevel) {
    warnings.push(`This lowers ${f.employee.name}'s designation.`);
  }
  const manager = r.toManager ? r.toManager.person : f.currentManager;
  if (manager && newLevel !== null && manager.level !== null && manager.level <= newLevel) {
    warnings.push(`${manager.name} would be ${f.employee.name}'s manager, but their designation is not above ${f.employee.name}'s.`);
  }
  const stays = f.reports.filter((p) => r.teamMoves.some((m) => m.userId === p.id && m.toManagerId === f.employee.id));
  if (stays.length > 0) warnings.push(`${stays.length} direct report${stays.length === 1 ? '' : 's'} will keep reporting to ${f.employee.name}. You can move them later.`);
  for (const move of r.teamMoves) {
    const who = f.reports.find((p) => p.id === move.userId);
    if (who && move.target && who.level !== null && move.target.level !== null && move.target.level <= who.level) {
      warnings.push(`${move.target.name} would be ${who.name}'s manager, but their designation is not above ${who.name}'s.`);
    }
  }
  return { problems, warnings };
}
