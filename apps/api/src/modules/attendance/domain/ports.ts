/** Attendance's narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface IdentityPort {
  listActiveFieldUserIds(): Promise<string[]>;
  getUserSummaries(userIds: string[]): Promise<Array<{ id: string; name: string; employeeCode: string }>>;
  /** The joining date; `null` without an EmployeeProfile. */
  getEmploymentDetails(userId: string): Promise<{ dateOfJoining: Date | null; lastWorkingDay?: string | null; rejoinedOn?: string | null } | null>;
}

export interface HrPort {
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
  listLeaveDates(userId: string, from: string, to: string): Promise<string[]>;
}

export interface PlanningPort {
  listDailyPlanDays(userId: string, from: string, to: string): Promise<Array<{ date: string; status: string; workingType: string }>>;
}

export interface FieldActivityPort {
  listReportedDates(userId: string, from: string, to: string): Promise<string[]>;
  countDoctorCallsByDay(range: { from: string; to: string }): Promise<Array<{ userId: string; date: string; count: number }>>;
}
