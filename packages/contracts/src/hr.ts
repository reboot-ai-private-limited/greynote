/** One row of `GET /hr/leaves`. `status` is an approval status (SUBMITTED, APPROVED, …). */
export interface LeaveRequestDto {
  id: string;
  userId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  half: string | null;
  reason: string | null;
  status: string;
}
