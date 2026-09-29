import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { GateRefusal } from '../domain/gateRefusal.js';
import { LOG_CODES, LogRefusal } from '../domain/logRefusal.js';
import type { LogChemistCallUseCase, LogDoctorCallUseCase, LogFollowupUseCase } from './usecases/logCalls.usecase.js';

/** The record kinds the phone sends for the day's calls and follow-ups (LLD sync.md, *The kinds registered so far*). */
export const DOCTOR_CALL_SYNC_KIND = 'DOCTOR_CALL';
export const CHEMIST_CALL_SYNC_KIND = 'CHEMIST_CALL';
export const DOCTOR_FOLLOWUP_SYNC_KIND = 'DOCTOR_FOLLOWUP';
export const CHEMIST_FOLLOWUP_SYNC_KIND = 'CHEMIST_FOLLOWUP';

/** The first problem, named by its field — enough for the MR to fix, with none of the parser's internals. */
function describeInvalid(err: unknown): string {
  const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
  return issue ? `${issue.path.join('.') || 'The record'}: ${issue.message}` : 'The record’s details are not valid.';
}

/** A gate or lookup refusal becomes that record's reason with its own code; anything else is a fault and passes through. */
function asRejection(err: unknown): unknown {
  if (err instanceof GateRefusal || err instanceof LogRefusal) return new SyncRejection(err.code, err.message);
  return err;
}

/** Parse the payload, run the use case, translate its refusals — the same wrapping for every kind. */
export function recordHandler<Input, Output extends { serverId: string }>(kind: string, parse: (payload: unknown) => Input, run: (rec: { userId: string; clientId: string; recordedAt: Date }, input: Input, ctx: unknown) => Promise<Output>): SyncHandlerDefinition {
  return {
    kind,
    async apply({ userId, clientId, clientCreatedAt, payload }, ctx) {
      let input: Input;
      try {
        input = parse(payload);
      } catch (err) {
        throw new SyncRejection(LOG_CODES.invalidPayload, describeInvalid(err));
      }
      try {
        return await run({ userId, clientId, recordedAt: clientCreatedAt }, input, ctx);
      } catch (err) {
        throw asRejection(err);
      }
    },
  };
}

/**
 * The four handlers. Each `parse` validates the payload with the same rules the phone was built against (the
 * composition root passes them); a call's result carries the server's geofence answer back to the phone (G10).
 */
export function makeCallSyncHandlers(deps: {
  doctorCall: LogDoctorCallUseCase;
  chemistCall: LogChemistCallUseCase;
  followup: LogFollowupUseCase;
  parse: {
    doctorCall: (p: unknown) => Parameters<LogDoctorCallUseCase['execute']>[1];
    chemistCall: (p: unknown) => Parameters<LogChemistCallUseCase['execute']>[1];
    doctorFollowup: (p: unknown) => { reportDate: string; doctorId: string; remarks: string };
    chemistFollowup: (p: unknown) => { reportDate: string; chemistId: string; remarks: string };
  };
}): SyncHandlerDefinition[] {
  return [
    recordHandler(DOCTOR_CALL_SYNC_KIND, deps.parse.doctorCall, (rec, input, ctx) => deps.doctorCall.execute(rec, input, ctx)),
    recordHandler(CHEMIST_CALL_SYNC_KIND, deps.parse.chemistCall, (rec, input, ctx) => deps.chemistCall.execute(rec, input, ctx)),
    recordHandler(DOCTOR_FOLLOWUP_SYNC_KIND, deps.parse.doctorFollowup, (rec, p, ctx) =>
      deps.followup.execute(rec, { reportDate: p.reportDate, subject: 'DOCTOR', subjectId: p.doctorId, remarks: p.remarks }, ctx),
    ),
    recordHandler(CHEMIST_FOLLOWUP_SYNC_KIND, deps.parse.chemistFollowup, (rec, p, ctx) =>
      deps.followup.execute(rec, { reportDate: p.reportDate, subject: 'CHEMIST', subjectId: p.chemistId, remarks: p.remarks }, ctx),
    ),
  ];
}
