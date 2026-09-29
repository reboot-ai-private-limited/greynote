import { Router } from 'express';
import type { FieldActivityPublicContract } from './field-activity.public.js';

export interface FieldActivityContainer {
  contract: FieldActivityPublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 4. Built up over Phase 6 (docs/roadmap.md): the DCR and its gate, calls and follow-ups, expenses,
 * the sync record kinds, DCR review, TA/DA, Doctor Service and Gift, mark-paid, and the missed-DCR job.
 * Records reach the server through the sync push (LLD sync.md), so this module registers handlers there
 * rather than exposing a POST per record.
 */
export function buildFieldActivityContainer(): FieldActivityContainer {
  return {
    contract: {},
    // Nothing is served yet; the routes arrive with the steps that build them.
    buildRouter: () => Router(),
  };
}
