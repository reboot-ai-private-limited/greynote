export const PAYROLL_CODES = {
  monthNotEnded: 'MONTH_NOT_ENDED',
  alreadyFinalized: 'ALREADY_FINALIZED',
  runNotFound: 'RUN_NOT_FOUND',
  userNotFound: 'USER_NOT_FOUND',
  notFieldEmployee: 'NOT_FIELD_EMPLOYEE',
  noCtc: 'NO_CTC',
  notDraft: 'RUN_NOT_DRAFT',
  notFinalized: 'RUN_NOT_FINALIZED',
  alreadyPaid: 'ALREADY_PAID',
  changed: 'RUN_CHANGED',
  badDay: 'BAD_DAY',
  negativeNet: 'NEGATIVE_NET',
  error: 'ERROR',
} as const;
export type PayrollCode = (typeof PAYROLL_CODES)[keyof typeof PAYROLL_CODES];

const STATUS: Partial<Record<PayrollCode, number>> = { MONTH_NOT_ENDED: 409, ALREADY_FINALIZED: 409, RUN_NOT_FOUND: 404, USER_NOT_FOUND: 404, NOT_FIELD_EMPLOYEE: 400, NO_CTC: 400, RUN_NOT_DRAFT: 409, RUN_NOT_FINALIZED: 409, ALREADY_PAID: 409, RUN_CHANGED: 409, BAD_DAY: 400, NEGATIVE_NET: 400 };

/** A payroll action refused for what it refers to. A plain domain error; the controller maps it to a status. */
export class PayrollRefusal extends Error {
  constructor(
    readonly code: PayrollCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRefusal';
  }
  get status(): number {
    return STATUS[this.code] ?? 400;
  }
}
