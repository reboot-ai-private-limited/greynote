import { AppError } from '@/shared/errors/AppError.js';
import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { DuplicateRecordError } from '../domain/duplicateRecord.error.js';
import type { AddedDoctorInput, AddedDoctors } from './usecases/addedDoctors.js';

/** The record kind the phone sends for a Doctor the MR added offline (LLD sync.md, *In the daily report*). */
export const NEW_DOCTOR_SYNC_KIND = 'NEW_DOCTOR';

/** The codes this handler refuses with — what the app tells the MR to do about each. */
export const NEW_DOCTOR_SYNC_CODES = {
  invalidPayload: 'INVALID_PAYLOAD',
  routeNotAssigned: 'ROUTE_NOT_ASSIGNED',
  addedAtTheSameTime: 'ADDED_AT_THE_SAME_TIME',
  managerNotAllowed: 'MANAGER_NOT_ALLOWED',
} as const;

/**
 * Applies a `NEW_DOCTOR` record from the daily report's push: the Doctor is created `pending` and sent for
 * approval exactly as `POST /doctors/added` does — the same logic, inside the sync engine's transaction, so
 * the record, its approval request and its receipt commit or roll back together. The sync `clientId` is the
 * Doctor's `clientRequestId`, so a Doctor already added under that id (directly, or by an earlier push) is
 * returned, never duplicated.
 *
 * Master-data drift is caught here (HLD 01 §1.4): if the MR no longer has the Route the Doctor was added on
 * — Admin took it away while the phone was offline — the record is refused with `ROUTE_NOT_ASSIGNED` and the
 * MR picks another Route. `parse` validates the payload (it arrives as `unknown`); the composition root passes
 * the same field rules `POST /doctors/added` uses.
 */
export function makeNewDoctorSyncHandler(added: AddedDoctors, parse: (payload: unknown) => AddedDoctorInput): SyncHandlerDefinition {
  return {
    kind: NEW_DOCTOR_SYNC_KIND,
    async apply({ userId, clientId, payload }, ctx) {
      let input: AddedDoctorInput;
      try {
        input = parse(payload);
      } catch (err) {
        throw new SyncRejection(NEW_DOCTOR_SYNC_CODES.invalidPayload, describeInvalid(err));
      }
      try {
        const doctor = await added.addWithin(userId, { ...input, clientRequestId: clientId }, ctx);
        return { serverId: doctor.id };
      } catch (err) {
        if (err instanceof AppError && (err.publicDetails as { field?: string } | undefined)?.field === 'routeId') {
          throw new SyncRejection(NEW_DOCTOR_SYNC_CODES.routeNotAssigned, 'You no longer have this doctor’s route. Choose another of your routes.');
        }
        if (err instanceof AppError && err.statusCode === 403) {
          throw new SyncRejection(NEW_DOCTOR_SYNC_CODES.managerNotAllowed, 'Managers can’t add doctors. Ask Admin.');
        }
        if (err instanceof DuplicateRecordError) {
          throw new SyncRejection(NEW_DOCTOR_SYNC_CODES.addedAtTheSameTime, 'This doctor was being added at the same moment. Tap Submit again.');
        }
        throw err;
      }
    },
  };
}

/** The first problem, named by its field — enough for the MR to fix it, with none of the parser's internals. */
function describeInvalid(err: unknown): string {
  const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
  return issue ? `${issue.path.join('.') || 'The doctor'}: ${issue.message}` : 'The doctor’s details are not valid.';
}
