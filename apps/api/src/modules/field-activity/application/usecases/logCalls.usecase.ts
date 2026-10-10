import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { WorkingType } from '@greynote/contracts';
import { LOG_CODES, LogRefusal } from '../../domain/logRefusal.js';
import type { ChemistCall, DoctorCall, Followup, GeofenceOutcome, SampleLine } from '../../domain/call.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { CallChecks } from '../callChecks.js';
import type { GeofenceEvaluator } from '../geofenceEvaluator.js';
import type { LoggingGate } from '../loggingGate.js';

/** What every record of the day arrives with (the sync engine's record context). */
export interface RecordContext {
  userId: string;
  /** The phone's id for the record. */
  clientId: string;
  /** When the MR made it on the phone. */
  recordedAt: Date;
}

interface CallInput {
  reportDate: string;
  workingType: WorkingType;
  workWith: string[];
  remarks: string | null;
  capturedLocation: { latitude: number; longitude: number } | null;
  accuracyMeters: number | null;
}

/** The server's own version of a call that goes back to the phone (sign-off G10). */
export interface CallResult {
  serverId: string;
  data: { geofence: Pick<GeofenceOutcome, 'status' | 'distanceMeters' | 'reason'> };
}
const resultOf = (id: string, g: GeofenceOutcome): CallResult => ({ serverId: id, data: { geofence: { status: g.status, distanceMeters: g.distanceMeters, reason: g.reason } } });

/**
 * A Doctor Call (LLD field-activity.md, *Calls*). In order: the gate (blocked, the day, the Plan, the DCR not
 * already sent) → the Doctor is active and still assigned to this MR → the colleagues are real → the geofence
 * is computed from the Doctor's stored location → each sample line draws its allocation down.
 *
 * Runs inside the sync engine's transaction, so a sample line that can't be covered (`SAMPLES_EXHAUSTED`) undoes
 * the lines already drawn and the call itself — the record fails alone, with the rest of the day intact. The
 * phone's own geofence result isn't accepted: the server's replaces it.
 */
export class LogDoctorCallUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly geofence: GeofenceEvaluator,
    private readonly master: FieldMasterDataPort,
    private readonly calls: DoctorCallRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: CallInput & { doctorId: string; samples: Array<{ productId: string; quantity: number }> }, ctx: TransactionContext): Promise<CallResult> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const doctor = await this.checks.doctor(rec.userId, input.doctorId);
    await this.checks.onPlannedRoute(rec.userId, input.reportDate, doctor.routeId, doctor.id);
    await this.checks.workWith(rec.userId, input.workWith);
    const geofence = await this.geofence.evaluate(await this.master.getDoctorLocation(input.doctorId), input.capturedLocation, input.accuracyMeters);

    const samples: SampleLine[] = [];
    for (const line of input.samples) {
      const allocation = await this.master.getSampleAllocation(input.doctorId, line.productId);
      if (!allocation) throw new LogRefusal(LOG_CODES.noSampleAllocation, 'No samples of this product have been issued for this doctor.');
      // One conditional update: two calls racing for the last units can't both succeed, and one refused line rolls back the rest.
      if (!(await this.master.decrementRemaining(allocation.id, line.quantity, ctx))) {
        throw new LogRefusal(LOG_CODES.samplesExhausted, `Not enough samples left: ${allocation.quantityRemaining} available, ${line.quantity} asked for.`);
      }
      samples.push({ allocationId: allocation.id, productId: line.productId, quantity: line.quantity });
    }

    const call = await this.calls.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, doctorId: input.doctorId, workingType: input.workingType, workWith: input.workWith, remarks: input.remarks, capturedLocation: input.capturedLocation, accuracyMeters: input.accuracyMeters, geofence, samples, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return resultOf(call.id, geofence);
  }
}

/** A Chemist Call: the same as a Doctor Call without samples, checked against the Routes the MR covers. */
export class LogChemistCallUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly geofence: GeofenceEvaluator,
    private readonly master: FieldMasterDataPort,
    private readonly calls: ChemistCallRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: CallInput & { chemistId: string }, ctx: TransactionContext): Promise<CallResult> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const chemist = await this.checks.chemist(rec.userId, input.chemistId);
    await this.checks.onPlannedRoute(rec.userId, input.reportDate, chemist.routeId);
    await this.checks.workWith(rec.userId, input.workWith);
    const geofence = await this.geofence.evaluate(await this.master.getChemistLocation(input.chemistId), input.capturedLocation, input.accuracyMeters);
    const call = await this.calls.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, chemistId: input.chemistId, workingType: input.workingType, workWith: input.workWith, remarks: input.remarks, capturedLocation: input.capturedLocation, accuracyMeters: input.accuracyMeters, geofence, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return resultOf(call.id, geofence);
  }
}

/** A follow-up note on a Doctor or a Chemist — remarks only, attached to the day's DCR, with the same gate and the same checks on who it's about. */
export class LogFollowupUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly followups: FollowupRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: { reportDate: string; subject: 'DOCTOR' | 'CHEMIST'; subjectId: string; remarks: string }, ctx: TransactionContext): Promise<{ serverId: string }> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    if (input.subject === 'DOCTOR') await this.checks.doctor(rec.userId, input.subjectId);
    else await this.checks.chemist(rec.userId, input.subjectId);
    const created: Followup = await this.followups.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, subject: input.subject, subjectId: input.subjectId, remarks: input.remarks, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return { serverId: created.id };
  }
}

export type { ChemistCall, DoctorCall };
