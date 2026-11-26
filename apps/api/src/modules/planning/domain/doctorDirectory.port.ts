/** Planning's narrow view of Field Master Data; `fieldMasterData.contract` satisfies it structurally. */
export interface DoctorDirectoryPort {
  /** The active Doctors an MR can currently see and call — what a Daily Plan may list. */
  listAssignedDoctors(userId: string): Promise<Array<{ id: string; routeId: string; placeId?: string | undefined; name?: string }>>;
  /** Names for a batch of Doctors in one query (a reviewer reads who a plan names); an id that is not there is left out. */
  getDoctorNames(doctorIds: string[]): Promise<Array<{ id: string; name: string }>>;
}

/** Planning's narrow view of Field Activity: the Doctors this employee called in the reported days of a range (both ends inclusive). */
export type CalledDoctorsPort = (userId: string, range: { from: string; to: string }) => Promise<string[]>;
