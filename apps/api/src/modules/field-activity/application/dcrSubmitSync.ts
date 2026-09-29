import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { GateRefusal } from '../domain/gateRefusal.js';
import type { SubmitDcrUseCase } from './usecases/submitDcr.usecase.js';

/** The record kind the phone sends last in the day's push: the DCR's Final Submission (LLD sync.md). */
export const DCR_SUBMIT_SYNC_KIND = 'DCR_SUBMIT';

export const DCR_SUBMIT_SYNC_CODES = { invalidPayload: 'INVALID_PAYLOAD' } as const;

/**
 * Applies a `DCR_SUBMIT` record: submits the day's DCR for approval. It `dependsOn` every other record of the
 * day, so the sync engine only reaches it when they all applied. `parse` validates the payload (`{ reportDate }`);
 * a gate refusal becomes that record's reason with the gate's own code, so the phone can say exactly why.
 */
export function makeDcrSubmitSyncHandler(submit: SubmitDcrUseCase, parse: (payload: unknown) => { reportDate: string }): SyncHandlerDefinition {
  return {
    kind: DCR_SUBMIT_SYNC_KIND,
    async apply({ userId, clientCreatedAt, payload }, ctx) {
      let reportDate: string;
      try {
        reportDate = parse(payload).reportDate;
      } catch (err) {
        const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
        throw new SyncRejection(DCR_SUBMIT_SYNC_CODES.invalidPayload, issue ? `${issue.path.join('.') || 'The report'}: ${issue.message}` : 'The report’s details are not valid.');
      }
      try {
        const { dcrId } = await submit.execute(userId, reportDate, clientCreatedAt, ctx);
        return { serverId: dcrId };
      } catch (err) {
        if (err instanceof GateRefusal) throw new SyncRejection(err.code, err.message);
        throw err;
      }
    },
  };
}
