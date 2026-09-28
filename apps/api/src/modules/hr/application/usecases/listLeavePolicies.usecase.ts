import type { LeavePolicyRepositoryPort } from '../../domain/leavePolicy.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

export interface LeaveMasterRow {
  payBandId: string;
  payBandName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  /** `null` = not set yet; a balance seeded now gets 0 days of this type. */
  defaultDays: number | null;
}

/** The Leave Master as a grid: every Pay Band × every paid leave type, set or not. */
export class ListLeavePoliciesUseCase {
  constructor(
    private readonly policies: LeavePolicyRepositoryPort,
    private readonly types: LeaveTypeRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(): Promise<LeaveMasterRow[]> {
    const [payBands, types, policies] = await Promise.all([this.users.listPayBands(), this.types.list(), this.policies.list()]);
    const days = new Map(policies.map((p) => [`${p.payBandId}:${p.leaveTypeId}`, p.defaultDays]));
    return payBands.flatMap((band) =>
      types
        .filter((t) => t.isPaid)
        .map((t) => ({
          payBandId: band.id,
          payBandName: band.name,
          leaveTypeId: t.id,
          leaveTypeName: t.name,
          defaultDays: days.get(`${band.id}:${t.id}`) ?? null,
        })),
    );
  }
}
