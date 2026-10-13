import type {
  AllocateGiftDto,
  CreateAdminServiceDto,
  DcrDetailDto,
  DoctorGiftDto,
  DoctorServiceDto,
  ExpenseAuditRowDto,
  AddExpenseRowDto,
  AdjustExpenseRowDto,
  ExpenseAdjustmentDto,
  ExpenseOverviewDto,
  FinalizeExpensesDto,
  FinalizeOutcomeDto,
  ExpenseReviewDto,
  ExpenseMonthGrantDto,
  ExpenseStatementDto,
  GrantExpenseMonthDto,
  PaginatedDto,
  ExpensePaymentStatus,
  ExpensePayoutSheetDto,
  MarkedPaidDto,
  OverrideGeofenceDto,
  PayExpensesDto,
  PayOutcomeDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListExpenseGrantsQuery {
  page: number;
  pageSize: number;
}

export const fieldActivityApi = {
  expenseGrants: (token: string, query: ListExpenseGrantsQuery, signal?: AbortSignal) =>
    request<PaginatedDto<ExpenseMonthGrantDto>>('/field-activity/expense-grants', { token, query: { ...query }, signal }),
  grantExpenseMonth: (token: string, body: GrantExpenseMonthDto) => request<ExpenseMonthGrantDto>('/field-activity/expense-grants', { method: 'POST', token, body }),
  revokeExpenseGrant: (token: string, id: string) => request<ExpenseMonthGrantDto>(`/field-activity/expense-grants/${id}/revoke`, { method: 'POST', token }),
  /** `from`/`to` are required (`YYYY-MM-DD`, at most 400 days). A bare array, capped at 500. */
  expenses: (
    token: string,
    query: { from: string; to: string; userId?: string | undefined; paymentStatus?: ExpensePaymentStatus | undefined },
    signal?: AbortSignal,
  ) => request<ExpenseAuditRowDto[]>('/field-activity/expenses', { token, query: { ...query }, signal }),

  /**
   * Settles an accepted, unpaid expense, with who and when. Marking a paid one again changes nothing, so a retry is safe. A cancelled
   * row, or one whose report is not past the manager, is a 409.
   */
  markPaid: (token: string, id: string) =>
    request<MarkedPaidDto>(`/field-activity/expenses/${id}/mark-paid`, { method: 'POST', token }),

  /** One month's accepted expenses per employee (by the month they were incurred), with the day they are due. */
  expensePayouts: (token: string, month: string, signal?: AbortSignal) =>
    request<ExpensePayoutSheetDto>('/field-activity/expense-payouts', { token, query: { month }, signal }),

  /** Admin, HR, Accountant: every active field employee's month: claimed, accepted, paid and where the month stands. */
  expenseOverview: (token: string, month: string, signal?: AbortSignal) =>
    request<ExpenseOverviewDto>('/field-activity/expense-months/overview', { token, query: { month }, signal }),
  /** Admin, HR, Accountant: one employee's month day by day. */
  expenseReview: (token: string, userId: string, month: string, signal?: AbortSignal) =>
    request<ExpenseReviewDto>('/field-activity/expense-months/review', { token, query: { userId, month }, signal }),

  /** Accountant, Admin: finalizes approved months (named employees, or every approved one): locks the amounts and makes them payable. */
  finalizeExpenses: (token: string, body: FinalizeExpensesDto) =>
    request<FinalizeOutcomeDto[]>('/field-activity/expense-months/finalize', { method: 'POST', token, body }),
  /** Admin, HR: changes one expense row's amount, up or down, with a reason. The first amount and the change are kept. */
  adjustExpenseRow: (token: string, id: string, body: AdjustExpenseRowDto) =>
    request<ExpenseAdjustmentDto>(`/field-activity/expense-months/rows/${id}`, { method: 'PATCH', token, body }),
  /** Admin, HR: puts a TA or DA amount on a day that had none. */
  addExpenseRow: (token: string, body: AddExpenseRowDto) =>
    request<ExpenseAdjustmentDto>('/field-activity/expense-months/rows', { method: 'POST', token, body }),

  /** Pays a month's unpaid expenses for the named employees, or for everyone owed. Paying twice pays nothing twice. */
  payExpenses: (token: string, body: PayExpensesDto) => request<PayOutcomeDto[]>('/field-activity/expense-payouts/pay', { method: 'POST', token, body }),

  /** Admin: every Doctor Service, newest first, optionally for one Doctor. */
  doctorServices: (token: string, query: { doctorId?: string | undefined }, signal?: AbortSignal) =>
    request<DoctorServiceDto[]>('/field-activity/doctor-services', { token, query: { ...query }, signal }),
  /** Admin: creates a Service for a Doctor — effective at once, tied to the Doctor's assigned MR. A Doctor with no MR is refused. */
  createDoctorService: (token: string, body: CreateAdminServiceDto) =>
    request<DoctorServiceDto>('/field-activity/admin/doctor-services', { method: 'POST', token, body }),
  /** Admin: every gift, newest first, optionally only pending or done. */
  doctorGifts: (token: string, query: { status?: 'PENDING' | 'DONE' | undefined }, signal?: AbortSignal) =>
    request<DoctorGiftDto[]>('/field-activity/doctor-gifts', { token, query: { ...query }, signal }),
  /** Admin: allocates a gift (a name and its value) to a Doctor; the assigned MR marks it done. */
  allocateGift: (token: string, body: AllocateGiftDto) => request<DoctorGiftDto>('/field-activity/admin/doctor-gifts', { method: 'POST', token, body }),

  /** The month statement an approval request points at (its record id): date-wise TA, DA and Other. */
  expenseMonth: (token: string, id: string, signal?: AbortSignal) => request<ExpenseStatementDto>(`/field-activity/expense-months/${id}`, { token, signal }),

  /** One daily report with every call, follow-up and expense: the review screen. */
  dcr: (token: string, id: string, signal?: AbortSignal) => request<DcrDetailDto>(`/field-activity/dcr/${id}`, { token, signal }),

  /** Accepts a call the geofence flagged (FAIL or UNVERIFIED). The reviewing manager or Admin; a reason is required. */
  overrideGeofence: (token: string, dcrId: string, callId: string, body: OverrideGeofenceDto) =>
    request<{ id: string }>(`/field-activity/dcr/${dcrId}/calls/${callId}/override-geofence`, { method: 'POST', token, body }),

  /** Admin or Accounts: the last step of an approved service. */
  markDoctorServiceDone: (token: string, id: string) =>
    request<DoctorServiceDto>(`/field-activity/doctor-services/${id}/done`, { method: 'POST', token }),
  doctorService: (token: string, id: string, signal?: AbortSignal) =>
    request<DoctorServiceDto>(`/field-activity/doctor-services/${id}`, { token, signal }),
};
