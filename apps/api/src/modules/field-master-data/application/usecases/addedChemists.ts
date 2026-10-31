import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { parseBoolean, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import { DuplicateRecordError } from '../../domain/duplicateRecord.error.js';
import type { GeoPoint, PageQuery } from '../../domain/masterStatus.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { NEW_CHEMIST_KIND } from '../chemistApproval.js';

/** What an employee fills when adding a Chemist: no status — that comes from the approval. */
export interface AddedChemistInput {
  routeId: string;
  name: string;
  address: string;
  /** The phone's GPS when the employee added the Chemist — becomes the registered location until Admin corrects it. */
  location: GeoPoint;
}

export type AddedChemistView = Chemist & { approval: { requestId: string; cycle: number; status: string } | null };

/**
 * An employee adds a Chemist — the same flow as adding a Doctor: the Chemist is created `pending` and submitted
 * as a `NEW_CHEMIST` request in one transaction, so it never exists without its request. Offline-first: the phone
 * sends a `clientRequestId` with the create, and a retry of the same one returns the Chemist already made.
 */
export class AddedChemists {
  constructor(
    private readonly chemists: ChemistRepositoryPort,
    private readonly territory: TerritoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly users: UserDirectoryPort,
    private readonly config: ConfigReader,
  ) {}

  /** `created: false` means this was a retry of an earlier, successful create. */
  async add(userId: string, input: AddedChemistInput & { clientRequestId: string }): Promise<{ chemist: AddedChemistView; created: boolean }> {
    const earlier = await this.chemists.findByClientRequest(userId, input.clientRequestId);
    if (earlier) return { chemist: await this.view(earlier), created: false };

    await this.requireMayAdd(userId);
    await this.requireOwnRoute(userId, input.routeId);
    try {
      const created = await this.transactions.run((ctx) => this.insertAndSubmit(userId, input, ctx));
      return { chemist: await this.view(created), created: true };
    } catch (err) {
      if (!(err instanceof DuplicateRecordError)) throw err;
      // A racing retry of the same create got there first — hand back its Chemist.
      const winner = await this.chemists.findByClientRequest(userId, input.clientRequestId);
      if (!winner) throw AppError.conflict('This chemist was added at the same time. Reload and try again.');
      return { chemist: await this.view(winner), created: false };
    }
  }

  /** The same create, inside a transaction the caller already opened — the sync push's, for a Chemist added offline. */
  async addWithin(userId: string, input: AddedChemistInput & { clientRequestId: string }, ctx: TransactionContext): Promise<Chemist> {
    const earlier = await this.chemists.findByClientRequest(userId, input.clientRequestId);
    if (earlier) return earlier;
    await this.requireMayAdd(userId);
    await this.requireOwnRoute(userId, input.routeId);
    return this.insertAndSubmit(userId, input, ctx);
  }

  private async insertAndSubmit(userId: string, input: AddedChemistInput & { clientRequestId: string }, ctx: TransactionContext): Promise<Chemist> {
    const { clientRequestId, location, ...fields } = input;
    const chemist = await this.chemists.createProposed(
      { ...fields, location, capturedLocation: location, clientRequestId, status: 'pending', addedBy: userId, approvedAt: null },
      ctx,
    );
    await this.approvals.submit({ kind: NEW_CHEMIST_KIND, recordId: chemist.id, submitterId: userId }, ctx);
    return chemist;
  }

  /** After a rejection, withdrawal or Admin reopen: change the Chemist and resubmit it as a new cycle. */
  async edit(userId: string, chemistId: string, input: AddedChemistInput): Promise<AddedChemistView> {
    const existing = await this.chemists.findById(chemistId);
    if (!existing || existing.addedBy !== userId || existing.clientRequestId === null) throw AppError.notFound('No such chemist.');
    const request = await this.approvals.getForRecord(NEW_CHEMIST_KIND, existing.id);
    if (!request || !isEditableBySubmitter(request.status)) {
      throw AppError.conflict(
        request?.status === 'APPROVED'
          ? 'This chemist is approved and can’t be changed. Ask Admin.'
          : 'This chemist is waiting for approval and can’t be changed. Withdraw it first.',
      );
    }
    await this.requireMayAdd(userId);
    if (input.routeId !== existing.routeId) await this.requireOwnRoute(userId, input.routeId);

    const updated = await this.transactions.run(async (ctx) => {
      const { location, ...fields } = input;
      const chemist = await this.chemists.update(existing.id, { ...fields, location, capturedLocation: location }, ctx);
      if (!chemist) throw AppError.notFound('No such chemist.');
      await this.approvals.submit({ kind: NEW_CHEMIST_KIND, recordId: chemist.id, submitterId: userId }, ctx);
      return chemist;
    });
    return this.view(updated);
  }

  /** The Chemists this employee added, any status, newest first — with where each one is in its approval. */
  async list(userId: string, page: PageQuery): Promise<PaginatedResult<AddedChemistView>> {
    const { items, total } = await this.chemists.listAdded(userId, page);
    const views = await Promise.all(items.map((c) => this.view(c)));
    return buildPaginatedResult(views, total, page);
  }

  private async view(chemist: Chemist): Promise<AddedChemistView> {
    const request = await this.approvals.getForRecord(NEW_CHEMIST_KIND, chemist.id);
    return { ...chemist, approval: request && { requestId: request.id, cycle: request.cycle, status: request.status } };
  }

  /** A manager (someone with a team) may add a Chemist only while Admin has `MANAGER_CAN_ADD_CHEMISTS` on; read on every call, so turning it off applies at once. */
  private async requireMayAdd(userId: string): Promise<void> {
    if (await readConfigOr(this.config, 'MANAGER_CAN_ADD_CHEMISTS', parseBoolean, false)) return;
    if ((await this.users.getDownline(userId)).length > 0) throw AppError.forbidden('Managers can’t add chemists. Ask Admin.');
  }

  /** An employee can only add a Chemist to a Route they currently have. */
  private async requireOwnRoute(userId: string, routeId: string): Promise<void> {
    if (!(await this.territory.listRoutesForUser(userId)).some((r) => r.id === routeId)) {
      throw AppError.badRequest('That route isn’t one of yours.', { field: 'routeId' });
    }
  }
}
