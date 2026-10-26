import type { DistributorDeleteResultDto, DistributorImpactDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { logger } from '@/shared/logging/logger.js';
import type { Distributor } from '../domain/distributor.entity.js';
import type { DistributorRepositoryPort } from '../domain/distributor.repository.port.js';
import type { DistributorDocumentStoragePort } from '../domain/distributorDocumentStorage.port.js';
import { NO_DISTRIBUTOR_REFERENCES, type DistributorReferencesPort } from '../domain/distributorRetirement.js';

/**
 * Deleting a distributor for good, Admin only: what it takes with it (`impact`), and the permanent `delete`. Unlike a doctor, nothing is
 * archived — its payments, orders, monthly stock and stock statements are erased with it, so reports and dues totals change.
 * Deactivating stays `UpdateDistributorUseCase` with `status: inactive`.
 *
 * The steps run in an order that is safe to repeat. The distributor is made inactive first, so nothing new can be recorded against it;
 * then its history is erased, then its files, and only then the record itself. If anything fails midway the distributor is still
 * there, inactive, and deleting it again finishes the job.
 */
export class DistributorRetirement {
  private references: DistributorReferencesPort = { count: async () => NO_DISTRIBUTOR_REFERENCES, erase: async () => NO_DISTRIBUTOR_REFERENCES };

  constructor(
    private readonly distributors: DistributorRepositoryPort,
    private readonly storage: DistributorDocumentStoragePort,
  ) {}

  /** Sales is built after this module; the composition root hands it in. */
  bind(references: DistributorReferencesPort): void {
    this.references = references;
  }

  private async find(id: string): Promise<Distributor> {
    const distributor = await this.distributors.findById(id);
    if (!distributor) throw AppError.notFound('No such distributor.');
    return distributor;
  }

  async impact(id: string): Promise<DistributorImpactDto> {
    const distributor = await this.find(id);
    const history = await this.references.count(id);
    return {
      id,
      name: distributor.name,
      status: distributor.status,
      ...history,
      documents: distributor.documents.length,
      assignedPeople: distributor.assignedUserIds.length,
    };
  }

  async delete(id: string, actorId: string): Promise<DistributorDeleteResultDto> {
    const distributor = await this.find(id);
    if (distributor.status === 'active') await this.distributors.update(id, { status: 'inactive' });
    const erased = await this.references.erase(id);
    for (const document of distributor.documents) await this.storage.remove(document.publicId);
    await this.distributors.delete(id);
    const result = { id, payments: erased.payments, orders: erased.orders, monthlyStock: erased.monthlyStock, stockStatements: erased.stockStatements, documents: distributor.documents.length };
    logger.info({ ...result, name: distributor.name, actorId }, 'distributor deleted');
    return result;
  }
}
