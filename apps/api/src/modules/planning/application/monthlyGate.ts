import { AppError } from '@/shared/errors/AppError.js';

/** True when the user's Monthly Plan for `YYYY-MM` is past the manager. */
export type MonthlyApprovedCheck = (userId: string, planMonth: string) => Promise<boolean>;

/**
 * No approved Monthly Plan, no work that month: a Daily Plan can't be saved or submitted for a day in a month whose Monthly Plan
 * isn't approved. A new joiner, or anyone who missed the deadline, needs a late-submission exception for the month first.
 */
export async function assertMonthlyApproved(isApproved: MonthlyApprovedCheck, userId: string, planDate: string): Promise<void> {
  const planMonth = planDate.slice(0, 7);
  if (await isApproved(userId, planMonth)) return;
  throw new AppError({
    statusCode: 409,
    code: 'MONTHLY_PLAN_NOT_APPROVED',
    message: `Your monthly plan for ${planMonth} isn’t approved, so you can’t plan or work on its days yet.`,
    publicDetails: { planMonth },
  });
}
