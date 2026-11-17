/** Territory's narrow view of Identity for managers; `identity.contract` satisfies it structurally. */
export interface ManagerDirectoryPort {
  /** The designation level of each of these users (MR 1 … NSM 5); users without a designation are left out. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
  /** Everyone below this manager at any depth. */
  getDownline(managerId: string): Promise<Array<{ id: string }>>;
  /** Every active FIELD employee with designation, level, HQ and Zone; given `onlyIds`, just those (demo accounts included). */
  listFieldEmployees(onlyIds?: string[]): Promise<
    Array<{ id: string; employeeCode: string; name: string; designation: string | null; designationId: string | null; designationLevel: number | null; hqId: string | null; zoneId: string | null; managerId: string | null }>
  >;
}
