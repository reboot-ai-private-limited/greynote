import type { DeactivateUserDto, DeactivationImpactDto, DeactivationResultDto, UserDetailDto } from '@greynote/contracts';
import { passwordError } from './user';

/** What a person must know before they confirm each action: it is shown, not just logged. */
export const RESET_CONSEQUENCE =
  'The employee is signed out on every phone and must use the new password. Their registered phones stay registered.';

export const DEACTIVATE_CONSEQUENCE =
  'The employee is signed out everywhere at once and can no longer sign in. Their team moves to a new manager and their work is handed over. Their history stays, and an Admin can reactivate them later.';

export function resetPasswordError(password: string): string | undefined {
  return password === '' ? 'Enter a new password.' : passwordError(password);
}

export type DeactivateBlock = 'self' | 'already' | null;

/**
 * Why deactivating is not offered, if it is not. You cannot deactivate yourself (nobody would be
 * left to undo it, and the API does not stop you), and an inactive account is already done.
 */
export function deactivateBlock(target: Pick<UserDetailDto, 'id' | 'status'>, selfId: string | undefined): DeactivateBlock {
  if (target.id === selfId) return 'self';
  if (target.status === 'inactive') return 'already';
  return null;
}

export const DEACTIVATE_BLOCK_COPY: Record<'self' | 'already', string> = {
  self: 'You cannot deactivate your own account. Ask another Admin.',
  already: 'This account is deactivated.',
};

/** The deactivation form as typed. Empty ids: none chosen. */
export interface DeactivationDraft {
  lastWorkingDay: string;
  newManagerId: string;
  doctorHandoverTo: string;
  /** The employee code typed to confirm. */
  typedCode: string;
}

/**
 * Same rules as the API, plus the typed confirmation: a last working day no later than today, a new manager when they manage anyone
 * (not themselves), and their employee code typed exactly (ignoring case and spaces).
 */
export function buildDeactivation(
  draft: DeactivationDraft,
  impact: Pick<DeactivationImpactDto, 'today' | 'directReports' | 'user'>,
): { ok: true; body: DeactivateUserDto } | { ok: false; errors: Partial<Record<keyof DeactivationDraft, string>> } {
  const errors: Partial<Record<keyof DeactivationDraft, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.lastWorkingDay)) errors.lastWorkingDay = 'Choose the last working day.';
  else if (draft.lastWorkingDay > impact.today) errors.lastWorkingDay = 'The last working day cannot be in the future. Deactivate once they have left.';
  if (impact.directReports.length > 0 && !draft.newManagerId) errors.newManagerId = 'Choose who the team reports to now.';
  if (draft.newManagerId && draft.newManagerId === impact.user.id) errors.newManagerId = 'Choose someone other than the person leaving.';
  if (draft.doctorHandoverTo && draft.doctorHandoverTo === impact.user.id) errors.doctorHandoverTo = 'Choose someone other than the person leaving.';
  if (draft.typedCode.replace(/\s/g, '').toUpperCase() !== impact.user.employeeCode.toUpperCase()) errors.typedCode = `Type ${impact.user.employeeCode} to confirm.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      lastWorkingDay: draft.lastWorkingDay,
      ...(draft.newManagerId && { newManagerId: draft.newManagerId }),
      ...(draft.doctorHandoverTo && { doctorHandoverTo: draft.doctorHandoverTo }),
    },
  };
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the step will do, line by line; only what applies is listed. */
export function deactivationLines(impact: DeactivationImpactDto): string[] {
  const w = impact.work;
  return [
    impact.directReports.length > 0 ? `${impact.directReports.length === 1 ? '1 person reporting to them moves' : `${impact.directReports.length} people reporting to them move`} to the new manager${w.waitingOnThem > 0 ? `, with ${count(w.waitingOnThem, 'request')} waiting for a decision` : ''}` : '',
    w.doctors > 0 ? `${count(w.doctors, 'doctor')}: handed over where the new person has the route, the rest left unassigned` : '',
    w.routes > 0 ? `${count(w.routes, 'route')} ended` : '',
    w.coverage > 0 ? `${count(w.coverage, 'covered HQ or Zone', 'covered HQs or Zones')} cleared` : '',
    w.distributors > 0 ? `Taken off ${count(w.distributors, 'distributor')}` : '',
    w.plansAfter > 0 ? `${count(w.plansAfter, 'plan')} after the last working day closed` : '',
    w.leavesAfter > 0 ? `${count(w.leavesAfter, 'leave request')} after the last working day closed` : '',
    w.targetsAfter > 0 ? `${count(w.targetsAfter, 'target')} running past the leaving month cut at that month` : '',
  ].filter(Boolean);
}

export const STEP_LABEL: Record<DeactivationResultDto['steps'][number]['step'], string> = {
  DOCTORS: 'Doctors',
  DISTRIBUTORS: 'Distributors',
  TERRITORY: 'Routes and coverage',
  PLANS: 'Plans',
  LEAVE: 'Leave',
  TARGETS: 'Targets',
};

