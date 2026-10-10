/** Planning's narrow view of Field Master Data; `fieldMasterData.contract` satisfies it structurally. */
export interface DoctorDirectoryPort {
  /** The active Doctors an MR can currently see and call — what a Daily Plan may list. */
  listAssignedDoctors(userId: string): Promise<Array<{ id: string; routeId: string }>>;
}

/** Planning's narrow view of Field Activity: the Doctors this employee called in the reported days of a range (both ends inclusive). */
export type CalledDoctorsPort = (userId: string, range: { from: string; to: string }) => Promise<string[]>;
