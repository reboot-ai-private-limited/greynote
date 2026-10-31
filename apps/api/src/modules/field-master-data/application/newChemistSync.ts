import { AppError } from '@/shared/errors/AppError.js';
import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { DuplicateRecordError } from '../domain/duplicateRecord.error.js';
import type { AddedChemistInput, AddedChemists } from './usecases/addedChemists.js';

/** The record kind the phone sends for a Chemist the MR added offline. */
export const NEW_CHEMIST_SYNC_KIND = 'NEW_CHEMIST';

/** The codes this handler refuses with — what the app tells the MR to do about each. */
export const NEW_CHEMIST_SYNC_CODES = {
  invalidPayload: 'INVALID_PAYLOAD',
  routeNotAssigned: 'ROUTE_NOT_ASSIGNED',
  addedAtTheSameTime: 'ADDED_AT_THE_SAME_TIME',
  managerNotAllowed: 'MANAGER_NOT_ALLOWED',
} as const;

/**
 * Applies a `NEW_CHEMIST` record from the daily report's push: the Chemist is created `pending` and sent for
 * approval exactly as `POST /chemists/added` does — the same logic, inside the sync engine's transaction, so
 * the record, its approval request and its receipt commit or roll back together. The sync `clientId` is the
 * Chemist's `clientRequestId`, so a Chemist already added under that id (directly, or by an earlier push) is
 * returned, never duplicated.
 *
 * Master-data drift is caught here (HLD 01 §1.4): if the MR no longer has the Route the Chemist was added on
 * — Admin took it away while the phone was offline — the record is refused with `ROUTE_NOT_ASSIGNED` and the
 * MR picks another Route. `parse` validates the payload (it arrives as `unknown`); the composition root passes
 * the same field rules `POST /chemists/added` uses.
 */
export function makeNewChemistSyncHandler(added: AddedChemists, parse: (payload: unknown) => AddedChemistInput): SyncHandlerDefinition {
  return {
    kind: NEW_CHEMIST_SYNC_KIND,
    async apply({ userId, clientId, payload }, ctx) {
      let input: AddedChemistInput;
      try {
        input = parse(payload);
      } catch (err) {
        throw new SyncRejection(NEW_CHEMIST_SYNC_CODES.invalidPayload, describeInvalid(err));
      }
      try {
        const chemist = await added.addWithin(userId, { ...input, clientRequestId: clientId }, ctx);
        return { serverId: chemist.id };
      } catch (err) {
        if (err instanceof AppError && (err.publicDetails as { field?: string } | undefined)?.field === 'routeId') {
          throw new SyncRejection(NEW_CHEMIST_SYNC_CODES.routeNotAssigned, 'You no longer have this chemist’s route. Choose another of your routes.');
        }
        if (err instanceof AppError && err.statusCode === 403) {
          throw new SyncRejection(NEW_CHEMIST_SYNC_CODES.managerNotAllowed, 'Managers can’t add chemists. Ask Admin.');
        }
        if (err instanceof DuplicateRecordError) {
          throw new SyncRejection(NEW_CHEMIST_SYNC_CODES.addedAtTheSameTime, 'This chemist was being added at the same moment. Tap Submit again.');
        }
        throw err;
      }
    },
  };
}

/** The first problem, named by its field — enough for the MR to fix it, with none of the parser's internals. */
function describeInvalid(err: unknown): string {
  const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
  return issue ? `${issue.path.join('.') || 'The chemist'}: ${issue.message}` : 'The chemist’s details are not valid.';
}
