import type { ChemistCall, DoctorCall, Followup } from '../../domain/call.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { ChemistCallRepositoryPort, ExpenseRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { DcrView } from '../dcrViews.js';
import type { GetDcrUseCase, Actor } from './readDcrs.usecase.js';

export interface DcrDetail extends DcrView {
  doctorCalls: Array<DoctorCall & { doctorName: string; samples: Array<DoctorCall['samples'][number] & { productName: string }> }>;
  chemistCalls: Array<ChemistCall & { chemistName: string }>;
  followups: Array<Followup & { subjectName: string }>;
  expenses: Expense[];
}

/**
 * One DCR with everything on it — the manager's review screen. Readable by the owner, their managers and Admin
 * (the read check is `GetDcrUseCase`'s). Each call carries the server's geofence answer, so a `FAIL` or
 * `UNVERIFIED` shows next to the call's remarks for the reviewer.
 */
export class GetDcrDetailUseCase {
  constructor(
    private readonly base: GetDcrUseCase,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    private readonly expenses: ExpenseRepositoryPort,
    private readonly master: FieldMasterDataPort,
  ) {}

  async execute(actor: Actor, id: string): Promise<DcrDetail> {
    const view = await this.base.execute(actor, id);
    const [doctorCalls, chemistCalls, followups, expenses] = await Promise.all([this.doctorCalls.listForDcr(id), this.chemistCalls.listForDcr(id), this.followups.listForDcr(id), this.expenses.listForDcr(id)]);
    const name = async (fn: () => Promise<{ name: string } | null>) => (await fn())?.name ?? '';
    return {
      ...view,
      expenses,
      doctorCalls: await Promise.all(
        doctorCalls.map(async (c) => ({
          ...c,
          doctorName: await name(() => this.master.getDoctor(c.doctorId)),
          samples: await Promise.all(c.samples.map(async (s) => ({ ...s, productName: await name(() => this.master.getProduct(s.productId)) }))),
        })),
      ),
      chemistCalls: await Promise.all(chemistCalls.map(async (c) => ({ ...c, chemistName: await name(() => this.master.getChemist(c.chemistId)) }))),
      followups: await Promise.all(followups.map(async (f) => ({ ...f, subjectName: await name(() => (f.subject === 'DOCTOR' ? this.master.getDoctor(f.subjectId) : this.master.getChemist(f.subjectId))) }))),
    };
  }
}
