import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalKindDefinition } from '../domain/approvalKind.js';

/**
 * The kinds owning modules have registered at boot. The approval module knows nothing about any
 * kind until its owner registers it — which is what keeps it free of Planning/HR/etc. imports.
 */
export class ApprovalKindRegistry {
  private readonly kinds = new Map<string, ApprovalKindDefinition>();

  register(definition: ApprovalKindDefinition): void {
    if (this.kinds.has(definition.kind)) {
      throw AppError.internal('INTERNAL', { reason: 'APPROVAL_KIND_REGISTERED_TWICE', kind: definition.kind });
    }
    // Admin is the superuser of every workflow; a kind without it would lock Admin out.
    if (!definition.finalApproverRoles.includes('ADMIN')) {
      throw AppError.internal('INTERNAL', { reason: 'APPROVAL_KIND_WITHOUT_ADMIN', kind: definition.kind });
    }
    this.kinds.set(definition.kind, definition);
  }

  /** An unregistered kind is a wiring bug in the composition root, never caller input. */
  get(kind: string): ApprovalKindDefinition {
    const definition = this.kinds.get(kind);
    if (!definition) throw AppError.internal('INTERNAL', { reason: 'APPROVAL_KIND_NOT_REGISTERED', kind });
    return definition;
  }
}
