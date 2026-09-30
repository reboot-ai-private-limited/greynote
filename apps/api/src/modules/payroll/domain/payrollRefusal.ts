export const PAYROLL_CODES = {
  monthNotEnded: 'MONTH_NOT_ENDED',
  alreadyFinalized: 'ALREADY_FINALIZED',
  runNotFound: 'RUN_NOT_FOUND',
  userNotFound: 'USER_NOT_FOUND',
  notFieldEmployee: 'NOT_FIELD_EMPLOYEE',
  noPayBand: 'NO_PAY_BAND',
  error: 'ERROR',
} as const;
export type PayrollCode = (typeof PAYROLL_CODES)[keyof typeof PAYROLL_CODES];

const STATUS: Partial<Record<PayrollCode, number>> = { MONTH_NOT_ENDED: 409, ALREADY_FINALIZED: 409, RUN_NOT_FOUND: 404, USER_NOT_FOUND: 404, NOT_FIELD_EMPLOYEE: 400, NO_PAY_BAND: 400 };

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
