import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { personLabel } from './namePeople.usecase.js';

export type WorkWithScope = 'managers' | 'all';

export interface WorkWithPerson {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  /** What a picker and a report print: `Asha Rao (ASM)`, or just the name with no designation. */
  label: string;
}

/**
 * The people an employee can name as "Work With" on a plan or a call. `managers` (the default) is every active manager
 * in the organisation — anyone who has direct reports, not just the caller's own chain. `all` is every active field
 * employee, for the search-everyone box. The caller is never in the list. Demo accounts show only to demo accounts. Sorted by name.
 */
export class ListWorkWithUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly designations: DesignationRepositoryPort,
  ) {}

  async execute(callerId: string, scope: WorkWithScope = 'managers'): Promise<WorkWithPerson[]> {
    // Demo accounts are seen only by other demo accounts, in both scopes.
    const demoCaller = callerId ? ((await this.users.findById(callerId))?.isDemo ?? false) : false;
    const ids = scope === 'all' ? await this.users.listActiveIdsByRole('FIELD', { includeDemo: demoCaller }) : await this.profiles.findManagerIds();
    const wanted = [...new Set(ids)].filter((id) => id !== callerId);
    if (wanted.length === 0) return [];

    const [users, profiles, designations] = await Promise.all([
      this.users.findByIds(wanted),
      this.profiles.findByUserIds(wanted),
      this.designations.list(),
    ]);
    const profileOf = new Map(profiles.map((p) => [p.userId, p]));
    const designationName = new Map(designations.map((d) => [d.id, d.name as string]));

    return users
      .filter((u) => u.status === 'active' && (demoCaller || !u.isDemo))
      .map((u): WorkWithPerson => {
        const designationId = profileOf.get(u.id)?.designationId;
        const designation = (designationId && designationName.get(designationId)) || null;
        return {
          id: u.id,
          employeeCode: u.employeeCode,
          name: u.name,
          designation,
          label: personLabel(u.name, designation),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
