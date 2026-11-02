import type { DesignationRepositoryPort } from '../../domain/designation.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { personLabel } from './namePeople.usecase.js';

export interface WorkWithPerson {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  /** What a picker and a report print: `Asha Rao (ASM)`, or just the name with no designation. */
  label: string;
}

const MAX_CHAIN_DEPTH = 50;

/**
 * The people an employee can name as "Work With" on a plan: their own reporting tree — every manager above them (the
 * whole upline) and everyone below them at any depth (the downline). Nobody from another branch. The caller is never
 * in the list. Demo accounts show only to demo accounts. Sorted by name. `executeDirectory` is the org-wide list of
 * active field employees for Admin, HR and Accountant pickers.
 */
export class ListWorkWithUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly designations: DesignationRepositoryPort,
  ) {}

  async execute(callerId: string): Promise<WorkWithPerson[]> {
    const demoCaller = (await this.users.findById(callerId))?.isDemo ?? false;
    const [upline, downline] = await Promise.all([this.uplineIds(callerId), this.profiles.findDownline(callerId)]);
    return this.people([...upline, ...downline.map((d) => d.userId)], callerId, demoCaller);
  }

  async executeDirectory(): Promise<WorkWithPerson[]> {
    return this.people(await this.users.listActiveIdsByRole('FIELD', { includeDemo: false }), '', false);
  }

  /** Nearest manager first, then up to the top; stops on a cycle. */
  private async uplineIds(userId: string): Promise<string[]> {
    const chain: string[] = [];
    const seen = new Set([userId]);
    let current = (await this.profiles.findByUserId(userId))?.managerId ?? null;
    while (current && !seen.has(current) && chain.length < MAX_CHAIN_DEPTH) {
      chain.push(current);
      seen.add(current);
      current = (await this.profiles.findByUserId(current))?.managerId ?? null;
    }
    return chain;
  }

  private async people(ids: string[], callerId: string, demoCaller: boolean): Promise<WorkWithPerson[]> {
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
