import type { ExpenseGrantPhaseDto, ExpenseGrantStatusDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { zonedToIso } from '@/features/planning/lib/lateGrants';

export const EXPENSE_GRANT_STATUS_LABEL: Record<ExpenseGrantStatusDto, string> = {
  OPEN: 'Open',
  USED: 'Used',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

export const EXPENSE_GRANT_STATUS_TONE: Record<ExpenseGrantStatusDto, BadgeTone> = {
  OPEN: 'success',
  USED: 'neutral',
  REVOKED: 'danger',
  EXPIRED: 'warning',
};

export const EXPENSE_GRANT_PHASE_LABEL: Record<ExpenseGrantPhaseDto, string> = {
  SUBMIT: 'Sending the month',
  APPROVE: 'Approving the month',
};

export interface ExpenseGrantForm {
  userId: string;
  month: string;
  phase: ExpenseGrantPhaseDto;
  reason: string;
  /** datetime-local text in the business timezone; empty uses the default length. */
  expiresAt: string;
}

type Built =
  | {
      ok: true;
      body: {
        userId: string;
        month: string;
        phase: ExpenseGrantPhaseDto;
        reason: string;
        expiresAt?: string;
      };
    }
  | { ok: false; errors: Record<string, string> };

/** Checks the form and builds the request. The server has the last word (future, within the longest allowed, nothing paid yet). */
export function buildExpenseGrant(
  form: ExpenseGrantForm,
  timeZone: string,
  now: Date = new Date(),
): Built {
  const errors: Record<string, string> = {};
  if (!form.userId) errors['userId'] = 'Choose an employee.';
  const month = form.month.trim();
  if (!month) errors['month'] = 'Choose the month.';
  else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors['month'] = 'Not a valid month.';
  const reason = form.reason.trim();
  if (!reason) errors['reason'] = 'A reason is required.';
  let expiresAt: string | undefined;
  if (form.expiresAt) {
    const iso = zonedToIso(form.expiresAt, timeZone);
    if (!iso) errors['expiresAt'] = 'Not a valid date and time.';
    else if (new Date(iso) <= now) errors['expiresAt'] = 'Pick a time in the future.';
    else expiresAt = iso;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: {
      userId: form.userId,
      month,
      phase: form.phase,
      reason,
      ...(expiresAt && { expiresAt }),
    },
  };
}
