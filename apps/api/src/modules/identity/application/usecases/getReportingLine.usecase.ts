import type { UserSummary } from '../../domain/user.entity.js';
import type { DownlineMember } from './getDownline.usecase.js';

export interface ReportingLine {
  /** Nearest manager first, then everyone above, up to the top. Empty for someone with no manager. */
  upline: UserSummary[];
  /** Everyone below, at any depth (1 = direct report); each carries `managerId` so the tree can be rebuilt. */
  downline: DownlineMember[];
}

/** One employee's place in the reporting tree, for the web portal's Team tab (Admin/HR). Composes the chain and downline reads. */
export class GetReportingLineUseCase {
  constructor(
    private readonly getManagerChain: (userId: string) => Promise<UserSummary[]>,
    private readonly getDownline: (managerId: string) => Promise<DownlineMember[]>,
  ) {}

  async execute(userId: string): Promise<ReportingLine> {
    const [upline, downline] = await Promise.all([this.getManagerChain(userId), this.getDownline(userId)]);
    return { upline, downline };
  }
}
