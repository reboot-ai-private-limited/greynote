import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** A person as a plan names them: `Asha Rao (ASM)`, or just the name with no designation. */
export interface NamedPerson {
  id: string;
  name: string;
  designation: string | null;
  label: string;
}

export const personLabel = (name: string, designation: string | null): string => (designation ? `${name} (${designation})` : name);

/**
 * Names and current designations for user ids, in the order given — for a screen that holds ids (a plan's Work With)
 * and must print who they are. Any status, because a colleague who has since left still reads as a name on an old plan;
 * unknown ids are skipped.
 */
export class NamePeopleUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly designations: DesignationRepositoryPort,
  ) {}

  async execute(userIds: string[]): Promise<NamedPerson[]> {
    const wanted = [...new Set(userIds)];
    if (wanted.length === 0) return [];
    const [users, profiles, designations] = await Promise.all([
      this.users.findByIds(wanted),
      this.profiles.findByUserIds(wanted),
      this.designations.list(),
    ]);
    const userOf = new Map(users.map((u) => [u.id, u]));
    const designationIdOf = new Map(profiles.map((p) => [p.userId, p.designationId]));
    const designationName = new Map(designations.map((d) => [d.id, d.name as string]));
    return wanted.flatMap((id): NamedPerson[] => {
      const user = userOf.get(id);
      if (!user) return [];
      const designationId = designationIdOf.get(id);
      const designation = (designationId && designationName.get(designationId)) || null;
      return [{ id, name: user.name, designation, label: personLabel(user.name, designation) }];
    });
  }
}
